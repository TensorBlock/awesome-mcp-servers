import type { CatalogEntry, AuthType, Transport } from "../../catalog-builder/src/types.js";
import { webProfileUrl } from "./webProfile.js";

export interface CatalogSearchFilters {
  query?: string;
  category?: string;
  transport?: Transport;
  auth?: AuthType;
  limit?: number;
}

export interface ServerSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  transport: Transport[];
  auth: AuthType;
  installConfidence: CatalogEntry["install"]["confidence"];
  primaryUrl: string;
  profilePath: string;
  webProfilePath: string;
  sourcePullRequest: number | null;
  lastUpdatedAt: string | null;
}

export interface CategorySummary {
  name: string;
  count: number;
  path: string | null;
}

interface ScoredEntry {
  entry: CatalogEntry;
  score: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export const summarizeServer = (entry: CatalogEntry): ServerSummary => ({
  id: entry.id,
  name: entry.name,
  description: entry.description,
  category: entry.category,
  transport: entry.transport,
  auth: entry.auth.type,
  installConfidence: entry.install.confidence,
  primaryUrl: entry.links.primary,
  profilePath: `/v1/servers/${entry.id}`,
  webProfilePath: webProfileUrl(entry.id),
  sourcePullRequest: entry.source.pullRequest ?? null,
  lastUpdatedAt: entry.source.lastUpdatedAt ?? null,
});

export const listCategories = (catalog: CatalogEntry[]): CategorySummary[] => {
  const categories = new Map<string, { count: number; path: string | null }>();

  for (const entry of catalog) {
    const current = categories.get(entry.category) ?? {
      count: 0,
      path: entry.source.docsPath,
    };

    current.count += 1;
    current.path ??= entry.source.docsPath;
    categories.set(entry.category, current);
  }

  return Array.from(categories.entries())
    .map(([name, summary]) => ({
      name,
      count: summary.count,
      path: summary.path,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const searchCatalog = (
  catalog: CatalogEntry[],
  filters: CatalogSearchFilters
): ServerSummary[] => {
  const limit = normalizeLimit(filters.limit);
  const query = filters.query?.trim() ?? "";
  const terms = tokenize(query);

  const filtered = catalog.filter((entry) => matchesFilters(entry, filters));
  const ranked = terms.length > 0
    ? filtered
        .map((entry) => ({
          entry,
          score: scoreEntry(entry, terms),
        }))
        .filter(({ score }) => score > 0)
        .sort(sortScoredEntries)
        .map(({ entry }) => entry)
    : filtered.sort(sortEntries);

  return ranked.slice(0, limit).map(summarizeServer);
};

export const findServer = (
  catalog: CatalogEntry[],
  serverId: string
): CatalogEntry | null => {
  const requestedKey = normalizeLookupKey(serverId);

  if (!requestedKey) {
    return null;
  }

  const exactMatch = catalog.find((entry) => normalizeLookupKey(entry.id) === requestedKey);

  if (exactMatch) {
    return exactMatch;
  }

  const aliasMatches = catalog.filter((entry) => serverLookupKeys(entry).has(requestedKey));

  return aliasMatches.length === 1 ? aliasMatches[0] : null;
};

export const listRecentServers = (
  catalog: CatalogEntry[],
  rawLimit: number | undefined
): ServerSummary[] =>
  sortWithOriginalOrder(catalog, sortByUpdatedAtThenPullRequest)
    .slice(0, normalizeLimit(rawLimit))
    .map(summarizeServer);

export const listUpdatedServers = (
  catalog: CatalogEntry[],
  rawLimit: number | undefined
): ServerSummary[] =>
  sortWithOriginalOrder(catalog, sortByUpdatedAtThenPullRequest)
    .slice(0, normalizeLimit(rawLimit))
    .map(summarizeServer);

export const normalizeLimit = (rawLimit: number | undefined): number => {
  if (!rawLimit || Number.isNaN(rawLimit) || rawLimit < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(rawLimit), MAX_LIMIT);
};

const matchesFilters = (entry: CatalogEntry, filters: CatalogSearchFilters): boolean => {
  if (filters.category && entry.category !== filters.category) {
    return false;
  }

  if (filters.transport && !entry.transport.includes(filters.transport)) {
    return false;
  }

  if (filters.auth && entry.auth.type !== filters.auth) {
    return false;
  }

  return true;
};

const scoreEntry = (entry: CatalogEntry, terms: string[]): number => {
  const name = normalizeText(entry.name);
  const description = normalizeText(entry.description);
  const category = normalizeText(entry.category);
  const primaryUrl = normalizeText(entry.links.primary);
  let matchedTerms = 0;

  const score = terms.reduce((currentScore, term) => {
    let nextScore = currentScore;
    let matched = false;

    if (name.includes(term)) {
      nextScore += name === term ? 60 : 30;
      matched = true;
    }

    if (primaryUrl.includes(term)) {
      nextScore += 20;
      matched = true;
    }

    if (description.includes(term)) {
      nextScore += 12;
      matched = true;
    }

    if (category.includes(term)) {
      nextScore += 6;
      matched = true;
    }

    if (matched) {
      matchedTerms += 1;
    }

    return nextScore;
  }, 0);

  return score + matchedTerms * 10 + (matchedTerms === terms.length ? 100 : 0);
};

const sortScoredEntries = (left: ScoredEntry, right: ScoredEntry): number =>
  right.score - left.score || sortEntries(left.entry, right.entry);

const sortEntries = (left: CatalogEntry, right: CatalogEntry): number =>
  left.category.localeCompare(right.category) || left.name.localeCompare(right.name);

const sortWithOriginalOrder = (
  catalog: CatalogEntry[],
  compare: (left: CatalogEntry, right: CatalogEntry) => number
): CatalogEntry[] =>
  catalog
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => compare(left.entry, right.entry) || left.index - right.index)
    .map(({ entry }) => entry);

const sortByUpdatedAtThenPullRequest = (left: CatalogEntry, right: CatalogEntry): number =>
  compareNullableNumberDesc(timestampRank(left.source.lastUpdatedAt), timestampRank(right.source.lastUpdatedAt))
  || compareNullableNumberDesc(left.source.pullRequest ?? null, right.source.pullRequest ?? null);

const compareNullableNumberDesc = (left: number | null, right: number | null): number => {
  if (left === null && right === null) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return right - left;
};

const timestampRank = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const tokenize = (query: string): string[] =>
  normalizeText(query)
    .split(/\s+/)
    .filter((term) => term.length > 0);

const normalizeText = (value: string): string => value.toLowerCase();

const HASH_SUFFIX_PATTERN = /-[a-f0-9]{8}$/;

const serverLookupKeys = (entry: CatalogEntry): Set<string> => {
  const keys = new Set<string>();
  addLookupKey(keys, entry.id);
  addLookupKey(keys, entry.id.replace(HASH_SUFFIX_PATTERN, ""));
  addNameLookupKeys(keys, entry.name);
  addUrlLookupKeys(keys, entry.links.primary);
  addUrlLookupKeys(keys, entry.links.repo);

  return keys;
};

const addNameLookupKeys = (keys: Set<string>, name: string): void => {
  addLookupKey(keys, name);

  const parts = name.split("/").filter(Boolean);
  if (parts.length >= 2) {
    addLookupKey(keys, parts.slice(-2).join("-"));
    addLookupKey(keys, parts.at(-1) ?? "");
  }
};

const addUrlLookupKeys = (keys: Set<string>, rawUrl: string | null | undefined): void => {
  if (!rawUrl) {
    return;
  }

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const pathParts = parsed.pathname.split("/").filter(Boolean);

    if (host === "github.com" && pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts[1];

      addLookupKey(keys, `github-${owner}-${repo}`);
      addLookupKey(keys, `${owner}-${repo}`);
      addLookupKey(keys, repo);
      return;
    }

    addLookupKey(keys, [host, ...pathParts].join("-"));
    addLookupKey(keys, pathParts.at(-1) ?? "");
  } catch {
    addLookupKey(keys, rawUrl);
  }
};

const addLookupKey = (keys: Set<string>, value: string): void => {
  const key = normalizeLookupKey(value);

  if (key) {
    keys.add(key);
  }
};

const normalizeLookupKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
