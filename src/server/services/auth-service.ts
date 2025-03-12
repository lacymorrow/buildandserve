import { routes } from "@/config/routes";
import { SEARCH_PARAM_KEYS } from "@/config/search-param-keys";
import { STATUS_CODES } from "@/config/status-codes";
import { payload } from "@/lib/payload/payload";
import { signInSchema } from "@/lib/schemas/auth";
import { signIn, signOut } from "@/server/auth";
import type { UserRole } from "@/types/user";
import crypto from "node:crypto";
import { promisify } from "node:util";
import "server-only";

interface AuthOptions {
	redirectTo?: string;
	redirect?: boolean;
	protect?: boolean;
	role?: UserRole;
	nextUrl?: string;
	errorCode?: string;
	email?: string;
}

// Constants for password hashing
const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
	N: 16384, // CPU/memory cost parameter
	r: 8, // Block size parameter
	p: 1, // Parallelization parameter
} as const;

// Promisify scrypt
const scrypt = promisify<string | Buffer, Buffer, number, crypto.ScryptOptions, Buffer>(
	crypto.scrypt
);

/**
 * Hash a password using scrypt
 * @param password The plain text password to hash
 * @returns A string containing the salt and hash, separated by a colon
 */
async function hashPassword(password: string): Promise<string> {
	const salt = crypto.randomBytes(SALT_LENGTH);
	const derivedKey = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
	return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a password against a hash
 * @param password The plain text password to verify
 * @param hash The hash to verify against (in format salt:hash)
 * @returns True if the password matches, false otherwise
 */
async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
	try {
		const parts = storedHash.split(":");
		if (parts.length !== 2) return false;

		// Explicitly type the parts to ensure they are strings
		const saltHex: string = parts[0];
		const hashHex: string = parts[1];

		// Create buffers from the hex strings
		const salt = Buffer.from(saltHex, "hex");
		const hash = Buffer.from(hashHex, "hex");

		const derivedKey = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
		return crypto.timingSafeEqual(hash, derivedKey);
	} catch {
		return false;
	}
}

/**
 * Authentication service for handling user authentication and authorization
 */
export const AuthService = {
	/**
	 * Sign in with OAuth provider
	 */
	async signInWithOAuth(providerId: string, options?: AuthOptions) {
		await signIn(
			providerId,
			{
				redirectTo: options?.redirectTo ?? routes.home,
				...options,
			},
			providerId === "resend" && options?.email
				? { email: options.email }
				: { prompt: "select_account" }
		);
		return { success: STATUS_CODES.LOGIN.message };
	},

	/**
	 * Sign in with email and password using Payload CMS
	 */
	async signInWithCredentials({
		email,
		password,
		redirect = true,
		redirectTo = routes.home,
	}: {
		email: string;
		password: string;
		redirect?: boolean;
		redirectTo?: string;
	}) {
		// Use NextAuth's signIn method with credentials provider
		// This will call the authorize function in the credentials provider
		// which uses our validateCredentials method that connects to Payload CMS
		await signIn("credentials", {
			redirect,
			redirectTo,
			email,
			password,
		});
	},

	/**
	 * Sign up with email and password using Payload CMS
	 */
	async signUpWithCredentials({
		email,
		password,
		redirect = true,
		redirectTo = routes.home,
	}: {
		email: string;
		password: string;
		redirect?: boolean;
		redirectTo?: string;
	}) {
		try {
			if (!payload) {
				console.error("Payload CMS is not initialized");
				throw new Error("Authentication service unavailable");
			}

			// Check if user already exists in Payload CMS
			const existingUsers = await payload.find({
				collection: "users",
				where: {
					email: {
						equals: email,
					},
				},
			});

			if (existingUsers.docs.length > 0) {
				throw new Error("User already exists with this email");
			}

			// Create new user in Payload CMS
			const newUser = await payload.create({
				collection: "users",
				data: {
					email,
					password,
				},
			});

			if (!newUser) {
				throw new Error("Failed to create user");
			}

			// Sign in the user
			await signIn("credentials", {
				redirect,
				redirectTo,
				email,
				password,
			});

			return { success: true };
		} catch (error) {
			console.error("Sign up error:", error);
			throw error;
		}
	},

	/**
	 * Sign out the current user
	 */
	async signOut(options?: AuthOptions) {
		await signOut({
			redirectTo: `${routes.home}?${SEARCH_PARAM_KEYS.statusCode}=${STATUS_CODES.LOGOUT.code}`,
			redirect: true,
			...options,
		});

		return { success: STATUS_CODES.LOGOUT.message };
	},

	/**
	 * Validate user credentials against Payload CMS
	 */
	async validateCredentials(credentials: unknown) {
		try {
			const parsedCredentials = signInSchema.safeParse(credentials);

			if (!parsedCredentials.success) {
				throw new Error("Invalid credentials");
			}

			const { email, password } = parsedCredentials.data;

			// Use Payload CMS for authentication
			if (!payload) {
				console.error("Payload CMS is not initialized");
				throw new Error("Authentication service unavailable");
			}

			try {
				// Attempt to login with Payload CMS
				const result = await payload.login({
					collection: "users",
					data: {
						email,
						password,
					},
				});

				if (!result?.user) {
					throw new Error("Invalid credentials");
				}

				// Return the user data in the format expected by NextAuth
				return {
					id: result.user.id,
					name: result.user.email,
					email: result.user.email,
					emailVerified: null,
					image: null,
				};
			} catch (error) {
				console.error("Payload login error:", error);
				throw new Error("Invalid credentials");
			}
		} catch (error) {
			console.error("Auth error:", error);
			return null;
		}
	},
} as const;
