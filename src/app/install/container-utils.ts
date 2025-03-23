"use client";

// We're moving this to a client component since WebContainer can only run in the browser
import type { FileSystemTree } from "@webcontainer/api";

interface ContainerFile {
	path: string;
	content: string;
}

// Track whether the container has already been booted
let containerInstance: any = null;
let bootPromise: Promise<any> | null = null;

// Add a logging utility function at the top of the file
function logInfo(message: string, data?: any) {
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

// Add this to TypeScript global declarations
declare global {
	interface Window {
		webContainerLogs?: {
			type: string;
			message: string;
			data?: any;
			timestamp: string;
		}[];
	}
}

// Simplified interface for working with WebContainers
export class ContainerManager {
	private container: any;
	private isReady = false;
	private fileSystemSnapshotBefore: Map<string, string> = new Map();
	private fileSystemSnapshotAfter: Map<string, string> = new Map();
	private changedFiles: ContainerFile[] = [];

	// Initialize the container when needed
	async initialize() {
		if (typeof window === "undefined") {
			throw new Error("WebContainer can only be initialized in the browser");
		}

		// If already initialized, just return
		if (this.isReady && this.container) {
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
				return true;
			}

			// If boot is already in progress, wait for it
			if (bootPromise) {
				await bootPromise;
				this.container = containerInstance;
				this.isReady = true;
				return true;
			}

			// Dynamic import to avoid SSR issues
			const { WebContainer } = await import("@webcontainer/api");

			// Start booting and save the promise
			bootPromise = WebContainer.boot();

			// Await the container boot
			this.container = await bootPromise;
			containerInstance = this.container;
			this.isReady = true;

			// After boot is complete, set bootPromise to null for future boots if needed
			bootPromise = null;

			// Set up a basic project structure
			await this.container.mount(this.getInitialFileSystem());

			return true;
		} catch (error) {
			// Reset state on error
			bootPromise = null;
			this.isReady = false;

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

	// Get the initial file system for the container
	private getInitialFileSystem(): FileSystemTree {
		return {
			"package.json": {
				file: {
					contents: JSON.stringify({
						name: "shadcn-template-sandbox",
						version: "0.0.0",
						private: true,
						scripts: {
							start: "node index.js",
						},
						dependencies: {},
						devDependencies: {},
					}),
				},
			},
			"index.js": {
				file: {
					contents: `console.log('WebContainer initialized');`,
				},
			},
		};
	}

	// Helper method to check if a file or directory exists
	private async fileExists(path: string): Promise<boolean> {
		try {
			await this.container.fs.stat(path);
			return true;
		} catch (err) {
			return false;
		}
	}

	// Process shadcn template upload
	async installShadcnTemplate(projectStructure: string): Promise<ContainerFile[]> {
		if (!this.isReady) {
			await this.initialize();
		}

		try {
			logInfo("Starting shadcn template installation...");
			logInfo("WebContainer initialized and ready");

			// Instead of installing with npm/npx, we'll directly use the template files
			logInfo("Using shadcn template from templates/shadcn...");

			// Process all files from the shadcn template
			logInfo("Starting to process template files...");
			return await this.processTemplateFilesFromDisk(projectStructure);
		} catch (error) {
			logInfo(
				"Error occurred during installation",
				error instanceof Error ? error.message : String(error)
			);
			console.error("Error installing shadcn template:", error);
			throw error;
		}
	}

	// Process template files directly from disk (new method)
	private async processTemplateFilesFromDisk(projectStructure: string): Promise<ContainerFile[]> {
		const files: ContainerFile[] = [];

		logInfo(`Processing template files from disk for '${projectStructure}' structure`);

		// Helper function to read file from templates/shadcn
		const readTemplateFile = async (filePath: string): Promise<string | Uint8Array | null> => {
			try {
				// In the browser environment, we need to fetch the file
				if (typeof window !== "undefined") {
					const response = await fetch(
						`/api/template-file-content?path=${encodeURIComponent(filePath)}`
					);
					if (!response.ok) {
						logInfo(`Failed to fetch template file: ${filePath}`, response.statusText);
						return null;
					}

					// Check content type to determine how to handle the response
					const contentType = response.headers.get("Content-Type") || "";

					// Handle binary files
					if (
						contentType.includes("image/") ||
						contentType.includes("font/") ||
						contentType.includes("application/octet-stream") ||
						contentType.includes("application/zip")
					) {
						// For binary files, return an ArrayBuffer
						const buffer = await response.arrayBuffer();
						return new Uint8Array(buffer);
					}

					// For text files, return text
					return await response.text();
				}
				return null;
			} catch (error) {
				logInfo(`Error reading template file ${filePath}:`, error);
				return null;
			}
		};

		// Helper function to recursively process directory
		const processDirectory = async (directoryPath = ""): Promise<void> => {
			try {
				// Make a fetch request to get the directory listing
				const response = await fetch(
					`/api/template-files?path=${encodeURIComponent(directoryPath)}`
				);
				if (!response.ok) {
					logInfo(`Failed to fetch directory listing for ${directoryPath}`, response.statusText);
					return;
				}

				const entries = await response.json();

				for (const entry of entries) {
					const fullPath = directoryPath ? `${directoryPath}/${entry.name}` : entry.name;

					if (entry.isDirectory) {
						// Process subdirectory recursively
						await processDirectory(fullPath);
					} else {
						// Read the file content
						const content = await readTemplateFile(fullPath);
						if (content !== null) {
							// Create target path based on project structure
							let targetPath = fullPath;

							// If the path needs adjustment based on project structure
							if (fullPath.startsWith("app/") && projectStructure === "src/app") {
								targetPath = `src/${fullPath}`;
								logInfo(`Adjusting path from ${fullPath} to ${targetPath} for src/app structure`);
							} else if (fullPath.startsWith("src/app/") && projectStructure === "app") {
								targetPath = fullPath.substring(4); // Remove "src/"
								logInfo(`Adjusting path from ${fullPath} to ${targetPath} for app structure`);
							}

							// Log file info - handle both string and binary content
							const contentLength =
								typeof content === "string" ? content.length : content.byteLength;
							logInfo(`Adding file: ${targetPath} (${contentLength} bytes)`);

							// Create directory structure if it doesn't exist
							const dirPath = targetPath.substring(0, targetPath.lastIndexOf("/"));
							if (dirPath) {
								try {
									await this.container.fs.mkdir(dirPath, { recursive: true });
								} catch (err) {
									// Ignore if directory already exists
									logInfo(`Note: Directory ${dirPath} may already exist`);
								}
							}

							// Write the file to the container - handle both string and binary content
							try {
								// For WebContainer fs.writeFile, we need different formats for text vs binary
								await this.container.fs.writeFile(targetPath, content);
								logInfo(`Successfully wrote file: ${targetPath}`);
							} catch (writeError) {
								logInfo(`Error writing file ${targetPath}:`, writeError);
							}

							// Add to the list of processed files - convert binary to base64 for storage
							files.push({
								path: targetPath,
								content:
									typeof content === "string" ? content : `[Binary data: ${contentLength} bytes]`, // For display only
							});
						}
					}
				}
			} catch (error) {
				logInfo(`Error processing directory ${directoryPath}:`, error);
			}
		};

		// Start processing from root
		await processDirectory();

		// If unable to fetch template files, fallback to using the processTemplateFiles method
		if (files.length === 0) {
			logInfo(
				"No template files could be fetched from disk. Falling back to normal installation process."
			);

			// Install necessary dependencies
			logInfo("Setting up environment...");

			// Install base npm dependencies
			await this.runInstallCommand(
				"npm",
				["install", "--no-package-lock", "--yes"],
				"Base npm dependencies"
			);

			// Install shadcn CLI
			await this.runInstallCommand(
				"npm",
				["install", "--no-package-lock", "--yes", "shadcn"],
				"shadcn/ui CLI"
			);

			// Initialize shadcn template
			await this.runInstallCommand(
				"npx",
				[
					"--yes",
					"shadcn@latest",
					"init",
					"--yes", // Auto-confirm all prompts
				],
				"shadcn/ui template initialization"
			);

			// Process template files using the existing method
			return await this.processTemplateFiles(projectStructure);
		}

		logInfo(`Processed ${files.length} files total from disk`);
		logInfo("Template file processing complete");
		return files;
	}

	// Helper method to run installation commands with proper process monitoring
	private async runInstallCommand(
		command: string,
		args: string[],
		description: string
	): Promise<void> {
		logInfo(`Running ${description}: ${command} ${args.join(" ")}`);

		try {
			// Modify args to auto-accept prompts if possible
			let modifiedArgs = [...args];

			// For npm and pnpm commands, add --yes flag if not already present
			if (
				(command === "npm" || command === "pnpm") &&
				!args.includes("--yes") &&
				!args.includes("-y")
			) {
				modifiedArgs.push("--yes");
			}

			// For npx, add --yes if not already present
			if (command === "npx" && !args.includes("--yes") && !args.includes("-y")) {
				// Add --yes before the package name
				if (modifiedArgs[0] === "--yes" || modifiedArgs[0] === "-y") {
					// already has it as first arg
				} else if (modifiedArgs.length > 0) {
					modifiedArgs = ["--yes", ...modifiedArgs];
				}
			}

			// If installing shadcn, make sure to auto-accept prompts
			const isShadcn = modifiedArgs.some((arg) => arg.includes("shadcn"));
			if (isShadcn && !modifiedArgs.includes("--yes") && !modifiedArgs.includes("-y")) {
				modifiedArgs.push("--yes");
			}

			logInfo(`Modified command to auto-accept prompts: ${command} ${modifiedArgs.join(" ")}`);

			// Start the process
			const process = await this.container.spawn(command, modifiedArgs);

			// Set up tracking variables
			let output = "";
			let lastOutputTime = Date.now();
			let isComplete = false;

			// Create a reader for the output stream
			const reader = process.output.getReader();

			// Function to check if we've got indicators of completion
			const checkCompletionIndicators = (text: string): boolean => {
				const lowerText = text.toLowerCase();

				// General completion phrases
				if (
					lowerText.includes("done in") ||
					lowerText.includes("completed in") ||
					lowerText.includes("finished in")
				) {
					return true;
				}

				// npm specific completion indicators
				if (command === "npm") {
					return (
						lowerText.includes("added ") ||
						lowerText.includes("up to date") ||
						lowerText.includes("packages are looking for funding")
					);
				}

				// npx specific completion indicators
				if (command === "npx") {
					// For shadcn/shadcn-ui specifically, if we've gotten to the validation point
					// or any message about configuration or themes, consider it done
					// since it may error out after validating due to missing files
					if (isShadcn) {
						return (
							lowerText.includes("validating") ||
							lowerText.includes("no tailwind css configuration") ||
							lowerText.includes("components") ||
							lowerText.includes("configuration") ||
							lowerText.includes("error") ||
							lowerText.includes("failed") ||
							lowerText.includes("deprecated") || // Detect deprecation messages
							lowerText.includes("please use the 'shadcn' package") ||
							lowerText.includes("for more information") || // Added for shadcn output
							lowerText.includes("import the styles in your app") // Added for shadcn output
						);
					}

					return (
						lowerText.includes("installed") ||
						lowerText.includes("success") ||
						lowerText.includes("components") ||
						lowerText.includes("configuration")
					);
				}

				return false;
			};

			// Function to handle automatic prompt responses
			const handlePrompts = (text: string) => {
				const hasPrompt =
					text.toLowerCase().includes("ok to proceed?") ||
					text.toLowerCase().includes("need to install") ||
					text.toLowerCase().includes("(y/n)") ||
					text.toLowerCase().includes("(y)");

				if (hasPrompt) {
					try {
						logInfo("Detected prompt, attempting to respond with 'y'");

						// Check if input exists and is writable
						if (process.input && typeof process.input.write === "function") {
							process.input.write("y\n");
							logInfo("Successfully wrote 'y' to process input");
						} else {
							// If we can't write to input, log but don't throw error
							// Commands should have --yes flags already
							logInfo("Unable to write to process input, relying on --yes flags");
						}
					} catch (e) {
						logInfo("Failed to handle prompt", e);
						// Don't throw - we'll rely on --yes flags
					}
				}
			};

			// Set up an activity watcher to detect idle processes
			const activityCheckInterval = setInterval(() => {
				const idleTime = Date.now() - lastOutputTime;

				// If we've been idle for more than 3 seconds and have output
				if (idleTime > 3000 && output.length > 0) {
					// Check if the output indicates completion
					if (checkCompletionIndicators(output)) {
						logInfo(`${description} appears to be complete based on output indicators`);
						isComplete = true;
						clearInterval(activityCheckInterval);
					} else {
						logInfo(
							`${description} has been idle for ${Math.round(idleTime / 1000)}s, still waiting...`
						);
					}
				}
			}, 3000);

			// Read output until we get completion indicators
			const maxWaitTime = 60000; // 1 minute maximum wait
			const startTime = Date.now();

			try {
				let isDone = false;

				while (!isDone && !isComplete && Date.now() - startTime < maxWaitTime) {
					try {
						// Read with timeout to avoid blocking forever
						const readPromise = reader.read();
						const timeoutPromise = new Promise((resolve) => {
							setTimeout(() => resolve({ done: false, value: null }), 1000);
						});

						// @ts-ignore - mixing promise types but it works for our purpose
						const result = await Promise.race([readPromise, timeoutPromise]);

						if (result.done) {
							isDone = true;
						} else if (result.value) {
							const chunk = result.value.toString();
							logInfo(`${description} output: ${chunk}`);
							output += chunk;
							lastOutputTime = Date.now();

							// Handle any prompts that might appear
							handlePrompts(chunk);

							// Check if this chunk indicates completion
							if (checkCompletionIndicators(chunk)) {
								logInfo(`${description} completion detected in output`);
								isComplete = true;
								break;
							}
						}
					} catch (err) {
						logInfo(`Error reading output: ${err instanceof Error ? err.message : String(err)}`);
						// Continue trying to read
					}
				}
			} finally {
				// Clean up
				clearInterval(activityCheckInterval);
				reader.releaseLock();
			}

			// Check if we timed out
			if (Date.now() - startTime >= maxWaitTime && !isComplete) {
				logInfo(`${description} timed out after ${maxWaitTime / 1000} seconds`);
				throw new Error(`${description} process timed out`);
			}

			// Log completion
			logInfo(`${description} completed successfully`);

			// Just to be safe, try to get the actual exit code
			try {
				const exitCode = await Promise.race([
					process.exit,
					new Promise<number>((resolve) => setTimeout(() => resolve(0), 500)),
				]);

				logInfo(`${description} exit code: ${exitCode}`);
			} catch (e) {
				// If we can't get the exit code but have completion indicators, that's fine
				if (isComplete) {
					logInfo(
						`${description} couldn't get exit code, but completed based on output indicators`
					);
				} else {
					throw new Error(`${description} failed: couldn't verify completion`);
				}
			}
		} catch (error) {
			logInfo(`${description} failed`, error);
			throw new Error(
				`${description} failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	// Process all files from the shadcn template
	private async processTemplateFiles(projectStructure: string): Promise<ContainerFile[]> {
		const files: ContainerFile[] = [];
		const processedPaths = new Set<string>();

		logInfo(`Processing template files for '${projectStructure}' structure`);

		// First, let's get the most important configuration files
		const configFiles = [
			"components.json",
			"tailwind.config.js",
			"tailwind.config.ts",
			"next.config.js",
			"next.config.ts",
			"tsconfig.json",
			"globals.css", // Look for this in various locations
			"global.css", // Alternative naming
			"package.json", // Get updated package.json
		];

		// Check root directory first
		for (const file of configFiles) {
			try {
				const content = await this.container.fs.readFile(file, "utf-8");
				logInfo(`Found config file ${file}:`, `${content.substring(0, 100)}...`);
				files.push({
					path: file,
					content: content,
				});
			} catch (err) {
				// Try different locations for CSS files
				if (file.endsWith(".css")) {
					const possibleCssPaths = [
						"app/globals.css",
						"src/app/globals.css",
						`styles/${file}`,
						`src/styles/${file}`,
						`app/styles/${file}`,
						`src/app/styles/${file}`,
					];

					for (const cssPath of possibleCssPaths) {
						try {
							const content = await this.container.fs.readFile(cssPath, "utf-8");
							logInfo(`Found CSS file at ${cssPath}:`, `${content.substring(0, 100)}...`);
							files.push({
								path: cssPath,
								content: content,
							});
							break; // Found one, stop looking
						} catch {
							// Continue trying other paths
						}
					}
				}
			}
		}

		// Common directory paths to check for theme files
		const themeFilePaths = [
			"components/ui/theme.ts",
			"components/ui/theme.js",
			"src/components/ui/theme.ts",
			"src/components/ui/theme.js",
			"lib/theme.ts",
			"lib/theme.js",
			"src/lib/theme.ts",
			"src/lib/theme.js",
			"styles/theme.ts",
			"styles/theme.js",
			"src/styles/theme.ts",
			"src/styles/theme.js",
		];

		// Check for theme configuration files
		for (const themePath of themeFilePaths) {
			try {
				const content = await this.container.fs.readFile(themePath, "utf-8");
				logInfo(`Found theme file at ${themePath}:`, `${content.substring(0, 100)}...`);
				files.push({
					path: themePath,
					content: content,
				});
			} catch {
				// Continue trying other paths
			}
		}

		// Now look for all component files
		const componentPaths = [
			"components",
			"src/components",
			"app/components",
			"src/app/components",
			"ui",
			"src/ui",
			"app/ui",
			"src/app/ui",
			"lib",
			"src/lib",
			"app/lib",
			"src/app/lib",
		];

		// Start recursive file processing
		logInfo("Starting recursive file processing");

		// Helper function to recursively process files
		const processDirectory = async (dirPath: string) => {
			try {
				// Skip if already processed
				if (processedPaths.has(dirPath)) {
					return;
				}
				processedPaths.add(dirPath);

				logInfo(`Processing directory: ${dirPath}`);
				const entries = await this.container.fs.readdir(dirPath, { recursive: false });
				logInfo(`Found ${entries.length} items in ${dirPath}`);

				for (const entry of entries) {
					// Skip if entry is null or undefined
					if (!entry || !entry.name) {
						logInfo(`Skipping invalid entry in ${dirPath}`);
						continue;
					}

					const fullPath = `${dirPath}/${entry.name}`;

					if (processedPaths.has(fullPath)) {
						logInfo(`Skipping already processed path: ${fullPath}`);
						continue;
					}

					processedPaths.add(fullPath);

					try {
						// Try to get file stats
						const stats = await this.container.fs.stat(fullPath);
						const isDirectory = stats.isDirectory();

						if (isDirectory) {
							// Process subdirectory recursively
							await processDirectory(fullPath);
						} else {
							// Read file content
							try {
								const content = await this.container.fs.readFile(fullPath, "utf-8");

								// Create target path based on project structure
								let targetPath = fullPath;

								// If the path needs adjustment based on project structure
								if (fullPath.startsWith("app/") && projectStructure === "src/app") {
									targetPath = `src/${fullPath}`;
									logInfo(`Adjusting path from ${fullPath} to ${targetPath} for src/app structure`);
								} else if (fullPath.startsWith("src/app/") && projectStructure === "app") {
									targetPath = fullPath.substring(4); // Remove "src/"
									logInfo(`Adjusting path from ${fullPath} to ${targetPath} for app structure`);
								}

								logInfo(`Adding file: ${targetPath} (${content.length} bytes)`);
								files.push({
									path: targetPath,
									content: content,
								});
							} catch (readErr) {
								logInfo(
									`Error reading file ${fullPath}:`,
									readErr instanceof Error ? readErr.message : String(readErr)
								);
							}
						}
					} catch (statErr) {
						logInfo(
							`Error getting stats for ${fullPath}:`,
							statErr instanceof Error ? statErr.message : String(statErr)
						);
					}
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err);
				logInfo(`Error processing directory ${dirPath}:`, errorMessage);
				// Don't throw an error for missing directories - just log and continue
			}
		};

		// Try to process each component directory if it exists
		for (const compPath of componentPaths) {
			if (await this.fileExists(compPath)) {
				logInfo(`Found component directory: ${compPath}`);
				await processDirectory(compPath);
			}
		}

		// If no files were found at all, check if we should generate minimal shadcn files
		if (files.length === 0) {
			logInfo("No shadcn files found. The initialization likely failed or was interrupted.");
			logInfo("Generating minimal shadcn configuration files for manual setup...");

			// Add minimal components.json if not found
			if (!files.some((f) => f.path === "components.json")) {
				const componentsJson = {
					$schema: "https://ui.shadcn.com/schema.json",
					style: "default",
					rsc: true,
					tsx: true,
					tailwind: {
						config: "tailwind.config.ts",
						css: "src/app/globals.css",
						baseColor: "neutral",
						cssVariables: true,
					},
					aliases: {
						components: "@/components",
						utils: "@/lib/utils",
					},
				};

				files.push({
					path: "components.json",
					content: JSON.stringify(componentsJson, null, 2),
				});

				logInfo("Generated components.json file");
			}

			// Add minimal utils file if not found
			const utilsFile = "src/lib/utils.ts";
			if (!files.some((f) => f.path === utilsFile)) {
				const utilsContent = `import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;
				files.push({
					path: utilsFile,
					content: utilsContent,
				});

				logInfo("Generated utils.ts file");
			}
		}

		logInfo(`Processed ${files.length} files total`);
		logInfo("Template file processing complete");
		return files;
	}

	// Take a snapshot of the file system
	private async takeFileSystemSnapshot(): Promise<Map<string, string>> {
		const snapshot = new Map<string, string>();

		if (!this.container || !this.container.fs) {
			logInfo("Container or filesystem not available for snapshot");
			return snapshot;
		}

		// Helper function to recursively process directories
		const processDirectory = async (dirPath: string): Promise<void> => {
			try {
				logInfo(`Reading directory: ${dirPath}`);

				// Read directory entries
				const entries = await this.container.fs.readdir(dirPath);

				for (const entryName of entries) {
					const fullPath = `${dirPath}/${entryName}`;

					try {
						// Try to determine if it's a directory by attempting to read it
						try {
							const subEntries = await this.container.fs.readdir(fullPath);
							// If we get here, it's a directory
							logInfo(`Found directory: ${fullPath}`);
							await processDirectory(fullPath);
						} catch (readError) {
							// If we can't read it as a directory, assume it's a file
							// Skip binary files based on extension
							const extension = fullPath.split(".").pop()?.toLowerCase() || "";
							const binaryExtensions = [
								"png",
								"jpg",
								"jpeg",
								"gif",
								"ico",
								"woff",
								"woff2",
								"ttf",
								"eot",
								"pdf",
								"zip",
							];

							if (!binaryExtensions.includes(extension)) {
								try {
									// Try to read the file
									const content = await this.container.fs.readFile(fullPath, "utf-8");
									logInfo(`Added file to snapshot: ${fullPath} (${content.length} bytes)`);
									snapshot.set(fullPath, content);
								} catch (fileReadError) {
									logInfo(`Error reading file ${fullPath}:`, fileReadError);
								}
							} else {
								logInfo(`Skipping binary file: ${fullPath}`);
							}
						}
					} catch (err) {
						logInfo(`Error processing entry ${fullPath}:`, err);
					}
				}
			} catch (err) {
				logInfo(`Error reading directory ${dirPath}:`, err);
			}
		};

		// Start the snapshot from root
		try {
			await processDirectory(".");
		} catch (err) {
			logInfo("Error taking file system snapshot:", err);
		}

		return snapshot;
	}

	// Compare two snapshots and return changed files
	private compareSnapshots(
		before: Map<string, string>,
		after: Map<string, string>
	): ContainerFile[] {
		const changedFiles: ContainerFile[] = [];

		// Check for new and modified files
		after.forEach((content, path) => {
			if (!before.has(path) || before.get(path) !== content) {
				changedFiles.push({
					path,
					content,
				});
			}
		});

		return changedFiles;
	}

	// Run a shadcn command and track file system changes
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
			this.fileSystemSnapshotBefore = await this.takeFileSystemSnapshot();
			logInfo(`Initial snapshot captured: ${this.fileSystemSnapshotBefore.size} files`);

			// Just run the command as provided by the user
			logInfo(`Running command: ${packageManager} ${actualCommand.join(" ")}`);

			// Run the command directly without modification
			await this.runInstallCommand(
				packageManager,
				actualCommand,
				`${packageManager} ${actualCommand.join(" ")}`
			);

			// Take a snapshot after running the command
			logInfo("Taking snapshot of file system after command...");
			this.fileSystemSnapshotAfter = await this.takeFileSystemSnapshot();
			logInfo(`After snapshot captured: ${this.fileSystemSnapshotAfter.size} files`);

			// Compare snapshots to find changes
			this.changedFiles = this.compareSnapshots(
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

	// Get the detected changed files
	getChangedFiles(): ContainerFile[] {
		return this.changedFiles;
	}
}

// Create a singleton instance
export const containerManager = typeof window !== "undefined" ? new ContainerManager() : null;
