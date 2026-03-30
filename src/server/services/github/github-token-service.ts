import { auth } from "@/server/auth";

/**
 * Get a GitHub access token for the current user from their connected account.
 */
export async function getGitHubAccessToken(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;

  // TODO: Implement actual GitHub token retrieval from connected accounts
  return null;
}
