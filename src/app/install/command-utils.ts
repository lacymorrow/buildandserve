"use client";

import { logInfo } from "../(app)/install/logging";

/**
 * Run an installation command and return the exit code
 * @param container The WebContainer instance
 * @param packageManager The package manager to use (e.g. npm, yarn, pnpm)
 * @param command The command to run
 * @param displayCommand Optional display command for logging
 * @returns The exit code of the command
 */
export async function runInstallCommand(
	container: any,
	packageManager: string,
	command: string[],
	displayCommand?: string
): Promise<number> {
	try {
		logInfo(`Running command: ${displayCommand || `${packageManager} ${command.join(" ")}`}`);

		// Start the process
		const process = await container.spawn(packageManager, command);

		// Set up process logging
		process.output.pipeTo(
			new WritableStream({
				write(data) {
					logInfo(`Command output: ${data}`);
				},
			})
		);

		// Wait for process to exit
		const exitCode = await process.exit;
		logInfo(`Command exited with code ${exitCode}`);

		return exitCode;
	} catch (error) {
		logInfo("Error running installation command", error);
		return 1; // Return error code
	}
}
