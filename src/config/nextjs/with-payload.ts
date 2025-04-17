import withPayload from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import { isPayloadEnabled } from "../features-config";

/**
 * Applies Payload configuration to the Next.js config.
 * @param nextConfig The existing Next.js configuration object.
 * @returns The modified Next.js configuration object with Payload support.
 */
export function withPayloadConfig(nextConfig: NextConfig): NextConfig {
	if (isPayloadEnabled) {
		return withPayload(nextConfig);
	}
	return nextConfig;
}
