import { AuthForm } from "@/app/(app)/(authentication)/_components/auth-form";
import { CredentialsForm } from "@/app/(app)/(authentication)/_components/credentials-form";
import { Divider } from "@/components/primitives/divider";
import { AuthProviderService } from "@/server/services/auth-provider-service";

export const SignIn = async () => {
	const providers = await AuthProviderService.getOrderedProviders();

	return (
		<AuthForm mode="sign-in" withFooter={false} providers={providers}>
			<Divider text="Or continue with email" />
			<CredentialsForm />
		</AuthForm>
	);
};
