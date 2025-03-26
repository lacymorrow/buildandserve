"use client";

/**
 * Processes terminal output to remove redundant progress lines
 * Consolidates similar consecutive progress indicators into a single line
 * Preserves ANSI control sequences for proper terminal rendering
 */
export function processTerminalOutput(output: string): string {
	if (!output) return "";

	// Skip any debug logging messages about ANSI sequences
	const cleanedOutput = output
		.split("\n")
		.filter((line) => {
			return (
				!line.includes("Detected ANSI control sequence") &&
				!line.includes("not considering as completion")
			);
		})
		.join("\n");

	// Remove repetitive command output prefixes - match any npx command pattern
	// This will handle "npx shadcn@latest add button output: " and similar patterns
	const withoutPrefixes = cleanedOutput.replace(/^npx .+ output:\s*/gm, "");

	// Remove excessive empty lines - replace 3+ consecutive empty lines with just one
	const withoutExcessiveEmptyLines = withoutPrefixes.replace(/\n\s*\n\s*\n+/g, "\n\n");

	// Process spinner animations
	// We'll use regex to find lines with spinner characters and merge them
	const processedOutput = processSpinnerAnimations(withoutExcessiveEmptyLines);

	// Split the output into lines
	const lines = processedOutput.split("\n");
	const filteredLines: string[] = [];
	let lastProgressLine = "";
	let lastNonProgressLine = "";
	let progressCounter = 0;

	// Track the last spinner line so we can update it in place
	let lastSpinnerIdx = -1;

	// Group related lines together (installation, checking registry, etc.)
	let inInstallationGroup = false;
	let installationGroupStart = -1;

	// Process each line
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Skip empty lines and lines with just the command prefix
		if (
			!line.trim() ||
			line.trim() === "npx shadcn@latest add button" ||
			line.match(/^npx .+ output:$/)
		) {
			continue;
		}

		// Detect start of installation or checking registry sequence
		if (line.includes("Installing dependencies") || line.includes("Checking registry")) {
			if (!inInstallationGroup) {
				inInstallationGroup = true;
				installationGroupStart = filteredLines.length;
				filteredLines.push(line);
			} else {
				// Replace the previous line if we're in the same group
				if (installationGroupStart >= 0) {
					filteredLines[installationGroupStart] = line;
				}
			}
			continue;
		}

		// If we find a completion indicator, end the installation group
		if (line.includes("✔") || line.includes("installed") || line.includes("added")) {
			inInstallationGroup = false;
		}

		// Check for ANSI spinner characters (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏) or cursor control sequences
		// These are used by spinners to animate in-place
		const hasSpinner = line.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
		const hasCursorControl =
			line.includes("\u001b[") &&
			(line.includes("\u001b[A") || // Cursor up
				line.includes("\u001b[K") || // Clear line
				line.includes("\u001b[G")); // Cursor to column

		// If this is a spinner or has cursor control, we should replace the previous spinner line
		if (hasSpinner || hasCursorControl) {
			// If we found a previous spinner, replace it
			if (lastSpinnerIdx >= 0) {
				filteredLines[lastSpinnerIdx] = line;
			} else {
				// Otherwise add as a new line and track its position
				lastSpinnerIdx = filteredLines.length;
				filteredLines.push(line);
			}
			continue;
		}

		// Fix potential escaping issues with "npx" commands showing as "px"
		// This can happen with some ANSI sequences
		if (line.includes("px ") && !line.includes("npx ") && !line.includes("pnpx ")) {
			// Try to detect if this should be "npx" and fix it
			const fixedLine = line.replace(/(\s|^)px /g, "$1npx ");

			// Skip if it's just a command output prefix line
			if (fixedLine.match(/^npx .+ output:$/)) {
				continue;
			}

			lastNonProgressLine = fixedLine;
			filteredLines.push(fixedLine);
			continue;
		}

		// Identify progress indicators and duplicate output patterns
		const isProgressLine =
			line.includes("[#") ||
			line.includes("...") ||
			(line.includes("timing") && line.includes("Complete")) ||
			(line.includes("npx") && line.includes("output:")) ||
			line.match(/\[\d+\/\d+\]/) !== null; // [1/4], [2/4] style progress

		// Special handling for progress lines
		if (isProgressLine) {
			progressCounter++;

			// Extract the essence of progress lines for comparison
			let progressEssence = "";

			// Extract progress bar percentage for comparison
			if (line.includes("[#")) {
				const progressMatch = line.match(/\[#+\.+\]/);
				progressEssence = progressMatch ? progressMatch[0] : "";
			} else if (line.match(/\[\d+\/\d+\]/)) {
				const progressMatch = line.match(/\[\d+\/\d+\]/);
				progressEssence = progressMatch ? progressMatch[0] : "";
			} else {
				// For other progress lines, use the whole line
				progressEssence = line;
			}

			// Only keep progress lines if they represent a meaningful change
			const isSignificantChange =
				// Keep first progress line
				lastProgressLine === "" ||
				// Keep completed/final messages
				line.includes("Complete") ||
				line.includes("Completed") ||
				line.includes("Finished") ||
				// Keep lines with different progress patterns from the last one
				(progressEssence && !lastProgressLine.includes(progressEssence)) ||
				// Sample progress lines at a reasonable interval (every 10th)
				progressCounter % 10 === 0;

			if (isSignificantChange) {
				lastProgressLine = line;
				filteredLines.push(line);
			}
		} else {
			// For non-progress lines, avoid duplicates
			// Use a more lenient approach to avoid dropping important lines

			// Compare with a "fuzzy match" to catch near-duplicates
			const isFuzzyDuplicate =
				lastNonProgressLine.length > 10 &&
				line.length > 10 &&
				// If >80% of the characters match, consider it a duplicate
				(lastNonProgressLine.length - levenshteinDistance(lastNonProgressLine, line)) /
					lastNonProgressLine.length >
					0.8;

			if (!isFuzzyDuplicate || i === 0) {
				lastNonProgressLine = line;
				filteredLines.push(line);
			}
		}
	}

	return filteredLines.join("\n");
}

/**
 * Processes spinner animations by identifying consecutive spinner lines
 * and merging them to maintain in-place animations
 */
export function processSpinnerAnimations(output: string): string {
	if (!output) return "";

	// Collapse multiple consecutive newlines into a single newline
	const collapsedNewlines = output.replace(/\n{2,}/g, "\n");

	// Split the output into lines for processing
	const lines = collapsedNewlines.split("\n");
	const result: string[] = [];

	// Keep track of spinner state
	let currentSpinnerText = "";
	let spinnerPrefix = "";
	let inSpinnerSequence = false;
	let installationSequence = false;

	// Find spinner lines and merge them
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();

		// Skip completely empty lines when inside a spinner sequence
		if (!line) {
			if (
				!inSpinnerSequence &&
				!installationSequence &&
				result.length > 0 &&
				result[result.length - 1] !== ""
			) {
				// Only add empty line if we're not in a spinner sequence and don't already have one
				result.push("");
			}
			continue;
		}

		// Special handling for installation lines
		if (line.includes("Installing dependencies") || line.includes("Checking registry")) {
			// Track that we're in an installation sequence
			installationSequence = true;

			// If we already have an installation line, replace it instead of adding a new one
			if (
				result.length > 0 &&
				(result[result.length - 1].includes("Installing dependencies") ||
					result[result.length - 1].includes("Checking registry"))
			) {
				result[result.length - 1] = line;
			} else {
				// Only add a separator line if needed
				if (result.length > 0 && result[result.length - 1] !== "") {
					result.push("");
				}
				result.push(line);
			}
			continue;
		}

		// If we find a completion indicator, end the installation sequence
		if (
			line.includes("✓") ||
			line.includes("✔") ||
			line.includes("installed") ||
			line.includes("added")
		) {
			installationSequence = false;
		}

		// Check if this is a spinner line
		const spinnerMatch = line.match(/^(.*?)[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](.*?)$/);

		if (spinnerMatch) {
			// This is a spinner line
			const [, prefix, suffix] = spinnerMatch;

			if (!inSpinnerSequence) {
				// Starting a new spinner sequence
				spinnerPrefix = prefix;
				currentSpinnerText = line;
				inSpinnerSequence = true;
			} else if (prefix === spinnerPrefix) {
				// Continuing spinner sequence with same prefix - update instead of adding new line
				currentSpinnerText = line;
			} else {
				// Different spinner prefix - end previous sequence and start new one
				if (result.length > 0 && result[result.length - 1] !== currentSpinnerText) {
					result.push(currentSpinnerText);
				}
				spinnerPrefix = prefix;
				currentSpinnerText = line;
			}
		} else {
			// Not a spinner line
			if (inSpinnerSequence) {
				// End spinner sequence and add the final state
				if (result.length > 0 && result[result.length - 1] !== currentSpinnerText) {
					result.push(currentSpinnerText);
				}
				inSpinnerSequence = false;
			}

			// Add non-empty lines
			result.push(line);
		}
	}

	// Add the final spinner state if we were in a spinner sequence
	if (inSpinnerSequence && result.length > 0 && result[result.length - 1] !== currentSpinnerText) {
		result.push(currentSpinnerText);
	}

	return result.join("\n");
}

/**
 * Calculates the Levenshtein distance between two strings
 * Used to detect similar but not identical messages
 */
export function levenshteinDistance(a: string, b: string): number {
	const matrix: number[][] = [];

	// Initializing matrix
	for (let i = 0; i <= b.length; i++) {
		matrix[i] = [i];
	}

	for (let i = 0; i <= a.length; i++) {
		matrix[0][i] = i;
	}

	// Calculate Levenshtein distance
	for (let i = 1; i <= b.length; i++) {
		for (let j = 1; j <= a.length; j++) {
			if (b.charAt(i - 1) === a.charAt(j - 1)) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					matrix[i][j - 1] + 1, // insertion
					matrix[i - 1][j] + 1 // deletion
				);
			}
		}
	}

	return matrix[b.length][a.length];
}
