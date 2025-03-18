"use server";

import { getPayloadClient } from "@/lib/payload/payload";
import { seedAllDirect } from "@/lib/payload/seed-utils";
import { auth } from "@/server/auth";
import { isAdmin } from "@/server/services/admin-service";

/**
 * Server action to seed the CMS with initial data
 * Only works in production with a valid admin secret
 */
export async function seedCMSAction() {
	const session = await auth();

	if (!isAdmin({ email: session?.user?.email })) {
		throw new Error("Unauthorized");
	}

	try {
		// Get the payload client
		const payload = await getPayloadClient();
		if (!payload) {
			throw new Error("Payload CMS is not enabled");
		}

		// Run the direct seed function
		await seedAllDirect(payload);

		return { success: true, message: "CMS seeded successfully" };
	} catch (error) {
		console.error("Error seeding CMS:", error);
		return {
			success: false,
			message: error instanceof Error ? error.message : "Unknown error occurred",
		};
	}
}
