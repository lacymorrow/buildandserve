"use client";

import type { WebContainerLog } from "./types";

/**
 * Log information to the console and store in the webContainerLogs global variable
 * @param message The message to log
 * @param data Optional data to include in the log
 */
export function logInfo(message: string, data?: any): void {
	console.log(`[WebContainer] ${message}`, data ? data : "");

	// Store logs in global variable for display in UI
	if (typeof window !== "undefined") {
		if (!window.webContainerLogs) {
			window.webContainerLogs = [];
		}
		window.webContainerLogs.push({
			type: "info",
			message,
			data,
			timestamp: new Date().toISOString(),
		});
	}
}

/**
 * Get all WebContainer logs
 * @returns Array of WebContainer logs or empty array if none exist
 */
export function getWebContainerLogs(): WebContainerLog[] {
	if (typeof window !== "undefined" && window.webContainerLogs) {
		return window.webContainerLogs;
	}
	return [];
}
