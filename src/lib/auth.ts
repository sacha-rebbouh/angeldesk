import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "./prisma";

// Dev mode: bypass Clerk auth with a test user
// Triple-check to prevent accidental auth bypass in production (matches middleware.ts)
const DEV_MODE =
  process.env.NODE_ENV === "development" &&
  process.env.BYPASS_AUTH === "true" &&
  process.env.VERCEL_ENV !== "production" &&
  !process.env.VERCEL;

const DEV_USER = {
  id: "dev-user-001",
  clerkId: "dev-clerk-001",
  email: "dev@angeldesk.local",
  name: "Dev User",
  image: null,
  subscriptionStatus: "PRO" as const,
  investmentPreferences: null,
  cguAcceptedAt: new Date(), // Dev user always has CGU accepted
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PREVIEW_OWNER_EMAIL = "sacha@rebbouh.fr";

function isPreviewOwnerBootstrapEmail(email: string | null | undefined): boolean {
  return (
    process.env.VERCEL_ENV === "preview" &&
    email?.toLowerCase() === PREVIEW_OWNER_EMAIL
  );
}

export async function getAuthUser() {
  if (DEV_MODE) {
    return DEV_USER;
  }

  const { userId: clerkId } = await auth();

  if (!clerkId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
  });

  return user;
}

export async function getOrCreateUser() {
  if (DEV_MODE) {
    // Ensure dev user exists in DB
    const existingUser = await prisma.user.findUnique({
      where: { id: DEV_USER.id },
    });

    if (!existingUser) {
      const user = await prisma.user.create({
        data: {
          id: DEV_USER.id,
          clerkId: DEV_USER.clerkId,
          email: DEV_USER.email,
          name: DEV_USER.name,
          subscriptionStatus: DEV_USER.subscriptionStatus,
        },
      });
      // Grant admin credits
      await ensureAdminCredits(DEV_USER.id);
      return user;
    }

    // Ensure admin credits exist on every request (idempotent)
    await ensureAdminCredits(DEV_USER.id);
    return existingUser;
  }

  const { userId: clerkId } = await auth();

  if (!clerkId) {
    throw new Error("Unauthorized");
  }

  // Try to find existing user
  let user = await prisma.user.findUnique({
    where: { clerkId },
  });

  // If user doesn't exist, create from Clerk data
  if (!user) {
    const clerkUser = await currentUser();

    if (!clerkUser) {
      throw new Error("Clerk user not found");
    }

    user = await prisma.user.create({
      data: {
        clerkId,
        email: clerkUser.emailAddresses[0]?.emailAddress ?? "",
        name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || null,
        image: clerkUser.imageUrl,
      },
    });
  }

  if (isPreviewOwnerBootstrapEmail(user.email)) {
    await ensureAdminCredits(user.id);
  }

  return user;
}

export async function requireAuth() {
  const user = await getOrCreateUser();
  return user;
}

// Admin/Owner role types from Clerk publicMetadata
export type UserRole = "admin" | "user";

export interface UserMetadata {
  role?: UserRole;
  isOwner?: boolean;
}

export async function getUserMetadata(): Promise<UserMetadata> {
  if (DEV_MODE) {
    // Dev user is always admin + owner
    return { role: "admin", isOwner: true };
  }

  const clerkUser = await currentUser();
  if (!clerkUser) {
    return { role: "user", isOwner: false };
  }

  const metadata = clerkUser.publicMetadata as UserMetadata;
  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (isPreviewOwnerBootstrapEmail(email)) {
    return { role: "admin", isOwner: true };
  }

  return {
    role: metadata?.role ?? "user",
    isOwner: metadata?.isOwner ?? false,
  };
}

export async function isAdmin(): Promise<boolean> {
  const metadata = await getUserMetadata();
  return metadata.role === "admin";
}

export async function isOwner(): Promise<boolean> {
  const metadata = await getUserMetadata();
  return metadata.isOwner === true;
}

export async function requireAdmin() {
  const user = await requireAuth();
  const admin = await isAdmin();

  if (!admin) {
    throw new Error("Admin access required");
  }

  return user;
}

export async function requireOwner() {
  const user = await requireAuth();
  const owner = await isOwner();

  if (!owner) {
    throw new Error("Owner access required");
  }

  return user;
}

// ============================================================================
// ADMIN CREDITS — Ensure dev/admin user always has 250K credits for testing
// ============================================================================

const ADMIN_CREDITS = 500;

async function ensureAdminCredits(userId: string): Promise<void> {
  try {
    const balance = await prisma.userCreditBalance.findUnique({
      where: { userId },
    });

    if (!balance) {
      await prisma.userCreditBalance.create({
        data: {
          userId,
          balance: ADMIN_CREDITS,
          totalPurchased: ADMIN_CREDITS,
          lastPackName: 'admin',
          freeCreditsGranted: true,
        },
      });
      return;
    }

    // Top up if below threshold
    if (balance.balance < ADMIN_CREDITS) {
      await prisma.userCreditBalance.update({
        where: { userId },
        data: { balance: ADMIN_CREDITS },
      });
    }
  } catch {
    // Table may not exist yet — skip silently in dev
    console.warn('[auth] Credit tables not available — skipping ensureAdminCredits');
  }
}
