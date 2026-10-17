"use server";

/**
 * @fileoverview Server actions for the admin GitHub panel.
 *
 * Consumed by `_components/add-collaborator-form`. Mutations only — read
 * operations should call `@/server/services/github/github-service` directly
 * from a Server Component.
 */

import { auth } from "@/server/auth";
import { isAdmin } from "@/server/services/admin-service";
import { grantGitHubAccess } from "@/server/services/github/github-service";

export interface AddCollaboratorResult {
  success: boolean;
  error?: string;
}

/**
 * Invites a GitHub user as a collaborator on the private repository.
 * Admin-only: the panel is admin-gated, but the action re-checks because a
 * server action is independently callable.
 */
export async function addCollaboratorAction(username: string): Promise<AddCollaboratorResult> {
  const trimmed = username.trim();
  if (!trimmed) {
    return { success: false, error: "GitHub username is required" };
  }

  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Authentication required" };
  }

  const authorized = await isAdmin({
    email: session.user.email,
    userId: session.user.id,
  });
  if (!authorized) {
    return { success: false, error: "Admin access required" };
  }

  try {
    const granted = await grantGitHubAccess({ githubUsername: trimmed });
    if (!granted) {
      return { success: false, error: "GitHub integration is not configured" };
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to add collaborator",
    };
  }
}
