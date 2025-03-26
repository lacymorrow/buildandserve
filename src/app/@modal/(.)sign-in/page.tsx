// @see https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#modals
import { SignInForm } from "@/app/(app)/(authentication)/sign-in/_components/sign-in-form";
import { Modal } from "@/components/primitives/modal";
import { auth } from "@/server/auth";

export default async function Page() {
	const session = await auth();
	if (session) {
		return null;
	}
	return (
		<Modal>
			<SignInForm />
		</Modal>
	);
}
