/**
 * Shared utilities for both client and server components
 * This file contains only server-safe code (no browser APIs or client-specific functionality)
 */

import type { ContainerFile } from "./types";

// Common constants
export const TEMPLATE_BASE_DIR = ".";
export const BINARY_EXTENSIONS = [
	".ico",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".svg",
	".webp",
	".bmp",
	".woff",
	".woff2",
	".ttf",
	".eot",
	".otf",
	".pdf",
	".zip",
	".tar",
	".gz",
];

// Content type mapping
export const CONTENT_TYPE_MAP: Record<string, string> = {
	".json": "application/json",
	".js": "application/javascript",
	".jsx": "application/javascript",
	".mjs": "application/javascript",
	".cjs": "application/javascript",
	".ts": "application/typescript",
	".tsx": "application/typescript",
	".css": "text/css",
	".html": "text/html",
	".md": "text/markdown",
	".mdx": "text/markdown",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
};

// Cache for file content
export const fileContentCache = new Map<string, string | Uint8Array>();

// Cache for directory listings
export const directoryListingCache = new Map<string, any[]>();

/**
 * Check if a file should be ignored
 * @param filename The filename to check
 * @returns True if the file should be ignored, false otherwise
 */
export function shouldIgnoreFile(filename: string): boolean {
	// Skip empty paths
	if (!filename || filename.trim() === "") return true;

	// Normalize path
	const normalizedName = filename.replace(/^\/+/, "").trim();

	// Ignore system files
	if (normalizedName.includes(".DS_Store")) return true;

	// Ignore lock files
	if (
		normalizedName.includes("package-lock.json") ||
		normalizedName.includes("yarn.lock") ||
		normalizedName.includes("pnpm-lock.yaml") ||
		normalizedName.includes(".pnpm-lock.yaml") ||
		normalizedName.includes("npm-shrinkwrap.json") ||
		normalizedName.includes("bun.lockb")
	)
		return true;

	// Ignore TypeScript environment files
	if (normalizedName.includes("next-env.d.ts")) return true;

	// Ignore configuration files
	if (
		normalizedName.includes("README.md") ||
		normalizedName.includes("eslint.config") ||
		normalizedName.includes("next.config") ||
		normalizedName.includes("postcss.config") ||
		normalizedName.includes("tsconfig.json")
	)
		return true;

	// Ignore environment files
	if (
		normalizedName.endsWith(".git") ||
		normalizedName.endsWith(".gitignore") ||
		normalizedName.endsWith(".npmrc") ||
		normalizedName.endsWith(".env") ||
		normalizedName.endsWith(".env.local") ||
		normalizedName.endsWith(".env.development") ||
		normalizedName.endsWith(".env.production")
	)
		return true;

	return false;
}

/**
 * Get content type based on file extension
 * @param ext File extension
 * @returns Content type string
 */
export function getContentType(ext: string): string {
	return CONTENT_TYPE_MAP[ext.toLowerCase()] || "text/plain";
}

/**
 * Sanitize a file path to prevent directory traversal attacks
 * @param filePath The file path to sanitize
 * @returns Sanitized file path
 */
export function sanitizePath(filePath: string): string {
	return filePath.replace(/\.\./g, "").replace(/^\/+/, "");
}

/**
 * Helper function to read a template file
 * @param filePath The path to the file
 * @returns The file content or null if the file couldn't be read
 */
export async function readTemplateFile(filePath: string): Promise<string | Uint8Array | null> {
	try {
		// Normalize the path to prevent duplicate requests with slightly different paths
		const normalizedPath = filePath.replace(/^\/+/, "").trim();

		// Skip empty paths
		if (!normalizedPath) {
			return null;
		}

		// In the browser environment, we need to fetch the file
		if (typeof window !== "undefined") {
			// Check cache first
			if (fileContentCache.has(normalizedPath)) {
				return fileContentCache.get(normalizedPath) || null;
			}

			// Fetch directly from source components
			const url = `/api/template-file-content?path=${encodeURIComponent(normalizedPath)}`;

			const response = await fetch(url);

			if (!response.ok) {
				return null;
			}

			// Check content type to determine how to handle the response
			const contentType = response.headers.get("Content-Type") || "";

			let content: string | Uint8Array;

			// Handle binary files
			if (
				contentType.includes("image/") ||
				contentType.includes("font/") ||
				contentType.includes("application/octet-stream") ||
				contentType.includes("application/zip")
			) {
				// For binary files, return an ArrayBuffer
				const buffer = await response.arrayBuffer();
				content = new Uint8Array(buffer);
			} else {
				// For text files, return text
				content = await response.text();
			}

			// Cache the content
			fileContentCache.set(normalizedPath, content);
			return content;
		}
		return null;
	} catch (error) {
		return null;
	}
}

/**
 * Helper function to get directory entries with caching
 * @param directoryPath The directory path to fetch
 * @returns Array of directory entries or empty array if failed
 */
export async function getDirectoryEntries(directoryPath = ""): Promise<any[]> {
	try {
		// Normalize the path to prevent duplicate requests with slightly different paths
		const normalizedPath = directoryPath.replace(/^\/+/, "").trim();

		// Check cache first
		if (directoryListingCache.has(normalizedPath)) {
			return directoryListingCache.get(normalizedPath) || [];
		}

		const response = await fetch(`/api/template-files?path=${encodeURIComponent(normalizedPath)}`);
		if (!response.ok) {
			return [];
		}

		const entries = await response.json();

		// Cache the directory listing
		directoryListingCache.set(normalizedPath, entries);
		return entries;
	} catch (error) {
		return [];
	}
}

/**
 * Calculates the Levenshtein distance between two strings
 * Used to detect similar but not identical messages
 */
export function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = [];

	// Initializing matrix
	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}

	for (let i = 0; i <= a.length; i++) {
		matrix[0][i] = i;
	}

	// Calculate Levenshtein distance
	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					matrix[i][j - 1] + 1, // insertion
					matrix[i - 1][j] + 1 // deletion
				);
			}
		}
	}

	return matrix[b.length][a.length];
}

/**
 * Process template files from disk
 * @param projectStructure The project structure type ("app" or "src/app")
 */
export async function processTemplateFiles(projectStructure: string): Promise<ContainerFile[]> {
	const files: ContainerFile[] = [];

	// Helper function to recursively process a directory
	const processDirectory = async (directoryPath = ""): Promise<void> => {
		// Get directory entries
		const entries = await getDirectoryEntries(directoryPath);

		// Process each entry
		for (const entry of entries) {
			const subPath = directoryPath ? `${directoryPath}/${entry.name}` : entry.name;

			// Skip if this file should be ignored
			if (shouldIgnoreFile(subPath)) {
				continue;
			}

			// If this is a directory, process its contents recursively
			if (entry.isDirectory) {
				await processDirectory(subPath);
			} else {
				// This is a file, read its content
				const content = await readTemplateFile(subPath);

				// Skip if the content is null or not a string
				if (content === null || !(typeof content === "string")) {
					continue;
				}

				// Create target path based on project structure
				let targetPath = subPath;

				// If the path needs adjustment based on project structure
				if (subPath.startsWith("app/") && projectStructure === "src/app") {
					targetPath = `src/${subPath}`;
				} else if (subPath.startsWith("src/app/") && projectStructure === "app") {
					targetPath = subPath.substring(4); // Remove "src/"
				}

				// Add to the list of processed files
				files.push({
					path: targetPath,
					content: content,
				});
			}
		}
	};

	// Start processing from the root
	await processDirectory();

	return files;
}

/**
 * Import project files into the container
 * @param container WebContainer instance
 * @param fileExists Function to check if a file exists
 * @param files Optional list of specific files to import
 */
export async function importProjectFiles(
	container: any,
	fileExists: (path: string) => Promise<boolean>,
	files?: string[]
): Promise<void> {
	try {
		// If specific files are provided, only import those
		if (files && files.length > 0) {
			for (const file of files) {
				// Check if file already exists
				const exists = await fileExists(file);
				if (exists) {
					continue;
				}

				// Read the file from the template
				const content = await readTemplateFile(file);
				if (content) {
					// Make sure the directory exists
					const dir = file.substring(0, file.lastIndexOf("/"));
					if (dir) {
						await container.fs.mkdir(dir, { recursive: true });
					}

					// Write the file
					if (typeof content === "string") {
						await container.fs.writeFile(file, content);
					} else {
						await container.fs.writeFile(file, content, null);
					}
				}
			}
			return;
		}

		// Handle importing all files
		const processDirectory = async (directoryPath = ""): Promise<void> => {
			// Get directory entries
			const entries = await getDirectoryEntries(directoryPath);

			// Process each entry
			for (const entry of entries) {
				const subPath = directoryPath ? `${directoryPath}/${entry.name}` : entry.name;

				// Skip if this file should be ignored
				if (shouldIgnoreFile(subPath)) {
					continue;
				}

				// If this is a directory, process its contents recursively
				if (entry.isDirectory) {
					// Make sure the directory exists
					try {
						await container.fs.mkdir(subPath, { recursive: true });
					} catch (error) {}
					await processDirectory(subPath);
				} else {
					// Check if the file already exists
					const exists = await fileExists(subPath);
					if (exists) {
						continue;
					}

					// This is a file, read its content
					const content = await readTemplateFile(subPath);
					if (content) {
						// Write the file
						if (typeof content === "string") {
							await container.fs.writeFile(subPath, content);
						} else {
							await container.fs.writeFile(subPath, content, null);
						}
					}
				}
			}
		};

		// Start processing from the root
		await processDirectory();
	} catch (error) {}
}
