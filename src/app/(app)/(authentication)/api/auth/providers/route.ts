import { AuthProviderService } from "@/server/services/auth-provider-service";
import { NextResponse } from "next/server";

export async function GET() {
	try {
		const providers = await AuthProviderService.getOrderedProviders();
		const filteredProviders = providers.filter(
			(provider): provider is { id: string; name: string; isExcluded?: boolean } => {
				return typeof provider?.id === "string" && typeof provider?.name === "string";
			}
		);

		return NextResponse.json(filteredProviders);
	} catch (error) {
		console.error("Error fetching providers:", error);
		return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
	}
}
