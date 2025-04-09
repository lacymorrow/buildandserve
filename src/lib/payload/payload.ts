import { env } from "@/env";
import payloadConfig from "@/payload.config";
import { getPayload } from "payload";

// Flag to track if the warning has been logged
let payloadWarningLogged = false;

// Initialize Payload
export const getPayloadClient = async () => {
	if (!env?.DATABASE_URL || env?.ENABLE_PAYLOAD !== "true") {
		// Log the warning only once
		if (!payloadWarningLogged) {
			console.warn(
				"Payload not initialized: DATABASE_URL is missing or Payload is not enabled"
			);
			payloadWarningLogged = true;
		}
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
