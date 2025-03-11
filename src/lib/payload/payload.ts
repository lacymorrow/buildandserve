import { env } from "@/env";
import payloadConfig from "@/payload.config";
import { getPayload } from "payload";

// Initialize Payload
export const getPayloadClient = async () => {
	if (!env?.DATABASE_URL || env?.DISABLE_PAYLOAD === "true") {
		console.warn("Payload CMS is not enabled");
		return null;
	}

	// Initialize Payload
	const payload = await getPayload({
		// Pass in the config
		config: payloadConfig,
	}).catch((error) => {
		console.warn("Payload failed to initialize", error);
		return null;
	});

	return payload;
};

// Export a singleton instance
export const payload = await getPayloadClient();
