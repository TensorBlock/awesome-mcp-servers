import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { catalogPath, getServerProfile, searchServers } from "../src/server.js";

const createEntry = (overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: "shopify-analytics",
  name: "Shopify Analytics",
  description: "MCP server for Shopify analytics, Stripe revenue, and store reporting.",
  category: "E-commerce analytics",
  source: {
    readmePath: "README.md",
    docsPath: "docs/shopify-analytics.md",
    featuredInReadme: true,
  },
  links: {
    primary: "https://example.com/shopify-analytics",
    repo: "https://github.com/example/shopify-analytics",
  },
  install: {
    commands: ["npx shopify-analytics-mcp"],
    env: ["SHOPIFY_TOKEN", "STRIPE_API_KEY"],
    confidence: "high",
  },
  transport: ["stdio"],
  auth: {
    type: "api-key",
    notes: ["Requires Shopify and Stripe API keys."],
  },
  clients: ["claude", "cursor", "codex", "vscode"],
  tools: {
    count: 2,
    names: ["query_shopify", "query_stripe"],
    source: "self_reported",
  },
  license: "MIT",
  health: {
    repoPublic: true,
    packageFound: true,
    endpointReachable: null,
    lastCheckedAt: null,
  },
  verification: {
    status: "self_reported",
    notes: [],
  },
  community: {
    maintainedBy: ["Example"],
    verifiedBy: [],
    claimed: false,
  },
  ...overrides,
});

const catalog: CatalogEntry[] = [
  createEntry({
    id: "generic-stripe",
    name: "Stripe Billing",
    description: "Stripe billing MCP server for invoices.",
    category: "Payments",
  }),
  createEntry(),
  createEntry({
    id: "shopify-storefront",
    name: "Shopify Storefront",
    description: "Storefront operations for Shopify stores.",
    category: "E-commerce",
  }),
];

describe("registry MCP server helpers", () => {
  it("returns shopify-analytics first when searching for shopify stripe", () => {
    expect(searchServers(catalog, "shopify stripe")[0]?.id).toBe(
      "shopify-analytics"
    );
  });

  it("prioritizes entries matching all query terms", () => {
    const results = searchServers(
      [
        createEntry({
          id: "shopify-only",
          name: "Shopify Storefront",
          description: "Shopify storefront operations.",
        }),
        createEntry({
          id: "stripe-only",
          name: "Stripe Billing",
          description: "Stripe billing operations.",
        }),
        createEntry(),
      ],
      "shopify stripe"
    );

    expect(results[0]?.id).toBe("shopify-analytics");
  });

  it("returns a server profile by id", () => {
    expect(getServerProfile(catalog, "shopify-analytics")?.name).toBe(
      "Shopify Analytics"
    );
  });

  it("resolves the catalog path independent of process cwd", () => {
    expect(catalogPath()).toMatch(/data\/catalog\.json$/);
    expect(existsSync(catalogPath())).toBe(true);
  });
});
