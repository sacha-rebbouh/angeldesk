import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { clerkClient } from "@/lib/clerk";
import { prisma } from "@/lib/prisma";

// GET /api/admin/users - List all users
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");

    // Get users from Clerk
    const clerkUsers = await clerkClient.users.getUserList({
      limit,
      offset,
    });

    // Get users from Prisma for subscription status
    const prismaUsers = await prisma.user.findMany({
      select: {
        id: true,
        clerkId: true,
        email: true,
        subscriptionStatus: true,
        createdAt: true,
        _count: {
          select: {
            deals: true,
          },
        },
      },
    });

    // Create a map for quick lookup
    const prismaUserMap = new Map(
      prismaUsers.map((u) => [u.clerkId, u])
    );

    // Merge Clerk and Prisma data
    const users = clerkUsers.data.map((clerkUser) => {
      const prismaUser = prismaUserMap.get(clerkUser.id);
      return {
        id: clerkUser.id,
        prismaId: prismaUser?.id ?? null,
        email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
        name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || null,
        image: clerkUser.imageUrl,
        role: (clerkUser.publicMetadata?.role as string) ?? "user",
        isOwner: (clerkUser.publicMetadata?.isOwner as boolean) ?? false,
        subscriptionStatus: prismaUser?.subscriptionStatus ?? "FREE",
        dealsCount: prismaUser?._count.deals ?? 0,
        createdAt: clerkUser.createdAt,
        lastSignInAt: clerkUser.lastSignInAt,
        inPrisma: !!prismaUser,
      };
    });

    return NextResponse.json({
      data: users,
      totalCount: clerkUsers.totalCount,
      limit,
      offset,
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

    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}
