import { describe, expect, it } from "vitest";
import { parseGitBlamePorcelain } from "../src/sourceMetadata.js";

describe("parseGitBlamePorcelain", () => {
  it("maps blamed source lines to ISO update timestamps", () => {
    const blameOutput = [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 2",
      "author Example",
      "author-mail <example@example.com>",
      "author-time 1781786096",
      "committer Example",
      "committer-mail <example@example.com>",
      "committer-time 1781786096",
      "summary Add tracked entries (#42)",
      "\t## Search",
      "\t- [Tracked MCP](https://github.com/owner/tracked-mcp): Search tool.",
    ].join("\n");

    expect(parseGitBlamePorcelain("docs/search.md", blameOutput)).toEqual(new Map([
      ["docs/search.md:1", { lastUpdatedAt: "2026-06-18T12:34:56.000Z", pullRequest: 42 }],
      ["docs/search.md:2", { lastUpdatedAt: "2026-06-18T12:34:56.000Z", pullRequest: 42 }],
    ]));
  });
});
