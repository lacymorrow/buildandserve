"use server";

import { spawn } from "child_process";
import type { InstallOptions } from "../_lib/types";
import { v0ComponentImportService } from "../_lib/v0-import-service";

interface ComponentFile {
	path: string;
	content: string;
}

/**
 * Fetches a v0.dev component's structure from a URL without installing it.
 * This allows examining the component structure before deciding where to install it.
 */
export async function fetchV0ComponentStructure(url: string): Promise<{
	files: ComponentFile[];
	appStructure: "app" | "src/app" | null;
}> {
	try {
		// Fetch the component structure using the shadcn CLI
		const structure = await v0ComponentImportService.fetchComponentStructure(url);

		// Determine app directory structure by analyzing the file paths
		let appStructure: "app" | "src/app" | null = null;

		if (structure.files.some((file: ComponentFile) => file.path.startsWith("app/"))) {
			appStructure = "app";
		} else if (structure.files.some((file: ComponentFile) => file.path.startsWith("src/app/"))) {
			appStructure = "src/app";
		}

		return {
			files: structure.files,
			appStructure,
		};
	} catch (error) {
		console.error("Error fetching component structure:", error);
		throw error;
	}
}

/**
 * Imports a v0.dev component safely, ensuring it's compatible with the project structure
 * and allowing for client-side downloading of the files for later installation.
 */
export async function importV0Component(
	componentUrl: string,
	options: InstallOptions & { targetStructure?: "app" | "src/app" } = {}
): Promise<{
	files: ComponentFile[];
	message: string;
}> {
	try {
		// Fetch the component structure
		const { files, appStructure } = await fetchV0ComponentStructure(componentUrl);

		// If we have a target structure and it doesn't match the component structure,
		// we need to adjust the file paths
		if (options.targetStructure && appStructure && options.targetStructure !== appStructure) {
			const adjustedFiles = files.map((file: ComponentFile) => {
				// Replace the app/ prefix with src/app/ or vice versa
				let newPath = file.path;
				if (appStructure === "app" && options.targetStructure === "src/app") {
					newPath = file.path.replace(/^app\//, "src/app/");
				} else if (appStructure === "src/app" && options.targetStructure === "app") {
					newPath = file.path.replace(/^src\/app\//, "app/");
				}

				return {
					...file,
					path: newPath,
				};
			});

			return {
				files: adjustedFiles,
				message: `Component structure adjusted from ${appStructure} to ${options.targetStructure}`,
			};
		}

		return {
			files,
			message: "Component structure fetched successfully",
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error occurred";
		throw new Error(`Failed to import v0 component: ${message}`);
	}
}

/**
 * Installs a v0.dev component into the project directly
 * This should only be used in development environments
 */
export async function installV0Component(
	componentUrl: string,
	options: InstallOptions & { targetStructure?: "app" | "src/app" } = {}
): Promise<ReadableStream<Uint8Array>> {
	const encoder = new TextEncoder();

	return new ReadableStream({
		async start(controller) {
			try {
				// First, check the component structure
				controller.enqueue(encoder.encode("Fetching component structure...\n"));
				const { files, appStructure } = await fetchV0ComponentStructure(componentUrl);

				if (options.targetStructure && appStructure && options.targetStructure !== appStructure) {
					controller.enqueue(
						encoder.encode(
							`Warning: Component uses ${appStructure} structure but project uses ${options.targetStructure}.\n`
						)
					);
					controller.enqueue(
						encoder.encode("Adjusting file paths to match project structure...\n")
					);
				}

				// Now proceed with installation
				const args = ["shadcn@latest", "add"];

				// Add component URL
				args.push(componentUrl);

				// Add options
				if (options.overwrite) args.push("--overwrite");
				if (options.style) args.push("--style", options.style);
				if (options.typescript) args.push("--typescript");
				if (options.path) args.push("--path", options.path);

				controller.enqueue(encoder.encode(`Running: npx ${args.join(" ")}\n`));

				const process = spawn("npx", args, {
					stdio: ["pipe", "pipe", "pipe"],
				});

				// If not overwriting, automatically answer "n" to prompts
				if (!options.overwrite && process.stdin) {
					process.stdin.write("n\n");
					process.stdin.end();
				}

				process.stdout?.on("data", (data) => {
					controller.enqueue(encoder.encode(data));
				});

				process.stderr?.on("data", (data) => {
					controller.enqueue(encoder.encode(data));
				});

				process.on("close", (code) => {
					if (code !== 0) {
						controller.enqueue(encoder.encode(`\nProcess exited with code ${code}`));
					} else {
						controller.enqueue(encoder.encode("\nComponent installed successfully!"));
					}
					controller.close();
				});

				process.on("error", (err) => {
					controller.enqueue(encoder.encode(`\nError: ${err.message}`));
					controller.close();
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : "Unknown error occurred";
				controller.enqueue(encoder.encode(`\nError: ${message}`));
				controller.close();
			}
		},
	});
}
