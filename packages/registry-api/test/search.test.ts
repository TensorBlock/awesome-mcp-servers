import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import {
  findServer,
  listCategories,
  listRecentServers,
  listUpdatedServers,
  normalizeLimit,
  searchCatalog,
  summarizeServer,
} from "../src/search.js";

const baseEntry: CatalogEntry = {
  id: "base",
  name: "Base",
  description: "Base server",
  category: "Utilities & Helpers",
  source: {
    readmePath: null,
    docsPath: "docs/utilities--helpers.md",
    featuredInReadme: false,
  },
  links: {
    primary: "https://example.com/base",
    repo: null,
    homepage: "https://example.com/base",
    docs: null,
    endpoint: null,
  },
  install: {
    commands: [],
    env: [],
    confidence: "low",
  },
  transport: ["unknown"],
  auth: {
    type: "unknown",
    notes: [],
  },
  clients: [],
  tools: {
    count: null,
    names: [],
    source: "unknown",
  },
  license: "unknown",
  installReady: false,
  verifiedAt: null,
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

type EntryOverrides = Partial<Omit<
  CatalogEntry,
  "source" | "links" | "install" | "auth" | "tools" | "health" | "verification" | "community"
>> & {
  source?: Partial<CatalogEntry["source"]>;
  links?: Partial<CatalogEntry["links"]>;
  install?: Partial<CatalogEntry["install"]>;
  auth?: Partial<CatalogEntry["auth"]>;
  tools?: Partial<CatalogEntry["tools"]>;
  health?: Partial<CatalogEntry["health"]>;
  verification?: Partial<CatalogEntry["verification"]>;
  community?: Partial<CatalogEntry["community"]>;
};

const entry = (overrides: EntryOverrides): CatalogEntry => ({
  ...baseEntry,
  ...overrides,
  source: {
    ...baseEntry.source,
    ...overrides.source,
  },
  links: {
    ...baseEntry.links,
    ...overrides.links,
  },
  install: {
    ...baseEntry.install,
    ...overrides.install,
  },
  auth: {
    ...baseEntry.auth,
    ...overrides.auth,
  },
  tools: {
    ...baseEntry.tools,
    ...overrides.tools,
  },
  health: {
    ...baseEntry.health,
    ...overrides.health,
  },
  verification: {
    ...baseEntry.verification,
    ...overrides.verification,
  },
  community: {
    ...baseEntry.community,
    ...overrides.community,
  },
});

const catalog: CatalogEntry[] = [
  entry({
    id: "postgres-mcp",
    name: "Postgres MCP",
    description: "Query PostgreSQL databases from agents.",
    category: "Databases",
    transport: ["stdio"],
    auth: {
      type: "api-key",
      notes: [],
    },
    install: {
      commands: ["npx postgres-mcp"],
      env: ["DATABASE_URL"],
      confidence: "high",
    },
    links: {
      primary: "https://github.com/example/postgres-mcp",
      repo: "https://github.com/example/postgres-mcp",
    },
  }),
  entry({
    id: "browser-tools",
    name: "Browser Tools",
    description: "Automate browser workflows and screenshots.",
    category: "Browser Automation & Web Scraping",
    transport: ["streamable-http"],
    auth: {
      type: "none",
      notes: [],
    },
    links: {
      primary: "https://browser.example.com",
      endpoint: "https://browser.example.com/mcp",
    },
  }),
];

describe("searchCatalog", () => {
  it("ranks matching entries and returns summaries", () => {
    const results = searchCatalog(catalog, { query: "postgres", limit: 10 });

    expect(results).toEqual([summarizeServer(catalog[0])]);
    expect(results[0].profilePath).toBe("/v1/servers/postgres-mcp");
    expect(results[0].webProfilePath).toBe("https://tensorblock.co/mcp/servers/postgres-mcp");
  });

  it("filters by category, transport, and auth", () => {
    expect(searchCatalog(catalog, {
      category: "Browser Automation & Web Scraping",
      transport: "streamable-http",
      auth: "none",
    })).toEqual([summarizeServer(catalog[1])]);
  });

  it("returns sorted entries when no query is provided", () => {
    expect(searchCatalog(catalog, {}).map((server) => server.id)).toEqual([
      "browser-tools",
      "postgres-mcp",
    ]);
  });
});

describe("catalog helpers", () => {
  it("lists category counts", () => {
    expect(listCategories(catalog)).toEqual([
      {
        name: "Browser Automation & Web Scraping",
        count: 1,
        path: "docs/utilities--helpers.md",
      },
      {
        name: "Databases",
        count: 1,
        path: "docs/utilities--helpers.md",
      },
    ]);
  });

  it("finds servers by id", () => {
    expect(findServer(catalog, "postgres-mcp")?.name).toBe("Postgres MCP");
    expect(findServer(catalog, "missing")).toBeNull();
  });

  it("finds a unique hashed GitHub server by stable alias keys", () => {
    const hashedCatalog = [
      entry({
        id: "github-owner-alpha-server-1234abcd",
        name: "owner/alpha-server",
        links: {
          primary: "https://github.com/owner/alpha-server",
          repo: "https://github.com/owner/alpha-server",
        },
      }),
      entry({
        id: "github-owner-beta-server-5678abcd",
        name: "owner/beta-server",
        links: {
          primary: "https://github.com/owner/beta-server",
          repo: "https://github.com/owner/beta-server",
        },
      }),
    ];

    expect(findServer(hashedCatalog, "github-owner-alpha-server")?.id).toBe("github-owner-alpha-server-1234abcd");
    expect(findServer(hashedCatalog, "owner-alpha-server")?.id).toBe("github-owner-alpha-server-1234abcd");
    expect(findServer(hashedCatalog, "alpha-server")?.id).toBe("github-owner-alpha-server-1234abcd");
  });

  it("does not resolve ambiguous short aliases", () => {
    const ambiguousCatalog = [
      entry({
        id: "github-first-postgres-mcp-1234abcd",
        name: "first/postgres-mcp",
        links: {
          primary: "https://github.com/first/postgres-mcp",
          repo: "https://github.com/first/postgres-mcp",
        },
      }),
      entry({
        id: "github-second-postgres-mcp-5678abcd",
        name: "second/postgres-mcp",
        links: {
          primary: "https://github.com/second/postgres-mcp",
          repo: "https://github.com/second/postgres-mcp",
        },
      }),
    ];

    expect(findServer(ambiguousCatalog, "postgres-mcp")).toBeNull();
  });

  it("normalizes limits", () => {
    expect(normalizeLimit(undefined)).toBe(25);
    expect(normalizeLimit(0)).toBe(25);
    expect(normalizeLimit(101)).toBe(100);
    expect(normalizeLimit(7.8)).toBe(7);
  });

  it("lists recent servers by update timestamp before pull request fallback", () => {
    const timelineCatalog = [
      entry({
        id: "older-pr",
        name: "Older PR",
        source: {
          pullRequest: 14,
          lastUpdatedAt: "2026-06-18T10:00:00.000Z",
        },
      }),
      entry({
        id: "newer-pr",
        name: "Newer PR",
        source: {
          pullRequest: 42,
          lastUpdatedAt: "2026-06-01T10:00:00.000Z",
        },
      }),
      entry({
        id: "timestamp-only",
        name: "Timestamp Only",
        source: {
          lastUpdatedAt: "2026-06-20T10:00:00.000Z",
        },
      }),
    ];

    expect(listRecentServers(timelineCatalog, 3).map((server) => server.id)).toEqual([
      "timestamp-only",
      "older-pr",
      "newer-pr",
    ]);
    expect(listRecentServers(timelineCatalog, 1)[0]).toMatchObject({
      id: "timestamp-only",
      sourcePullRequest: null,
      lastUpdatedAt: "2026-06-20T10:00:00.000Z",
    });
  });

  it("lists updated servers by last updated timestamp", () => {
    const timelineCatalog = [
      entry({
        id: "older",
        name: "Older",
        source: {
          lastUpdatedAt: "2026-06-01T10:00:00.000Z",
        },
      }),
      entry({
        id: "newer",
        name: "Newer",
        source: {
          lastUpdatedAt: "2026-06-20T10:00:00.000Z",
        },
      }),
      entry({
        id: "unknown-time",
        name: "Unknown Time",
      }),
    ];

    expect(listUpdatedServers(timelineCatalog, 3).map((server) => server.id)).toEqual([
      "newer",
      "older",
      "unknown-time",
    ]);
    expect(listUpdatedServers(timelineCatalog, 1)[0]).toMatchObject({
      id: "newer",
      lastUpdatedAt: "2026-06-20T10:00:00.000Z",
      sourcePullRequest: null,
    });
  });
});

describe("bounded search result ordering", () => {
  const entries = Array.from({ length: 480 }, (_, index) => entry({
    id: `entry-${index}`,
    name: `MCP ${String(479 - index).padStart(3, "0")}`,
    category: `Category ${index % 5}`,
    description: index % 3 === 0 ? "MCP helper" : "Useful helper",
    transport: [index % 2 === 0 ? "stdio" : "sse"],
    auth: { type: index % 4 === 0 ? "none" : "api-key" },
  }));
  const byCategoryAndName = (left: CatalogEntry, right: CatalogEntry) =>
    left.category.localeCompare(right.category) || left.name.localeCompare(right.name);

  it.each([[1, 1], [2, 2], [5, 5], [25, 25], [100, 100], [150, 100], [0, 25], [-3, 25], [NaN, 25], [Infinity, 100]])(
    "preserves alphabetic and scored ordering with limit %s",
    (limit, expectedCount) => {
      const originalIds = entries.map(({ id }) => id);
      const alphabetic = [...entries].sort(byCategoryAndName);
      const scored = [...entries].sort((left, right) =>
        Number(right.description.includes("MCP")) - Number(left.description.includes("MCP"))
        || byCategoryAndName(left, right));
      expect(searchCatalog(entries, { limit })).toEqual(alphabetic.slice(0, expectedCount).map(summarizeServer));
      expect(searchCatalog(entries, { query: "mcp", limit })).toEqual(scored.slice(0, expectedCount).map(summarizeServer));
      expect(entries.map(({ id }) => id)).toEqual(originalIds);
    },
  );

  it.each([1, 25, 100])("retains the original order for exact ties at limit %s", (limit) => {
    const tied = Array.from({ length: 260 }, (_, index) => entry({ id: `tied-${index}` }));
    expect(searchCatalog(tied, { limit }).map(({ id }) => id)).toEqual(tied.slice(0, limit).map(({ id }) => id));
    expect(searchCatalog(tied, { query: "base", limit }).map(({ id }) => id)).toEqual(tied.slice(0, limit).map(({ id }) => id));
  });

  it("applies filters before retaining the highest-ranked entries", () => {
    const expected = entries.filter((value) => value.transport.includes("stdio") && value.auth.type === "none")
      .sort((left, right) => Number(right.description.includes("MCP")) - Number(left.description.includes("MCP"))
        || byCategoryAndName(left, right));
    expect(searchCatalog(entries, { query: "mcp", transport: "stdio", auth: "none", limit: 25 }))
      .toEqual(expected.slice(0, 25).map(summarizeServer));
    expect(searchCatalog(entries, { category: "absent", limit: 1 })).toEqual([]);
    expect(searchCatalog(entries, { query: "unmatched-term", limit: 1 })).toEqual([]);
  });
});
