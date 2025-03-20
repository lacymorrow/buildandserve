import { ResetPasswordForm } from "@/app/(app)/(authentication)/reset-password/_components/reset-password-form";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthenticationCard } from "../_components/authentication-card";

export default function ResetPasswordPage({
    searchParams,
}: {
    searchParams: { token?: string };
}) {
    return (
        <AuthenticationCard>
            <CardHeader>
                <CardTitle className="text-2xl">Reset Password</CardTitle>
                <CardDescription>Create a new password for your account</CardDescription>
            </CardHeader>
            <CardContent>
                <ResetPasswordForm token={searchParams.token} />
            </CardContent>
        </AuthenticationCard>
    );
}
