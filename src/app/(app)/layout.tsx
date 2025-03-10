import type { Metadata } from "next";
import type React from "react";

import { RootLayout } from "@/components/layouts/root-layout";
import { BodyProvider } from "@/components/providers/body-provider";
import { ShipkitProvider } from "@/components/providers/shipkit-provider";
import { metadata as defaultMetadata } from "@/config/metadata";

export const metadata: Metadata = defaultMetadata;

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<BodyProvider>
				<ShipkitProvider>
					<RootLayout>
						<main>{children}</main>
					</RootLayout>
				</ShipkitProvider>
			</BodyProvider>
		</html>
	);
}
