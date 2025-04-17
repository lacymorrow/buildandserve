import { routes } from "@/config/routes";
import { redirect } from "next/navigation";

export default function SettingsPage() {
	redirect(routes.settings.profile);
}
