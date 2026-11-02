import { fetchJson } from "./http.js";

const API_BASE_URL = "https://hacker-news.firebaseio.com/v0";

export type StoryListType = "top" | "new" | "best" | "ask" | "show" | "job";

const LIST_ENDPOINTS: Record<StoryListType, string> = {
  top: "topstories",
  new: "newstories",
  best: "beststories",
  ask: "askstories",
  show: "showstories",
  job: "jobstories",
};

/**
 * Client for the official Hacker News API
 */
export class HackerNewsAPI {
  /**
   * Fetch an item by ID (returns null if it does not exist)
   */
  async getItem(id: number): Promise<any> {
    return fetchJson(`${API_BASE_URL}/item/${id}.json`);
  }

  /**
   * Fetch multiple items by ID
   */
  async getItems(ids: number[]): Promise<any[]> {
    return Promise.all(ids.map((id) => this.getItem(id)));
  }

  /**
   * Fetch story IDs for one of the front-page lists
   */
  async getStoryIds(type: StoryListType, limit: number = 30): Promise<number[]> {
    const ids = await fetchJson<number[]>(
      `${API_BASE_URL}/${LIST_ENDPOINTS[type]}.json`
    );
    return (ids || []).slice(0, limit);
  }

  async getTopStories(limit = 30) { return this.getStoryIds("top", limit); }
  async getNewStories(limit = 30) { return this.getStoryIds("new", limit); }
  async getBestStories(limit = 30) { return this.getStoryIds("best", limit); }
  async getAskStories(limit = 30) { return this.getStoryIds("ask", limit); }
  async getShowStories(limit = 30) { return this.getStoryIds("show", limit); }
  async getJobStories(limit = 30) { return this.getStoryIds("job", limit); }

  /**
   * Fetch a user by ID
   */
  async getUser(id: string): Promise<any> {
    return fetchJson(`${API_BASE_URL}/user/${encodeURIComponent(id)}.json`);
  }

  /**
   * Fetch the maximum item ID
   */
  async getMaxItemId(): Promise<number> {
    return fetchJson<number>(`${API_BASE_URL}/maxitem.json`);
  }
}

// Export a singleton instance
export const hnApi = new HackerNewsAPI();
