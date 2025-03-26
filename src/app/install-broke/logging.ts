"use client";

import type { WebContainerLog } from "./types";

/**
 * Simple logging utility for the install feature
 * This is just basic console logging with some standardization
 */

/**
 * Log an informational message to the console
 * @param message Main message to log
 * @param details Optional details object or message
 */
export function logInfo(message: string, details?: unknown): void {
	if (typeof window === "undefined") {
		// Don't log in server-side context
		return;
	}

	if (details) {
		console.info(`[Install] ${message}:`, details);
	} else {
		console.info(`[Install] ${message}`);
	}
}

/**
 * Log a warning message to the console
 * @param message Main message to log
 * @param details Optional details object or message
 */
export function logWarning(message: string, details?: unknown): void {
	if (typeof window === "undefined") {
		// Don't log in server-side context
		return;
	}

	if (details) {
		console.warn(`[Install] ${message}:`, details);
	} else {
		console.warn(`[Install] ${message}`);
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
