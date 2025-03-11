import { Icon } from "@/components/assets/icon";
import type { AtomIcon } from "lucide-react";

export const Logo = (props: React.ComponentProps<typeof AtomIcon>) => {
	return (
		<div className="flex items-center gap-2 text-2xl font-bold">
			<Icon {...props} /> Shipkit
		</div>
	);
};
