import type { Metadata } from "next";
import React from "react";

import { AppLayout } from "@/components/layouts/app-layout";
import { BodyProvider } from "@/components/providers/body-provider";
import { metadata as defaultMetadata } from "@/config/metadata";
import { KeyboardShortcutProvider } from "@/contexts/keyboard-shortcut-context";
import { initializePaymentProviders } from "@/server/providers";
import { FontSelector } from "@/app/(app)/devtools/_components/font-selector";

export const metadata: Metadata = defaultMetadata;

await initializePaymentProviders();

export default async function Layout({
	children,
	...slots
}: { children: React.ReactNode;[key: string]: React.ReactNode }) {
	// Intercepting routes
	const resolvedSlots = (await Promise.all(
		Object.entries(slots).map(async ([key, slot]) => {
			const resolvedSlot = slot instanceof Promise ? await slot : slot;
			if (!resolvedSlot || (typeof resolvedSlot === 'object' && Object.keys(resolvedSlot).length === 0)) {
				return null;
			}
			return [key, resolvedSlot] as [string, React.ReactNode];
		})
	)).filter((item): item is [string, React.ReactNode] => item !== null);

	return (
		<html lang="en" suppressHydrationWarning>
			<BodyProvider>
				<KeyboardShortcutProvider>
					<AppLayout>
						<main>{children}</main>

						{/* Dynamically render all available slots */}
						{resolvedSlots.map(([key, slot]) => (
							<React.Fragment key={`slot-${key}`}>{slot}</React.Fragment>
						))}
					</AppLayout>
				</KeyboardShortcutProvider>

				{/* Add FontSelector only in development */}
				{process.env.NODE_ENV === "development" && <FontSelector />}

			</BodyProvider>
		</html>
	);
}
