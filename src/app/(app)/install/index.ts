"use client";

// Re-export types
export * from "./types";

// Export logging utilities
export * from "./logging";

// Export terminal output processing
export { processTerminalOutput } from "./terminal-output";

// Export container manager
export { ContainerManager, containerManager } from "./container-manager";

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
