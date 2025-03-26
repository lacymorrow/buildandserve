"use client";

import { logInfo } from "./logging";
import type { ContainerFile } from "./types";

/**
 * Helper function to read a template file
 * @param filePath The path to the file
 * @returns The file content or null if the file couldn't be read
 */
export async function readTemplateFile(filePath: string): Promise<string | Uint8Array | null> {
	try {
		// In the browser environment, we need to fetch the file
		if (typeof window !== "undefined") {
			const url = `/api/template-file-content?path=${encodeURIComponent(filePath)}`;
			logInfo(`Fetching template file content from: ${url}`);

			const response = await fetch(url);

			if (!response.ok) {
				logInfo(`Failed to fetch template file: ${filePath}`, {
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
		logInfo(`Error reading template file ${filePath}:`, error);
		return null;
	}
}

/**
 * Preload template files to speed up later operations
 * @param container The WebContainer instance
 */
export async function preloadTemplateFiles(container: any): Promise<void> {
	logInfo("Starting to preload template files");

	// Helper function to recursively process directory
	const processDirectory = async (directoryPath = ""): Promise<void> => {
		try {
			// Make a fetch request to get the directory listing
			const response = await fetch(`/api/template-files?path=${encodeURIComponent(directoryPath)}`);
			if (!response.ok) {
				logInfo(`Failed to fetch directory listing for ${directoryPath}`, response.statusText);
				return;
			}

			const entries = await response.json();
			logInfo(`Found ${entries.length} entries in ${directoryPath || "root"}`);

			// Create the directory in the container if it doesn't exist
			if (directoryPath) {
				try {
					await container.fs.mkdir(directoryPath, { recursive: true });
					logInfo(`Created directory ${directoryPath} in container`);
				} catch (err) {
					// Directory may already exist
					logInfo(`Note: Directory ${directoryPath} may already exist in container`);
				}
			}

			for (const entry of entries) {
				const fullPath = directoryPath ? `${directoryPath}/${entry.name}` : entry.name;

				if (entry.isDirectory) {
					// Process subdirectory recursively
					await processDirectory(fullPath);
				} else {
					// Read the file content
					const content = await readTemplateFile(fullPath);
					if (content !== null) {
						// Write file to the container
						try {
							await container.fs.writeFile(fullPath, content);
							logInfo(`Preloaded file: ${fullPath}`);
						} catch (writeError) {
							logInfo(`Error writing file ${fullPath} to container:`, writeError);
						}
					}
				}
			}
		} catch (error) {
			logInfo(`Error processing directory ${directoryPath}:`, error);
		}
	};

	// Start processing from root
	await processDirectory("");
	logInfo("Completed preloading template files");
}

/**
 * Process template files from disk
 * @param container The WebContainer instance
 * @param projectStructure The project structure type ("app" or "src/app")
 */
export async function processTemplateFilesFromDisk(
	container: any,
	projectStructure: string
): Promise<ContainerFile[]> {
	const files: ContainerFile[] = [];

	logInfo(`Processing template files from disk for '${projectStructure}' structure`);

	// Helper function to recursively process directory
	const processDirectory = async (directoryPath = ""): Promise<void> => {
		try {
			// Make a fetch request to get the directory listing
			const response = await fetch(`/api/template-files?path=${encodeURIComponent(directoryPath)}`);
			if (!response.ok) {
				logInfo(`Failed to fetch directory listing for ${directoryPath}`, response.statusText);
				return;
			}

			const entries = await response.json();

			for (const entry of entries) {
				const fullPath = directoryPath ? `${directoryPath}/${entry.name}` : entry.name;

				if (entry.isDirectory) {
					// Process subdirectory recursively
					await processDirectory(fullPath);
				} else {
					// Read the file content
					const content = await readTemplateFile(fullPath);
					if (content !== null) {
						// Create target path based on project structure
						let targetPath = fullPath;

						// If the path needs adjustment based on project structure
						if (fullPath.startsWith("app/") && projectStructure === "src/app") {
							targetPath = `src/${fullPath}`;
							logInfo(`Adjusting path from ${fullPath} to ${targetPath} for src/app structure`);
						} else if (fullPath.startsWith("src/app/") && projectStructure === "app") {
							targetPath = fullPath.substring(4); // Remove "src/"
							logInfo(`Adjusting path from ${fullPath} to ${targetPath} for app structure`);
						}

						// Log file info - handle both string and binary content
						const contentLength = typeof content === "string" ? content.length : content.byteLength;
						logInfo(`Adding file: ${targetPath} (${contentLength} bytes)`);

						// Create directory structure if it doesn't exist
						const dirPath = targetPath.substring(0, targetPath.lastIndexOf("/"));
						if (dirPath) {
							try {
								await container.fs.mkdir(dirPath, { recursive: true });
							} catch (err) {
								// Ignore if directory already exists
								logInfo(`Note: Directory ${dirPath} may already exist`);
							}
						}

						// Write the file to the container - handle both string and binary content
						try {
							// For WebContainer fs.writeFile, we need different formats for text vs binary
							await container.fs.writeFile(targetPath, content);
							logInfo(`Successfully wrote file: ${targetPath}`);
						} catch (writeError) {
							logInfo(`Error writing file ${targetPath}:`, writeError);
						}

						// Add to the list of processed files - convert binary to base64 for storage
						files.push({
							path: targetPath,
							content:
								typeof content === "string" ? content : `[Binary data: ${contentLength} bytes]`, // For display only
						});
					}
				}
			}
		} catch (error) {
			logInfo(`Error processing directory ${directoryPath}:`, error);
		}
	};

	// Start processing from root
	await processDirectory("");

	// If unable to fetch template files, fallback to using the processTemplateFiles method
	if (files.length === 0) {
		logInfo(
			"No template files could be fetched from disk. Falling back to normal installation process."
		);

		// Log error but don't try to run shadcn init as a fallback
		logInfo("Template files could not be processed. Please try again or use manual installation.");
		return [];
	}

	logInfo(`Processed ${files.length} files total from disk`);
	logInfo("Template file processing complete");
	return files;
}

/**
 * Import project files from the host into the container
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

	// Files to synchronize with the host project
	const targetFiles = files?.length
		? files
		: [
				"package.json",
				"tailwind.config.ts",
				"components.json",
				"src/styles/globals.css",
				"src/lib/utils.ts",
				"src/app/layout.tsx",
				"src/app/page.tsx",
			];

	try {
		for (const filePath of targetFiles) {
			try {
				// Check if file exists in current project
				if (await fileExists(filePath)) {
					// Get file content from the server
					const response = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);

					if (response.ok) {
						const content = await response.text();

						// Ensure directory exists
						const directory = filePath.split("/").slice(0, -1).join("/");
						if (directory) {
							await container.fs.mkdir(directory, { recursive: true });
						}

						// Write file to WebContainer
						await container.fs.writeFile(filePath, content);
						logInfo(`Imported project file: ${filePath}`);
					}
				}
			} catch (error) {
				console.warn(`Failed to import file ${filePath}:`, error);
			}
		}

		logInfo("Project files import completed");
	} catch (error) {
		console.error("Error importing project files:", error);
		throw error;
	}
}
