"use server";

import { RESEND_FROM } from "@/config/constants";
import { routes } from "@/config/routes";
import { STATUS_CODES } from "@/config/status-codes";
import { forgotPasswordSchema, resetPasswordSchema, signInActionSchema } from "@/lib/schemas/auth";
import { AuthService } from "@/server/services/auth-service";
import type { UserRole } from "@/types/user";
import { createServerAction } from "zsa";

export interface AuthOptions {
	redirectTo?: string;
	redirect?: boolean;
	protect?: boolean;
	role?: UserRole;
	nextUrl?: string;
	errorCode?: string;
	email?: string;
}

interface SignUpInData {
	email: string;
	password: string;
	redirect?: boolean;
	redirectTo?: string;
}

export const signInWithOAuthAction = async ({
	providerId,
	options,
}: {
	providerId: string;
	options?: AuthOptions;
}) => {
	return await AuthService.signInWithOAuth(providerId, options);
};

export const signInAction = createServerAction()
	.input(signInActionSchema)
	.handler(async ({ input }) => {
		await AuthService.signInWithCredentials({
			email: input.email,
			password: input.password,
			redirect: input.redirect,
			redirectTo: input.redirectTo,
		});
		return null;
	});

export const signInWithCredentialsAction = async ({
	email,
	password,
	redirect = true,
	redirectTo = routes.home,
}: {
	email: string;
	password: string;
	redirect?: boolean;
	redirectTo?: string;
}) => {
	try {
		console.log("signInWithCredentialsAction called with:", { email, redirect, redirectTo });

		// Call the AuthService to handle the sign-in
		const result = await AuthService.signInWithCredentials({
			email,
			password,
			redirect: false, // Important: Set to false to prevent automatic redirects from the server
			redirectTo,
		});

		console.log("Sign in result:", result);

		// Return the result for client-side handling
		return result;
	} catch (error) {
		console.error("Error in signInWithCredentialsAction:", error);

		// Propagate the error to the client
		if (error instanceof Error) {
			// Return an error object that can be handled by the client
			return {
				error: error.message,
				ok: false,
			};
		}

		// For unknown errors, return a generic error
		return {
			error: STATUS_CODES.AUTH_ERROR.message,
			ok: false,
		};
	}
};

export const signUpWithCredentialsAction = async (data: SignUpInData) => {
	try {
		console.log("signUpWithCredentialsAction called with:", {
			email: data.email,
			redirect: data.redirect,
			redirectTo: data.redirectTo,
		});

		// Call the AuthService to handle the sign-up
		const result = await AuthService.signUpWithCredentials({
			email: data.email,
			password: data.password,
			redirect: false, // Important: Set to false to prevent automatic redirects from the server
			redirectTo: data.redirectTo, // Use redirectTo as expected by the method signature
		});

		console.log("Sign up result:", result);

		// Return the result for client-side handling
		return result;
	} catch (error) {
		console.error("Error in signUpWithCredentialsAction:", error);
		throw error;
	}
};

export const signOutAction = async (options?: AuthOptions) => {
	return await AuthService.signOut(options);
};

export const forgotPasswordAction = createServerAction()
	.input(forgotPasswordSchema)
	.handler(async ({ input }) => {
		try {
			await AuthService.forgotPassword(input.email);
			return { success: true };
		} catch (error) {
			console.log(RESEND_FROM);
			console.error("Error in forgotPasswordAction:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : STATUS_CODES.AUTH_ERROR.message,
			};
		}
	});

export const resetPasswordAction = createServerAction()
	.input(resetPasswordSchema)
	.handler(async ({ input }) => {
		try {
			await AuthService.resetPassword(input.token, input.password);
			return { success: true };
		} catch (error) {
			console.error("Error in resetPasswordAction:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : STATUS_CODES.AUTH_ERROR.message,
			};
		}
	});
