import { fetchJson } from "./http.js";

const API_BASE_URL = "https://hn.algolia.com/api/v1";

export interface AlgoliaSearchOptions {
  /** Comma-separated tags (AND); use parentheses for OR, e.g. "story,(author_pg,author_dang)". */
  tags?: string;
  /** Comma-separated numeric filters, e.g. "points>100,created_at_i>1700000000". */
  numericFilters?: string;
  page?: number;
  hitsPerPage?: number;
  /** true = /search_by_date (newest first), false = /search (relevance). */
  sortByDate?: boolean;
}

/**
 * Client for the Algolia Hacker News API
 */
export class AlgoliaAPI {
  /**
   * Search for stories and comments
   */
  async search(query: string, options: AlgoliaSearchOptions = {}): Promise<any> {
    const params = new URLSearchParams();
    params.append("query", query);

    if (options.tags) params.append("tags", options.tags);
    if (options.numericFilters)
      params.append("numericFilters", options.numericFilters);
    if (options.page !== undefined)
      params.append("page", options.page.toString());
    if (options.hitsPerPage !== undefined)
      params.append("hitsPerPage", options.hitsPerPage.toString());

    const endpoint = options.sortByDate ? "search_by_date" : "search";
    return fetchJson(`${API_BASE_URL}/${endpoint}?${params.toString()}`);
  }

  /**
   * Get an item (usually a story) with its full nested comment tree
   */
  async getStoryWithComments(storyId: number): Promise<any> {
    return fetchJson(`${API_BASE_URL}/items/${storyId}`);
  }

  /**
   * Get a user profile
   */
  async getUser(username: string): Promise<any> {
    return fetchJson(`${API_BASE_URL}/users/${encodeURIComponent(username)}`);
  }
}

// Export a singleton instance
export const algoliaApi = new AlgoliaAPI();
