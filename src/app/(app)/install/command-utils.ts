"use client";

import { logInfo } from "./logging";

/**
 * Run an installation command with proper process monitoring
 * @param container The WebContainer instance
 * @param command The command to run (e.g. 'npm', 'npx')
 * @param args The arguments to pass to the command
 * @param description A description of the command for logging
 */
export async function runInstallCommand(
	container: any,
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
		const process = await container.spawn(command, modifiedArgs);

		// Set up tracking variables
		let output = "";
		let lastOutputTime = Date.now();
		let isComplete = false;
		let installationStarted = false;
		let installationMessages = 0;

		// Create a reader for the output stream
		const reader = process.output.getReader();

		// Function to check if we've got indicators of completion
		const checkCompletionIndicators = (text: string): boolean => {
			const lowerText = text.toLowerCase();

			// Skip spinner animations which are often used for "Installing dependencies"
			// The ora spinner package uses these characters: ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
			if (text.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/) && lowerText.includes("installing")) {
				// This is most likely a spinner animation - not a completion indicator
				// Update the last activity time to prevent timeout
				lastOutputTime = Date.now();
				return false;
			}

			// Skip ANSI color/cursor control sequences (used by spinners and progress indicators)
			if (text.includes("\u001b[") || text.match(/\[\d+[A-Z]/)) {
				// These are terminal control sequences, not actual completion indicators
				return false;
			}

			// Skip simple "installing dependencies" messages which aren't completion markers
			if (
				lowerText.trim() === "installing dependencies." ||
				lowerText.includes("installing dependencies...") ||
				lowerText.match(/installing dependencies/i)
			) {
				// Update the last activity time to prevent timeout since we know work is happening
				lastOutputTime = Date.now();
				installationStarted = true;
				installationMessages++;

				logInfo(
					`Installation in progress (message #${installationMessages}), not considering as completion`
				);
				return false;
			}

			// General completion phrases
			if (
				lowerText.includes("done in") ||
				lowerText.includes("completed in") ||
				lowerText.includes("finished in") ||
				(lowerText.includes("added") && lowerText.includes("package"))
			) {
				logInfo("Detected completion phrase in output");
				return true;
			}

			// npm specific completion indicators
			if (command === "npm") {
				if (
					lowerText.includes("added ") ||
					lowerText.includes("up to date") ||
					lowerText.includes("packages are looking for funding")
				) {
					logInfo("Detected npm completion indicator");
					return true;
				}
			}

			// npx specific completion indicators for shadcn
			if (command === "npx" && isShadcn) {
				// For shadcn specifically, additional completion indicators
				if (
					// Common completion phrases for shadcn
					lowerText.includes("added dependencies") ||
					lowerText.includes("installed button") ||
					lowerText.includes("component added") ||
					lowerText.includes("components added") ||
					lowerText.includes("ready to use") ||
					(lowerText.includes("successfully") && lowerText.includes("installed")) ||
					// Installation complete phrases
					(lowerText.includes("tailwind") && lowerText.includes("configured")) ||
					(lowerText.includes("components") && lowerText.includes("ready")) ||
					// Component copy phrases
					lowerText.includes("component copied") ||
					(lowerText.includes("copying component") && lowerText.includes("complete")) ||
					// Configuration complete phrases
					(lowerText.includes("configuration") && !lowerText.includes("configuring")) ||
					lowerText.includes("tailwind.config") ||
					// Explicit completion
					lowerText.includes("import the styles in your app") ||
					lowerText.includes("for more information") ||
					// Error states
					lowerText.includes("error") ||
					lowerText.includes("failed") ||
					lowerText.includes("deprecated") ||
					lowerText.includes("please use the 'shadcn' package")
				) {
					logInfo("Detected shadcn completion indicator");
					return true;
				}

				// Handle installation progress - we now specifically exclude this as a completion indicator
				if (lowerText.includes("installing")) {
					installationStarted = true;
					installationMessages++;

					// Reset the last output time to avoid timeouts - we know the installation is ongoing
					lastOutputTime = Date.now();

					// Never consider "installing" as a completion indicator on its own
					logInfo(`Installation progress message #${installationMessages}, continuing to wait`);
					return false;
				}
			}

			// Other npx completion indicators
			if (command === "npx") {
				if (
					(lowerText.includes("installed") && !lowerText.includes("installing")) ||
					lowerText.includes("success") ||
					(lowerText.includes("components") && !lowerText.includes("installing"))
				) {
					logInfo("Detected npx completion indicator");
					return true;
				}
			}

			// If we've seen 20+ installation messages and haven't detected completion,
			// we should check if we're seeing any output at all
			if (installationStarted && installationMessages > 20) {
				// Keep updating the last output time to prevent timeouts
				lastOutputTime = Date.now();
				logInfo("Long-running installation in progress, continuing to wait");
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

			// If we've been idle for more than 10 seconds and have output
			if (idleTime > 10000 && output.length > 0) {
				// Check if the output indicates completion
				if (checkCompletionIndicators(output)) {
					logInfo(`${description} appears to be complete based on output indicators`);
					isComplete = true;
					clearInterval(activityCheckInterval);
				} else if (installationStarted) {
					// For installations, be more lenient with idle time
					logInfo(
						`${description} has been installing for ${Math.round(idleTime / 1000)}s, still waiting...`
					);
					// Reset the last output time to prevent timeout during installation
					if (isShadcn) {
						lastOutputTime = Date.now() - 5000; // Still track idle time, but give more buffer
					}
				} else {
					logInfo(
						`${description} has been idle for ${Math.round(idleTime / 1000)}s, still waiting...`
					);
				}
			}
		}, 10000); // Check every 10 seconds instead of 3

		// Read output until we get completion indicators
		const maxWaitTime = 300000; // 5 minutes maximum wait (increased from 1 minute)
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

						// Update UI with progress info for long-running processes
						if (
							chunk.includes("Installing dependencies") ||
							chunk.includes("installing") ||
							chunk.includes("downloading")
						) {
							installationStarted = true;
							installationMessages++;
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
			throw new Error(
				`${description} process timed out after ${Math.floor(maxWaitTime / 60000)} minutes. This may be due to slow network or resource limits. Try again or use a more basic component.`
			);
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
				logInfo(`${description} couldn't get exit code, but completed based on output indicators`);
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
