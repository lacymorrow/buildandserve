"use server";

import {
	getAdminDomains as getAdminDomainsService,
	getAdminEmails as getAdminEmailsService,
	isAdmin,
} from "@/server/services/admin-service";

/**
 * Server action to check if a user is an admin
 * This keeps admin checking logic on the server side for security
 *
 * @param email The email address to check
 * @returns Boolean indicating if the email belongs to an admin
 */
export async function checkIsAdmin(email?: string | null): Promise<boolean> {
	return isAdmin({ email });
}

/**
 * Server action to get admin emails (for authorized users only)
 * Should only be called after verifying the requester is an admin
 *
 * @param requestingEmail The email of the user requesting the admin list
 * @returns Array of admin emails if requester is admin, empty array otherwise
 */
export async function getAdminEmails(requestingEmail?: string | null): Promise<string[]> {
	return getAdminEmailsService(requestingEmail);
}

/**
 * Server action to get admin domains (for authorized users only)
 * Should only be called after verifying the requester is an admin
 *
 * @param requestingEmail The email of the user requesting the admin domains
 * @returns Array of admin domains if requester is admin, empty array otherwise
 */
export async function getAdminDomains(requestingEmail?: string | null): Promise<string[]> {
	return getAdminDomainsService(requestingEmail);
}
