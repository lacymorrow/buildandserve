// @see https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#modals

import { SignIn } from "@/app/(app)/(authentication)/sign-in/_components/sign-in";
import { Modal } from "@/components/primitives/modal";
import { SuspenseFallback } from "@/components/primitives/suspense-fallback";
import { Suspense } from "react";

export default async function Page() {
	return (
		<Modal dialogTitle="Sign in">
			<Suspense fallback={<SuspenseFallback />}>
				<SignIn />
			</Suspense>
		</Modal>
	);
}
