import type { CatalogBuildError, CatalogEntry, ParsedMarkdownEntry } from "./types.js";
import { CATEGORY_TO_DOCS_PATH } from "./category-map.js";
import { parseMarkdownEntries, slugFromUrl } from "./parseMarkdown.js";

export interface CatalogBuildResult {
  entries: CatalogEntry[];
  errors: CatalogBuildError[];
}

export function buildCatalogFromMarkdown(
  readmeMarkdown: string,
  docsByPath: Map<string, string>,
): CatalogBuildResult {
  const readmeEntries = parseMarkdownEntries(readmeMarkdown, "README.md");
  const docsEntriesByPath = parseDocsEntries(docsByPath);
  const errors: CatalogBuildError[] = [];
  const seenUrls = new Map<string, ParsedMarkdownEntry>();
  const entries: CatalogEntry[] = [];

  for (const entry of readmeEntries) {
    let id: string;
    let normalizedUrl: string;

    try {
      id = slugFromUrl(entry.url);
      normalizedUrl = normalizeUrl(entry.url);
    } catch (error) {
      errors.push({
        code: "parse_error",
        message: error instanceof Error ? error.message : "Unable to parse entry URL",
        sourcePath: entry.sourcePath,
        line: entry.line,
      });
      continue;
    }

    const docsPath = CATEGORY_TO_DOCS_PATH[entry.category] ?? null;
    const previous = seenUrls.get(normalizedUrl);
    if (previous) {
      errors.push({
        code: "duplicate_url",
        message: `Duplicate URL also appears at ${previous.sourcePath}:${previous.line}`,
        entryId: id,
        sourcePath: entry.sourcePath,
        line: entry.line,
      });
    } else {
      seenUrls.set(normalizedUrl, entry);
    }

    if (docsPath && !isMirroredInDocs(entry.url, docsEntriesByPath.get(docsPath) ?? [])) {
      errors.push({
        code: "missing_docs_mirror",
        message: `Entry is present in README.md but missing from ${docsPath}`,
        entryId: id,
        sourcePath: entry.sourcePath,
        line: entry.line,
      });
    }

    entries.push(toCatalogEntry(entry, id, docsPath));
  }

  return { entries, errors };
}

function parseDocsEntries(docsByPath: Map<string, string>): Map<string, ParsedMarkdownEntry[]> {
  const docsEntriesByPath = new Map<string, ParsedMarkdownEntry[]>();

  for (const [path, markdown] of docsByPath.entries()) {
    docsEntriesByPath.set(path, parseMarkdownEntries(markdown, path));
  }

  return docsEntriesByPath;
}

function isMirroredInDocs(url: string, docsEntries: ParsedMarkdownEntry[]): boolean {
  const normalizedUrl = normalizeUrl(url);
  return docsEntries.some((docsEntry) => normalizeUrl(docsEntry.url) === normalizedUrl);
}

function toCatalogEntry(entry: ParsedMarkdownEntry, id: string, docsPath: string | null): CatalogEntry {
  const repo = isGithubUrl(entry.url) ? entry.url : null;
  const installCommands = extractInstallCommands(entry.description);
  const toolCount = extractToolCount(entry.description);

  return {
    id,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    source: {
      readmePath: entry.sourcePath,
      docsPath,
    },
    links: {
      primary: entry.url,
      repo,
      homepage: repo ? null : entry.url,
      docs: null,
      endpoint: extractEndpoint(entry.description),
    },
    install: {
      commands: installCommands,
      env: extractEnvVars(entry.description),
      confidence: installCommands.length > 0 ? "medium" : "low",
    },
    transport: inferTransport(entry.description),
    auth: inferAuth(entry.description),
    clients: inferClients(entry.description),
    tools: {
      count: toolCount,
      names: [],
      source: toolCount === null ? "unknown" : "self_reported",
    },
    license: inferLicense(entry.description),
    health: {
      repoPublic: null,
      packageFound: null,
      endpointReachable: null,
      lastCheckedAt: null,
    },
    verification: {
      status: "unknown",
      notes: [],
    },
    community: {
      maintainedBy: [],
      verifiedBy: [],
      claimed: false,
    },
  };
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }

  return parsed.toString().replace(/\/+$/, "");
}

function isGithubUrl(url: string): boolean {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "") === "github.com";
}

function extractInstallCommands(text: string): string[] {
  const commands = text.match(/`([^`]*(?:npx|uvx|pip|docker|npm)[^`]*)`/gi) ?? [];
  return unique(commands.map((command) => command.slice(1, -1).trim()).filter(Boolean));
}

function extractEnvVars(text: string): string[] {
  const matches = text.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
  return unique(matches.filter((match) => /(KEY|TOKEN|SECRET|PASSWORD|ENDPOINT|URL)$/.test(match)));
}

function extractEndpoint(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s`,)]+(?:\/(?:mcp|sse|api\/mcp)[^\s`,)]*)?/i);
  return match ? match[0].replace(/[.;:!?]+$/, "") : null;
}

function inferTransport(text: string): CatalogEntry["transport"] {
  const lower = text.toLowerCase();
  const transports: CatalogEntry["transport"] = [];

  if (lower.includes("stdio")) transports.push("stdio");
  if (lower.includes("streamable") || /\bhttp\b/.test(lower)) transports.push("streamable-http");
  if (lower.includes("sse")) transports.push("sse");

  return transports.length > 0 ? transports : ["unknown"];
}

function inferAuth(text: string): CatalogEntry["auth"] {
  const lower = text.toLowerCase();

  if (lower.includes("no api key") || lower.includes("no auth")) return { type: "none", notes: [] };
  if (lower.includes("oauth")) return { type: "oauth", notes: [] };
  if (lower.includes("bearer")) return { type: "bearer", notes: [] };
  if (lower.includes("api key") || lower.includes("api-key") || /\b[A-Z][A-Z0-9_]*API_KEY\b/.test(text)) {
    return { type: "api-key", notes: [] };
  }

  return { type: "unknown", notes: [] };
}

function inferClients(text: string): string[] {
  const clientPatterns: Array<[string, RegExp]> = [
    ["Claude", /\bclaude\b/i],
    ["Cursor", /\bcursor\b/i],
    ["Codex", /\bcodex\b/i],
    ["VS Code", /\bvs\s*code\b|\bvscode\b/i],
  ];

  return clientPatterns.filter(([, pattern]) => pattern.test(text)).map(([client]) => client);
}

function extractToolCount(text: string): number | null {
  const match = text.match(/\b(\d+)\s+(?:mcp\s+)?tools?\b/i);
  return match ? Number(match[1]) : null;
}

function inferLicense(text: string): string {
  const match = text.match(/\b(MIT|Apache-2\.0|AGPL-3\.0|GPL-3\.0|BSD-3-Clause|BSD-2-Clause|ISC)\b/i);
  return match?.[1] ?? "unknown";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
