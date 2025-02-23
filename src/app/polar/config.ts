import type { CheckoutConfig } from "@polar-sh/nextjs";

export const polarConfig: CheckoutConfig = {
	accessToken: process.env.POLAR_ACCESS_TOKEN || "",
	successUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
	server: "production",
};
