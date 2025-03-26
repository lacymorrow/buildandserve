"use client";

/**
 * Types for the install feature
 */

/**
 * Represents a file in the container
 */
export interface ContainerFile {
	path: string;
	content: string;
}

/**
 * Represents a log entry from the WebContainer
 */
export interface WebContainerLog {
	message: string;
	data?: string;
}

/**
 * Global type augmentation for window
 */
declare global {
	interface Window {
		webContainerLogs?: WebContainerLog[];
	}
}
