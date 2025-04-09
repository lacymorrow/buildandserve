"use server";

import { RESEND_FROM } from "@/config/constants";
import { routes } from "@/config/routes";
import { STATUS_CODES } from "@/config/status-codes";
import { forgotPasswordSchema, resetPasswordSchema, signInActionSchema } from "@/lib/schemas/auth";
import { AuthService } from "@/server/services/auth-service";
import type { UserRole } from "@/types/user";
import { createServerAction } from "zsa";
import type { ActionState } from "@/lib/utils/middleware";
import { z } from "zod";
import { env } from "@/env";
import { resend } from "@/lib/resend";
import { BASE_URL } from "@/config/base-url";

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

const CredentialsSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
});

export const signInWithCredentialsAction = async (_prevState: ActionState, formData: FormData) => {
	// console.log("signInWithCredentialsAction called with:", {
	// 	email: formData.get("email"),
	// 	redirect: formData.get("redirect"),
	// 	redirectTo: formData.get("redirectTo"),
	// });

	const email = formData.get("email") as string;
	const password = formData.get("password") as string;
	const redirect = formData.get("redirect") !== "false"; // Default to true
	const redirectTo = formData.get("redirectTo") as string | undefined;

	try {
		const result = await AuthService.signInWithCredentials({
			email,
			password,
			redirect: false, // Prevent server-side redirect
			redirectTo,
		});
		// console.log("Sign in result:", result);
		return result;
	} catch (error: any) {
		console.error("Error in signInWithCredentialsAction:", error);
		return { success: false, error: error.message || "Sign in failed" };
	}
};

export const signUpWithCredentialsAction = async (_prevState: ActionState, formData: FormData) => {
	// console.log("signUpWithCredentialsAction called with:", {
	// 	email: formData.get("email"),
	// 	passwordExists: !!formData.get("password"),
	// });

	const parsed = CredentialsSchema.safeParse(Object.fromEntries(formData));

	if (!parsed.success) {
		return { success: false, error: "Invalid form data" };
	}
	try {
		const result = await AuthService.signUpWithCredentials(parsed.data);
		// console.log("Sign up result:", result);

		if (!result.success || !result.user) {
			return { success: false, error: result.error || "Sign up failed" };
		}

		// Send verification email (moved from auth service for clarity)
		try {
			if (!resend) {
				console.warn("Resend client not initialized - skipping verification email");
			} else {
				const RESEND_FROM = env.RESEND_FROM || "noreply@example.com";
				// console.log(RESEND_FROM);
				await resend.emails.send({
					from: RESEND_FROM,
					to: parsed.data.email,
					subject: "Welcome to Our App - Verify Your Email",
					html: `
            <p>Welcome! Please verify your email by clicking the link below:</p>
            <a href="${BASE_URL}/verify-email?token=${result.user.verificationToken}">Verify Email</a>
          `,
				});
			}
		} catch (emailError) {
			console.error("Failed to send verification email", emailError);
			// Proceed with sign-up even if email fails, but log the error
		}

		return { success: true, user: result.user }; // Only return necessary info
	} catch (error: any) {
		console.error("Error in signUpWithCredentialsAction:", error);
		return { success: false, error: error.message || "Sign up failed" };
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
