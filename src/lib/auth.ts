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
  createdAt: new Date(),
  updatedAt: new Date(),
};

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
      return prisma.user.create({
        data: {
          id: DEV_USER.id,
          clerkId: DEV_USER.clerkId,
          email: DEV_USER.email,
          name: DEV_USER.name,
          subscriptionStatus: DEV_USER.subscriptionStatus,
        },
      });
    }

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
