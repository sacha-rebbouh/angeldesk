import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { clerkClient } from "@/lib/clerk";

// POST /api/admin/users/[userId]/reset-password - Send password reset
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdmin();

    const { userId } = await params;

    // Get user email
    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.emailAddresses[0]?.emailAddress;

    if (!email) {
      return NextResponse.json(
        { error: "User has no email address" },
        { status: 400 }
      );
    }

    // Clerk doesn't have a direct "send password reset email" API for admins.
    // The user needs to use the "Forgot password" flow.
    //
    // Alternative approaches:
    // 1. Use Clerk's "impersonation" feature (Enterprise only)
    // 2. Send a custom email with instructions
    // 3. Generate a sign-in token for one-time access
    //
    // For now, we return the email so the admin can contact the user manually
    // or guide them to use the "Forgot password" flow.

    return NextResponse.json({
      success: true,
      message: `L'utilisateur doit utiliser "Mot de passe oublié" sur la page de connexion.`,
      email,
      loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
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

    console.error("Error with password reset:", error);
    return NextResponse.json(
      { error: "Failed to process password reset" },
      { status: 500 }
    );
  }
}
