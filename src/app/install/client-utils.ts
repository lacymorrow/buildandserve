"use client";

import { logInfo } from "./logging";
import {
	BINARY_EXTENSIONS,
	TEMPLATE_BASE_DIR,
	sanitizePath,
	shouldIgnoreFile,
} from "./shared-utils";
import type { ContainerFile } from "./types";

// Client-side caches
const fileContentCache = new Map<string, string | Uint8Array>();
const directoryListingCache = new Map<string, string[]>();

/**
 * Read a template file from the file system
 * Uses caching to avoid repeated fetches
 */
export async function readTemplateFile(filePath: string): Promise<string | Uint8Array | null> {
	try {
		// Normalize and sanitize path
		const normalizedPath = sanitizePath(filePath);

		// Skip empty paths
		if (!normalizedPath) {
			logInfo("Skipping empty file path request");
			return null;
		}

		// Check cache first
		if (fileContentCache.has(normalizedPath)) {
			logInfo(`Using cached file content for: ${normalizedPath}`);
			return fileContentCache.get(normalizedPath) || null;
		}

		// Fetch directly from source components
		const url = `/api/template-file-content?path=${encodeURIComponent(normalizedPath)}`;
		logInfo(`Fetching template file from: ${url}`);

		const response = await fetch(url);

		if (!response.ok) {
			logInfo(`Failed to fetch template file: ${normalizedPath}`, {
				status: response.status,
				statusText: response.statusText,
			});
			return null;
		}

		// Check content type to determine how to handle the response
		const contentType = response.headers.get("Content-Type") || "";
		logInfo(`Received content type: ${contentType} for file: ${normalizedPath}`);

		let content: string | Uint8Array;

		// Check if this is a binary file
		const fileExt = normalizedPath.substring(normalizedPath.lastIndexOf("."));
		if (
			BINARY_EXTENSIONS.includes(fileExt) ||
			contentType.startsWith("image/") ||
			contentType.includes("octet-stream")
		) {
			// For binary files, return an array buffer
			const buffer = await response.arrayBuffer();
			content = new Uint8Array(buffer);
			logInfo(`Received binary content (${content.length} bytes) for file: ${normalizedPath}`);
		} else {
			// For text files, return text
			content = await response.text();
			logInfo(`Received text content (${content.length} bytes) for file: ${normalizedPath}`);
		}

		// Add to cache
		fileContentCache.set(normalizedPath, content);
		return content;
	} catch (error) {
		logInfo(`Error reading template file ${filePath}:`, error);
		return null;
	}
}

/**
 * Get directory entries
 * Uses caching to avoid repeated fetches
 */
export async function getDirectoryEntries(directoryPath: string): Promise<string[]> {
	try {
		// Normalize path
		const normalizedPath = sanitizePath(directoryPath);

		// Check cache first
		if (directoryListingCache.has(normalizedPath)) {
			logInfo(`Using cached directory listing for: ${normalizedPath}`);
			return directoryListingCache.get(normalizedPath) || [];
		}

		const response = await fetch(`/api/template-files?path=${encodeURIComponent(normalizedPath)}`);
		if (!response.ok) {
			logInfo(`Failed to fetch directory listing for ${normalizedPath}`, response.statusText);
			return [];
		}

		const entries = await response.json();
		logInfo(`Found ${entries.length} entries in ${normalizedPath || "root"}`);

		// Cache the directory listing
		directoryListingCache.set(normalizedPath, entries);
		return entries;
	} catch (error) {
		logInfo(`Error getting directory entries for ${directoryPath}:`, error);
		return [];
	}
}

/**
 * Process template files based on the project structure
 * @param projectStructure The project structure to process (app or src/app)
 * @returns An array of container files
 */
export async function processTemplateFiles(projectStructure: string): Promise<ContainerFile[]> {
	const files: ContainerFile[] = [];

	logInfo(`Processing template files for '${projectStructure}' structure`);

	// Helper function to recursively process a directory
	async function processDirectory(dirPath: string = TEMPLATE_BASE_DIR) {
		const entries = await getDirectoryEntries(dirPath);

		for (const entry of entries) {
			const subPath = dirPath === TEMPLATE_BASE_DIR ? entry : `${dirPath}/${entry}`;

			// Skip if this file should be ignored
			if (shouldIgnoreFile(subPath)) {
				logInfo(`Skipping ignored file: ${subPath}`);
				continue;
			}

			// Check if it's a directory
			if (subPath.endsWith("/")) {
				// Recursively process subdirectories
				await processDirectory(subPath);
			} else {
				// Get file content
				const content = await readTemplateFile(subPath);

				// Skip if the content is null or not a string
				if (content === null || !(typeof content === "string")) {
					logInfo(`Skipping non-text file: ${subPath}`);
					continue;
				}

				// Adjust path based on project structure
				let targetPath = subPath;

				if (subPath.startsWith("app/") && projectStructure === "src/app") {
					targetPath = `src/${subPath}`;
					logInfo(`Adjusting path from ${subPath} to ${targetPath} for src/app structure`);
				} else if (subPath.startsWith("src/app/") && projectStructure === "app") {
					targetPath = subPath.substring(4); // Remove "src/"
					logInfo(`Adjusting path from ${subPath} to ${targetPath} for app structure`);
				}

				// Add the file to the result
				files.push({
					path: targetPath,
					content: content,
				});

				logInfo(`Processed file: ${targetPath} (${content.length} bytes)`);
			}
		}
	}

	// Start processing from the root
	await processDirectory();
	logInfo(`Processed ${files.length} files total`);

	return files;
}

/**
 * Import project files into the container
 * @param container The container to import files into
 * @param fileExists Function to check if a file exists
 * @param files Optional list of files to import
 */
export async function importProjectFiles(
	container: any,
	fileExists: (path: string) => Promise<boolean>,
	files?: string[]
) {
	try {
		if (files && files.length > 0) {
			// Import specific files
			for (const file of files) {
				try {
					// Check if file already exists
					const exists = await fileExists(file);
					if (exists) {
						logInfo(`File already exists, skipping: ${file}`);
						continue;
					}

					// Read file content
					const content = await readTemplateFile(file);
					if (content) {
						// Write the file to the container
						if (typeof content === "string") {
							await container.fs.writeFile(file, content);
							logInfo(`Imported text file: ${file}`);
						} else {
							await container.fs.writeFile(file, content, null);
							logInfo(`Imported binary file: ${file}`);
						}
					}
				} catch (error) {
					logInfo(`Error importing file: ${file}`, error);
				}
			}
		} else {
			// Import all project files
			async function processDirectory(dirPath: string = TEMPLATE_BASE_DIR) {
				const entries = await getDirectoryEntries(dirPath);

				for (const entry of entries) {
					const subPath = dirPath === TEMPLATE_BASE_DIR ? entry : `${dirPath}/${entry}`;

					// Skip if this file should be ignored
					if (shouldIgnoreFile(subPath)) {
						logInfo(`Skipping ignored file: ${subPath}`);
						continue;
					}

					// Process subdirectories and files
					if (subPath.endsWith("/")) {
						try {
							await container.fs.mkdir(subPath, { recursive: true });
							logInfo(`Created directory: ${subPath}`);
						} catch (error) {
							logInfo(`Directory might already exist: ${subPath}`, error);
						}
						await processDirectory(subPath);
					} else {
						try {
							// Check if file already exists
							const exists = await fileExists(subPath);
							if (exists) {
								logInfo(`File already exists, skipping: ${subPath}`);
								continue;
							}

							// Read file content
							const content = await readTemplateFile(subPath);
							if (content) {
								// Write the file to the container
								if (typeof content === "string") {
									await container.fs.writeFile(subPath, content);
									logInfo(`Imported text file: ${subPath}`);
								} else {
									await container.fs.writeFile(subPath, content, null);
									logInfo(`Imported binary file: ${subPath}`);
								}
							}
						} catch (error) {
							logInfo(`Error importing file: ${subPath}`, error);
						}
					}
				}
			}

			await processDirectory();
		}
	} catch (error) {
		logInfo("Error importing project files:", error);
	}
}
