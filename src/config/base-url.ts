const port = process.env.PORT || 3000;
const host = process.env.HOST || "localhost";

export const BASE_URL =
	// Get the port from environment variables or use default port 3000
	process.env.NODE_ENV === "production"
		? (process.env.URL ?? `https://${process.env.VERCEL_URL}`)
		: typeof window !== "undefined"
			? window.location.origin
			: `http://${host}:${port}`;
