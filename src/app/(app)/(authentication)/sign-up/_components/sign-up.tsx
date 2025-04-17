
import { AuthForm } from "@/app/(app)/(authentication)/_components/auth-form";
import { SignUpForm } from "./sign-up-form";
import { env } from "@/env";

export const SignUp = () => {
	return (
		<>
			<AuthForm
				mode="sign-up"
				title="Create an account"
				description="Sign up to get started"
			>
				{env.NEXT_PUBLIC_FEATURE_AUTH_CREDENTIALS_ENABLED && (
					<SignUpForm />
				)}
			</AuthForm>
		</>
	);
}
