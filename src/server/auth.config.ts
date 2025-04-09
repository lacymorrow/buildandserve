import { routes } from "@/config/routes";
import type { NextAuthConfig } from "next-auth";
import { connectGitHub } from "@/server/actions/github";
import { providers } from "@/server/auth-providers.config";
import { db } from "@/server/db";
import { userService } from "@/server/services/user-service";

// Extend the default session user type
declare module "next-auth" {
	interface Session {
		user: {
			id: string;
			name: string | null;
			email: string | null;
			image: string | null;
			bio: string | null;
			githubUsername: string | null;
			theme?: "light" | "dark" | "system";
			emailVerified: Date | null;
			accounts?: {
				provider: string;
				providerAccountId: string;
			}[];
			payloadToken?: string; // Add Payload CMS token to session
		};
	}

	// Extend the JWT type to include Payload token
	interface JWT {
		payloadToken?: string;
	}
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authOptions: NextAuthConfig = {
	debug: process.env.NODE_ENV !== "production",
	providers,
	pages: {
		error: routes.auth.error,
		signIn: routes.auth.signIn,
		signOut: routes.auth.signOut,
	},
	session: {
		strategy: "jwt",
		maxAge: 30 * 24 * 60 * 60, // 30 days
		updateAge: 24 * 60 * 60, // 24 hours
	},
	// cookies: {
	// 	sessionToken: {
	// 		name:
	// 			process.env.NODE_ENV === "production"
	// 				? "__Secure-next-auth.session-token"
	// 				: "next-auth.session-token",
	// 		options: {
	// 			httpOnly: true,
	// 			sameSite: "lax",
	// 			path: "/",
	// 			secure: process.env.NODE_ENV === "production",
	// 		},
	// 	},
	// },
	callbacks: {
		async signIn({ user, account, profile }) {
			if (!user.id) return false;

			// Handle GitHub OAuth connection
			if (account?.provider === "github" && account.access_token) {
				console.debug("GitHub OAuth signIn callback", {
					user,
					account,
				});

				try {
					// Connect GitHub account to the user
					await connectGitHub({
						githubId: account.providerAccountId,
						githubUsername: (user as any).githubUsername || (profile?.login as string),
						accessToken: account.access_token,
					});
					return true;
				} catch (error) {
					console.error("Error connecting GitHub account:", error);
					// Don't fail the sign-in if GitHub connection fails
				}
			}

			// Special handling for credentials provider
			// This ensures the user exists in both databases and handles session creation properly
			if (account?.provider === "credentials") {
				// The user should already exist in both databases from validateCredentials
				// Just return true to allow sign in
				return true;
			}

			// Ensure the user exists in the Shipkit database
			// This handles cases where a user was created through OAuth but not in Shipkit
			try {
				await userService.ensureUserExists({
					id: user.id,
					email: user.email as string,
					name: user.name,
					image: user.image,
				});
			} catch (error) {
				console.error("Error ensuring user exists in Shipkit database:", error);
				// Don't fail the sign-in if this fails, just log the error
			}

			// Log the sign in activity
			return true;
		},
		jwt({ token, user, account, trigger, session }) {
			// Save user data to the token
			if (user) {
				token.id = user.id;
				token.name = user.name;
				token.email = user.email;

				// Safely access optional properties
				if ("bio" in user) token.bio = user.bio as string | null;
				if ("githubUsername" in user) token.githubUsername = user.githubUsername as string | null;
				if ("theme" in user) token.theme = user.theme as "light" | "dark" | "system" | undefined;
				if ("emailVerified" in user) token.emailVerified = user.emailVerified as Date | null;

				// Store Payload CMS token if available
				if ("payloadToken" in user && typeof user.payloadToken === "string") {
					token.payloadToken = user.payloadToken;
				}
			}

			// Save GitHub access token when signing in with GitHub
			if (account?.provider === "github" && account.access_token) {
				token.githubAccessToken = account.access_token;

				// If we have a GitHub username from the profile, store it directly
				// This is important for handling first-time GitHub OAuth logins
				if (user && (user as any).githubUsername) {
					token.githubUsername = (user as any).githubUsername;
				}
			}

			// Handle direct GitHub username updates passed from session update
			// This is critical for UI updates when connecting or disconnecting GitHub
			if (session?.user?.githubUsername !== undefined) {
				token.githubUsername = session.user.githubUsername;
			}

			// Handle account updates directly from session
			if (session?.user?.accounts) {
				token.accounts = session.user.accounts;
			}

			// Handle Payload token updates in session
			if (session?.payloadToken && typeof session.payloadToken === "string") {
				token.payloadToken = session.payloadToken;
			}

			// Handle updates
			if (trigger === "update" && session) {
				if (session.theme) token.theme = session.theme;
				if (session.name) token.name = session.name;
				if (session.bio) token.bio = session.bio;
				if (session.payloadToken && typeof session.payloadToken === "string")
					token.payloadToken = session.payloadToken;
			}
			return token;
		},
		async session({ session, token, user }) {
			if (token) {
				session.user.id = token.id as string;
				session.user.name = token.name as string | null;
				session.user.email = token.email as string;
				session.user.bio = token.bio as string | null;
				session.user.githubUsername = token.githubUsername as string | null;
				session.user.theme = token.theme as "light" | "dark" | "system" | undefined;
				session.user.emailVerified = token.emailVerified as Date | null;

				// Include Payload token in session
				if (token.payloadToken && typeof token.payloadToken === "string") {
					session.user.payloadToken = token.payloadToken;
				}

				// Copy accounts from token to session if they exist
				if (token.accounts) {
					session.user.accounts = token.accounts as {
						provider: string;
						providerAccountId: string;
					}[];
				}
			}

			// If token didn't have accounts and we have a user from database, fetch accounts
			if (!session.user.accounts && user) {
				// Fetch user accounts from database
				try {
					const accounts = await db?.query.accounts.findMany({
						where: (accounts, { eq }) => eq(accounts.userId, user.id),
						columns: {
							provider: true,
							providerAccountId: true,
						},
					});

					if (accounts) {
						session.user.accounts = accounts;
					}
				} catch (error) {
					console.error("Error fetching user accounts:", error);
				}
			}

			return session;
		},
	},
} satisfies NextAuthConfig;
