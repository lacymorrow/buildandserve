"use client";

import { logInfo } from "./logging";
import type { ContainerFile } from "./types";

/**
 * Helper function to read a repo file directly
 * @param filePath The path to the file in the repo
 * @returns The file content or null if the file couldn't be read
 */
export async function readRepoFile(filePath: string): Promise<string | Uint8Array | null> {
	try {
		// In the browser environment, we need to fetch the file
		if (typeof window !== "undefined") {
			const url = `/api/repo-file?path=${encodeURIComponent(filePath)}`;
			logInfo(`Fetching repo file content from: ${url}`);

			const response = await fetch(url);

			if (!response.ok) {
				logInfo(`Failed to fetch repo file: ${filePath}`, {
					status: response.status,
					statusText: response.statusText,
				});
				return null;
			}

			// Check content type to determine how to handle the response
			const contentType = response.headers.get("Content-Type") || "";
			logInfo(`Received content type: ${contentType} for file: ${filePath}`);

			// Handle binary files
			if (
				contentType.includes("image/") ||
				contentType.includes("font/") ||
				contentType.includes("application/octet-stream") ||
				contentType.includes("application/zip")
			) {
				// For binary files, return an ArrayBuffer
				const buffer = await response.arrayBuffer();
				return new Uint8Array(buffer);
			}

			// For text files, return text
			const text = await response.text();
			logInfo(`Received text content (${text.length} bytes) for file: ${filePath}`);
			return text;
		}
		return null;
	} catch (error) {
		logInfo(`Error reading repo file ${filePath}:`, error);
		return null;
	}
}

/**
 * Get a list of important files from the repo that should be loaded
 * @returns Array of file paths
 */
export function getImportantRepoFiles(): string[] {
	// List of key files that should be loaded for proper functionality
	return [
		// Core configuration files
		"package.json",
		"tailwind.config.ts",
		"tsconfig.json",
		"components.json",
		// Style files
		"src/styles/globals.css",
		"src/app/globals.css", // Alternative location
		// Utility files
		"src/lib/utils.ts",
		// Layout and page files
		"src/app/layout.tsx",
		"src/app/page.tsx",
		// Theme files
		"src/styles/themes.ts",
		"src/lib/themes.ts",
		"src/app/themes.ts",
		// Important shadcn component files if they exist
		"src/components/ui/button.tsx",
		"src/components/ui/card.tsx",
		"src/components/ui/form.tsx",
		"src/components/ui/input.tsx",
	];
}

/**
 * Preload important repo files to speed up operations
 * @param container The WebContainer instance
 */
export async function preloadRepoFiles(container: any): Promise<void> {
	logInfo("Starting to preload important repo files");

	const filesToPreload = getImportantRepoFiles();

	for (const filePath of filesToPreload) {
		try {
			// Read the file content
			const content = await readRepoFile(filePath);
			if (content !== null) {
				// Make sure the directory exists
				const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
				if (dirPath) {
					try {
						await container.fs.mkdir(dirPath, { recursive: true });
						logInfo(`Created directory ${dirPath} in container`);
					} catch (err) {
						// Directory may already exist
						logInfo(`Note: Directory ${dirPath} may already exist in container`);
					}
				}

				// Write file to the container
				try {
					await container.fs.writeFile(filePath, content);
					logInfo(`Preloaded file: ${filePath}`);
				} catch (writeError) {
					logInfo(`Error writing file ${filePath} to container:`, writeError);
				}
			}
		} catch (error) {
			logInfo(`Error processing file ${filePath}:`, error);
		}
	}

	logInfo("Completed preloading repo files");
}

/**
 * Process shadcn component installation directly using repo files
 * @param container The WebContainer instance
 * @param projectStructure The project structure type ("app" or "src/app")
 */
export async function processShadcnComponent(
	container: any,
	projectStructure: string,
	componentName: string
): Promise<ContainerFile[]> {
	const files: ContainerFile[] = [];
	logInfo(`Processing shadcn component '${componentName}' for '${projectStructure}' structure`);

	// Define the base directory for shadcn components
	const componentBaseDir = "src/components/ui";

	// Get dependencies from components.json if available
	let dependencies: Record<string, string> = {};

	try {
		const componentsJson = await readRepoFile("components.json");
		if (componentsJson) {
			const config = JSON.parse(componentsJson as string);
			dependencies = config.dependencies || {};
		}
	} catch (error) {
		logInfo("Error reading components.json:", error);
	}

	// Add the component files to the result
	try {
		// Try to load the component file from the repo
		const componentPath = `${componentBaseDir}/${componentName}.tsx`;
		const content = await readRepoFile(componentPath);

		if (content) {
			// Create directory structure if needed
			try {
				await container.fs.mkdir(componentBaseDir, { recursive: true });
			} catch (err) {
				// Ignore if directory already exists
				logInfo("Note: Directory ${componentBaseDir} may already exist");
			}

			// Write the file to the container
			try {
				await container.fs.writeFile(componentPath, content);
				logInfo(`Successfully wrote component file: ${componentPath}`);

				// Add to the list of processed files
				files.push({
					path: componentPath,
					content: typeof content === "string" ? content : "[Binary data]",
				});
			} catch (writeError) {
				logInfo("Error writing component file ${componentPath}:", writeError);
			}
		}

		// Add utility files if needed
		const utilsPath = "src/lib/utils.ts";
		const utilsContent = await readRepoFile(utilsPath);

		if (utilsContent) {
			try {
				await container.fs.mkdir("src/lib", { recursive: true });
				await container.fs.writeFile(utilsPath, utilsContent);
				files.push({
					path: utilsPath,
					content: typeof utilsContent === "string" ? utilsContent : "[Binary data]",
				});
			} catch (err) {
				logInfo("Error writing utils file:", err);
			}
		}
	} catch (error) {
		logInfo(`Error processing component ${componentName}:`, error);
	}

	logInfo(`Processed component ${componentName} with ${files.length} files`);
	return files;
}

/**
 * Import project files from the repo into the container
 * @param container The WebContainer instance
 * @param fileExists Helper function to check if a file exists
 * @param files Optional list of specific files to import
 */
export async function importProjectFiles(
	container: any,
	fileExists: (path: string) => Promise<boolean>,
	files?: string[]
): Promise<void> {
	if (!container) {
		throw new Error("Container not initialized");
	}

	logInfo("Importing project files", { count: files?.length || 0 });

	// Files to synchronize with the repo project
	const targetFiles = files?.length ? files : getImportantRepoFiles();

	for (const filePath of targetFiles) {
		try {
			// For each file, try to read it from the repo
			const content = await readRepoFile(filePath);

			if (content !== null) {
				logInfo(`Successfully read ${filePath} from repo`);

				// Make sure the directory exists
				const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
				if (dirPath) {
					try {
						await container.fs.mkdir(dirPath, { recursive: true });
					} catch (err) {
						// Directory may already exist, ignore
					}
				}

				// Write to container
				await container.fs.writeFile(filePath, content);
				logInfo(`Imported ${filePath} to container`);
			}
		} catch (error) {
			logInfo(`Failed to import ${filePath}:`, error);
		}
	}

	logInfo("Project file import complete");
}
