import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Check if a user has connected their Vercel account
 *
 * @param userId The ID of the user to check
 * @returns True if the user has connected their Vercel account, false otherwise
 */
export async function checkVercelConnection(userId: string): Promise<boolean> {
	logger.info("Checking Vercel connection", { userId });

	if (!userId) {
		logger.warn("No user ID provided for Vercel connection check");
		return false;
	}

	try {
		const vercelAccount = await db?.query.accounts.findFirst({
			where: and(eq(accounts.userId, userId), eq(accounts.provider, "vercel")),
		});

		const hasVercelConnection = !!vercelAccount;

		logger.info("Vercel connection status", {
			userId,
			hasVercelConnection,
		});

		return hasVercelConnection;
	} catch (error) {
		logger.error("Error checking Vercel connection", {
			userId,
			error: error instanceof Error ? error.message : "Unknown error",
		});
		return false;
	}
}

/**
 * Get the Vercel account for a user
 *
 * @param userId The ID of the user
 * @returns The Vercel account for the user, or null if not connected
 */
export async function getVercelAccount(userId: string) {
	logger.info("Getting Vercel account", { userId });

	if (!userId) {
		logger.warn("No user ID provided for Vercel account");
		return null;
	}

	try {
		const vercelAccount = await db?.query.accounts.findFirst({
			where: and(eq(accounts.userId, userId), eq(accounts.provider, "vercel")),
		});

		if (!vercelAccount) {
			logger.info("No Vercel account found for user", { userId });
			return null;
		}

		logger.info("Vercel account found for user", { userId });
		return vercelAccount;
	} catch (error) {
		logger.error("Error getting Vercel account", {
			userId,
			error: error instanceof Error ? error.message : "Unknown error",
		});
		return null;
	}
}
