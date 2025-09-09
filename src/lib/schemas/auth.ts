import { z } from "zod";

export const signInSchema = z.object({
	email: z.string().email("Please enter a valid email address."),
	password: z.string().min(4, {
		message: "Password must be at least 4 characters.",
	}),
});

export const signInActionSchema = signInSchema.extend({
	redirectTo: z.string().optional(),
	redirect: z.boolean().optional(),
});

export const signUpSchema = signInActionSchema;

export const forgotPasswordSchema = signInSchema.pick({ email: true });

export const resetPasswordSchema = z
	.object({
		token: z.string(),
		password: z.string().min(4, {
			message: "Password must be at least 4 characters.",
		}),
		passwordConfirm: z.string(),
	})
	.refine((data) => data.password === data.passwordConfirm, {
		message: "Passwords do not match.",
		path: ["passwordConfirm"],
	});
