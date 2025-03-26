"use client";

import { importProjectFiles, processTemplateFiles, readTemplateFile } from "./client-utils";
import { runInstallCommand } from "./command-utils";
import {
	compareSnapshots,
	ensureComponentsJsonExists,
	fileExists,
	getInitialFileSystem,
	takeFileSystemSnapshot,
} from "./filesystem-utils";
import { logInfo } from "./logging";
import type { ContainerFile } from "./types";

// Define essential configuration files
const ESSENTIAL_CONFIG_FILES = [
	"package.json",
	"tsconfig.json",
	"components.json",
	"tailwind.config.js",
	"tailwind.config.ts",
	"postcss.config.js",
	"next.config.js",
	"next.config.ts",
];

// Define essential directories
const ESSENTIAL_DIRECTORIES = [
	"components",
	"components/ui",
	"app",
	"src",
	"src/app",
	"lib",
	"hooks",
	"styles",
];

// Component dependency mapping
const COMPONENT_DEPENDENCIES: Record<string, string[]> = {
	button: ["components/ui/button.tsx", "lib/utils.ts"],
	dialog: ["components/ui/dialog.tsx", "lib/utils.ts", "components/ui/button.tsx"],
	accordion: ["components/ui/accordion.tsx"],
	alert: ["components/ui/alert.tsx"],
	"alert-dialog": ["components/ui/alert-dialog.tsx", "components/ui/button.tsx"],
	"aspect-ratio": ["components/ui/aspect-ratio.tsx"],
	avatar: ["components/ui/avatar.tsx"],
	badge: ["components/ui/badge.tsx"],
	calendar: ["components/ui/calendar.tsx"],
	card: ["components/ui/card.tsx"],
	checkbox: ["components/ui/checkbox.tsx"],
	collapsible: ["components/ui/collapsible.tsx"],
	command: ["components/ui/command.tsx"],
	"context-menu": ["components/ui/context-menu.tsx"],
	"dropdown-menu": ["components/ui/dropdown-menu.tsx"],
	form: ["components/ui/form.tsx", "lib/utils.ts"],
	"hover-card": ["components/ui/hover-card.tsx"],
	input: ["components/ui/input.tsx"],
	label: ["components/ui/label.tsx"],
	menubar: ["components/ui/menubar.tsx"],
	"navigation-menu": ["components/ui/navigation-menu.tsx"],
	popover: ["components/ui/popover.tsx"],
	progress: ["components/ui/progress.tsx"],
	"radio-group": ["components/ui/radio-group.tsx"],
	"scroll-area": ["components/ui/scroll-area.tsx"],
	select: ["components/ui/select.tsx"],
	separator: ["components/ui/separator.tsx"],
	sheet: ["components/ui/sheet.tsx"],
	skeleton: ["components/ui/skeleton.tsx"],
	slider: ["components/ui/slider.tsx"],
	switch: ["components/ui/switch.tsx"],
	table: ["components/ui/table.tsx"],
	tabs: ["components/ui/tabs.tsx"],
	textarea: ["components/ui/textarea.tsx"],
	toast: ["components/ui/toast.tsx", "components/ui/use-toast.ts"],
	toggle: ["components/ui/toggle.tsx"],
	tooltip: ["components/ui/tooltip.tsx"],
};

// Track whether the container has already been booted
let containerInstance: any = null;
let bootPromise: Promise<any> | null = null;

// Improve debugging by explicitly tracking initialization state
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
	 * Get the component name from a shadcn command
	 * @param command The command array (e.g., ["add", "button"])
	 * @returns The component name or undefined
	 */
	private getComponentNameFromCommand(command: string[]): string | undefined {
		// If this is an "add" command, the second item is the component name
		if (command.length >= 2 && command[0] === "add") {
			return command[1];
		}
		return undefined;
	}

	/**
	 * Load essential files only for the WebContainer
	 * @param componentToInstall Optional component name to load dependencies for
	 * @param projectStructure The project structure type ("app" or "src/app")
	 */
	private async loadEssentialFiles(
		componentToInstall?: string,
		projectStructure = "app"
	): Promise<void> {
		if (!this.container) {
			throw new Error("Container not initialized");
		}

		logInfo("Loading essential configuration files...");

		// Load essential configuration files
		for (const file of ESSENTIAL_CONFIG_FILES) {
			try {
				const fileContent = await readTemplateFile(file);
				if (fileContent && typeof fileContent === "string") {
					await this.container.fs.writeFile(file, fileContent);
					logInfo(`Loaded essential configuration file: ${file}`);
				}
			} catch (error) {
				logInfo(`Error loading configuration file ${file}:`, error);
				// Continue loading other files
			}
		}

		// Create essential directories based on project structure
		logInfo(`Creating essential directory structure for ${projectStructure} structure...`);
		for (const dir of ESSENTIAL_DIRECTORIES) {
			try {
				// Transform directory path based on project structure
				const targetDir = this.transformPath(dir, projectStructure);
				await this.container.fs.mkdir(targetDir, { recursive: true });
				logInfo(`Created essential directory: ${targetDir}`);
			} catch (error) {
				logInfo(`Directory might already exist: ${dir}`, error);
				// Continue creating other directories
			}
		}

		// Load component-specific dependencies if a component is specified
		if (componentToInstall && COMPONENT_DEPENDENCIES[componentToInstall]) {
			logInfo(
				`Loading dependencies for component: ${componentToInstall} with ${projectStructure} structure`
			);

			const dependencies = COMPONENT_DEPENDENCIES[componentToInstall];
			for (const dependency of dependencies) {
				try {
					// Read template file from source
					const fileContent = await readTemplateFile(dependency);
					if (fileContent) {
						// Transform path based on project structure
						const targetPath = this.transformPath(dependency, projectStructure);

						// Create directory for the dependency if needed
						const dirPath = targetPath.substring(0, targetPath.lastIndexOf("/"));
						if (dirPath) {
							await this.container.fs.mkdir(dirPath, { recursive: true });
						}

						// Write the file to the transformed path
						await this.container.fs.writeFile(targetPath, fileContent);
						logInfo(`Loaded dependency file: ${dependency} → ${targetPath}`);
					}
				} catch (error) {
					logInfo(`Error loading dependency ${dependency}:`, error);
					// Continue loading other dependencies
				}
			}
		}

		logInfo("Essential files loaded successfully");
	}

	/**
	 * Transform a path based on project structure
	 * @param path Original path
	 * @param projectStructure Project structure type ("app" or "src/app")
	 */
	private transformPath(path: string, projectStructure: string): string {
		// If using src/app structure, add src/ prefix to paths that should be in src
		if (projectStructure === "src/app") {
			// For component imports
			if (path.startsWith("components/")) {
				return `src/${path}`;
			}

			// For lib imports
			if (path.startsWith("lib/")) {
				return `src/${path}`;
			}

			// For app imports
			if (path.startsWith("app/")) {
				return `src/${path}`;
			}

			// For hooks and other common directories
			if (path.startsWith("hooks/") || path.startsWith("styles/")) {
				return `src/${path}`;
			}
		}

		// Return unmodified path for "app" structure
		return path;
	}

	/**
	 * Determine project structure based on URL or defaults
	 */
	private detectProjectStructure(initialStructure?: string): string {
		// Use provided structure if available
		if (initialStructure) {
			return initialStructure;
		}

		// Default to app directory
		let detectedStructure = "app";

		// Check URL params for structure hint
		if (typeof window !== "undefined") {
			const urlParams = new URLSearchParams(window.location.search);
			const structureParam = urlParams.get("structure");
			if (structureParam === "src-app" || structureParam === "src/app") {
				detectedStructure = "src/app";
			}
		}

		return detectedStructure;
	}

	/**
	 * Initialize the container when needed
	 * @param componentToInstall Optional component name to preload
	 * @param initialProjectStructure Project structure ("app" or "src/app")
	 */
	async initialize(componentToInstall?: string, initialProjectStructure?: string) {
		if (typeof window === "undefined") {
			throw new Error("WebContainer can only be initialized in the browser");
		}

		// Determine project structure if not provided
		const projectStructure = this.detectProjectStructure(initialProjectStructure);

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

			// Load only essential files instead of the entire repository
			logInfo(`Initializing selective file loading for ${projectStructure} structure...`);
			await this.loadEssentialFiles(componentToInstall, projectStructure);

			// Ensure we have a components.json file at the root for any command to work
			await ensureComponentsJsonExists(this.container, readTemplateFile);

			// Mark template loading state
			templateFilesLoaded = true;
			logInfo("Selective file loading completed successfully");

			// Mark initialization as complete
			containerInitializing = false;

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
						"WebContainer requires cross-origin isolation. The page must be served with the 'Cross-Origin-Opener-Policy: same-origin' and 'Cross-Origin-Embedder-Policy: require-corp' headers. Please use the manual processing option instead."
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

				if (error.message.includes("timeout") || error.message.includes("timed out")) {
					throw new Error(
						"The WebContainer initialization timed out. This may be due to network issues or browser limitations. Please try again or use the manual processing option."
					);
				}

				if (error.message.includes("memory") || error.message.includes("out of memory")) {
					throw new Error(
						"WebContainer ran out of memory. Try closing other tabs or applications and refresh the page."
					);
				}
			}

			throw new Error(
				`Failed to initialize WebContainer: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Install shadcn template and get the result
	 */
	async installShadcnTemplate(projectStructure: string): Promise<ContainerFile[]> {
		if (!this.isReady) {
			throw new Error("Container not initialized");
		}

		try {
			logInfo("Starting shadcn template installation...");
			logInfo("WebContainer initialized and ready");

			// Ensure the project structure matches one of the expected values
			const normalizedStructure = projectStructure === "src/app" ? "src/app" : "app";

			// Process the template files
			const templateFiles = await processTemplateFiles(normalizedStructure);
			logInfo(`Processed ${templateFiles.length} template files`);

			// Directly return the template files
			return templateFiles;
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
	 * Run a shadcn command in the container
	 * @param commandArray The command array to execute
	 * @param projectStructure Project structure ("app" or "src/app")
	 */
	async runShadcnCommand(
		commandArray: string[],
		projectStructure?: string
	): Promise<ContainerFile[]> {
		// Get the component name if this is an add command
		const componentName = this.getComponentNameFromCommand(commandArray);

		// Initialize with component dependencies if applicable
		await this.initialize(componentName, projectStructure);

		// Take a snapshot of the file system before installation
		this.fileSystemSnapshotBefore = await takeFileSystemSnapshot(this.container);
		logInfo(
			`Taken snapshot before shadcn command with ${this.fileSystemSnapshotBefore.size} files`
		);

		// Run the command
		const commandString = `npx shadcn-ui@latest ${commandArray.join(" ")}`;
		await runInstallCommand(this.container, commandString);

		// Take another snapshot
		this.fileSystemSnapshotAfter = await takeFileSystemSnapshot(this.container);
		logInfo(`Taken snapshot after shadcn command with ${this.fileSystemSnapshotAfter.size} files`);

		// Get the list of changed files
		this.changedFiles = compareSnapshots(
			this.fileSystemSnapshotBefore,
			this.fileSystemSnapshotAfter
		);
		logInfo(`Found ${this.changedFiles.length} changed files after shadcn command`);

		return this.changedFiles;
	}

	/**
	 * Get the changed files from the last operation
	 */
	getChangedFiles(): ContainerFile[] {
		return this.changedFiles;
	}

	/**
	 * Import project files into the container
	 * @param files Optional array of specific files to import
	 * @param projectStructure Optional project structure type
	 */
	async importProjectFiles(files?: string[], projectStructure?: string): Promise<void> {
		await this.initialize(undefined, projectStructure);
		await importProjectFiles(this.container, (path) => fileExists(this.container, path), files);
	}
}
