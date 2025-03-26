"use client";

// Re-export main components and utilities for easier imports
export { ContainerManager, containerManager } from "./container-manager";
export { logInfo, logWarning } from "./logging";
export { processTerminalOutput } from "./terminal-output";

// Type exports
export type { ContainerFile } from "./types";

// Export logging utilities
export * from "./logging";

// Export filesystem utilities
export {
	compareSnapshots,
	ensureComponentsJsonExists,
	fileExists,
	getInitialFileSystem,
	takeFileSystemSnapshot,
} from "./filesystem-utils";

// Export template utilities
export {
	importProjectFiles,
	preloadTemplateFiles,
	processTemplateFilesFromDisk,
	readTemplateFile,
} from "./template-utils";

// Export command utilities
export { runInstallCommand } from "./command-utils";
