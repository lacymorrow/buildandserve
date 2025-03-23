import fs from "fs/promises";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import path from "path";

// Function to get all files in a directory
async function getDirectoryContents(directoryPath: string) {
	try {
		const fullPath = path.join(process.cwd(), "templates/shadcn", directoryPath);
		const entries = await fs.readdir(fullPath, { withFileTypes: true });

		return entries.map((entry) => ({
			name: entry.name,
			isDirectory: entry.isDirectory(),
		}));
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

		const entries = await getDirectoryContents(dirPath);

		return NextResponse.json(entries);
	} catch (error) {
		console.error("Error listing template files:", error);
		return NextResponse.json({ error: "Failed to list template files" }, { status: 500 });
	}
}
