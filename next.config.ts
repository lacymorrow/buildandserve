import {
	buildTimeFeatureFlags,
	isBuilderEnabled,
	isPayloadEnabled,
	isMDXEnabled,
	isPwaEnabled,
} from "@/config/features-config";
import { FILE_UPLOAD_MAX_SIZE } from "@/config/file";
import { redirects } from "@/config/routes";
import BuilderDevTools from "@builder.io/dev-tools/next";
import createMDX from "@next/mdx";
import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import withPWA from "next-pwa";

let nextConfig: NextConfig = {
	env: {
		...buildTimeFeatureFlags,
		// You can add other build-time env variables here if needed
	},
	/*
	 * Redirects are located in the `src/config/routes.ts` file
	 */
	redirects,
	/*
	 * Next.js configuration
	 */
	images: {
		remotePatterns: [
			{ hostname: "picsum.photos" }, // @dev: for testing
			{ hostname: "avatar.vercel.sh" }, // @dev: for testing
			{ hostname: "github.com" }, // @dev: for testing
			{ hostname: "images.unsplash.com" }, // @dev: for testing
			{ hostname: "2.gravatar.com" }, // @dev: for testing
			{ hostname: "avatars.githubusercontent.com" }, // @dev: github avatars
			{ hostname: "vercel.com" }, // @dev: vercel button
			{
				protocol: "https",
				hostname: "**.vercel.app",
			},
			{
				protocol: "https",
				hostname: "shipkit.s3.**.amazonaws.com",
			},
		],
	},

	/*
	 * React configuration
	 */
	reactStrictMode: true,

	/*
	 * Source maps
	 */
	productionBrowserSourceMaps: true,

	/*
	 * Lint configuration
	 */
	eslint: {
		/*
			!! WARNING !!
			* This allows production builds to successfully complete even if
			* your project has ESLint errors.
		*/
		ignoreDuringBuilds: true,
	},
	typescript: {
		/*
			!! WARNING !!
			* Dangerously allow production builds to successfully complete even if
			* your project has type errors.
		*/
		ignoreBuildErrors: true,
	},

	// Configure `pageExtensions` to include markdown and MDX files
	pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],

	/*
	 * Experimental configuration
	 */
	experimental: {
		// esmExternals: true,
		// mdxRs: true,
		// mdxRs: {
		// 	jsxRuntime: "automatic",
		// 	jsxImportSource: "jsx-runtime",
		// 	mdxType: "gfm",
		// },

		nextScriptWorkers: true,
		serverActions: {
			bodySizeLimit: FILE_UPLOAD_MAX_SIZE,
		},
		// @see: https://nextjs.org/docs/app/api-reference/next-config-js/viewTransition
		viewTransition: true,
		webVitalsAttribution: ["CLS", "LCP", "TTFB", "FCP", "FID"],
	},

	/*
	 * Miscellaneous configuration
	 */
	devIndicators: {
		position: "bottom-left" as const,
	},

	/*
	 * Logging configuration
	 * @see https://nextjs.org/docs/app/api-reference/next-config-js/logging
	 */
	logging: {
		fetches: {
			fullUrl: true, // This will log the full URL of the fetch request even if cached
			// hmrRefreshes: true,
		},
	},

	compiler: {
		// Remove all console logs
		// removeConsole: true
		// Remove console logs only in production, excluding error logs
		// removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,

		// Use DISABLE_LOGGING to disable all logging except error logs
		// Use DISABLE_ERROR_LOGGING to disable error logging too
		removeConsole:
			process.env.DISABLE_LOGGING === "true"
				? process.env.DISABLE_ERROR_LOGGING === "true"
					? true
					: { exclude: ["error"] }
				: false,
	},

	outputFileTracingExcludes: {
		"*": [
			"**/*.test.*",
			"**/*.spec.*",
			"**/*.stories.*",
			"**/tests/**",
			"**/.git/**",
			"**/.github/**",
			"**/.vscode/**",
			"**/.next/cache/**",
			"**/node_modules/typescript/**",
			"**/node_modules/@types/**",
			"**/node_modules/eslint/**",
			"**/node_modules/prettier/**",
			"**/node_modules/typescript/**",
			"**/node_modules/react-syntax-highlighter/**",
			"**/node_modules/canvas-confetti/**",
			"**/node_modules/@huggingface/transformers/**",
			"**/node_modules/three/**",
			"**/node_modules/@react-three/**",
			"**/node_modules/jspdf/**",
		],
	},
	outputFileTracingIncludes: {
		"*": ["./docs/**/*", "./src/content/**/*"],
	},
};

/*
 * Configurations
 * Order matters!
 */
// Builder config
nextConfig = isBuilderEnabled ? BuilderDevTools()(nextConfig) : nextConfig;

// Payload config
nextConfig = isPayloadEnabled ? withPayload(nextConfig) : nextConfig;

/*
 * MDX config - should be last or second to last
 */
const withMDX = createMDX({
	extension: /\.mdx?$/,
	options: {
		remarkPlugins: [
			[
				// @ts-expect-error
				"remark-frontmatter",
				{
					type: "yaml",
					marker: "-",
				},
			],
			// @ts-expect-error
			["remark-mdx-frontmatter", {}],
		],
		rehypePlugins: [],
	},
});
nextConfig = isMDXEnabled ? withMDX(nextConfig) : nextConfig;

/*
 * PWA config
 */
const pwaConfig = {
	dest: "public",
	register: true,
	skipWaiting: true,
	disable: !isPwaEnabled || process.env.NODE_ENV === "development",
};

nextConfig = isPwaEnabled ? (withPWA as any)(pwaConfig)(nextConfig) as NextConfig : nextConfig;

/*
 * Logflare config - should be last
 */
/** @type {import("./withLogFlare.js").LogFlareOptions} */
// const logFlareOptions = {
// 	// apiKey: "sk_tk4XH5TBd76VPKWEkDQ7706z9WReI7sQK9bSelC5", // Move to env
// 	prefix: "[LogFlare]",
// 	logLevel: process.env.NODE_ENV === "production" ? "log" : "debug",
// 	logToFile: true,
// 	logFilePath: "./logflare.log",
// 	useColors: true,
// 	useEmoji: true,
// 	colors: {
// 		// Override default colors if needed
// 		error: "\x1b[41m\x1b[37m", // White text on red background
// 	},
// 	emojis: {
// 		// Override default emojis if needed
// 		debug: "🔍",
// 	},
// };
// nextConfig = withLogFlare(logFlareOptions)(nextConfig);

export default nextConfig;
