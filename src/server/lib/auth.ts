import { auth } from "@/server/auth";

/**
 * Get the current session. Returns null if not authenticated.
 */
export async function getSession() {
  return auth();
}

/**
 * Require admin access. Throws if not authenticated.
 * TODO: Add proper admin role check.
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}
