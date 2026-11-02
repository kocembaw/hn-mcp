# Hacker News MCP Server

[![smithery badge](https://smithery.ai/badge/@devabdultech/hn-mcp)](https://smithery.ai/server/@devabdultech/hn-mcp)
Official Hacker News MCP Server - Adds powerful Hacker News integration to Cursor, Claude, and any other LLM clients. Access stories, comments, user profiles, and search functionality through the Model Context Protocol.

<a href="https://glama.ai/mcp/servers/73uji99mwg">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/73uji99mwg/badge" alt="Hacker News Server MCP server" />
</a>

## Features

- Search stories and comments using Algolia's HN Search API
- Get stories by type (top, new, best, ask, show, job)
- Get individual stories with comments
- Get comment trees and user discussions
- Get user profiles and submissions
- Real-time access to Hacker News data

## Set Up

### Running on Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hackernews": {
      "command": "npx",
      "args": ["-y", "@devabdultech/hn-mcp-server"]
    }
  }
}
```

### Installing via Smithery

To install Hacker News MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@devabdultech/hn-mcp):

```bash
npx -y @smithery/cli install @devabdultech/hn-mcp --client claude
```

## Tools

All tools are read-only and need no API key. Every result includes an HN link and item ID.

1. `search`: search the full HN archive (stories and comments) via Algolia
   - `query` (string): keywords; matching is full-text, not semantic, so 1-4 words work best
   - `type` (optional): `all` (default), `story`, `comment`, `ask_hn`, `show_hn`
   - `sortBy` (optional): `relevance` (default) or `date` (newest first)
   - `minPoints`, `minComments` (optional): quality filters for stories (HN hides comment scores)
   - `dateFrom`, `dateTo` (optional, `YYYY-MM-DD`): date range
   - `author` (optional): only items by this user
   - `storyId` (optional): only comments inside this story
   - `page`, `hitsPerPage` (optional, max 100): pagination
   - Comment results show the comment text and the story they belong to

2. `getStoryWithComments`: a story and its discussion as an indented thread
   - `id` (number): story ID
   - `maxComments` (optional, default 80), `maxDepth` (optional, default 4), `maxCommentLength` (optional, default 1500)
   - Top-level comments follow HN's ranking and are picked breadth-first, so large threads stay readable; the output says how many comments were hidden

3. `getCommentTree`: same as `getStoryWithComments` without the story header (takes `storyId`)

4. `getStory`: a story's metadata and text, without comments

5. `getStories`: current lists: `top`, `new`, `best`, `ask`, `show`, `job` (`limit` up to 100)

6. `getComment` / `getComments`: one comment, or a story's top-level comments only

7. `getUser`: profile (karma, creation date, about)

8. `getUserSubmissions`: a user's latest stories and/or comments, newest first (`type`, `limit`)

Comment HTML is converted to plain text (links kept, entities decoded) and deleted comments are skipped, which keeps responses compact for LLMs.

### Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This MCP server is licensed under the MIT License. See the LICENSE file for details.

## About

This MCP server is built and maintained by [devabdultech](https://github.com/devabdultech). It uses the official Hacker News API and Algolia Search API to provide comprehensive access to Hacker News data through the Model Context Protocol.
