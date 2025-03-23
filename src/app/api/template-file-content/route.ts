import fs from "fs/promises";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import path from "path";

// Binary file extensions that should be returned as raw data
const binaryExtensions = [
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

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		let filePath = searchParams.get("path") || "";

		// Sanitize the path to prevent directory traversal attacks
		filePath = filePath.replace(/\.\./g, "").replace(/^\/+/, "");

		// Get the full path to the file
		const fullPath = path.join(process.cwd(), "templates/shadcn", filePath);

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
		const isBinary = binaryExtensions.includes(extension);

		// Read the file
		const content = isBinary
			? await fs.readFile(fullPath) // Binary files as Buffer
			: await fs.readFile(fullPath, "utf-8"); // Text files as UTF-8

		// Determine content type based on file extension
		let contentType = "text/plain";

		switch (extension) {
			case ".json":
				contentType = "application/json";
				break;
			case ".js":
			case ".jsx":
			case ".ts":
			case ".tsx":
				contentType = "application/javascript";
				break;
			case ".css":
				contentType = "text/css";
				break;
			case ".html":
				contentType = "text/html";
				break;
			case ".md":
			case ".mdx":
				contentType = "text/markdown";
				break;
			case ".png":
				contentType = "image/png";
				break;
			case ".jpg":
			case ".jpeg":
				contentType = "image/jpeg";
				break;
			case ".gif":
				contentType = "image/gif";
				break;
			case ".svg":
				contentType = "image/svg+xml";
				break;
			case ".ico":
				contentType = "image/x-icon";
				break;
			case ".woff":
				contentType = "font/woff";
				break;
			case ".woff2":
				contentType = "font/woff2";
				break;
			case ".ttf":
				contentType = "font/ttf";
				break;
			// Add more content types as needed
		}

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
