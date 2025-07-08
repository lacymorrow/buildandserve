import { buildTimeFeatureFlags } from "@/config/features-config";
import { FILE_UPLOAD_MAX_SIZE } from "@/config/file";
import { redirects } from "@/config/routes";
import { withPlugins } from "@/config/with-plugins";
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
	env: {
		// Add client-side feature flags
		...buildTimeFeatureFlags,

		// You can add other build-time env variables here if needed
	},

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
		/*
		 * Next.js 15 Image Optimization
		 * Enhanced image formats and caching for better performance
		 */
		// formats: ["image/avif", "image/webp"],
		// deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
		// imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
		// minimumCacheTTL: 60,
		// dangerouslyAllowSVG: true,
		// contentDispositionType: "attachment",
		// contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
	},

	/*
	 * Redirects are located in the `src/config/routes.ts` file
	 */
	redirects,

	async headers() {
		return Promise.resolve([
			// /install
			{
				source: "/install",
				headers: [
					{
						key: "Cross-Origin-Opener-Policy",
						value: "same-origin",
					},
					{
						key: "Cross-Origin-Embedder-Policy",
						value: "require-corp",
					},
				],
			},
			/*
			 * Enhanced Security Headers
			 * Adds Content Security Policy for better security
			 */
			// {
			// 	source: "/(.*)",
			// 	headers: [
			// 		{
			// 			key: "X-Frame-Options",
			// 			value: "DENY",
			// 		},
			// 		{
			// 			key: "X-Content-Type-Options",
			// 			value: "nosniff",
			// 		},
			// 		{
			// 			key: "Referrer-Policy",
			// 			value: "origin-when-cross-origin",
			// 		},
			// 		{
			// 			key: "Permissions-Policy",
			// 			value: "camera=(), microphone=(), geolocation=()",
			// 		},
			// 	],
			// },
		]);
	},

	/*
	 * React configuration
	 */
	reactStrictMode: true,

	/*
	 * Source maps - DISABLED to reduce memory usage during build
	 * Enable only in development or when specifically needed
	 */
	productionBrowserSourceMaps: false,

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
		// ignoreBuildErrors: true,
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

		/*
		 * Next.js 15 Client-side Router Cache Configuration
		 * Optimizes navigation performance by caching page segments
		 */
		staleTimes: {
			dynamic: 90, // 90 seconds for dynamic routes
			static: 3600, // 3600 seconds for static routes
		},

		/*
		 * Build Performance Optimization
		 * Use available CPU cores efficiently (leave one core free)
		 */
		// cpus: Math.max(1, (os.cpus()?.length ?? 1) - 1),

		// Memory optimization - reduce worker memory
		// workerThreads: false,
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

	/*
	 * Bundle Size Optimization - Enhanced
	 * Excludes additional heavy dependencies and dev tools from production bundles
	 */
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
			// Additional Next.js 15 optimizations
			"**/node_modules/monaco-editor/**",
			"**/node_modules/@playwright/**",
			"**/node_modules/typescript/lib/**",
			// Exclude more heavy dependencies
			"**/node_modules/remotion/**",
			"**/node_modules/@opentelemetry/**",
			"**/node_modules/googleapis/**",
			"**/node_modules/@tsparticles/**",
			"**/node_modules/marked/**",
			"**/node_modules/remark/**",
			"**/node_modules/rehype/**",
		],
	},
	outputFileTracingIncludes: {
		"*": ["./docs/**/*", "./src/content/**/*"],
	},

	/*
	 * Turbopack configuration
	 * @see https://nextjs.org/docs/app/api-reference/next-config-js/turbo
	 */
	turbopack: {
		rules: {
			// Add rules for raw-loader to handle specific file types
			// This mirrors the webpack config for these extensions
			"*.(node|bin|html)": {
				loaders: ["raw-loader"],
				as: "*.js",
			},
		},
	},


	/*
	 * Webpack configuration
	 */
	webpack: (config: any, { dev, isServer }: { dev: boolean; isServer: boolean }) => {
		// Enable top-level await
		config.experiments = { ...config.experiments, topLevelAwait: true };
		if (!dev) {
			// // Disable source maps for node_modules to save memory
			// config.module.rules.push({
			// 	test: /\.js$/,
			// 	include: /node_modules/,
			// 	use: {
			// 		loader: 'source-map-loader',
			// 		options: {
			// 			enforce: 'pre',
			// 		},
			// 	},
			// 	enforce: 'pre',
			// });

			// Optimize chunk splitting to prevent large chunks
			config.optimization = {
				...config.optimization,
				splitChunks: {
					...config.optimization.splitChunks,
					cacheGroups: {
						...config.optimization.splitChunks?.cacheGroups,
						// Split large vendor libraries into separate chunks
						vendor: {
							test: /[\\/]node_modules[\\/]/,
							name: "vendors",
							chunks: "all",
							maxSize: 244000, // ~240KB chunks
						},
						// Split three.js and related 3D libraries
						threejs: {
							test: /[\\/]node_modules[\\/](@react-three|three)[\\/]/,
							name: "threejs",
							chunks: "all",
							priority: 10,
						},
						// Split AI/ML libraries
						ai: {
							test: /[\\/]node_modules[\\/](@huggingface|openai|remotion)[\\/]/,
							name: "ai-libs",
							chunks: "all",
							priority: 10,
						},
					},
				},
			};

			// Limit memory usage - SLOW BUILD
			// config.optimization.moduleIds = 'deterministic';
			// config.optimization.chunkIds = 'deterministic';
		}

		if (isServer) {
			// config.resolve.alias = {
			// 	...config.resolve.alias,
			// };

			// Ensure docs directory is included in the bundle for dynamic imports
			config.module.rules.push({
				test: /\.(md|mdx)$/,
				include: [
					path.join(process.cwd(), "docs"),
					// require("path").join(process.cwd(), "src/content/docs"),
				],
				use: "raw-loader",
			});

			config.externals = [
				...(config.externals ?? []),
				// Externalize heavy client-only libraries on server
				{
					three: "three",
					"@react-three/fiber": "@react-three/fiber",
					"@react-three/drei": "@react-three/drei",
					"canvas-confetti": "canvas-confetti",
					"@huggingface/transformers": "@huggingface/transformers",
					remotion: "remotion",
					"@opentelemetry/instrumentation": "@opentelemetry/instrumentation",
				},
			];
		} else {
			config.watchOptions = {
				...config.watchOptions,
				ignored: [
					"**/node_modules",
					"**/.git",
					"**/.next",
					"**/node_modules/three",
					"**/node_modules/@react-three",
					"**/node_modules/remotion",
					// Don't ignore docs directory
				],
			};
		}

		return config;
	}

};

/*
 * Apply Next.js configuration plugins using the withPlugins utility.
 * The utility handles loading and applying functions exported from files
 * in the specified directory (default: src/config/nextjs).
 */
export default withPlugins(nextConfig);
