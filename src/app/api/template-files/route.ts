import fs from "fs/promises";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import path from "path";
import { shouldIgnoreFile } from "../template-utils";

// Cache for directory listings to avoid redundant filesystem operations
const directoryCache = new Map<string, any[]>();

// Function to get all files in a directory
async function getDirectoryContents(directoryPath: string) {
	try {
		// Check cache first
		if (directoryCache.has(directoryPath)) {
			console.log(`Using cached directory listing for: ${directoryPath}`);
			return directoryCache.get(directoryPath) || [];
		}

		const fullPath = path.join(process.cwd(), "templates/shadcn", directoryPath);
		const entries = await fs.readdir(fullPath, { withFileTypes: true });

		// Filter out unwanted files before returning the list
		const filteredEntries = entries
			.filter((entry) => {
				const fullEntryPath = path.join(directoryPath, entry.name);
				return !shouldIgnoreFile(fullEntryPath);
			})
			.map((entry) => ({
				name: entry.name,
				isDirectory: entry.isDirectory(),
			}));

		// Cache the result
		directoryCache.set(directoryPath, filteredEntries);

		return filteredEntries;
	} catch (error) {
		console.error(`Error reading directory: ${directoryPath}`, error);
		return [];
	}
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		let dirPath = searchParams.get("path") || "";

		// Sanitize the path to prevent directory traversal attacks
		dirPath = dirPath.replace(/\.\./g, "").replace(/^\/+/, "");

		// Log all requests for debugging
		console.log(`Directory listing request for path: "${dirPath}"`);

		const entries = await getDirectoryContents(dirPath);

		// Log the response for debugging
		console.log(`Returning ${entries.length} entries for path: "${dirPath}"`);

		return NextResponse.json(entries);
	} catch (error) {
		console.error("Error listing template files:", error);
		return NextResponse.json({ error: "Failed to list template files" }, { status: 500 });
	}
}
