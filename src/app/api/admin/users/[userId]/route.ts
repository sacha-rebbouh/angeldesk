import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { clerkClient } from "@/lib/clerk";
import { prisma } from "@/lib/prisma";

const updateUserSchema = z.object({
  subscriptionStatus: z.enum(["FREE", "PRO"]).optional(),
  role: z.enum(["admin", "user"]).optional(),
  isOwner: z.boolean().optional(),
  name: z.string().optional(),
});

// PATCH /api/admin/users/[userId] - Update a user
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdmin();

    const { userId } = await params;
    const body = await request.json();
    const data = updateUserSchema.parse(body);

    const results: { clerk?: boolean; prisma?: boolean } = {};

    // Update Clerk metadata if role or isOwner changed
    if (data.role !== undefined || data.isOwner !== undefined || data.name !== undefined) {
      const clerkUser = await clerkClient.users.getUser(userId);

      const updateData: {
        publicMetadata?: Record<string, unknown>;
        firstName?: string;
        lastName?: string;
      } = {};

      if (data.role !== undefined || data.isOwner !== undefined) {
        updateData.publicMetadata = {
          ...clerkUser.publicMetadata,
          ...(data.role !== undefined && { role: data.role }),
          ...(data.isOwner !== undefined && { isOwner: data.isOwner }),
        };
      }

      if (data.name !== undefined) {
        const [firstName, ...lastNameParts] = data.name.split(" ");
        updateData.firstName = firstName || "";
        updateData.lastName = lastNameParts.join(" ") || "";
      }

      await clerkClient.users.updateUser(userId, updateData);
      results.clerk = true;
    }

    // Update Prisma if subscriptionStatus changed
    if (data.subscriptionStatus !== undefined) {
      const prismaUser = await prisma.user.findUnique({
        where: { clerkId: userId },
      });

      if (prismaUser) {
        await prisma.user.update({
          where: { clerkId: userId },
          data: { subscriptionStatus: data.subscriptionStatus },
        });
        results.prisma = true;
      }
    }

    return NextResponse.json({
      success: true,
      updated: results,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Admin access required") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/[userId] - Delete a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdmin();

    const { userId } = await params;

    // Delete from Prisma first (cascade will delete deals, etc.)
    const prismaUser = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    if (prismaUser) {
      await prisma.user.delete({
        where: { clerkId: userId },
      });
    }

    // Delete from Clerk
    await clerkClient.users.deleteUser(userId);

    return NextResponse.json({
      success: true,
      deleted: { clerk: true, prisma: !!prismaUser },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Admin access required") {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
    }

    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
