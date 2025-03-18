import { adminConfig } from "@/config/admin-config";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Admin service for server-side admin checking
 * This service should be used by server components to check admin status
 */

/**
 * Check if a user is an admin based on their email
 *
 * @param email The email address to check
 * @returns Boolean indicating if the email belongs to an admin
 */
export async function isAdmin(email?: string | null): Promise<boolean> {
	if (!email) {
		return false;
	}

	if (adminConfig.isAdmin(email)) {
		return true;
	}

	// Check if user is admin by querying the database directly
	const user = await db?.query.users.findFirst({
		where: eq(users.email, email),
		columns: {
			role: true,
		},
	});

	return user?.role === "admin";
}

/**
 * Get the list of admin emails
 * Should only be called after verifying the requester is an admin
 *
 * @param requestingEmail The email of the user requesting the admin list
 * @returns Array of admin emails if requester is admin, empty array otherwise
 */
export function getAdminEmails(requestingEmail?: string | null): string[] {
	if (!isAdmin(requestingEmail)) {
		return [];
	}

	return adminConfig.emails;
}

/**
 * Get the list of admin domains
 * Should only be called after verifying the requester is an admin
 *
 * @param requestingEmail The email of the user requesting the admin domains
 * @returns Array of admin domains if requester is admin, empty array otherwise
 */
export function getAdminDomains(requestingEmail?: string | null): string[] {
	if (!isAdmin(requestingEmail)) {
		return [];
	}

	return adminConfig.domains;
}
