import { AuthForm } from "@/app/(app)/(authentication)/_components/auth-form";
import { Divider } from "@/components/primitives/divider";
import { getAuthUiFlags } from "@/lib/auth/auth-ui-availability";
import { SignUpForm } from "./sign-up-form";

export const SignUp = () => {
  const { credentials } = getAuthUiFlags();

  return (
    <AuthForm mode="sign-up" title="Create an account" description="Sign up to get started">
      {credentials && (
        <>
          <Divider text="Or continue with email" />
          <SignUpForm />
        </>
      )}
    </AuthForm>
  );
};
