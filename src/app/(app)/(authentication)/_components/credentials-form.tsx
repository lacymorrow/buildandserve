"use client";

import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { routes } from "@/config/routes";
import { SEARCH_PARAM_KEYS } from "@/config/search-param-keys";
import { STATUS_CODES } from "@/config/status-codes";
import { signInWithCredentialsAction } from "@/server/actions/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockClosedIcon } from "@radix-ui/react-icons";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const credentialsSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
	password: z.string().min(4, "Password must be at least 4 characters"),
});

type CredentialsFormValues = z.infer<typeof credentialsSchema>;

interface CredentialsFormProps {
	className?: string;
}

export function CredentialsForm({ className }: CredentialsFormProps) {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const searchParams = useSearchParams();
	const router = useRouter();
	const nextUrl = searchParams?.get(SEARCH_PARAM_KEYS.nextUrl);
	const { update: updateSession } = useSession();

	const form = useForm<CredentialsFormValues>({
		resolver: zodResolver(credentialsSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	async function onSubmit(values: CredentialsFormValues) {
		setIsSubmitting(true);
		try {
			// Call the server action with redirect set to false
			const result = await signInWithCredentialsAction({
				email: values.email,
				password: values.password,
				redirect: false,
				redirectTo: nextUrl || routes.home,
			});

			console.log("Sign in result:", result);

			// Check if the result is an error object from our server action
			if (result && typeof result === 'object' && 'error' in result && !result.ok) {
				// Handle the error returned by the server action
				let errorMessage = result.error;

				// Check if the error matches our known error codes
				if (result.error === STATUS_CODES.CREDENTIALS.message) {
					errorMessage = STATUS_CODES.CREDENTIALS.message;
				}

				toast.error("Failed to sign in", {
					description: errorMessage,
				});
				return;
			}

			// Check if the sign-in was successful
			if (typeof result === 'string') {
				// If result is a string, it's likely a URL to redirect to
				toast.success("Signed in successfully");
				// Update the session before redirecting
				await updateSession();
				router.push(nextUrl || routes.home);
				router.refresh(); // Refresh to update the session
				return;
			}

			if (result?.error) {
				// Handle specific error codes from NextAuth
				if (result.error === "CredentialsSignin") {
					toast.error("Failed to sign in", {
						description: STATUS_CODES.CREDENTIALS.message,
					});
					return;
				}
				throw new Error(result.error);
			}

			if (result?.url) {
				// Handle successful sign-in with client-side redirect
				toast.success("Signed in successfully");
				// Update the session before redirecting
				await updateSession();
				router.push(result.url);
				router.refresh(); // Refresh to update the session
				return;
			}

			// If we get here, something unexpected happened but we'll try to handle it gracefully
			console.warn("Unexpected authentication result:", result);
			// Still try to update the session and redirect
			await updateSession();
			toast.success("Signed in successfully");
			router.push(nextUrl || routes.home);
			router.refresh(); // Refresh to update the session
		} catch (error) {
			console.error("Error signing in:", error);

			let errorMessage = "Please check your credentials and try again.";

			if (error instanceof Error) {
				if (error.message.includes("Invalid credentials") ||
					error.message.includes("User not found") ||
					error.message.includes("CredentialsSignin") ||
					error.message === STATUS_CODES.CREDENTIALS.message) {
					errorMessage = STATUS_CODES.CREDENTIALS.message;
				} else if (error.message.includes("Authentication service unavailable")) {
					errorMessage = "Authentication service is currently unavailable. Please try again later.";
				} else {
					errorMessage = error.message;
				}
			}

			toast.error("Failed to sign in", {
				description: errorMessage,
			});
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className={className}>
				<div className="space-y-4">
					<FormField
						control={form.control}
						name="email"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Email</FormLabel>
								<FormControl>
									<Input
										placeholder="me@example.com"
										type="email"
										autoComplete="email"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="password"
						render={({ field }) => (
							<FormItem>
								<div className="flex items-center justify-between">
									<FormLabel>Password</FormLabel>
									<Link
										href={routes.auth.forgotPassword}
										className="text-xs text-muted-foreground underline-offset-4 hover:underline"
									>
										Forgot password?
									</Link>
								</div>
								<FormControl>
									<Input
										placeholder="••••••••"
										type="password"
										autoComplete="current-password"
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button
						type="submit"
						className="w-full"
						disabled={isSubmitting || !form.formState.isValid}
					>
						{isSubmitting ? (
							"Signing in..."
						) : (
							<>
								<LockClosedIcon className="mr-2 h-4 w-4" />
								Sign In
							</>
						)}
					</Button>
				</div>
			</form>
		</Form>
	);
}
