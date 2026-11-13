export function configureMDXFormatting(monaco: any) {
  monaco.languages.registerDocumentFormattingEditProvider("mdx", {
    provideDocumentFormattingEdits(model: any) {
      const text = model.getValue();
      const formatted = formatMDXContent(text);

      return [
        {
          range: model.getFullModelRange(),
          text: formatted,
        },
      ];
    },
  });
}

function formatMDXContent(content: string): string {
  const lines = content.split("\n");
  let inCodeBlock = false;
  let inFrontmatter = false;
  const formattedLines: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine;

    // Handle frontmatter
    if (line.trim() === "---") {
      inFrontmatter = !inFrontmatter;
      formattedLines.push(line);
      continue;
    }

    // Handle code blocks
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      formattedLines.push(line);
      continue;
    }

    if (inCodeBlock || inFrontmatter) {
      formattedLines.push(line);
      continue;
    }

    // Format JSX/TSX content
    if (line.includes("<") && line.includes(">")) {
      line = formatJSXLine(line);
    }

    // Format lists
    if (/^[\s]*[-*+]\s/.exec(line)) {
      line = line.replace(/^(\s*)[-*+]\s+/, "$1- ");
    }

    // Format headings
    if (/^#+\s/.exec(line)) {
      line = line.replace(/^(#+)\s*/, "$1 ");
    }

    // Format blockquotes
    if (/^>\s/.exec(line)) {
      line = line.replace(/^>\s*/, "> ");
    }

    // Format links and images
    line = line.replace(/\[\s*([^\]]+)\s*\]\(\s*([^)]+)\s*\)/g, "[$1]($2)");
    line = line.replace(/!\[\s*([^\]]*)\s*\]\(\s*([^)]+)\s*\)/g, "![$1]($2)");

    formattedLines.push(line);
  }

  return formattedLines.join("\n");
}

/**
 * Normalize `attr = { value }` to `attr={value}` without disturbing anything
 * inside nested braces. A regex cannot match balanced braces: on
 * `<C p = { { a: 1 } } />` a lazy `[^}]*?` stops at the first `}` and trims the
 * inner space, giving `={{ a: 1} }`. It also mangled already-correct input
 * (`p={{ a: 1 }}` -> `p={{ a: 1}}`). So scan for the brace that actually closes
 * the one the attribute opened with. Braces inside string literals are not
 * tracked; an attribute whose braces do not balance on this line is left alone.
 */
function normalizeAttributeBraces(line: string): string {
  let out = "";
  let cursor = 0;

  while (cursor < line.length) {
    const eq = line.indexOf("=", cursor);
    if (eq === -1) break;

    let open = eq + 1;
    while (/\s/.test(line.charAt(open))) open++;

    // Not an `= {` attribute: emit through the `=` and keep looking.
    if (line.charAt(open) !== "{") {
      out += line.slice(cursor, eq + 1);
      cursor = eq + 1;
      continue;
    }

    let depth = 0;
    let close = -1;
    for (let i = open; i < line.length; i++) {
      if (line[i] === "{") depth++;
      else if (line[i] === "}" && --depth === 0) {
        close = i;
        break;
      }
    }
    // Unbalanced on this line (multi-line attribute): leave it untouched.
    if (close === -1) break;

    let attrEnd = eq;
    while (attrEnd > cursor && /\s/.test(line.charAt(attrEnd - 1))) attrEnd--;

    out += `${line.slice(cursor, attrEnd)}={${line.slice(open + 1, close).trim()}}`;
    cursor = close + 1;
  }

  return out + line.slice(cursor);
}

export function formatJSXLine(input: string): string {
  let line = input;
  // Basic JSX formatting
  line = normalizeAttributeBraces(line);
  line = line.replace(/}\s+/g, "} ");
  line = line.replace(/<\/\s+/g, "</");
  line = line.replace(/\s+>/g, ">");
  // Space before a closing tag, but not directly after another tag's ">"
  line = line.replace(/([^\s>])<\//g, "$1 </");

  // Format self-closing tags
  line = line.replace(/\s+\/>/g, " />");

  return line;
}
