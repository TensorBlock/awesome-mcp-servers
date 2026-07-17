import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMergedPrComment,
  extractAddedCatalogEntries,
  parseAddedMarkdownEntry,
  slugFromUrl,
} from "./comment-merged-pr.mjs";

test("extracts added docs catalog entries from pull request files", () => {
  const entries = extractAddedCatalogEntries([
    {
      filename: "docs/search.md",
      patch: [
        "@@ -1,2 +1,3 @@",
        " ## Search",
        "+- [Example Search](https://github.com/example/search-mcp): Search MCP server for agents.",
        "+not a markdown entry",
      ].join("\n"),
    },
    {
      filename: "README.md",
      patch: "+- [Ignored](https://github.com/example/ignored): README entries are ignored.",
    },
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "Example Search");
  assert.equal(entries[0].url, "https://github.com/example/search-mcp");
  assert.equal(entries[0].sourcePath, "docs/search.md");
});

test("also supports gh JSON file path shape", () => {
  const entries = extractAddedCatalogEntries([
    {
      path: "docs/databases.md",
      patch: "+- [Database MCP](https://github.com/example/db-mcp): Database MCP server.",
    },
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourcePath, "docs/databases.md");
});

test("parses markdown entries with colon or dash separators", () => {
  assert.deepEqual(
    parseAddedMarkdownEntry("+- [One](https://example.com/mcp): Example server."),
    {
      id: slugFromUrl("https://example.com/mcp"),
      name: "One",
      url: "https://example.com/mcp",
      description: "Example server.",
    },
  );

  assert.equal(
    parseAddedMarkdownEntry("+- [Two](https://example.com/two) - Another server.")?.description,
    "Another server.",
  );
});

test("uses the same stable slug format as catalog profiles", () => {
  assert.equal(
    slugFromUrl("https://github.com/CursorTouch/Windows-MCP"),
    "github-cursortouch-windows-mcp-83a6332f",
  );
});

test("builds a concise merged PR follow-up with profile and repository links", () => {
  const entries = extractAddedCatalogEntries([
    {
      path: "docs/operating-system--command-line.md",
      patch: "+- [CursorTouch/Windows-MCP](https://github.com/CursorTouch/Windows-MCP): Windows automation MCP server.",
    },
  ]);
  const comment = buildMergedPrComment({
    pullRequest: { number: 726 },
    entries,
  });

  assert.match(comment, /tensorblock-mcp-merge-follow-up:v1/);
  assert.match(comment, /https:\/\/tensorblock\.co\/mcp\/servers\/github-cursortouch-windows-mcp-83a6332f/);
  assert.match(comment, /Each profile includes install configs, a shareable badge, and options to claim or improve metadata\./);
  assert.match(comment, /consider starring the repo/);
  assert.doesNotMatch(comment, /mcp-index\.tensorblock\.co/);
  assert.doesNotMatch(comment, /badge\.svg/);
  assert.doesNotMatch(comment, /claim-profile\.yml/);
  assert.doesNotMatch(comment, /improve-metadata\.yml/);
  assert.doesNotMatch(comment, /report-broken-entry\.yml/);
  assert.doesNotMatch(comment, /install-config\?client=/);
  assert.doesNotMatch(comment, /discord\.com\/invite/);
  assert.doesNotMatch(comment, /MCP author onboarding/);
});
