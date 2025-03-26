"use client";

import { logInfo } from "./logging";
import type { WebContainerLog } from "./types";

declare global {
	interface Window {
		webContainerLogs?: Array<WebContainerLog>;
	}
}

/**
 * Runs an install command in the container
 */
export async function runInstallCommand(
	container: any,
	packageManager: string,
	args: string[],
	fullCommand: string
): Promise<void> {
	// Log the command being executed
	logInfo(`Executing command: ${fullCommand}`);

	try {
		// Initialize the logs array if it doesn't exist
		if (typeof window !== "undefined" && !window.webContainerLogs) {
			window.webContainerLogs = [];
		}

		// Create a function to log output to both the console and our custom log array
		const logOutput = (message: string, data?: string) => {
			console.log(`${message}${data ? ` ${data}` : ""}`);
			if (typeof window !== "undefined" && window.webContainerLogs) {
				window.webContainerLogs.push({ message, data });
			}
		};

		// Add an initial log entry for the command
		logOutput(`$ ${fullCommand}`, "");

		// Add prompt detection flags
		let needsPromptResponse = false;
		let hasResponded = false;

		// Pre-modify arguments to include --yes flags if possible
		let modifiedArgs = [...args];

		// For NPX commands add the -y flag if not already present
		if (packageManager === "npx" && !args.includes("-y") && !args.includes("--yes")) {
			if (args.some((arg) => arg.includes("shadcn"))) {
				// For shadcn command, add it as the first argument
				modifiedArgs = ["-y", ...args];
				logOutput("Added automatic -y flag to shadcn command", "");
			}
		}

		// Prepare the command to run
		const process = await container.spawn(packageManager, modifiedArgs);

		// Set up output handler
		const outputStream = new WritableStream({
			write(data) {
				logOutput("", data);

				// Check if this output contains a prompt that needs a response
				if (
					data.includes("Ok to proceed?") ||
					data.includes("Need to install") ||
					data.includes("(y)") ||
					data.includes("(Y/n)") ||
					data.includes("(y/N)")
				) {
					needsPromptResponse = true;

					// Respond with a slight delay to ensure the prompt is fully processed
					setTimeout(() => {
						if (!hasResponded) {
							try {
								logOutput("Auto-responding with 'y' to prompt", "");
								process.input.write("y\n");
								hasResponded = true;
								logOutput("", "y");
							} catch (error) {
								logOutput("Failed to respond to prompt", String(error));
							}
						}
					}, 100);
				}
			},
		});

		process.output.pipeTo(outputStream);

		// Also set up auto-response on a timer as a fallback
		const promptCheckTimer = setInterval(() => {
			if (needsPromptResponse && !hasResponded) {
				try {
					logOutput("Auto-responding with 'y' (timer-based)", "");
					process.input.write("y\n");
					hasResponded = true;
					logOutput("", "y");
				} catch (error) {
					logOutput("Failed to respond to prompt (timer-based)", String(error));
				}
			}
		}, 1000);

		// For interactive prompts, we need to handle stdin and write to it based on expected prompts
		const exitCode = await process.exit;

		// Clear the timer
		clearInterval(promptCheckTimer);

		// Handle exit code
		if (exitCode !== 0) {
			throw new Error(`Command failed with exit code ${exitCode}`);
		}

		logOutput(`Command completed successfully with exit code ${exitCode}`, "");
	} catch (error) {
		// Log and rethrow the error
		const errorMessage = error instanceof Error ? error.message : String(error);
		logInfo(`Error executing command: ${errorMessage}`);
		throw error;
	}
}
