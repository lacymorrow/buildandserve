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
	const response = await listProducts({});
	return response.data ?? [];
};
