import {
	getAllOrders as getLemonSqueezyOrders,
	getLemonSqueezyPaymentStatus,
	getUserPurchasedProducts as getUserPurchasedLemonsqueezyProducts,
	hasUserActiveSubscription as hasUserActiveLemonsqueezySubscription,
	hasUserPurchasedProduct as hasUserPurchasedLemonsqueezyProduct,
} from "@/lib/lemonsqueezy";
import { logger } from "@/lib/logger";
import {
	getAllOrders as getPolarOrders,
	getPolarPaymentStatus,
	getUserPurchasedProducts as getUserPurchasedPolarProducts,
	hasUserActiveSubscription as hasUserActivePolarSubscription,
	hasUserPurchasedProduct as hasUserPurchasedPolarProduct,
} from "@/lib/polar";
import { db, isDatabaseInitialized } from "@/server/db";
import { type Payment, payments, users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

// Define PaymentData interface for frontend use
export interface PaymentData {
	id: string;
	orderId: string;
	userEmail: string;
	userName: string | null;
	userImage: string | null;
	amount: number;
	status: "paid" | "refunded" | "pending";
	productName: string;
	purchaseDate: Date;
	processor: string;
	isFreeProduct: boolean;
}

// Define interface for Purchase (used in user data)
export interface Purchase {
	id: string;
	productName: string;
	amount: number;
	status: "paid" | "refunded" | "pending";
	purchaseDate: Date;
	orderId: string;
	processor?: string; // Payment processor (lemonsqueezy, polar, etc.)
	isFreeProduct: boolean;
}

// Define UserData interface for admin dashboard
export interface UserData {
	id: string;
	email: string;
	name: string | null;
	image: string | null;
	role?: string;
	hasPaid: boolean;
	lemonSqueezyStatus: boolean;
	polarStatus: boolean;
	hasActiveSubscription: boolean;
	hadSubscription: boolean; // Tracks if user had a subscription in the past
	createdAt: Date;
	lastPurchaseDate: Date | null;
	totalPurchases: number;
	purchases?: Purchase[];
}

// Convert class to object with functions to satisfy linter
const PaymentService = {
	/**
	 * Gets the payment status for a user
	 * @param userId - The ID of the user
	 * @returns Whether the user has paid
	 */
	async getUserPaymentStatus(userId: string): Promise<boolean> {
		logger.debug("Checking payment status", { userId });

		// Check both payment processors
		const lemonSqueezyStatus = await getLemonSqueezyPaymentStatus(userId);
		const polarStatus = await getPolarPaymentStatus(userId);

		const status = lemonSqueezyStatus || polarStatus;
		logger.debug("Payment status result", {
			userId,
			status,
			lemonSqueezyStatus,
			polarStatus,
		});

		return status;
	},

	/**
	 * Checks if a user has purchased a specific product
	 * @param userId The user ID
	 * @param productId The product ID
	 * @param provider Optional payment provider to check (lemonsqueezy or polar)
	 * @returns True if the user has purchased the product
	 */
	async hasUserPurchasedProduct({
		userId,
		productId,
		provider = "lemonsqueezy",
	}: {
		userId: string;
		productId: string;
		provider?: "lemonsqueezy" | "polar";
	}): Promise<boolean> {
		try {
			// Check if the database is initialized
			if (!isDatabaseInitialized() || !db) {
				logger.warn("Database not initialized when checking purchase");
				return false;
			}

			// Check if the user exists
			const user = await db.query.users.findFirst({
				where: eq(users.id, userId),
			});

			if (!user) {
				return false;
			}

			// If provider is specified, only check that provider
			if (provider === "lemonsqueezy") {
				return await hasUserPurchasedLemonsqueezyProduct(userId, productId);
			}

			if (provider === "polar") {
				return await hasUserPurchasedPolarProduct(userId, productId);
			}

			// Otherwise, check both providers
			const lemonsqueezyPurchased = await hasUserPurchasedLemonsqueezyProduct(userId, productId);
			if (lemonsqueezyPurchased) {
				return true;
			}

			const polarPurchased = await hasUserPurchasedPolarProduct(userId, productId);
			return polarPurchased;
		} catch (error) {
			console.error("Error checking if user purchased product:", error);
			return false;
		}
	},

	/**
	 * Checks if a user has an active subscription
	 * @param userId The user ID
	 * @param provider Optional payment provider to check (lemonsqueezy or polar)
	 * @returns True if the user has an active subscription
	 */
	async hasUserActiveSubscription({
		userId,
		provider = "lemonsqueezy",
	}: {
		userId: string;
		provider?: "lemonsqueezy" | "polar";
	}): Promise<boolean> {
		try {
			// Check if the database is initialized
			if (!isDatabaseInitialized() || !db) {
				logger.warn("Database not initialized when checking subscription");
				return false;
			}

			// Check if the user exists
			const user = await db.query.users.findFirst({
				where: eq(users.id, userId),
			});

			if (!user) {
				return false;
			}

			// If provider is specified, only check that provider
			if (provider === "lemonsqueezy") {
				return await hasUserActiveLemonsqueezySubscription(userId);
			}

			if (provider === "polar") {
				return await hasUserActivePolarSubscription(userId);
			}

			// Otherwise, check both providers
			const lemonsqueezyActive = await hasUserActiveLemonsqueezySubscription(userId);
			if (lemonsqueezyActive) {
				return true;
			}

			const polarActive = await hasUserActivePolarSubscription(userId);
			return polarActive;
		} catch (error) {
			console.error("Error checking if user has active subscription:", error);
			return false;
		}
	},

	/**
	 * Gets all products a user has purchased
	 * @param userId The user ID
	 * @param provider Optional payment provider to check (lemonsqueezy or polar)
	 * @returns Array of purchased products
	 */
	async getUserPurchasedProducts(
		userId: string,
		provider?: "lemonsqueezy" | "polar"
	): Promise<any[]> {
		try {
			// Check if the database is initialized
			if (!isDatabaseInitialized() || !db) {
				logger.warn("Database not initialized when getting purchased products");
				return [];
			}

			// Check if the user exists
			const user = await db.query.users.findFirst({
				where: eq(users.id, userId),
			});

			if (!user) {
				return [];
			}

			let products: any[] = [];

			// If provider is specified, only check that provider
			if (provider === "lemonsqueezy" || !provider) {
				const lemonsqueezyProducts = await getUserPurchasedLemonsqueezyProducts(userId);
				products = [
					...products,
					...lemonsqueezyProducts.map((p) => ({ ...p, provider: "lemonsqueezy" })),
				];
			}

			if (provider === "polar" || !provider) {
				const polarProducts = await getUserPurchasedPolarProducts(userId);
				// Polar products already have provider: "polar" added
				products = [...products, ...polarProducts];
			}

			return products;
		} catch (error) {
			console.error("Error getting user purchased products:", error);
			return [];
		}
	},

	/**
	 * Gets all payments for a user
	 * @param userId - The ID of the user
	 * @returns Array of payments
	 */
	async getUserPayments(userId: string): Promise<Payment[]> {
		logger.debug("Fetching user payments", { userId });

		if (!isDatabaseInitialized()) {
			logger.error("Database not initialized when fetching user payments", {
				userId,
			});
			throw new Error("Database is not initialized");
		}

		if (!db) {
			throw new Error("Database is not initialized");
		}

		const userPayments = await db?.query.payments.findMany({
			where: eq(payments.userId, userId),
			orderBy: (payments, { desc }) => [desc(payments.createdAt)],
		});

		logger.debug("User payments fetched", {
			userId,
			count: userPayments.length,
			totalAmount: userPayments.reduce((sum: number, p: Payment) => sum + (p.amount || 0), 0),
		});

		return userPayments;
	},

	/**
	 * Creates a new payment in the database
	 * @param data Payment data to create
	 * @returns The created payment
	 */
	async createPayment(data: {
		userId: string;
		orderId: string;
		amount: number;
		status: string;
		processor?: string;
		isFreeProduct?: boolean;
		metadata?: Record<string, unknown>;
	}): Promise<Payment> {
		try {
			// Check if the database is initialized
			if (!isDatabaseInitialized() || !db) {
				throw new Error("Database not initialized");
			}

			// Check if the payment already exists
			const existingPayment = await db.query.payments.findFirst({
				where: eq(payments.orderId, data.orderId),
			});

			if (existingPayment) {
				logger.debug("Payment already exists", { orderId: data.orderId });
				return existingPayment;
			}

			// Create the payment
			const [payment] = await db
				.insert(payments)
				.values({
					userId: data.userId,
					orderId: data.orderId,
					amount: data.amount,
					status: data.status,
					processor: data.processor || "unknown",
					isFreeProduct: data.isFreeProduct || false,
					metadata: data.metadata ? JSON.stringify(data.metadata) : "{}",
				})
				.returning();

			logger.debug("Payment created", { id: payment.id, orderId: data.orderId });

			return payment;
		} catch (error) {
			console.error("Error creating payment:", error);
			throw error;
		}
	},

	/**
	 * Updates a payment's status
	 * @param orderId - The order ID
	 * @param status - The new status
	 * @returns The updated payment
	 */
	async updatePaymentStatus(orderId: string, status: string): Promise<Payment> {
		logger.debug("Updating payment status", { orderId, status });

		if (!db) {
			logger.error("Database not initialized when updating payment status", {
				orderId,
			});
			throw new Error("Database is not initialized");
		}

		const [payment] = await db
			.update(payments)
			.set({ status, updatedAt: new Date() })
			.where(eq(payments.orderId, orderId))
			.returning();

		if (!payment) {
			logger.error("Payment not found for status update", { orderId, status });
			throw new Error("Payment not found");
		}

		logger.debug("Payment status updated", {
			paymentId: payment.id,
			orderId,
			oldStatus: payment.status,
			newStatus: status,
			processor: payment.processor,
		});

		return payment;
	},

	/**
	 * Gets a payment by order ID
	 * @param orderId - The order ID
	 * @returns The payment if found
	 */
	async getPaymentByOrderId(orderId: string): Promise<Payment | null> {
		logger.debug("Fetching payment by order ID", { orderId });

		if (!db) {
			logger.error("Database not initialized when fetching payment", {
				orderId,
			});
			throw new Error("Database is not initialized");
		}

		const payment = await db?.query.payments.findFirst({
			where: eq(payments.orderId, orderId),
		});

		if (payment) {
			logger.debug("Payment found", {
				paymentId: payment.id,
				orderId,
				status: payment.status,
				processor: payment.processor,
			});
			return payment;
		}

		logger.debug("Payment not found", { orderId });
		return null;
	},

	/**
	 * Gets all payments with user information for admin dashboard
	 * This fetches from all configured payment processors
	 * @returns Array of payment data with user information
	 */
	async getPaymentsWithUsers(): Promise<PaymentData[]> {
		try {
			// Check if the database is initialized
			if (!isDatabaseInitialized() || !db) {
				logger.warn("Database not initialized when getting payments with users");
				return [];
			}

			// Get all payments from the database
			const allPayments = await db.query.payments.findMany();

			// Get all users from the database
			const allUsers = await db.query.users.findMany();

			// Combine them into PaymentData objects
			const paymentData: PaymentData[] = [];

			// Process database payments
			for (const payment of allPayments) {
				// Find the user for this payment
				const user = allUsers.find((u) => u.id === payment.userId);

				// Try to parse metadata for additional info
				let productName = "Unknown Product";
				let isFreeProduct = payment.isFreeProduct || false;
				try {
					if (payment.metadata) {
						const metadata = JSON.parse(payment.metadata as string);
						if (metadata.productName) {
							productName = metadata.productName;
						}
						if (metadata.isFreeProduct !== undefined) {
							isFreeProduct = metadata.isFreeProduct;
						}
					}
				} catch (error) {
					// Ignore parsing errors
				}

				paymentData.push({
					id: payment.id.toString(),
					orderId: payment.orderId || "",
					userEmail: user?.email || "unknown@example.com",
					userName: user?.name || null,
					userImage: user?.image || null,
					amount: (payment.amount || 0) / 100, // Convert from cents to dollars
					status: payment.status as "paid" | "refunded" | "pending",
					productName,
					purchaseDate: new Date(payment.createdAt),
					processor: payment.processor || "unknown",
					isFreeProduct,
				});
			}

			// Get payments from Lemon Squeezy
			try {
				const orders = await getLemonSqueezyOrders();

				for (const order of orders) {
					// Check if we already have this order in the database
					const existingOrder = paymentData.find((p) => p.orderId === order.orderId);

					if (!existingOrder) {
						// Try to find a user with matching email
						const user = allUsers.find(
							(u) => u.email?.toLowerCase() === order.userEmail.toLowerCase()
						);

						// Determine if it's a free product (price is 0 but not a discounted product)
						// For Lemon Squeezy, we're assuming products with 0 amount that don't have a
						// discount code are considered free products
						const isFreeProduct = order.amount === 0 && !order.discountCode;

						paymentData.push({
							id: order.id,
							orderId: order.orderId,
							userEmail: order.userEmail,
							userName: order.userName,
							userImage: user?.image || null,
							amount: order.amount, // This amount is already in dollars
							status: order.status,
							productName: order.productName,
							purchaseDate: order.purchaseDate,
							processor: "lemonsqueezy",
							isFreeProduct,
						});
					}
				}
			} catch (error) {
				logger.error("Error fetching Lemon Squeezy orders:", error);
			}

			// Get payments from Polar
			try {
				const orders = await getPolarOrders();

				for (const order of orders) {
					// Check if we already have this order in the database
					const existingOrder = paymentData.find((p) => p.orderId === order.orderId);

					if (!existingOrder) {
						// Try to find a user with matching email
						const user = allUsers.find(
							(u) => u.email?.toLowerCase() === order.userEmail.toLowerCase()
						);

						// For Polar, determine if a product with 0 amount is a free product
						// or a discounted product (similar logic to Lemon Squeezy)
						const isFreeProduct = order.amount === 0 && !order.discountCode;

						paymentData.push({
							id: order.id,
							orderId: order.orderId,
							userEmail: order.userEmail,
							userName: order.userName,
							userImage: user?.image || null,
							amount: order.amount, // This amount is already in dollars
							status: order.status,
							productName: order.productName,
							purchaseDate: order.purchaseDate,
							processor: "polar",
							isFreeProduct,
						});
					}
				}
			} catch (error) {
				logger.error("Error fetching Polar orders:", error);
			}

			// Sort by date (newest first)
			return paymentData.sort((a, b) => {
				return b.purchaseDate.getTime() - a.purchaseDate.getTime();
			});
		} catch (error) {
			logger.error("Error getting payments with users:", error);
			return [];
		}
	},

	/**
	 * Fetches all users with their payment status from all payment processors
	 * This is used in the admin dashboard to display user payment information
	 * @returns Array of users with payment information
	 */
	async getUsersWithPayments(): Promise<UserData[]> {
		try {
			// Check if the database is initialized
			if (!isDatabaseInitialized() || !db) {
				logger.warn("Database not initialized when getting users with payments");
				return [];
			}

			// Get all users
			const allUsers = await db.query.users.findMany();

			// Get all payments
			const allPayments = await db.query.payments.findMany();

			// Map users to UserData format
			const userData: UserData[] = [];

			for (const user of allUsers) {
				// Get payments for this user
				const userPayments = allPayments.filter((payment) => payment.userId === user.id);

				// Sort payments by date (newest first)
				userPayments.sort((a, b) => {
					return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
				});

				// Map payments to Purchase format
				const purchases: Purchase[] = userPayments.map((payment) => {
					// Try to parse metadata for additional info
					let productName = "Unknown Product";
					try {
						if (payment.metadata) {
							const metadata = JSON.parse(payment.metadata as string);
							if (metadata.productName) {
								productName = metadata.productName;
							}
						}
					} catch (error) {
						// Ignore parsing errors
					}

					return {
						id: String(payment.id),
						productName,
						amount: (payment.amount ?? 0) / 100, // Convert from cents to dollars
						status: payment.status as "paid" | "refunded" | "pending",
						purchaseDate: new Date(payment.createdAt),
						orderId: payment.orderId ?? "",
						processor: payment.processor || "unknown",
						isFreeProduct: false,
					};
				});

				// Check payment status from payment processors
				const lemonSqueezyStatus = await getLemonSqueezyPaymentStatus(user.id);
				const polarStatus = await getPolarPaymentStatus(user.id);

				// Check subscription status from payment processors
				const lemonSqueezySubscriptionActive = await hasUserActiveLemonsqueezySubscription(user.id);
				const polarSubscriptionActive = await hasUserActivePolarSubscription(user.id);
				const hadSubscription = user.metadata
					? JSON.parse(user.metadata as string)?.hadSubscription || false
					: false;

				// Get the last purchase date
				const lastPurchaseDate =
					userPayments.length > 0 ? new Date(userPayments[0].createdAt) : null;

				// Create user data object
				userData.push({
					id: user.id,
					email: user.email || "",
					name: user.name,
					image: user.image,
					role: user.role,
					hasPaid: lemonSqueezyStatus || polarStatus,
					lemonSqueezyStatus,
					polarStatus,
					hasActiveSubscription: lemonSqueezySubscriptionActive || polarSubscriptionActive,
					hadSubscription,
					createdAt: new Date(user.createdAt),
					lastPurchaseDate,
					totalPurchases: userPayments.length,
					purchases,
				});
			}

			return userData;
		} catch (error) {
			console.error("Error getting users with payments:", error);
			return [];
		}
	},

	/**
	 * Imports payments from Lemon Squeezy into the database
	 * @returns Stats about the import process
	 */
	async importLemonSqueezyPayments(): Promise<{
		total: number;
		imported: number;
		skipped: number;
		errors: number;
		usersCreated: number;
	}> {
		logger.debug("Starting Lemon Squeezy payment import");
		const stats = { total: 0, imported: 0, skipped: 0, errors: 0, usersCreated: 0 };

		try {
			if (!isDatabaseInitialized() || !db) {
				throw new Error("Database is not initialized");
			}

			// Get all orders from Lemon Squeezy
			const lemonSqueezyOrders = await getLemonSqueezyOrders();
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
							// These are cast to any because we've added fields to the response that might not be in the type
							const orderAny = order as any;

							// Update user profile with any available information that might be missing
							// Check if address exists on user type before attempting to update
							const existingUserAny = existingUser as any;
							if (orderAny.userAddress && existingUserAny.address === undefined) {
								// Don't directly update address field since it might not exist in schema
								// We'll store it in metadata instead
							}

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
									processor: "lemonsqueezy",
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
										paymentSources: [...(currentMetadata.paymentSources || []), "lemonsqueezy"],
									};
								} catch (err) {
									logger.warn(`Failed to parse existing metadata for user ${existingUser.id}`, err);
									// If parsing fails, just set paymentSources
									newMetadata.paymentSources = ["lemonsqueezy"];
								}
							} else {
								newMetadata.paymentSources = ["lemonsqueezy"];
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
							// Create a new user with this email
							logger.debug(`Creating new user for email ${userEmail}`);
							try {
								// Extract additional user information
								const orderAny = order as any;

								// Prepare metadata with all available user information
								const userMetadata: Record<string, any> = {
									source: "lemonsqueezy_import",
									importedAt: new Date().toISOString(),
									paymentInfo: {
										processor: "lemonsqueezy",
										orderId: order.orderId,
										productName: order.productName,
										amount: order.amount,
										purchaseDate: order.purchaseDate,
									},
									// Store all original attributes to preserve any additional info
									originalData: order.attributes,
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

								// Add address if available (this might also be directly added to the user record)
								if (orderAny.userAddress) {
									userMetadata.address = orderAny.userAddress;
								}

								const [newUser] = await db
									.insert(users)
									.values({
										email: userEmail,
										name: userName || null,
										role: "user",
										emailVerified: new Date(),
										createdAt: new Date(),
										updatedAt: new Date(),
										// Store additional payment metadata to have a complete user profile
										metadata: JSON.stringify(userMetadata),
									})
									.returning();

								if (newUser) {
									userId = newUser.id;
									stats.usersCreated++;
									logger.debug(`Created new user ${newUser.id} for email ${userEmail}`);
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
							processor: "lemonsqueezy",
							createdAt: order.purchaseDate,
							updatedAt: new Date(),
							metadata: JSON.stringify({
								order_data: order.attributes,
							}),
						});

						logger.debug(`Imported Lemon Squeezy order ${order.orderId}`);
						stats.imported++;
					} else {
						logger.debug(
							`Skipping Lemon Squeezy order ${order.orderId} - no user found or created`
						);
						stats.skipped++;
					}
				} catch (error) {
					logger.error(`Error importing Lemon Squeezy order ${order.orderId}`, error);
					stats.errors++;
				}
			}

			logger.info("Lemon Squeezy payment import complete", stats);
			return stats;
		} catch (error) {
			logger.error("Error importing Lemon Squeezy payments", error);
			throw error;
		}
	},

	/**
	 * Imports payments from Polar into the database
	 * @returns Stats about the import process
	 */
	async importPolarPayments(): Promise<{
		total: number;
		imported: number;
		skipped: number;
		errors: number;
		usersCreated: number;
	}> {
		logger.debug("Starting Polar payment import");
		const stats = { total: 0, imported: 0, skipped: 0, errors: 0, usersCreated: 0 };

		try {
			if (!isDatabaseInitialized() || !db) {
				throw new Error("Database is not initialized");
			}

			// Get all orders from Polar
			const polarOrders = await getPolarOrders();
			stats.total = polarOrders.length;
			logger.debug(`Found ${polarOrders.length} Polar orders`);

			// Process each order
			for (const order of polarOrders) {
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
							// These are cast to any because we've added fields to the response that might not be in the type
							const orderAny = order as any;

							// Prepare metadata fields to update
							const metadataUpdates: Record<string, any> = {};

							if (orderAny.userAddress) {
								metadataUpdates.address = orderAny.userAddress;
							}

							if (orderAny.userCity || orderAny.userCountry) {
								metadataUpdates.locationInfo = {
									city: orderAny.userCity,
									country: orderAny.userCountry,
								};
							}

							if (orderAny.userPhone) {
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
									processor: "polar",
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
										paymentSources: [...(currentMetadata.paymentSources || []), "polar"],
									};
								} catch (err) {
									logger.warn(`Failed to parse existing metadata for user ${existingUser.id}`, err);
									// If parsing fails, just set paymentSources
									newMetadata.paymentSources = ["polar"];
								}
							} else {
								newMetadata.paymentSources = ["polar"];
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
							// Create a new user with this email
							logger.debug(`Creating new user for email ${userEmail}`);
							try {
								// Extract additional user information
								const orderAny = order as any;

								// Prepare metadata with all available user information
								const userMetadata: Record<string, any> = {
									source: "polar_import",
									importedAt: new Date().toISOString(),
									paymentInfo: {
										processor: "polar",
										orderId: order.orderId,
										productName: order.productName,
										amount: order.amount,
										purchaseDate: order.purchaseDate,
									},
									// Store all original attributes to preserve any additional info
									originalData: order.attributes,
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

								const [newUser] = await db
									.insert(users)
									.values({
										email: userEmail,
										name: userName || null,
										role: "user",
										emailVerified: new Date(),
										createdAt: new Date(),
										updatedAt: new Date(),
										// Store additional payment metadata to have a complete user profile
										metadata: JSON.stringify(userMetadata),
									})
									.returning();

								if (newUser) {
									userId = newUser.id;
									stats.usersCreated++;
									logger.debug(`Created new user ${newUser.id} for email ${userEmail}`);
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
							processor: "polar",
							createdAt: order.purchaseDate,
							updatedAt: new Date(),
							metadata: JSON.stringify({
								order_data: order.attributes,
							}),
						});

						logger.debug(`Imported Polar order ${order.orderId}`);
						stats.imported++;
					} else {
						logger.debug(`Skipping Polar order ${order.orderId} - no user found or created`);
						stats.skipped++;
					}
				} catch (error) {
					logger.error(`Error importing Polar order ${order.orderId}`, error);
					stats.errors++;
				}
			}

			logger.info("Polar payment import complete", stats);
			return stats;
		} catch (error) {
			logger.error("Error importing Polar payments", error);
			throw error;
		}
	},

	/**
	 * Imports payments from all providers into the database
	 * @returns Stats about the import process for each provider
	 */
	async importAllPayments(): Promise<{
		lemonsqueezy: {
			total: number;
			imported: number;
			skipped: number;
			errors: number;
			usersCreated: number;
		};
		polar: {
			total: number;
			imported: number;
			skipped: number;
			errors: number;
			usersCreated: number;
		};
	}> {
		logger.info("Starting import of all payments");

		let lemonsqueezyStats = { total: 0, imported: 0, skipped: 0, errors: 0, usersCreated: 0 };
		let polarStats = { total: 0, imported: 0, skipped: 0, errors: 0, usersCreated: 0 };

		try {
			lemonsqueezyStats = await this.importLemonSqueezyPayments();
		} catch (error) {
			logger.error("Error during Lemon Squeezy import", error);
			lemonsqueezyStats.errors++;
		}

		try {
			polarStats = await this.importPolarPayments();
		} catch (error) {
			logger.error("Error during Polar import", error);
			polarStats.errors++;
		}

		logger.info("All payment imports complete", {
			lemonsqueezy: lemonsqueezyStats,
			polar: polarStats,
		});

		return {
			lemonsqueezy: lemonsqueezyStats,
			polar: polarStats,
		};
	},
};

export { PaymentService };
