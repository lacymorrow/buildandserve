import { AuthForm } from "@/app/(app)/(authentication)/_components/auth-form";
import { CredentialsForm } from "@/app/(app)/(authentication)/_components/credentials-form";
import { Divider } from "@/components/primitives/divider";

export const SignIn = () => {
	return (
		<AuthForm mode="sign-in" withFooter={false}>
			<Divider text="Or continue with email" />
			<CredentialsForm />
		</AuthForm>
	);
};
