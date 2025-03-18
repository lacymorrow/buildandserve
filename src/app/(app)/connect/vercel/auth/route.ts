import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
	try {
		const session = await auth();
		if (!session?.user) {
			return NextResponse.redirect(new URL("/login", request.url));
		}

		const { searchParams } = new URL(request.url);
		const code = searchParams.get("code");
		const state = searchParams.get("state");
		const error = searchParams.get("error");
		const configurationId = searchParams.get("configurationId");
		const teamId = searchParams.get("teamId");

		// Log all parameters for debugging
		console.log("Vercel OAuth callback parameters:", {
			code: code ? "present" : "missing",
			state,
			error,
			configurationId,
			teamId,
			allParams: Object.fromEntries(searchParams.entries()),
		});

		if (error) {
			console.error("Error in Vercel OAuth callback:", error);
			return NextResponse.redirect(
				new URL("/settings/account?error=vercel_auth_error", request.url)
			);
		}

		if (!code) {
			console.error("No code provided in Vercel OAuth callback");
			return NextResponse.redirect(new URL("/settings/account?error=no_code", request.url));
		}

		// Get the origin for the redirect_uri
		const origin = new URL(request.url).origin;
		const redirectUri = `${origin}/connect/vercel/auth`;

		// Exchange code for access token
		const tokenResponse = await fetch("https://api.vercel.com/v2/oauth/access_token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				code,
				client_id: process.env.VERCEL_CLIENT_ID!,
				client_secret: process.env.VERCEL_CLIENT_SECRET!,
				redirect_uri: redirectUri, // Include the same redirect_uri used in the initial request
			}),
		});

		if (!tokenResponse.ok) {
			const errorText = await tokenResponse.text();
			console.error("Failed to exchange code for token:", errorText);
			return NextResponse.redirect(
				new URL("/settings/account?error=token_exchange_failed", request.url)
			);
		}

		const tokenData = await tokenResponse.json();
		console.log("Token exchange successful:", tokenData);

		const { access_token, refresh_token, expires_in, team_id } = tokenData;

		// Get user info from Vercel
		const userResponse = await fetch("https://api.vercel.com/v2/user", {
			headers: {
				Authorization: `Bearer ${access_token}`,
			},
		});

		if (!userResponse.ok) {
			console.error("Failed to get user info from Vercel");
			return NextResponse.redirect(
				new URL("/settings/account?error=user_info_failed", request.url)
			);
		}

		const userData = await userResponse.json();
		console.log("User info retrieved:", {
			hasUserId: !!(userData.user?.id || userData.user?.uid),
			user: userData.user
				? {
						id: userData.user.id || userData.user.uid,
						email: userData.user.email,
						username: userData.user.username,
						name: userData.user.name,
					}
				: null,
		});

		const vercelUserId = userData.user?.id || userData.user?.uid;

		if (!vercelUserId) {
			console.error("Failed to get Vercel user ID");
			return NextResponse.redirect(new URL("/settings/account?error=no_user_id", request.url));
		}

		// Calculate token expiry date - default to 30 days if expires_in is not provided
		let expiresAt = null;
		if (expires_in) {
			expiresAt = new Date();
			expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);
			expiresAt = Math.floor(expiresAt.getTime() / 1000); // Convert to Unix timestamp
		} else {
			// Default to 30 days if expires_in is not provided
			expiresAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
		}

		// Store the access token and user info in the database
		await db
			?.delete(accounts)
			.where(and(eq(accounts.provider, "vercel"), eq(accounts.userId, session.user.id)));

		await db?.insert(accounts).values({
			userId: session.user.id,
			type: "oauth",
			provider: "vercel",
			providerAccountId: vercelUserId,
			access_token,
			refresh_token,
			expires_at: expiresAt,
			token_type: "bearer",
			scope: "user team",
			id_token: null,
			session_state: null,
		});

		console.log("Account data stored in database for user:", session.user.id);

		// Try to update the session directly - this won't always work in a server route
		// but can help in some cases by signaling the auth system that accounts have changed
		try {
			const { update } = await import("@/server/auth");
			await update({
				user: {
					accounts: [{ provider: "vercel", providerAccountId: vercelUserId }],
				},
			});
			console.log("Auth session updated with Vercel account");
		} catch (error) {
			console.warn("Could not update session directly:", error);
			// This is non-fatal, the UI will handle updating via updateSession
		}

		// Redirect back to the account settings page with success message
		return NextResponse.redirect(
			new URL("/settings/account?success=vercel_connected", request.url)
		);
	} catch (error) {
		console.error("Error in Vercel OAuth callback:", error);
		return NextResponse.redirect(new URL("/settings/account?error=internal_error", request.url));
	}
}
