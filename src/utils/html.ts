const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decode the HTML entities that HN and Algolia emit (&#x27; &#x2F; &quot; ...).
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1].toLowerCase() === "x"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Turn HN comment HTML into compact plain text that is cheap for an LLM to read.
 * Links keep their target URL, italics become *text*, code blocks are preserved.
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";

  let text = html
    .replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, (_m, code: string) => `\n\`\`\`\n${code}\n\`\`\`\n`)
    .replace(/<p>/gi, "\n\n")
    .replace(/<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<i>([\s\S]*?)<\/i>/gi, "*$1*")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const url = decodeEntities(href);
      const shown = decodeEntities(label.replace(/<[^>]+>/g, ""));
      // HN shortens long link labels with "..." so the href is the real thing
      return shown === url || url.startsWith(shown.replace(/\.\.\.$/, "")) ? url : `${shown} (${url})`;
    })
    .replace(/<[^>]+>/g, "");

  text = decodeEntities(text);
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Cut text to maxLength characters, on a word boundary when possible.
 */
export function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0 || text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > maxLength * 0.8 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}… [truncated, ${text.length - base.length} more chars]`;
}

/**
 * Indent every line of a multi-line string.
 */
export function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}
