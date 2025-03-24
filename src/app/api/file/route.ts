import fs from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

/**
 * API route to get file content from the server filesystem
 * This is used by the WebContainer to get project files
 */
export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const filePath = url.searchParams.get("path");

		if (!filePath) {
			return NextResponse.json({ error: "Path parameter is required" }, { status: 400 });
		}

		// Verify the file is safe to access (relative to project root)
		const validatedPath = path.normalize(filePath).replace(/^\.\.(\/|\\|$)/, "");
		const resolvedPath = path.resolve(process.cwd(), validatedPath);

		// Ensure the path is within the project directory
		if (!resolvedPath.startsWith(process.cwd())) {
			return NextResponse.json({ error: "Invalid file path" }, { status: 403 });
		}

		// Check if the file exists
		try {
			const stats = await fs.stat(resolvedPath);
			if (!stats.isFile()) {
				return NextResponse.json({ error: "Not a file" }, { status: 400 });
			}
		} catch (error) {
			return NextResponse.json({ error: "File not found" }, { status: 404 });
		}

		// Read the file
		const content = await fs.readFile(resolvedPath, "utf-8");

		// Get file extension for content type
		const ext = path.extname(resolvedPath).toLowerCase();
		const contentType = getContentType(ext);

		// Return file content
		return new NextResponse(content, {
			headers: {
				"Content-Type": contentType,
			},
		});
	} catch (error) {
		console.error("Error accessing file:", error);
		return NextResponse.json(
			{
				error: "Failed to access file",
				details: error instanceof Error ? error.message : String(error),
			},
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
