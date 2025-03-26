import fs from "fs/promises";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import path from "path";
import {
	BINARY_EXTENSIONS,
	TEMPLATE_BASE_DIR,
	fileContentCache,
	getContentType,
	sanitizePath,
	shouldIgnoreFile,
} from "../utils";

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		let filePath = searchParams.get("path") || "";

		// Sanitize the path to prevent directory traversal attacks
		filePath = sanitizePath(filePath);

		// Log the request path for debugging
		console.log(`File content request for: "${filePath}"`);

		// Check if the file should be ignored
		if (shouldIgnoreFile(filePath)) {
			console.log(`Ignoring request for filtered file: ${filePath}`);
			return NextResponse.json({ error: "File is filtered out" }, { status: 404 });
		}

		// Check cache first
		if (fileContentCache.has(filePath)) {
			console.log(`Using cached file content for: ${filePath}`);
			const { content, contentType } = fileContentCache.get(filePath)!;
			return new NextResponse(content, {
				headers: {
					"Content-Type": contentType,
				},
			});
		}

		// Get the full path to the file
		const fullPath = path.join(process.cwd(), TEMPLATE_BASE_DIR, filePath);

		// Check if the file exists
		try {
			const stats = await fs.stat(fullPath);
			if (!stats.isFile()) {
				return NextResponse.json({ error: "Not a file" }, { status: 400 });
			}
		} catch (error) {
			return NextResponse.json({ error: "File not found" }, { status: 404 });
		}

		// Determine if this is a binary file
		const extension = path.extname(filePath).toLowerCase();
		const isBinary = BINARY_EXTENSIONS.includes(extension);

		// Read the file
		const content = isBinary
			? await fs.readFile(fullPath) // Binary files as Buffer
			: await fs.readFile(fullPath, "utf-8"); // Text files as UTF-8

		// Get content type based on file extension
		const contentType = getContentType(extension);

		// Cache the file content
		fileContentCache.set(filePath, { content, contentType });

		return new NextResponse(content, {
			headers: {
				"Content-Type": contentType,
			},
		});
	} catch (error) {
		console.error("Error reading template file:", error);
		return NextResponse.json({ error: "Failed to read template file" }, { status: 500 });
	}
}
