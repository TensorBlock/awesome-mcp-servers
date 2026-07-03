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

test("builds a merged PR follow-up with profile, API, badge, and community links", () => {
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
  assert.match(comment, /https:\/\/mcp-index\.tensorblock\.co\/v1\/servers\/github-cursortouch-windows-mcp-83a6332f/);
  assert.match(comment, /badge\.svg/);
  assert.match(comment, /claim-profile\.yml/);
  assert.match(comment, /improve-metadata\.yml/);
  assert.match(comment, /report-broken-entry\.yml/);
  assert.match(comment, /install-config\?client=claude-desktop/);
  assert.match(comment, /install-config\?client=cursor/);
  assert.match(comment, /install-config\?client=codex/);
  assert.match(comment, /install-config\?client=vscode/);
  assert.match(comment, /discord\.com\/invite/);
  assert.match(comment, /MCP author onboarding/);
  assert.match(comment, /Share this profile/);
  assert.match(comment, /Add the README badge/);
  assert.match(comment, /Missing install, transport, auth, docs, license, or tool metadata\?/);
  assert.match(comment, /Star this repo/);
});
