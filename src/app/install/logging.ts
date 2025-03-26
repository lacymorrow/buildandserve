/**
 * Simple logging utility for the install feature
 * This is just basic console logging with some standardization
 * This version works on both client and server
 */

/**
 * Log an informational message to the console
 * @param message Main message to log
 * @param details Optional details object or message
 */
export function logInfo(message: string, details?: unknown): void {
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
	if (details) {
		console.warn(`[Install] ${message}:`, details);
	} else {
		console.warn(`[Install] ${message}`);
	}
}

/**
 * Log an error message to the console
 * @param message Main message to log
 * @param details Optional details object or message
 */
export function logError(message: string, details?: unknown): void {
	if (details) {
		console.error(`[Install] ${message}:`, details);
	} else {
		console.error(`[Install] ${message}`);
	}
}
