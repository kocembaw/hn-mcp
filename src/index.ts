#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { hnApi } from "./api/hn.js";
import { algoliaApi } from "./api/algolia.js";
import { formatStory } from "./models/story.js";
import { formatComment } from "./models/comment.js";
import { formatUser } from "./models/user.js";
import { validateInput } from "./utils/validation.js";
import { htmlToText, indent, truncate } from "./utils/html.js";
import { formatCommentThread, formatSearchResults, hnLink } from "./utils/format.js";
import {
  SearchParamsSchema,
  StoryRequestSchema,
  StoryWithCommentsRequestSchema,
  CommentTreeRequestSchema,
  StoriesRequestSchema,
  CommentRequestSchema,
  CommentsRequestSchema,
  UserRequestSchema,
  UserSubmissionsRequestSchema,
} from "./schemas/index.js";

const VERSION = "1.3.1";
const ALGOLIA_MAX_HITS = 1000;

const server = new Server(
  { name: "hackernews-mcp-server", version: VERSION },
  { capabilities: { tools: {} } }
);

/** Turn a Zod object schema into the JSON Schema MCP clients expect. */
function toInputSchema(schema: z.ZodTypeAny) {
  const { $schema, ...json } = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  }) as Record<string, unknown>;
  return json as { type: "object"; [key: string]: unknown };
}

const readOnly = { readOnlyHint: true, openWorldHint: true };

const tools = [
  {
    name: "search",
    description:
      "Search the full Hacker News archive (2007-today) for stories and comments via Algolia. " +
      "Matching is by keywords, NOT meaning, and covers titles, URLs and post text, so some hits only " +
      "mention a word in passing: run several searches with short queries (1-4 words) using synonyms " +
      "and related terms, then judge relevance yourself. " +
      "Stories: relevance order favors popular items; use minPoints / dates / sortBy=date to focus on " +
      "quality or recency. " +
      "Comments (type=comment) hold practitioners' opinions and experience, but HN hides comment scores, " +
      "so relevance order among comments is close to arbitrary for 1-2 word queries. For comments use " +
      "sortBy=date, a dateFrom/dateTo range, a more specific multi-word query, or storyId to search " +
      "inside one discussion. " +
      "Algolia only returns the first 1000 matches of any search, so narrow the query instead of paging " +
      "deep. Each result includes an HN link and ID; pass a story ID to getStoryWithComments to read " +
      "the discussion.",
    inputSchema: toInputSchema(SearchParamsSchema),
    annotations: { title: "Search Hacker News", ...readOnly },
  },
  {
    name: "getStoryWithComments",
    description:
      "Get a story and its discussion as a readable, indented thread. Top-level comments come in HN's " +
      "ranking order and are picked breadth-first, so the defaults give a good overview of large threads " +
      "without flooding the context. The output says how many comments were hidden; raise maxComments " +
      "or maxDepth to read more.",
    inputSchema: toInputSchema(StoryWithCommentsRequestSchema),
    annotations: { title: "Read HN discussion", ...readOnly },
  },
  {
    name: "getStory",
    description: "Get a single story's metadata (title, URL, points, comment count, text) by ID, without comments.",
    inputSchema: toInputSchema(StoryRequestSchema),
    annotations: { title: "Get HN story", ...readOnly },
  },
  {
    name: "getStories",
    description: "Get the current front-page lists: top, new, best, Ask HN, Show HN or jobs.",
    inputSchema: toInputSchema(StoriesRequestSchema),
    annotations: { title: "Get HN story list", ...readOnly },
  },
  {
    name: "getComment",
    description: "Get a single comment by ID.",
    inputSchema: toInputSchema(CommentRequestSchema),
    annotations: { title: "Get HN comment", ...readOnly },
  },
  {
    name: "getComments",
    description:
      "Get only the top-level comments of a story (no replies). Prefer getStoryWithComments for reading a discussion.",
    inputSchema: toInputSchema(CommentsRequestSchema),
    annotations: { title: "Get top-level HN comments", ...readOnly },
  },
  {
    name: "getCommentTree",
    description: "Same as getStoryWithComments without the story header (kept for backwards compatibility).",
    inputSchema: toInputSchema(CommentTreeRequestSchema),
    annotations: { title: "Get HN comment tree", ...readOnly },
  },
  {
    name: "getUser",
    description: "Get a user's profile: karma, account creation date and 'about' text.",
    inputSchema: toInputSchema(UserRequestSchema),
    annotations: { title: "Get HN user", ...readOnly },
  },
  {
    name: "getUserSubmissions",
    description: "Get a user's most recent stories and/or comments, newest first.",
    inputSchema: toInputSchema(UserSubmissionsRequestSchema),
    annotations: { title: "Get HN user submissions", ...readOnly },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

const text = (body: string) => ({ content: [{ type: "text" as const, text: body.trim() }] });

/** Start of a day / end of a day as a unix timestamp (UTC). */
const dayStart = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 1000);
const dayEnd = (d: string) => dayStart(d) + 86_399;

const day = (unix?: number) => (unix ? new Date(unix * 1000).toISOString().slice(0, 10) : "unknown date");

async function readThread(
  id: number,
  opts: { maxComments: number; maxDepth: number; maxCommentLength: number },
  includeStoryHeader: boolean
) {
  // Algolia gives the whole tree in one request; Firebase gives HN's ranking of top-level comments.
  const [data, firebaseItem] = await Promise.all([
    algoliaApi.getStoryWithComments(id).catch((err: Error) => {
      if (err.message.startsWith("HTTP 404")) return null;
      throw err;
    }),
    hnApi.getItem(id).catch(() => null),
  ]);
  if (!data || data.id === undefined) {
    throw new McpError(ErrorCode.InvalidParams, `Item with ID ${id} not found`);
  }
  return formatCommentThread(data, {
    ...opts,
    includeStoryHeader,
    rankOrder: firebaseItem?.kids,
  });
}

async function callTool(name: string, args: unknown) {
  switch (name) {
    case "search": {
      const p = validateInput(SearchParamsSchema, args);
      const tags: string[] = [];
      const numeric: string[] = [];
      const notes: string[] = [];

      if (p.type !== "all") tags.push(p.type);
      if (p.author) tags.push(`author_${p.author}`);
      if (p.storyId) tags.push(`story_${p.storyId}`);

      if (p.type === "comment" && (p.minPoints !== undefined || p.minComments !== undefined)) {
        notes.push("Note: minPoints/minComments were ignored because HN does not expose comment scores.");
      } else {
        if (p.minPoints !== undefined) numeric.push(`points>${p.minPoints}`);
        if (p.minComments !== undefined) numeric.push(`num_comments>${p.minComments}`);
        if (p.type === "all" && p.minPoints !== undefined) {
          notes.push("Note: minPoints excludes comments (their scores are hidden). Use type=story to be explicit.");
        }
      }

      if (p.dateFrom && p.dateTo && p.dateFrom > p.dateTo) {
        throw new McpError(ErrorCode.InvalidParams, "dateFrom must be on or before dateTo");
      }
      if (p.dateFrom) numeric.push(`created_at_i>=${dayStart(p.dateFrom)}`);
      if (p.dateTo) numeric.push(`created_at_i<=${dayEnd(p.dateTo)}`);

      const narrowHint =
        p.type === "comment"
          ? "a more specific query, a dateFrom/dateTo range or storyId"
          : "a more specific query, a dateFrom/dateTo range or minPoints";

      // Algolia caps every search at 1000 reachable hits; deeper pages come back empty.
      if (p.page * p.hitsPerPage >= ALGOLIA_MAX_HITS) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Algolia only returns the first ${ALGOLIA_MAX_HITS} results of a search (page * hitsPerPage must be below ${ALGOLIA_MAX_HITS}). Narrow the search with ${narrowHint} instead.`
        );
      }

      const sortByDate = p.sortBy === "date";
      const results = await algoliaApi.search(p.query, {
        tags: tags.join(",") || undefined,
        numericFilters: numeric.join(",") || undefined,
        page: p.page,
        hitsPerPage: p.hitsPerPage,
        sortByDate,
      });

      const nbHits: number = results?.nbHits ?? 0;
      if (nbHits > ALGOLIA_MAX_HITS) {
        notes.push(
          `Note: only the first ${ALGOLIA_MAX_HITS} of ${nbHits} matches can be paged through. Narrow the search with ${narrowHint} rather than paging further.`
        );
      }
      const queryWords = p.query.trim().split(/\s+/).filter(Boolean).length;
      if (p.type === "comment" && !sortByDate && !p.storyId && queryWords <= 2 && nbHits > p.hitsPerPage) {
        notes.push(
          "Note: comments have no public scores, so this relevance order is close to arbitrary. For a useful sample use sortBy=date, a date range, or a more specific multi-word query."
        );
      }

      const filters = [
        p.type !== "all" && `type=${p.type}`,
        p.author && `author=${p.author}`,
        p.storyId && `storyId=${p.storyId}`,
        p.minPoints !== undefined && `points>${p.minPoints}`,
        p.minComments !== undefined && `comments>${p.minComments}`,
        p.dateFrom && `from ${p.dateFrom}`,
        p.dateTo && `to ${p.dateTo}`,
      ].filter(Boolean);
      const heading =
        `Search ${p.query ? `"${p.query}"` : "(no query)"}` +
        (filters.length ? ` [${filters.join(", ")}]` : "");

      return text(formatSearchResults(results, { heading, page: p.page, sortByDate, notes }));
    }

    case "getStoryWithComments": {
      const { id, ...opts } = validateInput(StoryWithCommentsRequestSchema, args);
      return text(await readThread(id, opts, true));
    }

    case "getCommentTree": {
      const { storyId, ...opts } = validateInput(CommentTreeRequestSchema, args);
      return text(await readThread(storyId, opts, false));
    }

    case "getStory": {
      const { id } = validateInput(StoryRequestSchema, args);
      const item = await hnApi.getItem(id);
      if (!item || !["story", "job", "poll"].includes(item.type)) {
        throw new McpError(ErrorCode.InvalidParams, `Story with ID ${id} not found`);
      }
      const story = formatStory(item);
      const body = htmlToText(story.text);
      return text(
        `Story: ${story.title}\n` +
          `HN: ${hnLink(story.id)} (ID: ${story.id})\n` +
          (story.url ? `URL: ${story.url}\n` : "") +
          `${day(story.time)} · ${story.score} points · ${story.descendants} comments · by ${story.by}\n` +
          (body ? `\n${body}\n` : "")
      );
    }

    case "getStories": {
      const { type, limit } = validateInput(StoriesRequestSchema, args);
      const ids = await hnApi.getStoryIds(type, limit);
      const items = (await hnApi.getItems(ids)).filter(
        (item) => item && !item.deleted && !item.dead && ["story", "job", "poll"].includes(item.type)
      );
      if (items.length === 0) return text("No stories found.");

      const lines = items.map((item, i) => {
        const s = formatStory(item);
        return (
          `${i + 1}. ${s.title}\n` +
          `   HN: ${hnLink(s.id)} (ID: ${s.id})\n` +
          (s.url ? `   URL: ${s.url}\n` : "") +
          `   ${day(s.time)} · ${s.score} points · ${s.descendants} comments · by ${s.by}`
        );
      });
      return text(`${type} stories:\n\n${lines.join("\n\n")}`);
    }

    case "getComment": {
      const { id } = validateInput(CommentRequestSchema, args);
      const item = await hnApi.getItem(id);
      if (!item || item.type !== "comment") {
        throw new McpError(ErrorCode.InvalidParams, `Comment with ID ${id} not found`);
      }
      const c = formatComment(item);
      return text(
        `Comment by ${c.by} · ${day(c.time)}\n` +
          `HN: ${hnLink(c.id)} (ID: ${c.id}) · parent ID: ${c.parent}\n\n` +
          (htmlToText(c.text) || "[deleted]")
      );
    }

    case "getComments": {
      const { storyId, limit } = validateInput(CommentsRequestSchema, args);
      const story = await hnApi.getItem(storyId);
      if (!story?.kids?.length) return text(`No comments found for story ID ${storyId}.`);

      const comments = (await hnApi.getItems(story.kids.slice(0, limit)))
        .filter((item) => item && item.type === "comment" && !item.deleted && !item.dead)
        .map(formatComment);
      if (comments.length === 0) return text(`No comments found for story ID ${storyId}.`);

      const lines = comments.map(
        (c, i) =>
          `${i + 1}. ${c.by} · ${day(c.time)} · ID ${c.id} · ${c.kids?.length ?? 0} direct replies\n` +
          indent(truncate(htmlToText(c.text), 1500), "   ")
      );
      return text(`Top-level comments for story ${storyId} (HN ranking order):\n\n${lines.join("\n\n")}`);
    }

    case "getUser": {
      const { id } = validateInput(UserRequestSchema, args);
      const user = await hnApi.getUser(id);
      if (!user) throw new McpError(ErrorCode.InvalidParams, `User ${id} not found (usernames are case-sensitive)`);
      const u = formatUser(user);
      const about = htmlToText(u.about);
      return text(
        `User: ${u.id}\n` +
          `Karma: ${u.karma}\n` +
          `Created: ${day(u.created)}\n` +
          `Profile: https://news.ycombinator.com/user?id=${encodeURIComponent(u.id)}\n` +
          (about ? `\nAbout:\n${about}\n` : "")
      );
    }

    case "getUserSubmissions": {
      const { id, type, limit } = validateInput(UserSubmissionsRequestSchema, args);
      const tags = [`author_${id}`];
      if (type !== "all") tags.push(type);
      const results = await algoliaApi.search("", {
        tags: tags.join(","),
        hitsPerPage: limit,
        sortByDate: true,
      });
      return text(
        formatSearchResults(results, {
          heading: `Submissions by ${id}${type !== "all" ? ` (${type})` : ""}`,
          page: 0,
          sortByDate: true,
        })
      );
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Tool '${name}' not found`);
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await callTool(name, args ?? {});
  } catch (err) {
    if (err instanceof McpError && err.code === ErrorCode.MethodNotFound) throw err;
    // Report tool failures as results so the model can read the message and retry.
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = () => {
    transport.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.error(`Hacker News MCP Server ${VERSION} running on stdio`);
}

runServer().catch((error: unknown) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
