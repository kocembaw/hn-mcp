import { htmlToText, indent, truncate } from "./html.js";

export const hnLink = (id: number | string) =>
  `https://news.ycombinator.com/item?id=${id}`;

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : "unknown date");

const STORY_SNIPPET = 300;
const COMMENT_SNIPPET = 500;

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

function hitKind(hit: any): string {
  const tags: string[] = hit._tags || [];
  if (tags.includes("comment")) return "comment";
  if (tags.includes("ask_hn")) return "ask_hn";
  if (tags.includes("show_hn")) return "show_hn";
  if (tags.includes("poll")) return "poll";
  if (tags.includes("job")) return "job";
  return "story";
}

export function formatHit(hit: any, index: number): string {
  const kind = hitKind(hit);

  if (kind === "comment") {
    const text = truncate(htmlToText(hit.comment_text), COMMENT_SNIPPET);
    return [
      `${index}. [comment] by ${hit.author ?? "[deleted]"} · ${day(hit.created_at)}`,
      `   On story: "${hit.story_title ?? "(unknown story)"}" (story ID: ${hit.story_id ?? "?"})`,
      `   HN: ${hnLink(hit.objectID)} (comment ID: ${hit.objectID})`,
      indent(`Text: ${text || "(empty)"}`, "   "),
    ].join("\n");
  }

  const lines = [
    `${index}. [${kind}] ${hit.title ?? "(no title)"}`,
    `   HN: ${hnLink(hit.objectID)} (ID: ${hit.objectID})`,
  ];
  if (hit.url) lines.push(`   URL: ${hit.url}`);
  lines.push(
    `   ${day(hit.created_at)} · ${hit.points ?? 0} points · ${hit.num_comments ?? 0} comments · by ${hit.author ?? "[deleted]"}`
  );
  const storyText = htmlToText(hit.story_text);
  if (storyText) lines.push(indent(`Text: ${truncate(storyText, STORY_SNIPPET)}`, "   "));
  return lines.join("\n");
}

export function formatSearchResults(
  results: any,
  opts: { heading: string; page: number; sortByDate: boolean; notes?: string[] }
): string {
  const hits: any[] = results?.hits ?? [];
  const nbHits: number = results?.nbHits ?? hits.length;
  const nbPages: number = Math.max(results?.nbPages ?? 1, 1);
  const notes = opts.notes ?? [];

  if (hits.length === 0) {
    return [
      `${opts.heading}: no results.`,
      ...notes,
      "Tips: Algolia matches words, not meaning. Use 1-4 keywords, try synonyms or related terms, and loosen filters (minPoints, dates, type).",
    ].join("\n");
  }

  const header = [
    `${opts.heading}: ${nbHits} results, page ${opts.page + 1} of ${nbPages}, sorted by ${opts.sortByDate ? "date (newest first)" : "relevance"}.`,
  ];
  if (opts.page + 1 < nbPages) header.push(`More results available with page=${opts.page + 1}.`);
  header.push(...notes);

  const offset = opts.page * hits.length;
  const body = hits.map((hit, i) => formatHit(hit, offset + i + 1)).join("\n\n");
  return `${header.join("\n")}\n\n${body}`;
}

// ---------------------------------------------------------------------------
// Comment threads (Algolia /items/:id tree)
// ---------------------------------------------------------------------------

export interface ThreadOptions {
  maxComments: number;
  maxDepth: number;
  maxCommentLength: number;
  includeStoryHeader: boolean;
  /** Firebase `kids` order of the story: HN's own ranking of top-level comments. */
  rankOrder?: number[];
}

const isDeleted = (node: any) => !node.author && !node.text;

function countVisible(node: any): number {
  const self = node.type === "comment" && !isDeleted(node) ? 1 : 0;
  return self + (node.children ?? []).reduce((n: number, c: any) => n + countVisible(c), 0);
}

function hasVisibleDescendant(node: any): boolean {
  return (node.children ?? []).some((c: any) => !isDeleted(c) || hasVisibleDescendant(c));
}

export function formatCommentThread(data: any, opts: ThreadOptions): string {
  let topLevel: any[] = [...(data.children ?? [])];

  if (opts.rankOrder?.length) {
    const rank = new Map(opts.rankOrder.map((id, i) => [id, i]));
    topLevel = topLevel
      .map((c, i) => ({ c, i }))
      .sort((a, b) => (rank.get(a.c.id) ?? 1e9 + a.i) - (rank.get(b.c.id) ?? 1e9 + b.i))
      .map(({ c }) => c);
  }

  // Breadth-first selection: all top-level comments first (in HN rank order),
  // then their replies, and so on, until the budget is used up. This keeps one
  // huge sub-thread from eating the whole budget.
  const selected = new Set<number>();
  let shownCount = 0;
  const queue = topLevel.map((node) => ({ node, depth: 1 }));
  while (queue.length && selected.size < opts.maxComments) {
    const { node, depth } = queue.shift()!;
    if (depth > opts.maxDepth) continue;
    if (isDeleted(node) && !hasVisibleDescendant(node)) continue;
    selected.add(node.id);
    if (!isDeleted(node)) shownCount++;
    for (const child of node.children ?? []) queue.push({ node: child, depth: depth + 1 });
  }

  const render = (node: any, depth: number): string => {
    const pad = "  ".repeat(depth - 1);
    const out: string[] = [];

    if (isDeleted(node)) {
      out.push(`${pad}- [deleted] (ID ${node.id})`);
    } else {
      const text = truncate(htmlToText(node.text), opts.maxCommentLength);
      out.push(`${pad}- ${node.author} · ${day(node.created_at)} · ID ${node.id}`);
      out.push(indent(text || "(empty)", `${pad}  `));
    }

    let hidden = 0;
    for (const child of node.children ?? []) {
      if (selected.has(child.id)) out.push(render(child, depth + 1));
      else hidden += countVisible(child);
    }
    if (hidden > 0) {
      out.push(`${pad}  (+${hidden} more ${hidden === 1 ? "reply" : "replies"} hidden)`);
    }
    return out.join("\n");
  };

  const total = topLevel.reduce((n, c) => n + countVisible(c), 0);
  const shownComments = topLevel.filter((c) => selected.has(c.id)).map((c) => render(c, 1));

  const parts: string[] = [];
  if (opts.includeStoryHeader) {
    parts.push(`Story: ${data.title ?? "(no title)"}`);
    parts.push(`HN: ${hnLink(data.id)} (ID: ${data.id})`);
    if (data.url) parts.push(`URL: ${data.url}`);
    parts.push(`${day(data.created_at)} · ${data.points ?? 0} points · by ${data.author ?? "[deleted]"}`);
    const storyText = htmlToText(data.text);
    if (storyText) parts.push(`\n${truncate(storyText, opts.maxCommentLength * 2)}`);
    parts.push("");
  }

  if (total === 0) {
    parts.push("No comments.");
    return parts.join("\n");
  }

  parts.push(
    `Comments: showing ${shownCount} of ${total} (top-level ${opts.rankOrder?.length ? "in HN ranking order" : "in API order"}, max depth ${opts.maxDepth}).`
  );
  if (shownCount < total) {
    parts.push("Raise maxComments or maxDepth to see more.");
  }
  parts.push("");
  parts.push(shownComments.join("\n\n"));
  return parts.join("\n");
}
