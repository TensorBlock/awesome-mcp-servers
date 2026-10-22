import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import {
  generateLagrangeConfig,
  type LagrangeConfig,
} from "../../config-generator/src/generateLagrangeConfig.js";
import { normalizeLimit, summarizeServer, type ServerSummary } from "./search.js";

export interface RecommendOptions {
  text: string;
  limit?: number;
  cloudOnly?: boolean;
}

export interface NeedsOptions {
  needs: string[];
  perNeed?: number;
  cloudOnly?: boolean;
}

export interface NeedRecommendation {
  need: string;
  servers: Recommendation[];
}

export interface Recommendation extends ServerSummary {
  score: number;
  matchedTerms: string[];
  lagrange: LagrangeConfig;
}

interface IndexedEntry {
  entry: CatalogEntry;
  name: Set<string>;
  description: Set<string>;
  category: Set<string>;
  lagrange: LagrangeConfig;
  quality: number;
  trusted: boolean;
}

interface RecommendIndex {
  entries: IndexedEntry[];
  idf: Map<string, number>;
}

const MAX_TEXT_LENGTH = 4000;
const MAX_NEEDS = 12;
const DEFAULT_PER_NEED = 3;
const MAX_PER_NEED = 10;
const MAX_TERMS = 40;
const DEFAULT_RECOMMEND_LIMIT = 10;
const CANDIDATE_POOL = 200;
// A need another pick already covers counts for this much in later picks.
const COVERED_TERM_WEIGHT = 0.3;
// Later picks scoring under this share of the first pick are noise, not suggestions.
const MIN_SHARE_OF_TOP = 0.3;

// Hosting and registry domains say where a server lives, not what it does.
const GENERIC_HOSTS = new Set([
  "github", "gitlab", "bitbucket", "npmjs", "pypi", "smithery", "glama", "mcp", "modelcontextprotocol",
  "railway", "vercel", "netlify", "fly", "onrender", "herokuapp", "workers", "pages", "sslip", "ngrok",
  "cloudfront", "amazonaws", "azurewebsites", "appspot", "web", "run", "repl", "replit", "deno", "dev",
]);

// Words that say nothing about which tools an agent needs.
const STOPWORDS = new Set(
  ("a about after all also an and any are as at be been before being both but by can could do does each "
    + "for from get gets had has have help helps how if in into is it its just let lets like make makes may "
    + "more most must my need needs new no not of on once one only or other our out over own please same "
    + "should so some such than that the their them then there these they this those through to too under "
    + "until up use used uses using very via want was way we well were what when where which while who "
    + "why will with within would you your agent agents assistant mcp server servers tool tools model "
    + "models protocol context ai llm llms data user users task tasks work works based support supports "
    + "provides provide allows allow access integration integrate "
    + "every daily weekly monthly morning evening night today tomorrow week month time "
    + "post summary summarize report write read answer question save find send create update list check run "
    + "keep add show give take start stop look into onto across watch open")
    .split(" ")
);

const indexes = new WeakMap<CatalogEntry[], RecommendIndex>();

// Ranks catalog entries against a free-text description of an agent, such as its
// AGENTS.md, a user's "describe your agent" prompt, or a few keywords. Terms are
// weighted by how rare they are in the catalog, and entries with a working,
// verified install outrank look-alikes that only share words.
export const recommendServers = (
  catalog: CatalogEntry[],
  options: RecommendOptions
): Recommendation[] => {
  const terms = [...new Set(tokenize(options.text.slice(0, MAX_TEXT_LENGTH)))].slice(0, MAX_TERMS);

  if (terms.length === 0) {
    return [];
  }

  const index = recommendIndex(catalog);
  const cloudOnly = options.cloudOnly ?? true;
  const limit = normalizeLimit(options.limit ?? DEFAULT_RECOMMEND_LIMIT);

  const candidates = index.entries
    .filter((indexed) => !cloudOnly || indexed.lagrange.cloudReady)
    .map((indexed) => scoreIndexedEntry(indexed, terms, index.idf))
    .filter((scored): scored is ScoredRecommendation => scored !== null)
    .sort(compareScored)
    .slice(0, CANDIDATE_POOL);

  return pickDiverse(candidates, limit).map(toRecommendation);
};

// Ranks servers separately for each need an agent has, such as "github",
// "slack" or "web search". A caller that can name the needs, like an LLM that
// read the agent's instructions, gets a better answer this way than from the
// free-text ranking, since a common need like web search isn't drowned out by a
// rare vendor name elsewhere in the description.
export const recommendForNeeds = (
  catalog: CatalogEntry[],
  options: NeedsOptions
): NeedRecommendation[] => {
  const index = recommendIndex(catalog);
  const cloudOnly = options.cloudOnly ?? true;
  const perNeed = Math.min(Math.max(Math.floor(options.perNeed ?? DEFAULT_PER_NEED), 1) || DEFAULT_PER_NEED, MAX_PER_NEED);
  const needs = [...new Set(options.needs.map((need) => need.trim()).filter(Boolean))].slice(0, MAX_NEEDS);

  return needs.map((need) => {
    const terms = [...new Set(tokenize(need.slice(0, 200)))];
    const servers = terms.length === 0
      ? []
      : index.entries
          .filter((indexed) => !cloudOnly || indexed.lagrange.cloudReady)
          .map((indexed) => scoreIndexedEntry(indexed, terms, index.idf))
          .filter((scored): scored is ScoredRecommendation => scored !== null && scored.matchedTerms.length === terms.length)
          .sort(compareScored)
          .slice(0, perNeed)
          .map(toRecommendation);

    return { need, servers };
  });
};

const toRecommendation = ({ indexed, score, matchedTerms }: ScoredRecommendation): Recommendation => ({
  ...summarizeServer(indexed.entry),
  score: Math.round(score * 100) / 100,
  matchedTerms,
  lagrange: indexed.lagrange,
});

interface ScoredRecommendation {
  indexed: IndexedEntry;
  score: number;
  matchedTerms: string[];
  nameTerms: string[];
  contributions: Map<string, number>;
}

const scoreIndexedEntry = (
  indexed: IndexedEntry,
  terms: string[],
  idf: Map<string, number>
): ScoredRecommendation | null => {
  let relevance = 0;
  const matchedTerms: string[] = [];
  const nameTerms: string[] = [];
  const contributions = new Map<string, number>();

  for (const term of terms) {
    const weight = idf.get(term);

    if (weight === undefined) {
      continue;
    }

    let fieldWeight = 0;

    if (indexed.name.has(term)) {
      fieldWeight += 3;
      nameTerms.push(term);
    }

    if (indexed.description.has(term)) {
      // A reviewed, high-confidence entry is trusted to say what it does, so a
      // need it describes ("web search") counts as much as one in its name.
      if (indexed.trusted) {
        fieldWeight += 2;
        nameTerms.push(term);
      } else {
        fieldWeight += 1;
      }
    }

    if (indexed.category.has(term)) {
      fieldWeight += 0.5;
    }

    if (fieldWeight > 0) {
      relevance += weight * fieldWeight;
      matchedTerms.push(term);
      contributions.set(term, weight * fieldWeight * indexed.quality);
    }
  }

  // A server is suggested for what it is (its name or domain), not for sharing
  // a few words with the agent's description.
  if (nameTerms.length === 0) {
    return null;
  }

  return {
    indexed,
    score: relevance * indexed.quality,
    matchedTerms,
    nameTerms,
    contributions,
  };
};

const compareScored = (left: ScoredRecommendation, right: ScoredRecommendation): number =>
  right.score - left.score || left.indexed.entry.name.localeCompare(right.indexed.entry.name);

// Picks greedily so an agent that needs GitHub and Slack gets one of each before
// a second GitHub server: once a pick covers a need by name, that need counts
// for less in the remaining candidates.
const pickDiverse = (candidates: ScoredRecommendation[], limit: number): ScoredRecommendation[] => {
  const picked: ScoredRecommendation[] = [];
  const covered = new Set<string>();
  const remaining = [...candidates];
  let topScore = 0;

  while (picked.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -1;

    remaining.forEach((candidate, candidateIndex) => {
      let score = 0;
      for (const [term, contribution] of candidate.contributions) {
        score += covered.has(term) ? contribution * COVERED_TERM_WEIGHT : contribution;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIndex = candidateIndex;
      }
    });

    if (picked.length === 0) {
      topScore = bestScore;
    } else if (bestScore < topScore * MIN_SHARE_OF_TOP) {
      break;
    }

    const [best] = remaining.splice(bestIndex, 1);
    picked.push(best);
    best.nameTerms.forEach((term) => covered.add(term));
  }

  return picked;
};

const recommendIndex = (catalog: CatalogEntry[]): RecommendIndex => {
  const cached = indexes.get(catalog);

  if (cached) {
    return cached;
  }

  const entries = catalog.map((entry): IndexedEntry => ({
    entry,
    name: new Set([...tokenize(withoutRegistryIds(entry.name)), ...tokenize(hostWords(entry))]),
    description: new Set(tokenize(entry.description)),
    category: new Set(tokenize(entry.category)),
    lagrange: generateLagrangeConfig(entry),
    quality: qualityFactor(entry),
    trusted: (entry.verification.status === "verified" || entry.verification.status === "partial")
      && entry.install.confidence === "high",
  }));

  const documentFrequency = new Map<string, number>();

  for (const indexed of entries) {
    for (const term of new Set([...indexed.name, ...indexed.description, ...indexed.category])) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  const idf = new Map<string, number>();

  for (const [term, count] of documentFrequency) {
    idf.set(term, Math.log(1 + entries.length / count));
  }

  const index = { entries, idf };
  indexes.set(catalog, index);
  return index;
};

const qualityFactor = (entry: CatalogEntry): number => {
  let quality = 1;

  if (entry.verification.status === "verified") {
    quality += 0.6;
  } else if (entry.verification.status === "partial" || entry.verification.status === "self_reported") {
    quality += 0.3;
  } else if (entry.verification.status === "failing") {
    quality -= 0.6;
  }

  if (entry.install.confidence === "high") {
    quality += 0.4;
  } else if (entry.install.confidence === "medium") {
    quality += 0.2;
  }

  if (entry.installReady) {
    quality += 0.2;
  }

  if (entry.auth.type !== "unknown") {
    quality += 0.1;
  }

  if (entry.health.endpointReachable === false) {
    quality -= 0.4;
  }

  return Math.max(quality, 0.1);
};

// "Seonix (io.github.pahaa97/seonix)" is about Seonix, not GitHub.
const withoutRegistryIds = (name: string): string =>
  name.replace(/\(?\b(?:io|com)\.github\.[\w.-]+(?:\/[\w.-]+)?\)?/gi, " ");

// The vendor in a server's domain and its GitHub owner, so "mcp.slack.com" and
// "github.com/stripe/ai" count toward "slack" and "stripe".
const hostWords = (entry: CatalogEntry): string => {
  const words: string[] = [];

  for (const rawUrl of [entry.links.endpoint, entry.links.homepage, entry.links.primary]) {
    if (!rawUrl) {
      continue;
    }

    try {
      const url = new URL(rawUrl);
      const labels = url.hostname.toLowerCase().split(".");
      const vendor = labels.at(-2);

      if (url.hostname === "github.com") {
        words.push(url.pathname.split("/").filter(Boolean)[0] ?? "");
      } else if (vendor && !GENERIC_HOSTS.has(vendor)) {
        words.push(vendor);
      }
    } catch {
      continue;
    }
  }

  return words.join(" ");
};

export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word))
    .filter((word) => !STOPWORDS.has(word))
    .map(stem)
    .filter((word) => !stemmedStopwords().has(word));

// Just enough stemming to match "databases" with "database", "searches" with
// "search" and "scraping" with "scrape".
const stem = (word: string): string => {
  let stemmed = word;

  if (stemmed.length > 4 && stemmed.endsWith("ies")) {
    stemmed = `${stemmed.slice(0, -3)}y`;
  } else if (stemmed.length > 4 && /(?:s|x|ch|sh)es$/.test(stemmed)) {
    stemmed = stemmed.slice(0, -2);
  } else if (stemmed.length > 4 && stemmed.endsWith("s") && !stemmed.endsWith("ss") && !stemmed.endsWith("us")) {
    stemmed = stemmed.slice(0, -1);
  }

  if (stemmed.length > 5 && stemmed.endsWith("ing")) {
    stemmed = stemmed.slice(0, -3);
  } else if (stemmed.length > 4 && stemmed.endsWith("ed") && !stemmed.endsWith("eed")) {
    stemmed = stemmed.slice(0, -2);
  }

  if (stemmed.length > 4 && stemmed.endsWith("e")) {
    stemmed = stemmed.slice(0, -1);
  }

  return stemmed;
};

let stemmedStopwordSet: Set<string> | undefined;

// "morning" stems to "morn", so stems are checked against stemmed stopwords too.
const stemmedStopwords = (): Set<string> => {
  stemmedStopwordSet ??= new Set([...STOPWORDS].map(stem));
  return stemmedStopwordSet;
};
