"use client";

/**
 * Interface for container file structure
 */
export interface ContainerFile {
	path: string;
	content: string;
}

/**
 * Interface for file changes
 */
export interface FileChange {
	path: string;
	content: string;
}

/**
 * Type for WebContainer logs
 */
export interface WebContainerLog {
	type: string;
	message: string;
	data?: any;
	timestamp: string;
}

/**
 * Global declarations for WebContainer logs
 */
declare global {
	interface Window {
		webContainerLogs?: WebContainerLog[];
	}
}
