import { RESEND_FROM } from "@/config/constants";
import { STATUS_CODES } from "@/config/status-codes";
import { env } from "@/env";
import Bitbucket from "@auth/core/providers/bitbucket";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import GitHub from "next-auth/providers/github";
import GitLab from "next-auth/providers/gitlab";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Twitter from "next-auth/providers/twitter";
import { AuthService } from "@/server/services/auth-service";

// Define types for Vercel OAuth
interface VercelTokens {
	access_token: string;
	token_type: string;
	expires_at: number;
	refresh_token?: string;
	scope?: string;
}

interface VercelClient {
	clientId: string;
	clientSecret: string;
}

interface VercelUserProfile {
	id?: string;
	uid?: string;
	name?: string;
	username?: string;
	email: string;
	avatar?: {
		url: string;
	};
}

// Prevent these providers from being shown as buttons
export const EXCLUDED_PROVIDERS = ["credentials", "resend", "vercel"];

// Order providers buttons - These will be shown first
export const ORDERED_PROVIDERS = [
	"credentials",
	"google",
	"twitter",
	"discord",
	"github",
	"gitlab",
	"bitbucket",
];

// we use process.env instead of env because this is called on the client side too and we don't want to throw an error
export const providers: NextAuthConfig["providers"] = [
	/***
	 * Magic Link Provider - Resend
	 * @see https://authjs.dev/getting-started/providers/resend
	 */

	...(env.NEXT_PUBLIC_FEATURE_AUTH_RESEND_ENABLED
		? [
				Resend({
					apiKey: process.env.AUTH_RESEND_KEY ?? "",
					from: RESEND_FROM,
					// sendVerificationRequest({ identifier: email, url, provider: { server, from } }) {
					// 	// your function
					// },
				}),
			]
		: []),

	/**
	 * Credentials Provider - Username/Password
	 * @see https://authjs.dev/getting-started/providers/credentials
	 */

	...(env.NEXT_PUBLIC_FEATURE_AUTH_CREDENTIALS_ENABLED
		? [
				Credentials({
					name: "credentials", // Used by Oauth buttons to determine the active sign-in options
					credentials: {
						email: { label: "Email", type: "email" },
						password: { label: "Password", type: "password" },
					},
					async authorize(credentials) {
						if (!credentials?.email || !credentials?.password) {
							console.error("Missing email or password in credentials");
							return null;
						}

						try {
							// Use AuthService to validate credentials against Payload CMS
							const user = await AuthService.validateCredentials(credentials);

							if (!user) {
								console.error("User validation failed");
								throw new Error(STATUS_CODES.CREDENTIALS.message);
							}

							// For database session strategy, we need to ensure the user exists in the database
							// This is handled in validateCredentials via ensureUserSynchronized

							// Return the user object in the format expected by NextAuth
							return {
								id: user.id,
								name: user.name,
								email: user.email,
								image: user.image,
								emailVerified: user.emailVerified,
							};
						} catch (error) {
							console.error("Error in authorize callback:", error);
							// Rethrow the error to be handled by NextAuth
							throw error;
						}
					},
				}),
			]
		: []),

	/**
	 * OAuth Providers
	 * @see https://authjs.dev/getting-started/providers
	 */

	...(env.NEXT_PUBLIC_FEATURE_AUTH_BITBUCKET_ENABLED
		? [
				Bitbucket({
					clientId: process.env.AUTH_BITBUCKET_ID ?? "",
					clientSecret: process.env.AUTH_BITBUCKET_SECRET ?? "",
					allowDangerousEmailAccountLinking: true,
				}),
			]
		: []),
	...(env.NEXT_PUBLIC_FEATURE_AUTH_DISCORD_ENABLED
		? [
				Discord({
					clientId: process.env.AUTH_DISCORD_ID ?? "",
					clientSecret: process.env.AUTH_DISCORD_SECRET ?? "",
					allowDangerousEmailAccountLinking: true,
				}),
			]
		: []),
	...(env.NEXT_PUBLIC_FEATURE_AUTH_GITHUB_ENABLED
		? [
				GitHub({
					clientId: process.env.AUTH_GITHUB_ID ?? "",
					clientSecret: process.env.AUTH_GITHUB_SECRET ?? "",
					authorization: {
						params: {
							scope: "read:user user:email repo",
						},
					},
					profile(profile) {
						return {
							id: profile.id.toString(),
							name: profile.name ?? profile.login,
							email: profile.email,
							emailVerified: null,
							image: profile.avatar_url,
							githubUsername: profile.login,
						};
					},
					checks: ["state", "pkce"],
					allowDangerousEmailAccountLinking: true,
				}),
			]
		: []),
	...(env.NEXT_PUBLIC_FEATURE_AUTH_GITLAB_ENABLED
		? [
				GitLab({
					clientId: process.env.AUTH_GITLAB_ID ?? "",
					clientSecret: process.env.AUTH_GITLAB_SECRET ?? "",
					allowDangerousEmailAccountLinking: true,
				}),
			]
		: []),
	...(env.NEXT_PUBLIC_FEATURE_AUTH_GOOGLE_ENABLED
		? [
				Google({
					clientId: process.env.AUTH_GOOGLE_ID ?? "",
					clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
					allowDangerousEmailAccountLinking: true,
				}),
			]
		: []),

	...(env.NEXT_PUBLIC_FEATURE_AUTH_TWITTER_ENABLED
		? [
				Twitter({
					clientId: process.env.AUTH_TWITTER_ID ?? "",
					clientSecret: process.env.AUTH_TWITTER_SECRET ?? "",
					allowDangerousEmailAccountLinking: true,
				}),
			]
		: []),

	// Vercel OAuth Provider - ONLY FOR CONNECTING ACCOUNTS, NOT FOR SIGNING IN
	env.NEXT_PUBLIC_FEATURE_AUTH_VERCEL_ENABLED && {
		id: "vercel",
		name: "Vercel",
		type: "oauth" as const,
		clientId: process.env.VERCEL_CLIENT_ID,
		clientSecret: process.env.VERCEL_CLIENT_SECRET,
		authorization: {
			url: "https://vercel.com/oauth/authorize",
			params: {
				scope: "user team",
			},
		},
		token: "https://api.vercel.com/v2/oauth/access_token",
		userinfo: {
			url: "https://api.vercel.com/v2/user",
			async request({ tokens, client }: { tokens: VercelTokens; client: VercelClient }) {
				const response = await fetch("https://api.vercel.com/v2/user", {
					headers: {
						Authorization: `Bearer ${tokens.access_token}`,
					},
				});
				const profile = await response.json();
				return profile.user;
			},
		},
		profile(profile: VercelUserProfile) {
			return {
				id: profile.id || profile.uid || "",
				name: profile.name || profile.username || "",
				email: profile.email,
				image: profile.avatar?.url || null,
				emailVerified: null,
			};
		},
		allowDangerousEmailAccountLinking: true,
	},
].filter(Boolean) as NextAuthConfig["providers"];

// Note: The logic for generating the list of UI-displayable providers
// (including ordering and exclusion) has been moved to:
// src/config/auth-provider-details.ts
// UI components should import `enabledAuthProviders` from there.
