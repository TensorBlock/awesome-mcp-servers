import { describe, expect, it } from "vitest";
import { cleanCategoryHeading, parseMarkdownEntries, slugFromUrl } from "../src/parseMarkdown.js";

describe("cleanCategoryHeading", () => {
  it("removes heading markup and leading emoji or symbols", () => {
    expect(cleanCategoryHeading("## 🔎 Search")).toBe("Search");
    expect(cleanCategoryHeading("### - Security")).toBe("Security");
    expect(cleanCategoryHeading("## ❤️ Healthcare & Life Sciences")).toBe("Healthcare & Life Sciences");
  });
});

describe("parseMarkdownEntries", () => {
  it("parses category entries from README-style markdown", () => {
    const markdown = [
      "# Awesome MCP Servers",
      "",
      "## 🔎 Search",
      "",
      "Servers providing web search capabilities.",
      "",
      "- [owner/search-mcp](https://github.com/owner/search-mcp): Search the web through MCP.",
      "- [Hosted Search](https://example.com/mcp) - Hosted search MCP endpoint.",
      "",
      "## 🔒 Security",
      "",
      "- [owner/security-mcp](https://github.com/owner/security-mcp): Security scanner.",
    ].join("\n");

    const entries = parseMarkdownEntries(markdown, "README.md");

    expect(entries).toEqual([
      {
        category: "Search",
        name: "owner/search-mcp",
        url: "https://github.com/owner/search-mcp",
        description: "Search the web through MCP.",
        sourcePath: "README.md",
        line: 7,
      },
      {
        category: "Search",
        name: "Hosted Search",
        url: "https://example.com/mcp",
        description: "Hosted search MCP endpoint.",
        sourcePath: "README.md",
        line: 8,
      },
      {
        category: "Security",
        name: "owner/security-mcp",
        url: "https://github.com/owner/security-mcp",
        description: "Security scanner.",
        sourcePath: "README.md",
        line: 12,
      },
    ]);
  });

  it("supports colon, hyphen, em dash, and en dash descriptions", () => {
    const markdown = [
      "## 🔎 Search",
      "- [Colon](https://example.com/colon): Colon description.",
      "- [Hyphen](https://example.com/hyphen) - Hyphen description.",
      "- [Em Dash](https://example.com/em) \u2014 Em dash description.",
      "- [En Dash](https://example.com/en) \u2013 En dash description.",
    ].join("\n");

    const entries = parseMarkdownEntries(markdown, "README.md");

    expect(entries.map((entry) => entry.description)).toEqual([
      "Colon description.",
      "Hyphen description.",
      "Em dash description.",
      "En dash description.",
    ]);
  });

  it("ignores non-entry links and malformed bullets", () => {
    const markdown = [
      "## 🔎 Search",
      "- This bullet has no link.",
      "- [No description](https://example.com)",
      "- [Blank description](https://example.com/blank):   ",
      "- [Valid](https://example.com/valid): Valid description.",
    ].join("\n");

    const entries = parseMarkdownEntries(markdown, "README.md");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe("Valid");
  });
});

describe("slugFromUrl", () => {
  it("creates stable GitHub slugs", () => {
    expect(slugFromUrl("https://github.com/Owner/Repo")).toBe("github-owner-repo");
  });

  it("creates stable domain slugs", () => {
    expect(slugFromUrl("https://example.com/mcp/server")).toBe("example-com-mcp-server");
  });
});
