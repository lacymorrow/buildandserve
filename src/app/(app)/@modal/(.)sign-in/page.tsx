// @see https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#modals

import { Modal } from "@/components/primitives/modal";

export default async function Page() {
	return (
		<Modal dialogTitle="Sign in">
			Hi
			{/* <SignIn /> */}
		</Modal>
	);
}
