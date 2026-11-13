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

  // LAC-7066: the old lazy `[^}]*?` stopped at the first inner `}`.
  it("should not trim inside a nested object attribute", () => {
    const input = "<C p = { { a: 1 } } />";
    const expected = "<C p={{ a: 1 }} />";
    expect(formatJSXLine(input)).toBe(expected);
  });

  it("should leave an already-formatted nested object attribute alone", () => {
    const input = "<C p={{ a: 1 }} />";
    expect(formatJSXLine(input)).toBe(input);
  });

  it("should not trim inside an arrow function with a block body", () => {
    const input = "<C fn = { () => { go() } } />";
    const expected = "<C fn={() => { go() }} />";
    expect(formatJSXLine(input)).toBe(expected);
  });

  it("should normalize every nested attribute on the line", () => {
    const input = "<C a = { { x: 1 } } b = { { y: 2 } } />";
    const expected = "<C a={{ x: 1 }} b={{ y: 2 }} />";
    expect(formatJSXLine(input)).toBe(expected);
  });

  it("should leave an attribute whose braces do not close on this line alone", () => {
    const input = "<C p = { unclosed";
    expect(formatJSXLine(input)).toBe(input);
  });
});
