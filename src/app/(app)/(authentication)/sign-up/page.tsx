import { AuthForm } from "@/app/(app)/(authentication)/_components/auth-form";
import { Icon } from "@/components/assets/icon";
import { Divider } from "@/components/primitives/divider";
import { Link } from "@/components/primitives/link-with-transition";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";
import { AuthenticationCard } from "../_components/authentication-card";
import { SignUpForm } from "./_components/sign-up-form";
import { AuthProviderService } from "@/server/services/auth-provider-service";

export default async function SignUpPage() {
	// Fetch auth providers data
	const orderedProviders = await AuthProviderService.getOrderedProviders();


	return (
		<div className="flex w-full max-w-sm flex-col gap-6">
			<Link href={routes.home} className="flex items-center gap-2 self-center font-medium">
				<div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<Icon />
				</div>
				{siteConfig.name}
			</Link>
			<AuthenticationCard>
				<AuthForm mode="sign-up" providers={orderedProviders}>
					<Divider text="Or continue with email" />
					<SignUpForm />
				</AuthForm>
			</AuthenticationCard>
		</div>
	);
}
