"use client";

import { SignIn } from "@/app/(app)/(authentication)/sign-in/_components/sign-in";
import { Modal } from "@/components/primitives/modal";
import { SuspenseFallback } from "@/components/primitives/suspense-fallback";
import { debounce } from "@/lib/utils/debounce";
import { useRouter } from "next/navigation";
import { Suspense, useMemo } from "react";

export default async function Page() {
	const router = useRouter();

	// Don't immediately close the modal, we need to wait for the modal to animate closed before we should navigate
	// @see https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#modals
	const debouncedRouteBack = useMemo(
		() => debounce(() => router.back(), 300),
		[router],
	);

	const onOpenChange = (open: boolean) => {
		if (!open) {
			debouncedRouteBack();
		}
	};

	return (
		<Modal dialogTitle="Sign in" onOpenChange={onOpenChange}>
			<Suspense fallback={<SuspenseFallback />}>
				<SignIn />
			</Suspense>
		</Modal>
	);
}
