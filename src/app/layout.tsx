import type { Metadata } from "next";
import type React from "react";

import { AppLayout } from "@/components/layouts/app-layout";
import { BodyProvider } from "@/components/providers/body-provider";
import { metadata as defaultMetadata } from "@/config/metadata";

export const metadata: Metadata = defaultMetadata;

export default function Layout({ children, modal }: { children: React.ReactNode, modal?: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<BodyProvider>
				<AppLayout>
					<main>{children}</main>

					{modal}
				</AppLayout>
			</BodyProvider>
		</html>
	);
}
