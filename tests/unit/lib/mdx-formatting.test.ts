import { describe, expect, it } from "vitest";

// Assuming formatJSXLine is exported correctly from the module
// Adjust the import path as necessary
import { formatJSXLine } from "@/lib/mdx-formatting";

describe("formatJSXLine", () => {
	it("should format attribute spacing correctly", () => {
		const input = "<Component prop = { value } />";
		const expected = "<Component prop={value} />";
		expect(formatJSXLine(input)).toBe(expected);
	});

	it("should format closing tag spacing", () => {
		const input = "<div> Content </ div >";
		const expected = "<div> Content </div>";
		expect(formatJSXLine(input)).toBe(expected);
	});

	it("should format self-closing tag spacing", () => {
		const input = "<Component / >";
		const expected = "<Component />";
		expect(formatJSXLine(input)).toBe(expected);
	});

	it("should handle lines without JSX correctly", () => {
		const input = "This is a plain text line.";
		const expected = "This is a plain text line.";
		expect(formatJSXLine(input)).toBe(expected);
	});

	it("should handle complex lines with multiple JSX elements", () => {
		const input = "<span><Nested prop = { true } /></span> <Another / >";
		const expected = "<span><Nested prop={true} /></span> <Another />";
		expect(formatJSXLine(input)).toBe(expected);
	});

	it("should preserve indentation", () => {
		const input = "  <Component prop = { value } />";
		const expected = "  <Component prop={value} />";
		expect(formatJSXLine(input)).toBe(expected);
	});
});
