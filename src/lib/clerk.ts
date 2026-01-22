import { createClerkClient } from "@clerk/backend";

// Clerk backend client for admin operations
export const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

// Type for user metadata stored in Clerk
export interface ClerkUserMetadata {
  role?: "admin" | "user";
  isOwner?: boolean;
}
