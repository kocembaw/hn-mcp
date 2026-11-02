import { z } from "zod";

// Story schemas
export const StorySchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string().optional(),
  text: z.string().optional(),
  by: z.string(),
  score: z.number(),
  time: z.number(),
  descendants: z.number(),
  kids: z.array(z.number()).optional(),
  type: z.literal("story"),
});

// Comment schemas
export const CommentSchema = z.object({
  id: z.number(),
  text: z.string(),
  by: z.string(),
  time: z.number(),
  parent: z.number(),
  kids: z.array(z.number()).optional(),
  type: z.literal("comment"),
});

// User schemas
export const UserSchema = z.object({
  id: z.string(),
  karma: z.number(),
  created: z.number(),
  about: z.string().optional(),
  submitted: z.array(z.number()).optional(),
});

// ---------------------------------------------------------------------------
// Request schemas (also used to generate the tools' JSON Schemas)
// ---------------------------------------------------------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

export const SearchParamsSchema = z.object({
  query: z
    .string()
    .describe(
      "Keywords to match in titles, URLs and text (Algolia full-text, not semantic). 1-4 words work best; for comments prefer specific multi-word queries. May be empty when filtering by author/storyId or sorting by date."
    ),
  type: z
    .enum(["all", "story", "comment", "ask_hn", "show_hn"])
    .default("all")
    .describe(
      "What to search: stories, comments, Ask HN or Show HN posts, or all. Comments often hold the expert opinions."
    ),
  sortBy: z
    .enum(["relevance", "date"])
    .default("relevance")
    .describe("relevance = best match (popular items rank higher), date = newest first."),
  minPoints: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Only items with more than this many points. Stories only: HN hides comment scores."),
  minComments: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Only stories with more than this many comments."),
  dateFrom: isoDate.optional().describe("Only items created on or after this date (YYYY-MM-DD)."),
  dateTo: isoDate.optional().describe("Only items created on or before this date (YYYY-MM-DD)."),
  author: z.string().optional().describe("Only items by this HN username."),
  storyId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Only comments inside this story (search within one discussion)."),
  page: z.number().int().min(0).default(0).describe("Results page, starting at 0."),
  hitsPerPage: z.number().int().min(1).max(100).default(20).describe("Results per page (1-100)."),
});

export const StoryRequestSchema = z.object({
  id: z.number().int().positive().describe("The HN story ID."),
});

export const StoryWithCommentsRequestSchema = z.object({
  id: z.number().int().positive().describe("The HN story ID."),
  maxComments: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(80)
    .describe("Maximum comments to return. Picked breadth-first: top-level comments first, then replies."),
  maxDepth: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(4)
    .describe("Maximum reply depth (1 = top-level comments only)."),
  maxCommentLength: z
    .number()
    .int()
    .min(100)
    .max(20000)
    .default(1500)
    .describe("Truncate each comment to this many characters."),
});

/** Same as getStoryWithComments, kept for backwards compatibility. */
export const CommentTreeRequestSchema = StoryWithCommentsRequestSchema.omit({ id: true }).extend({
  storyId: z.number().int().positive().describe("The HN story ID."),
});

export const StoriesRequestSchema = z.object({
  type: z
    .enum(["top", "new", "best", "ask", "show", "job"])
    .describe("Which HN list to fetch."),
  limit: z.number().int().min(1).max(100).default(30).describe("How many items (1-100)."),
});

export const CommentRequestSchema = z.object({
  id: z.number().int().positive().describe("The HN comment ID."),
});

export const CommentsRequestSchema = z.object({
  storyId: z.number().int().positive().describe("The HN story ID."),
  limit: z.number().int().min(1).max(100).default(30).describe("How many top-level comments (1-100)."),
});

export const UserRequestSchema = z.object({
  id: z.string().min(1).describe("The HN username (case-sensitive)."),
});

export const UserSubmissionsRequestSchema = z.object({
  id: z.string().min(1).describe("The HN username (case-sensitive)."),
  type: z.enum(["all", "story", "comment"]).default("all").describe("Filter by submission type."),
  limit: z.number().int().min(1).max(100).default(30).describe("How many items, newest first (1-100)."),
});
