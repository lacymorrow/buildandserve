import { logger } from "@/lib/logger";
import { db, isDatabaseInitialized } from "@/server/db";
import { type Payment, payments, users } from "@/server/db/schema";
import {
	getEnabledProviders,
	getProvider,
	hasProvider,
	isProviderEnabled,
	type OrderData,
	PaymentProvider,
	type ProductData,
} from "@/server/providers";
import { eq } from "drizzle-orm";
import { userService } from "./user-service";

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
	isInDatabase: boolean;
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
	hasActiveSubscription: boolean;
	hadSubscription: boolean; // Tracks if user had a subscription in the past
	createdAt: Date;
	lastPurchaseDate: Date | null;
	totalPurchases: number;
	purchases?: Purchase[];
	providerStatuses?: Record<string, boolean>;
}

// Convert class to object with functions to satisfy linter
const PaymentService = {
	/**
	 * Gets the payment status for a user across all enabled providers
	 * @param userId - The ID of the user
	 * @returns Whether the user has paid
	 */
	async getUserPaymentStatus(userId: string): Promise<boolean> {
		logger.debug("Checking payment status", { userId });

		// Aggregate status across all enabled providers
		let status = false;
		const providers = getEnabledProviders();
		const providerStatuses: Record<string, boolean> = {};

		if (providers.length === 0) {
			logger.warn("No payment providers are enabled");
			return false;
		}

		// Check each provider in parallel
		const statusPromises = providers.map(async (provider) => {
			try {
				const providerStatus = await provider.getPaymentStatus(userId);
				providerStatuses[provider.id] = providerStatus;

				// If any provider returns true, the overall status is true
				if (providerStatus) {
					status = true;
				}

				return { provider: provider.id, status: providerStatus };
			} catch (error) {
				logger.error(`Error checking payment status with provider ${provider.id}`, {
					userId,
					error,
					provider: provider.id,
				});
				return { provider: provider.id, status: false, error };
			}
		});

		const results = await Promise.all(statusPromises);

		logger.debug("Payment status results", {
			userId,
			status,
			providerStatuses: results,
		});

		return status;
	},

	/**
	 * Checks if a user has purchased a specific product
	 * @param userId The user ID
	 * @param productId The product ID
	 * @param provider Optional payment provider to check
	 * @returns True if the user has purchased the product
	 */
	async hasUserPurchasedProduct({
		userId,
		productId,
		provider,
	}: {
		userId: string;
		productId: string;
		provider?: string;
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
			if (provider && hasProvider(provider)) {
				const paymentProvider = getProvider(provider);
				if (paymentProvider && isProviderEnabled(provider)) {
					return await paymentProvider.hasUserPurchasedProduct(userId, productId);
				}
				return false;
			}

			// Otherwise, check all enabled providers
			const providers = getEnabledProviders();
			for (const provider of providers) {
				const purchased = await provider.hasUserPurchasedProduct(userId, productId);
				if (purchased) {
					return true;
				}
			}

			return false;
		} catch (error) {
			logger.error("Error checking if user purchased product:", error);
			return false;
		}
	},

	/**
	 * Checks if a user has an active subscription
	 * @param userId The user ID
	 * @param provider Optional payment provider to check
	 * @returns True if the user has an active subscription
	 */
	async hasUserActiveSubscription({
		userId,
		provider,
	}: {
		userId: string;
		provider?: string;
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
			if (provider && hasProvider(provider)) {
				const paymentProvider = getProvider(provider);
				if (paymentProvider && isProviderEnabled(provider)) {
					return await paymentProvider.hasUserActiveSubscription(userId);
				}
				return false;
			}

			// Otherwise, check all enabled providers
			const providers = getEnabledProviders();
			for (const provider of providers) {
				const hasActiveSubscription = await provider.hasUserActiveSubscription(userId);
				if (hasActiveSubscription) {
					return true;
				}
			}

			return false;
		} catch (error) {
			logger.error("Error checking if user has active subscription:", error);
			return false;
		}
	},

	/**
	 * Gets all products a user has purchased
	 * @param userId The user ID
	 * @param provider Optional payment provider to check
	 * @returns Array of purchased products
	 */
	async getUserPurchasedProducts(userId: string, provider?: string): Promise<ProductData[]> {
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

			let products: ProductData[] = [];

			// If provider is specified, only check that provider
			if (provider && hasProvider(provider)) {
				const paymentProvider = getProvider(provider);
				if (paymentProvider && isProviderEnabled(provider)) {
					products = await paymentProvider.getUserPurchasedProducts(userId);
				}
				return products;
			}

			// Otherwise, get products from all enabled providers
			const providers = getEnabledProviders();
			const productPromises = providers.map((provider) =>
				provider.getUserPurchasedProducts(userId)
			);

			const providerProducts = await Promise.all(productPromises);

			// Merge products from all providers
			products = providerProducts.flat();

			return products;
		} catch (error) {
			logger.error("Error getting user purchased products:", error);
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
			logger.error("Error creating payment:", error);
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
	 * This fetches from the database AND all configured payment providers,
	 * merging the results and indicating which records exist in the database.
	 * @returns Array of payment data with user information
	 */
	async getPaymentsWithUsers(): Promise<PaymentData[]> {
		const combinedPayments = new Map<string, PaymentData>();
		let allUsers: (typeof users.$inferSelect)[] = [];

		try {
			// Check if the database is initialized
			if (!isDatabaseInitialized() || !db) {
				logger.warn("Database not initialized when getting payments with users");
				// Proceed to fetch from APIs only if DB isn't ready? Or return []?
				// For now, let's attempt API fetch, but DB-dependent steps will fail.
			} else {
				// Get all users from the database (used for matching email to user info)
				allUsers = await db.query.users.findMany();

				// 1. Get all payments from the database
				const dbPayments = await db.query.payments.findMany();
				logger.debug(`Fetched ${dbPayments.length} payments from database.`);

				// Process database payments first
				for (const payment of dbPayments) {
					const user = allUsers.find((u) => u.id === payment.userId);
					let productName = "Unknown Product";
					let isFreeProduct = payment.isFreeProduct || false;
					try {
						if (payment.metadata) {
							const metadata = JSON.parse(payment.metadata as string);
							if (metadata.productName) {
								productName = metadata.productName;
							}
							// isFreeProduct might also be in metadata for older records?
							if (metadata.isFreeProduct !== undefined) {
								isFreeProduct = metadata.isFreeProduct;
							}
						}
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						logger.warn(`Failed to parse metadata for DB payment ID: ${payment.id}`, {
							error: errorMessage,
						});
					}

					// Use processor + processorOrderId as the unique key
					const processorOrderId = payment.processorOrderId || payment.orderId; // Prioritize processorOrderId, fallback to orderId
					if (!processorOrderId) {
						logger.warn(`Skipping DB payment ID ${payment.id} due to missing order identifier.`);
						continue; // Skip if no suitable order ID found
					}
					const compositeKey = `${payment.processor || "unknown"}:${processorOrderId}`;

					combinedPayments.set(compositeKey, {
						id: payment.id.toString(), // Use DB primary key as ID
						orderId: processorOrderId,
						userEmail: user?.email || "unknown@example.com",
						userName: user?.name || null,
						userImage: user?.image || null,
						amount: (payment.amount || 0) / 100, // Convert cents to dollars
						status: payment.status as "paid" | "refunded" | "pending",
						productName,
						purchaseDate: payment.purchasedAt || new Date(payment.createdAt), // Prefer purchasedAt if available
						processor: payment.processor || "unknown",
						isFreeProduct,
						isInDatabase: true, // Mark as existing in DB
					});
				}
			} // End of DB fetch block

			// 2. Get payments from all enabled providers
			const providers = getEnabledProviders();
			logger.debug(`Fetching payments from ${providers.length} enabled providers.`);

			for (const provider of providers) {
				try {
					const apiOrders: OrderData[] = await provider.getAllOrders();
					logger.debug(`Fetched ${apiOrders.length} orders from provider: ${provider.id}`);

					for (const order of apiOrders) {
						// Use processor + processorOrderId as the unique key
						// Ensure order.orderId corresponds to the processor's unique order ID
						if (!order.orderId) {
							logger.warn(
								`Skipping API order from ${provider.id} with internal ID ${order.id} due to missing order identifier.`
							);
							continue; // Skip if no order ID from provider
						}
						const compositeKey = `${provider.id}:${order.orderId}`;

						const existingEntry = combinedPayments.get(compositeKey);

						if (existingEntry) {
							// Update existing DB entry with potentially fresher API data
							// Only update if the record is actually in the DB
							if (existingEntry.isInDatabase) {
								existingEntry.status = order.status; // API status might be more up-to-date
								existingEntry.amount = order.amount; // API amount might be more accurate
								existingEntry.productName = order.productName || existingEntry.productName; // Update if missing in DB
								// Potentially update other fields if desired
								// logger.trace(`Updated payment from API: ${compositeKey}`);
							}
						} else {
							// Add new entry from API (not found in DB)
							const user = allUsers.find(
								(u) => u.email?.toLowerCase() === order.userEmail?.toLowerCase()
							);
							const isFreeProduct = order.amount === 0 && !order.discountCode; // Determine based on API data

							combinedPayments.set(compositeKey, {
								id: order.id, // Use provider's internal ID (e.g., "sub_...", "ord_...")
								orderId: order.orderId, // Use provider's order ID (e.g., "lemonsqueezy-123", "polar-abc")
								userEmail: order.userEmail || "unknown@example.com",
								userName: order.userName || user?.name || null, // Use provider name, fallback to matched user name
								userImage: user?.image || null,
								amount: order.amount, // Already in dollars from provider.getAllOrders()
								status: order.status,
								productName: order.productName || "Unknown Product",
								purchaseDate: order.purchaseDate,
								processor: provider.id,
								isFreeProduct,
								isInDatabase: false, // Mark as *not* existing in DB
							});
							// logger.trace(`Added new payment from API: ${compositeKey}`);
						}
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					logger.error(`Error fetching or processing orders from provider ${provider.id}`, {
						error: errorMessage,
					});
					// Optionally add placeholder error entries?
				}
			} // End of provider loop

			// 3. Convert map values to array and sort
			const finalPaymentData = Array.from(combinedPayments.values()).sort((a, b) => {
				// Ensure valid dates before comparing
				const dateA = a.purchaseDate instanceof Date ? a.purchaseDate.getTime() : 0;
				const dateB = b.purchaseDate instanceof Date ? b.purchaseDate.getTime() : 0;
				// Sort newest first
				return dateB - dateA;
			});

			logger.info(`Returning ${finalPaymentData.length} combined payments.`);
			return finalPaymentData;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error("Error getting combined payments with users:", { error: errorMessage });
			// Decide if to return partial data from map or empty array
			const partialData = Array.from(combinedPayments.values()).sort((a, b) => {
				const dateA = a.purchaseDate instanceof Date ? a.purchaseDate.getTime() : 0;
				const dateB = b.purchaseDate instanceof Date ? b.purchaseDate.getTime() : 0;
				return dateB - dateA;
			});
			logger.warn(`Returning ${partialData.length} partial payments due to error.`);
			return partialData.length > 0 ? partialData : []; // Return partial if available, else empty
		}
	},

	/**
	 * Fetches all users with their payment status from all payment providers
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
						isFreeProduct: payment.isFreeProduct || false,
					};
				});

				// Check payment status from all payment providers
				const providers = getEnabledProviders();
				const providerStatuses: Record<string, boolean> = {};
				let hasPaid = false;
				let hasActiveSubscription = false;

				// Check each provider in parallel
				const statusPromises = providers.map(async (provider) => {
					try {
						const paymentStatus = await provider.getPaymentStatus(user.id);
						const subscriptionStatus = await provider.hasUserActiveSubscription(user.id);

						providerStatuses[provider.id] = paymentStatus;

						if (paymentStatus) {
							hasPaid = true;
						}

						if (subscriptionStatus) {
							hasActiveSubscription = true;
						}

						return {
							provider: provider.id,
							paymentStatus,
							subscriptionStatus,
						};
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						logger.error(`Error checking ${provider.name} payment status:`, {
							userId: user.id,
							error: errorMessage,
						});
						return {
							provider: provider.id,
							paymentStatus: false,
							subscriptionStatus: false,
							error: errorMessage, // Store message instead of raw error
						};
					}
				});

				await Promise.all(statusPromises);

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
					hasPaid,
					hasActiveSubscription,
					hadSubscription,
					createdAt: new Date(user.createdAt),
					lastPurchaseDate,
					totalPurchases: userPayments.length,
					purchases,
					providerStatuses,
				});
			}

			return userData;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error("Error getting users with payments:", { error: errorMessage });
			return [];
		}
	},

	/**
	 * Imports payments from all providers into the database
	 * @returns Stats about the import process for each provider
	 */
	async importAllPayments(): Promise<Record<string, any>> {
		logger.info("Starting import of all payments");

		const providers = getEnabledProviders();
		const results: Record<string, any> = {};

		if (providers.length === 0) {
			logger.warn("No payment providers are enabled");
			return results;
		}

		// Import payments from each provider
		for (const provider of providers) {
			try {
				logger.info(`Starting payment import for ${provider.name}`);
				const stats = await provider.importPayments();
				results[provider.id] = stats;
				logger.info(`Completed payment import for ${provider.name}`, stats);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				logger.error(`Error during ${provider.name} import`, { error: errorMessage });
				results[provider.id] = {
					error: true,
					message: errorMessage,
				};
			}
		}

		logger.info("All payment imports complete", results);

		return results;
	},

	/**
	 * Creates a checkout URL for a product
	 * @param options Checkout options
	 * @param providerId The ID of the provider to use
	 * @returns The checkout URL
	 */
	async createCheckoutUrl(
		options: {
			productId: string;
			email?: string;
			userId?: string;
			metadata?: Record<string, any>;
			successUrl?: string;
			cancelUrl?: string;
		},
		providerId: string
	): Promise<string | null> {
		try {
			const provider = getProvider(providerId);

			if (!provider || !isProviderEnabled(providerId)) {
				logger.error(`Provider ${providerId} not found or not enabled`);
				return null;
			}

			return await provider.createCheckoutUrl(options);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Error creating checkout URL with provider ${providerId}:`, {
				error: errorMessage,
			});
			return null;
		}
	},

	/**
	 * Gets all available providers
	 * @returns Array of provider information
	 */
	getProviders(): { id: string; name: string; enabled: boolean }[] {
		const allProviderData = getEnabledProviders().map((provider) => ({
			id: provider.id,
			name: provider.name,
			enabled: provider.isEnabled,
		}));
		return allProviderData;
	},
};

export { PaymentService };
