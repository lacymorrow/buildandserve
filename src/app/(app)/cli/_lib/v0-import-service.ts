import { execSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

interface ComponentFile {
	path: string;
	content: string;
}

interface ComponentStructure {
	files: ComponentFile[];
	dependencies?: string[];
}

/**
 * Service for handling v0.dev component imports
 */
class V0ComponentImportService {
	/**
	 * Fetches a component's structure from a v0.dev URL
	 * This works by using the shadcn CLI to download the component to a temporary directory,
	 * then reading the files and returning their contents without installing them
	 */
	async fetchComponentStructure(url: string): Promise<ComponentStructure> {
		// Create a temporary directory to download the component
		const tempDir = mkdtempSync(path.join(tmpdir(), "v0-import-"));

		try {
			// Create a fake components.json file to make the CLI work
			const componentsJson = {
				$schema: "https://ui.shadcn.com/schema.json",
				style: "default",
				rsc: true,
				tsx: true,
				tailwind: {
					config: "tailwind.config.js",
					css: "app/globals.css",
					baseColor: "slate",
					cssVariables: true,
				},
				aliases: {
					components: "@/components",
					utils: "@/lib/utils",
				},
			};

			writeFileSync(path.join(tempDir, "components.json"), JSON.stringify(componentsJson, null, 2));

			// Create a minimal package.json to prevent errors
			const packageJson = {
				name: "v0-import-temp",
				version: "0.1.0",
				private: true,
				dependencies: {},
			};

			writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(packageJson, null, 2));

			// Create tsconfig.json
			const tsconfigJson = {
				compilerOptions: {
					target: "es5",
					lib: ["dom", "dom.iterable", "esnext"],
					allowJs: true,
					skipLibCheck: true,
					strict: true,
					forceConsistentCasingInFileNames: true,
					noEmit: true,
					esModuleInterop: true,
					module: "esnext",
					moduleResolution: "node",
					resolveJsonModule: true,
					isolatedModules: true,
					jsx: "preserve",
					baseUrl: ".",
					paths: {
						"@/*": ["./*"],
					},
				},
				include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
				exclude: ["node_modules"],
			};

			writeFileSync(path.join(tempDir, "tsconfig.json"), JSON.stringify(tsconfigJson, null, 2));

			// Run the shadcn CLI with --config to generate the config without installing
			execSync(`npx shadcn@latest add "${url}" --yes --cwd "${tempDir}" --config`, {
				stdio: "pipe", // Suppress output
			});

			// Now we need to look at the generated component directories
			const dirs = ["app", "src/app", "components", "lib", "types"];

			// Extract files and dependencies
			const files: ComponentFile[] = [];

			for (const dir of dirs) {
				const dirPath = path.join(tempDir, dir);
				if (existsSync(dirPath)) {
					this.collectFiles(dirPath, tempDir, files);
				}
			}

			return {
				files,
				dependencies: [], // TODO: Extract dependencies if needed
			};
		} catch (error) {
			console.error("Error fetching component structure:", error);
			throw error;
		} finally {
			// Clean up the temporary directory
			try {
				rmSync(tempDir, { recursive: true, force: true });
			} catch (e) {
				console.error("Error cleaning up temporary directory:", e);
			}
		}
	}

	/**
	 * Recursively collect files from a directory
	 */
	private collectFiles(dirPath: string, basePath: string, files: ComponentFile[]): void {
		const { readdirSync, statSync } = require("fs");

		const entries = readdirSync(dirPath, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dirPath, entry.name);
			const relativePath = path.relative(basePath, fullPath);

			if (entry.isDirectory()) {
				// Recurse into subdirectories
				this.collectFiles(fullPath, basePath, files);
			} else {
				// Add file to the list
				try {
					const content = readFileSync(fullPath, "utf-8");
					files.push({
						path: relativePath,
						content,
					});
				} catch (error) {
					console.error(`Error reading file ${fullPath}:`, error);
				}
			}
		}
	}

	/**
	 * Parses a v0.dev URL to extract the component ID
	 */
	parseV0Url(url: string): string | null {
		const regexPatterns = [
			// Format: https://v0.dev/chat/b/PELBaSciVMb
			/https?:\/\/v0\.dev\/chat\/b\/([a-zA-Z0-9_-]+)/,
			// Format: https://v0.dev/chat/b/PELBaSciVMb?token=token
			/https?:\/\/v0\.dev\/chat\/b\/([a-zA-Z0-9_-]+)\?token=/,
			// Format with only the ID
			/^([a-zA-Z0-9_-]{8,})$/,
		];

		for (const pattern of regexPatterns) {
			const match = url.match(pattern);
			if (match?.[1]) {
				return match[1];
			}
		}

		return null;
	}

	/**
	 * Checks if a URL is a valid v0.dev URL
	 */
	isValidV0Url(url: string): boolean {
		return this.parseV0Url(url) !== null;
	}

	/**
	 * Formats a v0.dev ID or URL into the proper format for the shadcn CLI
	 */
	formatV0Url(input: string): string {
		const id = this.parseV0Url(input);
		if (!id) {
			throw new Error("Invalid v0.dev URL or component ID");
		}

		return `https://v0.dev/chat/b/${id}`;
	}
}

export const v0ComponentImportService = new V0ComponentImportService();
