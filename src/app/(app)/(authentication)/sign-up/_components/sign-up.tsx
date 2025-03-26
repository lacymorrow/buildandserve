import { AuthContent } from "@/app/(app)/(authentication)/_components/auth-content";
import { SignUpForm } from "./sign-up-form";

export const SignUp = () => {
    return (
        <AuthContent
            mode="sign-up"
            title="Create an account"
            description="Sign up to get started"
        >
            <SignUpForm />
        </AuthContent>
    );
}
