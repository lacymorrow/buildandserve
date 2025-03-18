// Prevent access to the dev pages in production
import { env } from "@/env";
import { notFound } from "next/navigation";
export default function DevLayout({ children }: { children: React.ReactNode }) {
	if (env.NODE_ENV !== "development") {
		notFound();
	}

	return <>{children}</>;
}
