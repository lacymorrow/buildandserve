"use server";

import { auth } from "@/server/auth";
import { PaymentService } from "@/server/services/payment-service";

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

		const purchased = await PaymentService.hasUserPurchasedProduct(
			session.user.id,
			productId,
			provider
		);

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

		const hasSubscription = await PaymentService.hasUserActiveSubscription(
			session.user.id,
			provider
		);

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
