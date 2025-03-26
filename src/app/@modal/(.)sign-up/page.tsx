// @see https://nextjs.org/docs/app/building-your-application/routing/parallel-routes#modals
import { SignUpCard } from "@/app/(app)/(authentication)/sign-up/_components/sign-up-card";
import { Modal } from "@/components/primitives/modal";

export default function Page() {
	return (
		<Modal>
			<SignUpCard />
		</Modal>
	);
}
