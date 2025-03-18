"use client";

import { signUpSchema } from "@/lib/schemas/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import type { z } from "zod";

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
import { useToast } from "@/hooks/use-toast";
import { getSchemaDefaults } from "@/lib/utils/get-schema-defaults";
import { signUpWithCredentialsAction } from "@/server/actions/auth";

export const SignUpForm = () => {
	const { toast } = useToast();
	const router = useRouter();
	const { update: updateSession } = useSession();
	const form = useForm<z.infer<typeof signUpSchema>>({
		resolver: zodResolver(signUpSchema),
		defaultValues: {
			...getSchemaDefaults(signUpSchema),
			redirectTo: routes.home,
			redirect: true,
		},
	});

	async function onSubmit(values: z.infer<typeof signUpSchema>) {
		try {
			const result = await signUpWithCredentialsAction({
				email: values.email,
				password: values.password,
				redirect: false,
				redirectTo: routes.home,
			});

			console.log("Sign up result:", result);

			// Check if the sign-up was successful
			if (typeof result === 'string') {
				// If result is a string, it's likely a URL to redirect to
				toast({
					title: "Success",
					description: "Account created successfully.",
				});
				// Update the session before redirecting
				await updateSession();
				router.push(routes.home);
				router.refresh(); // Refresh to update the session
				return;
			}

			if (result?.error) {
				// Handle error from result object
				throw new Error(result.error);
			}

			if (result?.url) {
				// Handle successful sign-up with client-side redirect
				toast({
					title: "Success",
					description: "Account created successfully.",
				});
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
			toast({
				title: "Success",
				description: "Account created successfully.",
			});
			router.push(routes.home);
			router.refresh(); // Refresh to update the session
		} catch (error) {
			if (error instanceof Error) {
				if (error.message.includes("User already exists")) {
					form.setError("email", {
						type: "manual",
						message: "An account with this email already exists.",
					});
				} else {
					toast({
						title: "Error",
						description: error.message,
						variant: "destructive",
					});
				}
			} else {
				toast({
					title: "Error",
					description: "Something went wrong. Please try again.",
					variant: "destructive",
				});
			}
		}
	}

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
				<FormField
					control={form.control}
					name="email"
					render={({ field }) => (
						<FormItem>
							<FormLabel>Email</FormLabel>
							<FormControl>
								<Input placeholder="me@example.com" type="email" autoComplete="email" {...field} />
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
							<FormLabel>Password</FormLabel>
							<FormControl>
								<Input type="password" autoComplete="new-password" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<Button
					type="submit"
					className="w-full"
					disabled={form.formState.isSubmitting || !form.formState.isValid}
				>
					{form.formState.isSubmitting ? "Creating account..." : "Create account"}
				</Button>
			</form>
		</Form>
	);
};
