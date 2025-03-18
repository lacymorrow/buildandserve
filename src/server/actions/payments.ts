"use server";

import { routes } from "@/config/routes";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { isAdmin } from "@/server/services/admin-service";
import { PaymentService } from "@/server/services/payment-service";
import { RateLimitService } from "@/server/services/rate-limit-service";
import type { ImportProvider, ImportStats } from "@/types/payments";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

// Rate limiting service
const rateLimitService = new RateLimitService();

// Rate limits
const rateLimits = {
	importPayments: {
		requests: 5, // 5 requests
		duration: 60 * 30, // per 30 minutes
	},
};

/**
 * Server action to import payments from a specific provider or all providers
 * @param provider - The payment provider to import from (or "all" for all providers)
 * @returns Stats about the import process
 */
export async function importPayments(
	provider: ImportProvider
): Promise<ImportStats | { lemonsqueezy: ImportStats; polar: ImportStats }> {
	try {
		// Get auth session and verify the user is admin
		const session = await auth();

		if (!session?.user) {
			redirect(routes.auth.signIn);
		}

		const { id: userId, email } = session.user;

		// Check if the database is initialized
		if (!db) {
			logger.error("Database not initialized");
			throw new Error("Database not initialized");
		}

		// Check if user is admin by querying the database directly
		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: {
				role: true,
			},
		});

		if (!user || !isAdmin(email)) {
			logger.warn("Unauthorized payment import attempt", {
				userId,
				role: user?.role,
			});
			throw new Error("Unauthorized: Only admins can import payments");
		}

		// Apply rate limiting
		await rateLimitService.checkLimit(userId, "importPayments", rateLimits.importPayments);

		logger.info(`Starting payment import for provider: ${provider}`, { userId });

		// Call the appropriate import method based on the provider
		switch (provider) {
			case "lemonsqueezy":
				return await PaymentService.importLemonSqueezyPayments();
			case "polar":
				return await PaymentService.importPolarPayments();
			case "all":
				return await PaymentService.importAllPayments();
			default:
				throw new Error(`Invalid provider: ${provider}`);
		}
	} catch (error) {
		logger.error("Error importing payments", { error });
		throw error;
	}
}
