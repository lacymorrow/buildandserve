"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { resetPasswordSchema } from "@/lib/schemas/auth";
import { getSchemaDefaults } from "@/lib/utils/get-schema-defaults";
import { resetPasswordAction } from "@/server/actions/auth";
import { toast } from "sonner";

export function ResetPasswordForm({ token }: { token?: string }) {
    const router = useRouter();

    const form = useForm<z.infer<typeof resetPasswordSchema>>({
        resolver: zodResolver(resetPasswordSchema),
        defaultValues: {
            ...getSchemaDefaults(resetPasswordSchema),
            token: token || "",
        },
    });

    async function onSubmit(values: z.infer<typeof resetPasswordSchema>) {
        if (!values.token) {
            toast.error("Missing reset token", {
                description: "The password reset link is invalid or has expired.",
            });
            return;
        }

        try {
            const [result, formError] = await resetPasswordAction(values);

            if (formError) {
                toast.error("Error resetting password", {
                    description: "The password reset link is invalid or has expired.",
                });
                return;
            }

            if (result) {
                toast.success("Password reset successful", {
                    description: "You can now sign in with your new password.",
                });
                router.push(routes.auth.signIn);
            } else {
                toast.error("Error resetting password", {
                    description: "The password reset link is invalid or has expired.",
                });
            }
        } catch (error) {
            toast.error("Error resetting password", {
                description: "An unexpected error occurred. Please try again.",
            });
        }
    }

    // Don't show the form if no token is provided
    if (!token) {
        return (
            <div className="text-center">
                <p className="mb-4">The password reset link is invalid or has expired.</p>
                <Button onClick={() => router.push(routes.auth.forgotPassword)}>
                    Request a new password reset link
                </Button>
            </div>
        );
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-sm">
                <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>New Password</FormLabel>
                            <FormControl>
                                <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="passwordConfirm"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <FormControl>
                                <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button className="self-end" type="submit">
                    Reset Password
                </Button>
            </form>
        </Form>
    );
}
