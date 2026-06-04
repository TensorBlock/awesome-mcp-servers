import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { FormatsPlugin } from "ajv-formats";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { buildCatalogFromMarkdown } from "../src/buildCatalog.js";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;

describe("buildCatalogFromMarkdown", () => {
  it("builds README entries and flags missing docs mirrors", () => {
    const readme = [
      "## 🔎 Search",
      "- [owner/search-mcp](https://github.com/owner/search-mcp): Search tool.",
      "- [Only README](https://github.com/owner/only-readme): Missing mirror.",
    ].join("\n");

    const docs = new Map([
      [
        "docs/search.md",
        [
          "## 🔎 Search",
          "- [owner/search-mcp](https://github.com/owner/search-mcp): Search tool.",
        ].join("\n"),
      ],
    ]);

    const result = buildCatalogFromMarkdown(readme, docs);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.id).toMatch(/^github-owner-search-mcp-[a-f0-9]{8}$/);
    expect(result.entries[0]?.source.docsPath).toBe("docs/search.md");
    expect(result.errors).toEqual([
      {
        code: "missing_docs_mirror",
        message: "Entry is present in README.md but missing from docs/search.md",
        entryId: expect.stringMatching(/^github-owner-only-readme-[a-f0-9]{8}$/),
        sourcePath: "README.md",
        line: 3,
      },
    ]);
  });

  it("flags duplicate URLs", () => {
    const readme = [
      "## 🔎 Search",
      "- [First](https://example.com/mcp): First entry.",
      "- [Second](https://example.com/mcp): Second entry.",
    ].join("\n");

    const result = buildCatalogFromMarkdown(readme, new Map());

    expect(result.errors.some((error) => error.code === "duplicate_url")).toBe(true);
  });

  it("sets source.docsPath to null when a category has no docs mapping", () => {
    const readme = [
      "## Experimental",
      "- [Experimental MCP](https://example.com/experimental-mcp): Experimental server.",
    ].join("\n");

    const result = buildCatalogFromMarkdown(readme, new Map());

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.source.docsPath).toBeNull();
    expect(result.errors).toEqual([]);
  });

  it("infers install, auth, client, tool, and license metadata from descriptions", () => {
    const readme = [
      "## Experimental",
      [
        "- [Metadata MCP](https://example.com/metadata-mcp):",
        "Run `npx metadata-mcp` with API_KEY for OAuth-enabled Claude usage.",
        "Includes 13 tools under MIT license.",
      ].join(" "),
    ].join("\n");

    const result = buildCatalogFromMarkdown(readme, new Map());
    const entry = result.entries[0];

    expect(entry?.install.commands).toEqual(["npx metadata-mcp"]);
    expect(entry?.install.env).toEqual(["API_KEY"]);
    expect(entry?.install.confidence).toBe("medium");
    expect(entry?.auth.type).toBe("oauth");
    expect(entry?.clients).toEqual(["Claude"]);
    expect(entry?.tools).toEqual({
      count: 13,
      names: [],
      source: "self_reported",
    });
    expect(entry?.license).toBe("MIT");
  });

  it("builds entries that validate against the catalog schema", () => {
    const readme = [
      "## Experimental",
      "- [Schema MCP](https://example.com/schema-mcp): Schema-valid server.",
    ].join("\n");
    const schema = JSON.parse(readFileSync("schemas/server.schema.json", "utf8"));
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    const result = buildCatalogFromMarkdown(readme, new Map());

    expect(validate(result.entries[0])).toBe(true);
    expect(validate.errors).toBeNull();
  });
});
