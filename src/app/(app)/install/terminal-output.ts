"use client";

import type { WebContainerLog } from "./types";

/**
 * Processes terminal output to make it more readable
 * Removes repetitive lines, progress indicators, and other noise
 *
 * @param output Raw terminal output
 * @returns Processed output
 */
export function processTerminalOutput(output: string): string {
	// First, split by lines to process each line individually
	const lines = output.split("\n");

	// Initialize variables for tracking and processing state
	const uniqueLines: string[] = [];
	const seenLines = new Set<string>();
	const spinnerPatterns = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]|[■□▪▫▱▰]/;
	const progressIndicators = /\[\d+%\]|\d+%|downloading|copying|installing/i;

	// Process each line individually
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Skip empty lines
		if (!line) continue;

		// Skip pure spinner animations (lines with only spinner characters)
		if (line.length < 3 && spinnerPatterns.test(line)) continue;

		// Skip ANSI escape sequences
		if (line.includes("\u001b[")) continue;

		// Detect progress indicator lines - keep only the latest for each type
		if (progressIndicators.test(line)) {
			// Check if this is an update to a previous progress indicator
			const lineType = line.replace(/\d+%|\[\d+%\]/, "[%]").replace(/\d+\/\d+/, "[N/M]");

			// Remove previous progress indicators of the same type
			for (let j = uniqueLines.length - 1; j >= 0; j--) {
				const prevLine = uniqueLines[j];
				const prevLineType = prevLine.replace(/\d+%|\[\d+%\]/, "[%]").replace(/\d+\/\d+/, "[N/M]");

				if (prevLineType === lineType) {
					uniqueLines.splice(j, 1);
					seenLines.delete(prevLine);
					break;
				}
			}
		}

		// Skip duplicate consecutive lines if not a progress indicator
		if (!seenLines.has(line)) {
			uniqueLines.push(line);
			seenLines.add(line);
		}
	}

	// Join the processed lines back into a string
	return uniqueLines.join("\n");
}

/**
 * Window global type extension for WebContainer logs
 */
declare global {
	interface Window {
		webContainerLogs?: WebContainerLog[];
	}
}
