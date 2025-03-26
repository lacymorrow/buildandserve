import * as fs from "fs";
import { type NextRequest, NextResponse } from "next/server";
import * as path from "path";
import { shouldIgnoreFile } from "../template-utils";

/**
 * API route to get file content from the server filesystem
 * This is used by the WebContainer to get project files
 */
export async function GET(request: NextRequest) {
	try {
		// Get the file path from the query parameter
		const filePath = request.nextUrl.searchParams.get("path");

		if (!filePath) {
			return NextResponse.json({ error: "File path is required" }, { status: 400 });
		}

		// Check if the file should be ignored
		if (shouldIgnoreFile(filePath)) {
			console.log(`Ignoring request for filtered file: ${filePath}`);
			return NextResponse.json({ error: "File is filtered out" }, { status: 404 });
		}

		// Sanitize the file path to prevent directory traversal attacks
		const sanitizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");

		// Construct the absolute path
		const rootDir = process.cwd();
		const absolutePath = path.join(rootDir, sanitizedPath);

		// Check if the file exists
		if (!fs.existsSync(absolutePath)) {
			return NextResponse.json({ error: "File not found" }, { status: 404 });
		}

		// Read the file
		const fileContent = fs.readFileSync(absolutePath, "utf-8");

		// Return the file content as plain text
		return new NextResponse(fileContent, {
			headers: {
				"Content-Type": getContentType(path.extname(filePath)),
			},
		});
	} catch (error) {
		console.error("Error reading file:", error);
		return NextResponse.json(
			{ error: "Failed to read file", details: (error as Error).message },
			{ status: 500 }
		);
	}
}

/**
 * Helper to determine content type based on file extension
 */
function getContentType(ext: string): string {
	switch (ext) {
		case ".json":
			return "application/json";
		case ".js":
		case ".mjs":
		case ".cjs":
			return "application/javascript";
		case ".ts":
		case ".tsx":
			return "application/typescript";
		case ".css":
			return "text/css";
		case ".svg":
			return "image/svg+xml";
		case ".html":
			return "text/html";
		case ".md":
		case ".mdx":
			return "text/markdown";
		default:
			return "text/plain";
	}
}
