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
 * Server action to check if a user has purchased a specific product
 */
export async function checkUserPurchasedProduct(
	productId: string,
	provider?: "lemonsqueezy" | "polar"
): Promise<{ success: boolean; purchased: boolean; message?: string }> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return { success: false, purchased: false, message: "Not authenticated" };
		}

		const purchased = await PaymentService.hasUserPurchasedProduct({
			userId: session.user.id,
			productId,
			provider,
		});

		return { success: true, purchased };
	} catch (error) {
		console.error("Error checking product purchase:", error);
		return {
			success: false,
			purchased: false,
			message: "Failed to check purchase status",
		};
	}
}

/**
 * Server action to check if a user has an active subscription
 */
export async function checkUserSubscription(
	provider?: "lemonsqueezy" | "polar"
): Promise<{ success: boolean; hasSubscription: boolean; message?: string }> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return { success: false, hasSubscription: false, message: "Not authenticated" };
		}

		const hasSubscription = await PaymentService.hasUserActiveSubscription({
			userId: session.user.id,
			provider,
		});

		return { success: true, hasSubscription };
	} catch (error) {
		console.error("Error checking subscription:", error);
		return {
			success: false,
			hasSubscription: false,
			message: "Failed to check subscription status",
		};
	}
}

/**
 * Server action to get all products a user has purchased
 */
export async function getUserPurchasedProducts(provider?: "lemonsqueezy" | "polar"): Promise<{
	success: boolean;
	products: any[];
	message?: string;
}> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return { success: false, products: [], message: "Not authenticated" };
		}

		const products = await PaymentService.getUserPurchasedProducts(session.user.id, provider);

		return { success: true, products };
	} catch (error) {
		console.error("Error getting purchased products:", error);
		return {
			success: false,
			products: [],
			message: "Failed to get purchased products",
		};
	}
}

/**
 * Server action to generate a Polar checkout URL
 */
export async function createPolarCheckoutUrl(
	productId: string,
	metadata?: {
		userId?: string;
		userEmail?: string;
		userName?: string;
		[key: string]: any;
	}
): Promise<{ success: boolean; url?: string; message?: string }> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return { success: false, message: "Not authenticated" };
		}

		const { createCheckoutUrl } = await import("@/lib/polar");

		// Extract user details and handle null values
		const email = session.user.email ?? undefined;
		const name = session.user.name ?? undefined;

		const url = await createCheckoutUrl({
			productId,
			email,
			userId: session.user.id,
			metadata: {
				userId: session.user.id,
				userEmail: email,
				userName: name,
				...metadata,
			},
		});

		if (!url) {
			return {
				success: false,
				message: "Failed to generate checkout URL",
			};
		}

		return { success: true, url };
	} catch (error) {
		console.error("Error creating Polar checkout URL:", error);
		return {
			success: false,
			message: "Failed to generate checkout URL",
		};
	}
}

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

		if (!user || !isAdmin({ email })) {
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

/**
 * Server action to check Polar subscription status in detail for debugging
 */
export async function debugPolarSubscription(): Promise<{
	success: boolean;
	details: any;
	message?: string;
}> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return { success: false, details: null, message: "Not authenticated" };
		}

		// Import required modules
		const polarModule = await import("@/lib/polar");
		const hasUserActivePolarSubscription = polarModule.hasUserActiveSubscription;
		const getOrdersByEmail = polarModule.getOrdersByEmail;
		const { db } = await import("@/server/db");
		const { users } = await import("@/server/db/schema");
		const { eq } = await import("drizzle-orm");

		// Get user email
		const user = await db?.query.users.findFirst({
			where: eq(users.id, session.user.id),
			columns: {
				email: true,
			},
		});

		if (!user?.email) {
			return { success: false, details: null, message: "User email not found" };
		}

		// Check subscription status
		const hasSubscription = await hasUserActivePolarSubscription(session.user.id);

		// Get user orders
		const orders = await getOrdersByEmail(user.email);

		// Prepare detailed response
		const details = {
			userId: session.user.id,
			email: user.email,
			hasActiveSubscription: hasSubscription,
			ordersCount: orders.length,
			orders: orders.map((order) => ({
				id: order.id,
				status: order.status,
				amount: order.amount,
				productName: order.productName,
				purchaseDate: order.purchaseDate,
				isSubscription:
					order.attributes?.isSubscription ||
					order.attributes?.is_recurring ||
					order.attributes?.subscription_status === "active",
				subscriptionStatus: order.attributes?.subscription_status,
				subscriptionEndDate: order.attributes?.subscription_end_date || order.attributes?.expiresAt,
			})),
		};

		return { success: true, details };
	} catch (error) {
		console.error("Error checking Polar subscription details:", error);
		return {
			success: false,
			details: { error: String(error) },
			message: "Failed to check Polar subscription details",
		};
	}
}
