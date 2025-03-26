"use client";

import { logInfo } from "../(app)/install/logging";
import { runInstallCommand } from "./command-utils";
import {
	compareSnapshots,
	ensureComponentsJsonExists,
	fileExists,
	getInitialFileSystem,
	takeFileSystemSnapshot,
} from "./filesystem-utils";
import {
	importProjectFiles as importFiles,
	preloadTemplateFiles as loadTemplateFiles,
	processTemplateFilesFromDisk,
	readTemplateFile,
} from "./template-utils";
import type { ContainerFile } from "./types";

// Track whether the container has already been booted
let containerInstance: any = null;
let bootPromise: Promise<any> | null = null;

// Add proper debugging to track initialization state
let containerInitializing = false;

// Track whether template files have been loaded
let templateFilesLoaded = false;

/**
 * Simplified interface for working with WebContainers
 */
export class ContainerManager {
	private container: any;
	private isReady = false;
	private fileSystemSnapshotBefore: Map<string, string> = new Map();
	private fileSystemSnapshotAfter: Map<string, string> = new Map();
	private changedFiles: ContainerFile[] = [];

	/**
	 * Initialize the container when needed
	 */
	async initialize() {
		if (typeof window === "undefined") {
			throw new Error("WebContainer can only be initialized in the browser");
		}

		// If already initialized, just return
		if (this.isReady && this.container) {
			logInfo("Container already initialized, reusing existing instance");
			return true;
		}

		// Check for cross-origin isolation first
		if (typeof window !== "undefined" && !window.crossOriginIsolated) {
			console.warn("This page is not cross-origin isolated. WebContainers might not work.");
			throw new Error(
				"WebContainer requires cross-origin isolation. Please use the manual processing option instead."
			);
		}

		try {
			// Use the existing singleton container if it exists
			if (containerInstance) {
				this.container = containerInstance;
				this.isReady = true;
				logInfo("Reusing existing container instance");
				return true;
			}

			// If boot is already in progress, wait for it
			if (bootPromise) {
				logInfo("WebContainer boot already in progress, waiting for it to complete...");
				await bootPromise;
				this.container = containerInstance;
				this.isReady = true;
				logInfo("WebContainer boot completed, container is now available");
				return true;
			}

			// If another initialization is in progress, wait for it to complete
			if (containerInitializing) {
				logInfo(
					"Container initialization already in progress, waiting to avoid race conditions..."
				);

				// Wait for initialization to complete
				while (containerInitializing) {
					await new Promise((resolve) => setTimeout(resolve, 100));
				}

				// If container was initialized during our wait, use it
				if (containerInstance) {
					this.container = containerInstance;
					this.isReady = true;
					logInfo(
						"Container initialization completed by another process, container is now available"
					);
					return true;
				}
			}

			// Mark initialization as in progress to prevent race conditions
			containerInitializing = true;

			// Dynamic import to avoid SSR issues
			const { WebContainer } = await import("@webcontainer/api");

			// Start booting and save the promise
			logInfo("Booting WebContainer...");
			bootPromise = WebContainer.boot();

			// Await the container boot
			this.container = await bootPromise;
			containerInstance = this.container;
			this.isReady = true;
			logInfo("WebContainer booted successfully");

			// After boot is complete, set bootPromise to null for future boots if needed
			bootPromise = null;

			// Set up a basic project structure
			logInfo("Setting up initial file system...");
			await this.container.mount(getInitialFileSystem());

			// Create the templates directory structure
			try {
				logInfo("Creating directory structure for templates...");
				await this.container.fs.mkdir("templates", { recursive: true });
				await this.container.fs.mkdir("templates/shadcn", { recursive: true });
				logInfo("Templates directory structure created");
			} catch (mkdirError) {
				logInfo("Note: Templates directory may already exist", mkdirError);
			}

			// Pre-load the shadcn template files
			logInfo("Pre-loading shadcn template files...");
			try {
				// Ensure we have a components.json file at the root for any command to work
				await this.ensureComponentsJsonExists();

				// Process template files in one go, waiting for it to complete
				await this.preloadTemplateFiles();

				logInfo("Shadcn template files pre-loaded successfully");
			} catch (preloadError) {
				logInfo(
					"Error pre-loading template files",
					preloadError instanceof Error ? preloadError.message : String(preloadError)
				);
				console.warn(
					"Failed to pre-load template files, will try on-demand loading:",
					preloadError
				);
				// Continue without failing - we'll try to load files on demand
			} finally {
				// Mark initialization as complete
				containerInitializing = false;
			}

			return true;
		} catch (error) {
			// Reset state on error
			bootPromise = null;
			this.isReady = false;
			containerInitializing = false;

			console.error("Failed to initialize WebContainer:", error);

			// Provide more specific error message based on the error
			if (error instanceof Error) {
				if (
					error.message.includes("SharedArrayBuffer") ||
					error.message.includes("crossOriginIsolated")
				) {
					throw new Error(
						"WebContainer requires cross-origin isolation. Please use the manual processing option instead."
					);
				}

				if (
					error.message.includes("Unable to create more instances") ||
					error.message.includes("Only a single WebContainer instance")
				) {
					throw new Error(
						"A WebContainer instance is already running. Please refresh the page and try again."
					);
				}
			}

			throw error;
		}
	}

	/**
	 * Check if a file or directory exists
	 */
	private async fileExists(path: string): Promise<boolean> {
		return fileExists(this.container, path);
	}

	/**
	 * Make sure components.json exists at the root
	 */
	private async ensureComponentsJsonExists(): Promise<void> {
		return ensureComponentsJsonExists(this.container, (path) => readTemplateFile(path));
	}

	/**
	 * Preload template files to speed up later operations
	 */
	async preloadTemplateFiles(): Promise<void> {
		// Skip if templates were already loaded
		if (templateFilesLoaded) {
			logInfo("Template files already loaded, skipping preload");
			return;
		}

		await loadTemplateFiles(this.container);
		templateFilesLoaded = true;
		logInfo("Template files loaded and cached");
	}

	/**
	 * Process shadcn template upload
	 */
	async installShadcnTemplate(projectStructure: string): Promise<ContainerFile[]> {
		if (!this.isReady) {
			await this.initialize();
		}

		try {
			logInfo("Starting shadcn template installation...");
			logInfo("WebContainer initialized and ready");

			// Make sure template files are loaded first
			if (!templateFilesLoaded) {
				logInfo("Loading template files before installation...");
				await this.preloadTemplateFiles();
			} else {
				logInfo("Using previously loaded template files");
			}

			// Instead of installing with npm/npx, we'll directly use the template files
			logInfo("Using shadcn template from templates/shadcn...");

			// Process all files from the shadcn template
			logInfo("Starting to process template files...");
			return await processTemplateFilesFromDisk(this.container, projectStructure);
		} catch (error) {
			logInfo(
				"Error occurred during installation",
				error instanceof Error ? error.message : String(error)
			);
			console.error("Error installing shadcn template:", error);
			throw error;
		}
	}

	/**
	 * Run a shadcn command and track file system changes
	 */
	async runShadcnCommand(command: string[]): Promise<ContainerFile[]> {
		if (!this.isReady) {
			await this.initialize();
		}

		try {
			// Log the user's original command
			const originalCommand = [...command];
			logInfo(`Original command: ${originalCommand.join(" ")}`);

			// Parse the command to determine package manager and actual command
			let packageManager = "npx";
			let actualCommand = [...command];

			// Check if command starts with a package manager
			const packageManagers = ["npx", "pnpx", "pnpm", "bunx", "yarn"];
			if (packageManagers.includes(command[0])) {
				packageManager = command[0];
				actualCommand = command.slice(1);
			}

			// Take a snapshot of the file system before running the command
			logInfo("Taking snapshot of file system before command...");
			this.fileSystemSnapshotBefore = await takeFileSystemSnapshot(this.container);
			logInfo(`Initial snapshot captured: ${this.fileSystemSnapshotBefore.size} files`);

			// Just run the command as provided by the user
			logInfo(`Running command: ${packageManager} ${actualCommand.join(" ")}`);

			// Run the command directly without modification
			await runInstallCommand(
				this.container,
				packageManager,
				actualCommand,
				`${packageManager} ${actualCommand.join(" ")}`
			);

			// Take a snapshot after running the command
			logInfo("Taking snapshot of file system after command...");
			this.fileSystemSnapshotAfter = await takeFileSystemSnapshot(this.container);
			logInfo(`After snapshot captured: ${this.fileSystemSnapshotAfter.size} files`);

			// Compare snapshots to find changes
			this.changedFiles = compareSnapshots(
				this.fileSystemSnapshotBefore,
				this.fileSystemSnapshotAfter
			);
			logInfo(`Detected ${this.changedFiles.length} changed files after command execution`);

			return this.changedFiles;
		} catch (error) {
			logInfo(
				"Error running shadcn command",
				error instanceof Error ? error.message : String(error)
			);
			console.error("Error running shadcn command:", error);
			throw error;
		}
	}

	/**
	 * Get the detected changed files
	 */
	getChangedFiles(): ContainerFile[] {
		return this.changedFiles;
	}

	/**
	 * Copies important files from the host project into the WebContainer
	 * This allows components to be added with correct project settings
	 */
	async importProjectFiles(files?: string[]): Promise<void> {
		return importFiles(this.container, (path) => this.fileExists(path), files);
	}
}

// Create a singleton instance
export const containerManager = typeof window !== "undefined" ? new ContainerManager() : null;
