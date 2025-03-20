import { Icon } from "@/components/assets/icon";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";

export default function PrimaryCta() {
	return (
		<RainbowButton className="w-full md:w-auto flex items-center gap-2" href={routes.external.buy}>
			<Icon className="size-5" /> Get {siteConfig.name}
		</RainbowButton>
	);
}
