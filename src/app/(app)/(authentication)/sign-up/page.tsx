import { Icon } from "@/components/assets/icon";
import { Link } from "@/components/primitives/link-with-transition";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site";
import { AuthForm } from "../_components/auth-form";
import { SignUpForm } from "./_components/sign-up-form";

export default function SignUpPage() {
	return (
		<div className="flex w-full max-w-sm flex-col gap-6">
			<Link href={routes.home} className="flex items-center gap-2 self-center font-medium">
				<div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<Icon />
				</div>
				{siteConfig.name}
			</Link>
			<AuthForm mode="sign-up">
				<div className="absolute inset-0 flex items-center">
					<span className="w-full border-t" />
				</div>
				<div className="relative flex justify-center text-xs uppercase">
					<span className="bg-background px-2 text-muted-foreground">
						Or continue with email
					</span>
				</div>
				<SignUpForm />
			</AuthForm>
		</div>
	);
}
