import { env } from "@/env";
import { logger } from "@/lib/logger";
// src/config/lemonsqueezy.ts
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import type { LemonSqueezyOrderAttributes } from "@/types/lemonsqueezy";
import { lemonSqueezySetup, listOrders, listProducts } from "@lemonsqueezy/lemonsqueezy.js";
import { eq } from "drizzle-orm";

export interface PaymentData {
	id: string;
	orderId: string;
	userEmail: string;
	userName: string | null;
	amount: number;
	status: "paid" | "refunded" | "pending";
	productName: string;
	purchaseDate: Date;
}

// Configuration
const configureLemonSqueezy = (): void => {
	if (!env.NEXT_PUBLIC_FEATURE_LEMONSQUEEZY_ENABLED) {
		logger.info("Lemon Squeezy feature disabled. Skipping setup.");
		return;
	}
	if (!env?.LEMONSQUEEZY_API_KEY) {
		logger.error("LEMONSQUEEZY_API_KEY is not set in the environment.");
		return;
	}
	lemonSqueezySetup({ apiKey: env.LEMONSQUEEZY_API_KEY });
};

// Initialize on import
configureLemonSqueezy();

/**
 * Fetches orders for a specific email from Lemon Squeezy
 */
export const getOrdersByEmail = async (email: string) => {
	if (!env.NEXT_PUBLIC_FEATURE_LEMONSQUEEZY_ENABLED) {
		logger.warn("Attempted to get LS orders by email, but feature is disabled.");
		return [];
	}
	try {
		const response = await listOrders({
			filter: {
				userEmail: email.trim(),
			},
		});

		if (!response) {
			return [];
		}

		return response.data?.data ?? [];
	} catch (error) {
		console.error("Error fetching orders by email:", error);
		return [];
	}
};

/**
 * Fetches all orders from Lemon Squeezy
 */
export const getAllOrders = async () => {
	if (!env.NEXT_PUBLIC_FEATURE_LEMONSQUEEZY_ENABLED) {
		logger.warn("Attempted to get all LS orders, but feature is disabled.");
		return [];
	}
	try {
		const response = await listOrders({});

		if (!response || !Array.isArray(response.data?.data)) {
			return [];
		}

		return response.data.data.map((order) => {
			const attributes = order.attributes;

			// Use subtotal as the amount field since total is often returning 0
			const amount = attributes.subtotal > 0 ? attributes.subtotal / 100 : 0;

			// Extract all possible user information
			// Use type assertion for additional fields that might be in the API but not in our types
			const attr = attributes as any;

			// Process any custom user data
			const customUserData: Record<string, any> = {};
			if (attr.custom_data && typeof attr.custom_data === "object") {
				for (const [key, value] of Object.entries(attr.custom_data)) {
					if (key.startsWith("user_")) {
						customUserData[key] = value;
					}
				}
			}

			return {
				id: order.id,
				orderId: attributes.identifier,
				userEmail: attributes.user_email ?? "Unknown",
				userName: attributes.user_name,
				// Include additional user fields if available
				userAddress: attr.user_address || null,
				userCity: attr.user_city || null,
				userCountry: attr.user_country || null,
				userPhone: attr.user_phone || null,
				// Include any custom user properties
				customUserData,
				amount,
				status: attributes.status as "paid" | "refunded" | "pending",
				productName: attributes.first_order_item?.variant_name ?? "Unknown Product",
				purchaseDate: new Date(attributes.created_at),
				// Include discount code if available - use type assertion to avoid TypeScript error
				discountCode: (attr.discount_code || null) as string | null,
				attributes,
			};
		});
	} catch (error) {
		logger.error("Error fetching all orders:", error);
		return [];
	}
};

/**
 * Gets the payment status for a user by checking both their ID and email
 * This ensures we catch payments even if they used a different email
 */
export const getLemonSqueezyPaymentStatus = async (userId: string): Promise<boolean> => {
	if (!env.NEXT_PUBLIC_FEATURE_LEMONSQUEEZY_ENABLED) {
		logger.warn("Attempted to get LS payment status, but feature is disabled.");
		return false;
	}
	try {
		const user = await db?.query.users.findFirst({
			where: eq(users.id, userId),
		});

		if (!user?.email) return false;

		// Check Lemon Squeezy orders by both user ID and email
		const orders = await listOrders({});
		const userOrders =
			orders.data?.data?.filter((order) => {
				const attributes = order.attributes as LemonSqueezyOrderAttributes;
				const customData = attributes.custom_data || {};

				// Check if either the user ID matches or the email matches
				return (
					// Match by user ID in custom data
					(typeof customData === "object" && customData?.user_id === userId) ||
					// Or match by email (case insensitive)
					attributes.user_email?.toLowerCase() === user.email.toLowerCase()
				);
			}) ?? [];

		const hasPaid = userOrders.some(
			(order) => (order.attributes as LemonSqueezyOrderAttributes).status === "paid"
		);

		return hasPaid;
	} catch (error) {
		console.error("Error checking payment status:", error);
		return false;
	}
};

export const fetchLemonSqueezyProducts = async () => {
	if (!env.NEXT_PUBLIC_FEATURE_LEMONSQUEEZY_ENABLED) {
		logger.warn("Attempted to fetch LS products, but feature is disabled.");
		return [];
	}
	const response = await listProducts({});
	return response.data ?? [];
};

/**
 * Checks if a user has purchased a specific product by variant ID
 */
export const hasUserPurchasedProduct = async (
	userId: string,
	variantId: string | number
): Promise<boolean> => {
	if (!env.NEXT_PUBLIC_FEATURE_LEMONSQUEEZY_ENABLED) {
		logger.warn("Attempted to check LS product purchase, but feature is disabled.");
		return false;
	}
	try {
		logger.debug("Checking if user has purchased product", { userId, variantId });

		// First get the user email
		const user = await db?.query.users.findFirst({
			where: eq(users.id, userId),
		});

		if (!user?.email) return false;

		// Get user orders
		const orders = await listOrders({});
		const userOrders =
			orders.data?.data?.filter((order) => {
				const attributes = order.attributes as LemonSqueezyOrderAttributes;
				const customData = attributes.custom_data || {};

				// Check if either the user ID matches or the email matches
				return (
					(typeof customData === "object" && customData?.user_id === userId) ||
					attributes.user_email?.toLowerCase() === user.email.toLowerCase()
				);
			}) ?? [];

		// Check if any paid order includes the specific variant ID
		const hasPurchased = userOrders.some((order) => {
			const attributes = order.attributes as LemonSqueezyOrderAttributes;

			// Check if order is paid and contains the product variant
			return (
				attributes.status === "paid" &&
				attributes.first_order_item?.variant_id === Number(variantId)
			);
		});

		logger.debug("User product purchase check result", {
			userId,
			variantId,
			hasPurchased,
			orderCount: userOrders.length,
		});

		return hasPurchased;
	} catch (error) {
		logger.error("Error checking if user purchased product:", error);
		return false;
	}
};

/**
 * Checks if a user has an active subscription
 */
export const hasUserActiveSubscription = async (userId: string): Promise<boolean> => {
	if (!env.NEXT_PUBLIC_FEATURE_LEMONSQUEEZY_ENABLED) {
		logger.warn("Attempted to check LS subscription, but feature is disabled.");
		return false;
	}
	try {
		logger.debug("Checking if user has active subscription", { userId });

		// First get the user email
		const user = await db?.query.users.findFirst({
			where: eq(users.id, userId),
		});

		if (!user?.email) return false;

		// Get user subscriptions
		try {
			// We need to use the Lemon Squeezy SDK to get subscriptions
			// Type assertion here since the SDK types may not be complete
			const lemonClient = lemonSqueezySetup({
				apiKey: env.LEMONSQUEEZY_API_KEY ?? "",
			}) as any;

			const response = await lemonClient.subscriptions?.list();

			// Filter subscriptions for this user
			const userSubscriptions =
				response?.data?.data?.filter((subscription: any) => {
					const attributes = subscription.attributes as any;
					const customData = attributes.custom_data || {};

					// Check if either the user ID matches or the email matches
					return (
						(typeof customData === "object" && customData?.user_id === userId) ||
						attributes.user_email?.toLowerCase() === user.email.toLowerCase()
					);
				}) ?? [];

			// Check if any subscription is active
			const hasActiveSubscription = userSubscriptions.some((subscription: any) => {
				const attributes = subscription.attributes as any;
				return attributes.status === "active";
			});

			logger.debug("User subscription check result", {
				userId,
				hasActiveSubscription,
				subscriptionCount: userSubscriptions.length,
			});

			return hasActiveSubscription;
		} catch (error) {
			logger.error("Error checking user subscriptions:", error);
			return false;
		}
	} catch (error) {
		logger.error("Error checking if user has active subscription:", error);
		return false;
	}
};

/**
 * Gets all products that a user has purchased
 */
export const getUserPurchasedProducts = async (userId: string): Promise<any[]> => {
	try {
		logger.debug("Getting user purchased products", { userId });

		// First get the user email
		const user = await db?.query.users.findFirst({
			where: eq(users.id, userId),
		});

		if (!user?.email) return [];

		// Get user orders
		const orders = await listOrders({});
		const userOrders =
			orders.data?.data?.filter((order) => {
				const attributes = order.attributes as LemonSqueezyOrderAttributes;
				const customData = attributes.custom_data || {};

				// Check if either the user ID matches or the email matches
				return (
					(typeof customData === "object" && customData?.user_id === userId) ||
					attributes.user_email?.toLowerCase() === user.email.toLowerCase()
				);
			}) ?? [];

		// Extract unique products from paid orders
		const purchasedVariantIds = new Set<number>();
		const purchasedProducts: any[] = [];

		// Use for...of loop instead of forEach
		for (const order of userOrders) {
			const attributes = order.attributes as LemonSqueezyOrderAttributes;

			// Only consider paid orders
			if (attributes.status === "paid" && attributes.first_order_item) {
				const variantId = attributes.first_order_item.variant_id;

				// Only add each variant once
				if (!purchasedVariantIds.has(variantId)) {
					purchasedVariantIds.add(variantId);
					purchasedProducts.push({
						id: attributes.first_order_item.product_id,
						variant_id: variantId,
						name: attributes.first_order_item.product_name,
						variant_name: attributes.first_order_item.variant_name,
						price: attributes.first_order_item.price,
						purchaseDate: new Date(attributes.created_at),
					});
				}
			}
		}

		logger.debug("User purchased products", {
			userId,
			productCount: purchasedProducts.length,
		});

		return purchasedProducts;
	} catch (error) {
		logger.error("Error getting user purchased products:", error);
		return [];
	}
};
