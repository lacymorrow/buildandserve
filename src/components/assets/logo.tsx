import { Icon } from "@/components/assets/icon";

export const Logo = (props: React.ComponentProps<typeof Icon>) => {
	return (
		<div className="flex items-center gap-2 text-2xl font-bold">
			<Icon {...props} /> Shipkit
		</div>
	);
};
