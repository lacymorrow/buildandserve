import { usePermission } from "@/hooks/use-permission";

export const useIsAdmin = () => {
	const { hasPermission } = usePermission({
		resource: "system",
		action: "admin",
	});

	return hasPermission;
};
