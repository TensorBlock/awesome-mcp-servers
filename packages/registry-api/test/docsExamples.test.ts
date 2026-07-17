import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as CatalogEntry[];
const catalogIds = new Set(catalog.map((entry) => entry.id));

const concreteServerIdsFromDocs = (markdown: string): string[] => {
  const ids = new Set<string>();
  const patterns = [
    /\/v1\/servers\/([^/?#\s)"'`<]+)/g,
    /\/mcp\/servers\/([^/?#\s)"'`<]+)/g,
  ];

  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) {
      const id = match[1];

      if (!id || id.includes("{") || id === "recent" || id === "updated") {
        continue;
      }

      ids.add(id);
    }
  }

  return [...ids].sort();
};

describe("MCP Index API docs examples", () => {
  it("uses concrete server ids that exist in the generated catalog", () => {
    const docs = readFileSync("docs/index-api.md", "utf8");
    const missingIds = concreteServerIdsFromDocs(docs)
      .filter((id) => !catalogIds.has(id));

    expect(missingIds).toEqual([]);
  });
});
