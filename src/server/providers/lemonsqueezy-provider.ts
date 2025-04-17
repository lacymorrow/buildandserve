import { env } from "@/env";
import { logger } from "@/lib/logger";
import { db } from "@/server/db";
import { payments, users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { lemonSqueezySetup, listOrders, listProducts } from "@lemonsqueezy/lemonsqueezy.js";
import { BasePaymentProvider } from "./base-provider";
import {
	type CheckoutOptions,
	type ImportStats,
	type OrderData,
	type ProductData,
	ProviderConfig,
} from "./types";
import { userService } from "../services/user-service";
import crypto from "crypto";

/**
 * LemonSqueezy implementation of the PaymentProvider interface
 */
export class LemonSqueezyProvider extends BasePaymentProvider {
	readonly name = "Lemon Squeezy";
	readonly id = "lemonsqueezy";
	private apiKey?: string;

	/**
	 * Validate the provider configuration
	 */
	protected validateConfig(): void {
		// Check the feature flag first
		if (!env.NEXT_PUBLIC_FEATURE_LEMONSQUEEZY_ENABLED) {
			this._isConfigured = false;
			return;
		}

		this.apiKey = this._config.apiKey || env.LEMONSQUEEZY_API_KEY;

		if (!this.apiKey) {
			logger.warn("Lemon Squeezy API key not provided");
			this._isConfigured = false;
			return;
		}

		try {
			// Initialize the LemonSqueezy client
			lemonSqueezySetup({ apiKey: this.apiKey });
			this._isConfigured = true;
			logger.debug("Lemon Squeezy client initialized successfully");
		} catch (error) {
			logger.error("Failed to initialize Lemon Squeezy client", { error });
			this._isConfigured = false;
		}
	}

	/**
	 * Get the payment status for a user
	 * @param userId The user ID
	 * @returns True if the user has a paid order
	 */
	async getPaymentStatus(userId: string): Promise<boolean> {
		try {
			this.checkProviderReady();

			const userEmail = await this.getUserEmail(userId);
			if (!userEmail) {
				return false;
			}

			// Check LemonSqueezy orders by both user ID and email
			const orders = await listOrders({});
			const userOrders =
				orders.data?.data?.filter((order) => {
					const attributes = order.attributes as any;
					const customData = attributes.custom_data || {};

					// Check if either the user ID matches or the email matches
					return (
						(typeof customData === "object" && customData?.user_id === userId) ||
						attributes.user_email?.toLowerCase() === userEmail.toLowerCase()
					);
				}) ?? [];

			const hasPaid = userOrders.some((order) => order.attributes.status === "paid");

			return hasPaid;
		} catch (error) {
			if (error instanceof Error && error.message.includes("not properly configured")) {
				// If the provider is not configured, return false instead of throwing
				return false;
			}
			return this.handleError(error, "Error checking Lemon Squeezy payment status");
		}
	}

	/**
	 * Check if a user has purchased a specific product
	 * @param userId The user ID
	 * @param productId The product ID
	 * @returns True if the user has purchased the product
	 */
	async hasUserPurchasedProduct(userId: string, productId: string): Promise<boolean> {
		try {
			this.checkProviderReady();

			const userEmail = await this.getUserEmail(userId);
			if (!userEmail) {
				return false;
			}

			// Get user orders
			const orders = await listOrders({});
			const userOrders =
				orders.data?.data?.filter((order) => {
					const attributes = order.attributes as any;
					const customData = attributes.custom_data || {};

					// Check if either the user ID matches or the email matches
					return (
						(typeof customData === "object" && customData?.user_id === userId) ||
						attributes.user_email?.toLowerCase() === userEmail.toLowerCase()
					);
				}) ?? [];

			// Check if any paid order includes the specific product ID
			const hasPurchased = userOrders.some((order) => {
				const attributes = order.attributes;

				// Check if order is paid and contains the product
				return (
					attributes.status === "paid" &&
					attributes.first_order_item?.product_id === Number(productId)
				);
			});

			return hasPurchased;
		} catch (error) {
			if (error instanceof Error && error.message.includes("not properly configured")) {
				return false;
			}
			return this.handleError(error, "Error checking Lemon Squeezy product purchase");
		}
	}

	/**
	 * Check if a user has an active subscription
	 * @param userId The user ID
	 * @returns True if the user has an active subscription
	 */
	async hasUserActiveSubscription(userId: string): Promise<boolean> {
		try {
			this.checkProviderReady();

			const userEmail = await this.getUserEmail(userId);
			if (!userEmail) {
				return false;
			}

			// Get user subscriptions
			try {
				// We need to use the Lemon Squeezy SDK to get subscriptions
				// Type assertion here since the SDK types may not be complete
				const lemonClient = lemonSqueezySetup({
					apiKey: this.apiKey ?? "",
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
							attributes.user_email?.toLowerCase() === userEmail.toLowerCase()
						);
					}) ?? [];

				// Check if any subscription is active
				const hasActiveSubscription = userSubscriptions.some((subscription: any) => {
					const attributes = subscription.attributes as any;
					return attributes.status === "active";
				});

				return hasActiveSubscription;
			} catch (error) {
				logger.error("Error checking Lemon Squeezy subscriptions:", error);
				return false;
			}
		} catch (error) {
			if (error instanceof Error && error.message.includes("not properly configured")) {
				return false;
			}
			return this.handleError(error, "Error checking Lemon Squeezy subscription");
		}
	}

	/**
	 * Get all products a user has purchased
	 * @param userId The user ID
	 * @returns Array of purchased products
	 */
	async getUserPurchasedProducts(userId: string): Promise<ProductData[]> {
		try {
			this.checkProviderReady();

			const userEmail = await this.getUserEmail(userId);
			if (!userEmail) {
				return [];
			}

			// Get user orders
			const orders = await listOrders({});
			const userOrders =
				orders.data?.data?.filter((order) => {
					const attributes = order.attributes as any;
					const customData = attributes.custom_data || {};

					// Check if either the user ID matches or the email matches
					return (
						(typeof customData === "object" && customData?.user_id === userId) ||
						attributes.user_email?.toLowerCase() === userEmail.toLowerCase()
					);
				}) ?? [];

			// Extract unique products from paid orders
			const purchasedVariantIds = new Set<number>();
			const purchasedProducts: ProductData[] = [];

			// Use for...of loop instead of forEach
			for (const order of userOrders) {
				const attributes = order.attributes;

				// Only consider paid orders
				if (attributes.status === "paid" && attributes.first_order_item) {
					const variantId = attributes.first_order_item.variant_id;

					// Only add each variant once
					if (!purchasedVariantIds.has(variantId)) {
						purchasedVariantIds.add(variantId);
						purchasedProducts.push({
							id: String(attributes.first_order_item.product_id),
							name: attributes.first_order_item.product_name,
							price: attributes.first_order_item.price / 100, // Convert cents to dollars
							provider: this.id,
							attributes: {
								variant_id: variantId,
								variant_name: attributes.first_order_item.variant_name,
								purchaseDate: new Date(attributes.created_at),
							},
						});
					}
				}
			}

			return purchasedProducts;
		} catch (error) {
			if (error instanceof Error && error.message.includes("not properly configured")) {
				return [];
			}
			return this.handleError(error, "Error getting Lemon Squeezy purchased products");
		}
	}

	/**
	 * Get all orders from Lemon Squeezy
	 * @returns Array of orders
	 */
	async getAllOrders(): Promise<OrderData[]> {
		try {
			this.checkProviderReady();

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
					amount,
					status: attributes.status as "paid" | "refunded" | "pending",
					productName: attributes.first_order_item?.variant_name ?? "Unknown Product",
					purchaseDate: new Date(attributes.created_at),
					processor: this.id,
					discountCode: (attr.discount_code || null) as string | null,
					isFreeProduct: amount === 0,
					attributes,
				};
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("not properly configured")) {
				return [];
			}
			return this.handleError(error, "Error fetching Lemon Squeezy orders");
		}
	}

	/**
	 * Get orders for a specific email
	 * @param email The email to search for
	 * @returns Array of orders
	 */
	async getOrdersByEmail(email: string): Promise<OrderData[]> {
		try {
			this.checkProviderReady();

			const response = await listOrders({
				filter: {
					userEmail: email.trim(),
				},
			});

			if (!response || !Array.isArray(response.data?.data)) {
				return [];
			}

			return response.data.data.map((order) => {
				const attributes = order.attributes;
				const amount = attributes.subtotal > 0 ? attributes.subtotal / 100 : 0;
				const attr = attributes as any;

				return {
					id: order.id,
					orderId: attributes.identifier,
					userEmail: attributes.user_email ?? "Unknown",
					userName: attributes.user_name,
					amount,
					status: attributes.status as "paid" | "refunded" | "pending",
					productName: attributes.first_order_item?.variant_name ?? "Unknown Product",
					purchaseDate: new Date(attributes.created_at),
					processor: this.id,
					discountCode: (attr.discount_code || null) as string | null,
					isFreeProduct: amount === 0,
					attributes,
				};
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("not properly configured")) {
				return [];
			}
			return this.handleError(error, "Error fetching Lemon Squeezy orders by email");
		}
	}

	/**
	 * Get a single order by ID
	 * @param orderId The order ID
	 * @returns The order if found, null otherwise
	 */
	async getOrderById(orderId: string): Promise<OrderData | null> {
		try {
			this.checkProviderReady();

			// LemonSqueezy SDK doesn't have a direct getOrderById method
			// So we'll get all orders and filter
			const orders = await this.getAllOrders();
			return orders.find((order) => order.orderId === orderId) ?? null;
		} catch (error) {
			if (error instanceof Error && error.message.includes("not properly configured")) {
				return null;
			}
			return this.handleError(error, "Error fetching Lemon Squeezy order by ID");
		}
	}

	/**
	 * Import payments from Lemon Squeezy
	 * @returns Statistics about the import process
	 */
	async importPayments(): Promise<ImportStats> {
		try {
			this.checkProviderReady();

			logger.debug("Starting Lemon Squeezy payment import");
			const stats: ImportStats = {
				total: 0,
				imported: 0,
				skipped: 0,
				errors: 0,
				usersCreated: 0,
			};

			if (!db) {
				throw new Error("Database is not initialized");
			}

			// Get all orders from Lemon Squeezy
			const lemonSqueezyOrders = await this.getAllOrders();
			stats.total = lemonSqueezyOrders.length;
			logger.debug(`Found ${lemonSqueezyOrders.length} Lemon Squeezy orders`);

			// Process each order
			for (const order of lemonSqueezyOrders) {
				try {
					// Try to find or create user by email
					let userId = null;
					const userEmail = order.userEmail;
					const userName = order.userName;

					if (userEmail && userEmail !== "Unknown") {
						// Look for existing user with this email
						const existingUser = await db.query.users.findFirst({
							where: eq(users.email, userEmail),
						});

						if (existingUser) {
							userId = existingUser.id;
							logger.debug(`Found existing user for email ${userEmail}`);

							// Update user information with data from payment
							const updates: Record<string, any> = {};

							// Update name if needed
							if (userName && !existingUser.name) {
								updates.name = userName;
							}

							// Extract additional user information from the order
							const orderAny = order as any;

							// Prepare metadata fields to update
							const metadataUpdates: Record<string, any> = {};

							if (orderAny.userAddress) {
								metadataUpdates.address = orderAny.userAddress;
							}

							if (orderAny.userCity || orderAny.userCountry) {
								// Store location information in metadata
								metadataUpdates.locationInfo = {
									city: orderAny.userCity,
									country: orderAny.userCountry,
								};
							}

							if (orderAny.userPhone) {
								// Store phone in metadata
								metadataUpdates.phoneNumber = orderAny.userPhone;
							}

							// Additional custom user data fields
							if (orderAny.customUserData && Object.keys(orderAny.customUserData).length > 0) {
								metadataUpdates.customUserData = orderAny.customUserData;
							}

							// Update or merge metadata
							interface UserMetadata {
								lastPaymentInfo: {
									processor: string;
									orderId: string;
									productName: string;
									amount: number;
									purchaseDate: Date;
								};
								lastImportedAt: string;
								paymentSources: string[];
								locationInfo?: {
									city?: string | null;
									country?: string | null;
								};
								phoneNumber?: string | null;
								customUserData?: Record<string, any>;
								address?: string | null;
								[key: string]: any; // Allow for additional properties
							}

							let newMetadata: Partial<UserMetadata> = {
								lastPaymentInfo: {
									processor: this.id,
									orderId: order.orderId,
									productName: order.productName,
									amount: order.amount,
									purchaseDate: order.purchaseDate,
								},
								lastImportedAt: new Date().toISOString(),
							};

							// Add all metadata updates to newMetadata
							Object.assign(newMetadata, metadataUpdates);

							// If user has existing metadata, merge it
							if (existingUser.metadata) {
								try {
									const currentMetadata = JSON.parse(existingUser.metadata as string);
									// Don't overwrite existing fields that aren't being updated
									newMetadata = {
										...currentMetadata,
										...newMetadata,
										paymentSources: [...(currentMetadata.paymentSources || []), this.id],
									};
								} catch (err) {
									logger.warn(`Failed to parse existing metadata for user ${existingUser.id}`, err);
									// If parsing fails, just set paymentSources
									newMetadata.paymentSources = [this.id];
								}
							} else {
								newMetadata.paymentSources = [this.id];
							}

							// Update metadata in the updates object
							updates.metadata = JSON.stringify(newMetadata);

							// Only update if we have changes
							if (Object.keys(updates).length > 0) {
								await db
									.update(users)
									.set({
										...updates,
										updatedAt: new Date(),
									})
									.where(eq(users.id, existingUser.id));
								logger.debug(`Updated user information for ${userEmail}`);
							}
						} else {
							// Create a new user with this email using the UserService
							logger.debug(`Creating new user for email ${userEmail}`);
							try {
								// Extract additional user information
								const orderAny = order as any;

								// Create the user with UserService to ensure proper initialization with team
								const newUser = await userService.ensureUserExists({
									id: crypto.randomUUID(), // Generate a new UUID for the user
									email: userEmail,
									name: userName || null,
									image: null,
								});

								if (newUser) {
									userId = newUser.id;
									stats.usersCreated++;
									logger.debug(`Created new user ${newUser.id} for email ${userEmail}`);

									// After user is created, update with additional payment metadata
									const userMetadata: Record<string, any> = {
										source: `${this.id}_import`,
										importedAt: new Date().toISOString(),
										paymentInfo: {
											processor: this.id,
											orderId: order.orderId,
											productName: order.productName,
											amount: order.amount,
											purchaseDate: order.purchaseDate,
										},
										// Store all original attributes to preserve any additional info
										originalData: order.attributes,
										paymentSources: [this.id],
									};

									// Add location information if available
									if (orderAny.userCity || orderAny.userCountry) {
										userMetadata.locationInfo = {
											city: orderAny.userCity,
											country: orderAny.userCountry,
										};
									}

									// Add phone if available
									if (orderAny.userPhone) {
										userMetadata.phoneNumber = orderAny.userPhone;
									}

									// Add custom user data if available
									if (orderAny.customUserData && Object.keys(orderAny.customUserData).length > 0) {
										userMetadata.customUserData = orderAny.customUserData;
									}

									// Add address if available
									if (orderAny.userAddress) {
										userMetadata.address = orderAny.userAddress;
									}

									// Update the user with the additional metadata
									await db
										.update(users)
										.set({
											metadata: JSON.stringify(userMetadata),
											updatedAt: new Date(),
										})
										.where(eq(users.id, newUser.id));
								} else {
									throw new Error("Failed to create user");
								}
							} catch (createError) {
								logger.error(`Failed to create user for ${userEmail}`, createError);
								// Continue without user ID, we'll try to find a matching user ID later
							}
						}
					} else {
						// No email provided, generate a placeholder
						logger.debug("No email provided for order, generating placeholder");
						// We'll still process the payment but leave userId as null
					}

					// Check if order already exists in the database
					const existingPayment = await db.query.payments.findFirst({
						where: eq(payments.orderId, order.orderId),
					});

					if (existingPayment) {
						logger.debug(`Order ${order.orderId} already exists, updating`);
						// Update existing payment in case data has changed
						await db
							.update(payments)
							.set({
								amount: Math.round(order.amount * 100), // Convert to cents for storage
								status: order.status === "paid" ? "completed" : order.status,
								updatedAt: new Date(),
								// Update userId if we found/created one and it was previously null
								...(userId && !existingPayment.userId ? { userId } : {}),
								metadata: JSON.stringify({
									order_data: order.attributes,
								}),
							})
							.where(eq(payments.orderId, order.orderId));
						stats.skipped++;
						continue;
					}

					// Create new payment record - only if we have a userId
					if (userId) {
						await db.insert(payments).values({
							orderId: order.orderId,
							userId,
							amount: Math.round(order.amount * 100), // Convert to cents for storage
							status: order.status === "paid" ? "completed" : order.status,
							processor: this.id,
							createdAt: order.purchaseDate,
							updatedAt: new Date(),
							metadata: JSON.stringify({
								order_data: order.attributes,
							}),
						});

						logger.debug(`Imported ${this.name} order ${order.orderId}`);
						stats.imported++;
					} else {
						logger.debug(`Skipping ${this.name} order ${order.orderId} - no user found or created`);
						stats.skipped++;
					}
				} catch (error) {
					logger.error(`Error importing ${this.name} order ${order.orderId}`, error);
					stats.errors++;
				}
			}

			logger.info(`${this.name} payment import complete`, stats);
			return stats;
		} catch (error) {
			return this.handleError(error, `Error importing ${this.name} payments`);
		}
	}

	/**
	 * Handle a webhook event
	 * @param event The webhook event
	 */
	async handleWebhookEvent(event: any): Promise<void> {
		try {
			this.checkProviderReady();

			logger.debug(`Processing ${this.name} webhook`, { type: event?.type });

			// TODO: Implement webhook handling for Lemon Squeezy
			// Example implementation:
			// switch (event?.type) {
			//   case "order_created":
			//     // Handle order created
			//     break;
			//   case "subscription_created":
			//     // Handle subscription created
			//     break;
			//   // Add more cases as needed
			//   default:
			//     logger.debug(`Unknown ${this.name} webhook event type`, { type: event?.type });
			// }
		} catch (error) {
			this.handleError(error, `Error processing ${this.name} webhook`);
		}
	}

	/**
	 * Create a checkout URL for a product
	 * @param options Checkout options
	 * @returns The checkout URL
	 */
	async createCheckoutUrl(options: CheckoutOptions): Promise<string | null> {
		try {
			this.checkProviderReady();

			// This is a placeholder implementation since LemonSqueezy SDK
			// doesn't have a direct checkout URL creation method in its types
			logger.debug(`Creating ${this.name} checkout URL`, { options });

			// TODO: Implement checkout URL creation for Lemon Squeezy

			// For now, return a generic URL with the product ID
			return `https://checkout.lemonsqueezy.com/buy/${options.productId}`;
		} catch (error) {
			if (error instanceof Error && error.message.includes("not properly configured")) {
				return null;
			}
			return this.handleError(error, `Error creating ${this.name} checkout URL`);
		}
	}

	/**
	 * List all products
	 * @returns Array of products
	 */
	async listProducts(): Promise<ProductData[]> {
		try {
			this.checkProviderReady();

			const response = await listProducts({});
			const products = response.data?.data ?? [];

			return products.map((product) => {
				const attributes = product.attributes as any;
				return {
					id: String(product.id),
					name: attributes.name,
					description: attributes.description,
					price: attributes.price_formatted
						? Number.parseFloat(attributes.price_formatted.replace(/[^0-9.]/g, ""))
						: undefined,
					isSubscription: attributes.is_subscription,
					provider: this.id,
					attributes: attributes,
				};
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("not properly configured")) {
				return [];
			}
			return this.handleError(error, `Error listing ${this.name} products`);
		}
	}
}

// Export a singleton instance
export const lemonSqueezyProvider = new LemonSqueezyProvider();
