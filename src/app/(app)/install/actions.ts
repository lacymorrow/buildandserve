"use server";

import JSZip from "jszip";

/**
 * Server actions for the installation page
 */

/**
 * Returns a simplified project structure for the shadcn UI installer
 * This uses the standard Next.js app directory structure and looks for
 * common directories like components, layouts etc.
 */
export async function getProjectStructure(): Promise<string> {
	// For simplicity, we just return a hardcoded structure
	// In a real implementation, this could dynamically scan the project
	return "src/app";
}

/**
 * Gets the content of the app template from the templates directory
 */
export async function getTemplateContent(path: string): Promise<string> {
	try {
		// Return the path for now to indicate this API was called
		return `Template content for: ${path}`;
	} catch (error) {
		console.error("Error getting template content:", error);
		throw new Error("Failed to get template content");
	}
}

// Create a ZIP file with all component files
export async function downloadFiles(files: { path: string; content: string }[]): Promise<Blob> {
	const zip = new JSZip();

	// Using for...of instead of forEach to fix linter error
	for (const file of files) {
		zip.file(file.path, file.content);
	}

	return await zip.generateAsync({ type: "blob" });
}
