/**
 * Live Search Provider Abstraction — future web search integration seam.
 *
 * Current state: stub that returns null (no live provider configured).
 * Next patch: connect to Tavily / Perplexity / first-party web search.
 *
 * Integration pattern:
 * 1. buildSearchQuery(userText, taskKind) → structured query
 * 2. executeLiveSearch(query) → raw results
 * 3. normalizeResults(raw) → structured findings
 * 4. formatCitations(findings) → Slack-formatted citation block
 */

/**
 * @typedef {{
 *   query: string,
 *   task_kind: string,
 *   freshness_required: boolean,
 *   locale: string,
 *   max_results: number,
 * }} SearchQuery
 */

/**
 * @typedef {{
 *   title: string,
 *   url: string,
 *   snippet: string,
 *   published_at: string | null,
 *   relevance: number,
 * }} SearchResult
 */

/**
 * @typedef {{
 *   provider: string,
 *   query: string,
 *   results: SearchResult[],
 *   searched_at: string,
 *   live: boolean,
 * }} SearchResponse
 */

/**
 * Build a search query from user text and task context.
 * @param {string} userText
 * @param {string} taskKind
 * @param {{ freshness_required?: boolean }} opts
 * @returns {SearchQuery}
 */
export function buildSearchQuery(userText, taskKind, opts = {}) {
  return {
    query: String(userText || '').slice(0, 500),
    task_kind: taskKind,
    freshness_required: opts.freshness_required || false,
    locale: 'ko-KR',
    max_results: 10,
  };
}

/**
 * Execute live search via configured provider.
 * Returns null if no provider is configured.
 * @param {SearchQuery} _query
 * @returns {Promise<SearchResponse | null>}
 */
export async function executeLiveSearch(_query) {
  const provider = process.env.COS_SEARCH_PROVIDER;
  if (!provider) return null;

  // Future: dispatch to tavily / perplexity / custom
  // For now: return null (no live results)
  return null;
}

/**
 * Normalize raw search results into structured findings.
 * @param {SearchResponse | null} response
 * @returns {SearchResult[]}
 */
export function normalizeResults(response) {
  if (!response || !Array.isArray(response.results)) return [];
  return response.results.filter((r) => r && r.url);
}

/**
 * Format search results as a Slack citation block.
 * @param {SearchResult[]} results
 * @returns {string}
 */
export function formatCitations(results) {
  if (!results.length) return '';
  const lines = results.slice(0, 5).map((r, i) =>
    `${i + 1}. <${r.url}|${r.title || '(제목 없음)'}>${r.published_at ? ` (${r.published_at})` : ''}`
  );
  return ['', '*출처*', ...lines].join('\n');
}

/**
 * Check if a live search provider is configured.
 * @returns {boolean}
 */
export function isLiveSearchConfigured() {
  return Boolean(process.env.COS_SEARCH_PROVIDER);
}
