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
import { signInWithCredentialsAction } from "@/server/actions/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { LockClosedIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
	const nextUrl = searchParams?.get(SEARCH_PARAM_KEYS.nextUrl);

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
			await signInWithCredentialsAction({
				email: values.email,
				password: values.password,
				redirect: true,
				redirectTo: nextUrl || routes.home,
			});
		} catch (error) {
			console.error("Error signing in:", error);

			let errorMessage = "Please check your credentials and try again.";

			if (error instanceof Error) {
				if (error.message.includes("Invalid credentials") ||
					error.message.includes("User not found")) {
					errorMessage = "Invalid email or password.";
				} else if (error.message.includes("Authentication service unavailable")) {
					errorMessage = "Authentication service is currently unavailable. Please try again later.";
				} else {
					errorMessage = error.message;
				}
			}

			toast.error("Failed to sign in", {
				description: errorMessage,
			});
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
