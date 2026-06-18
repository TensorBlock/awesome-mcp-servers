import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import {
  findServer,
  listCategories,
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

const entry = (overrides: Partial<CatalogEntry>): CatalogEntry => ({
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

  it("normalizes limits", () => {
    expect(normalizeLimit(undefined)).toBe(25);
    expect(normalizeLimit(0)).toBe(25);
    expect(normalizeLimit(101)).toBe(100);
    expect(normalizeLimit(7.8)).toBe(7);
  });
});
