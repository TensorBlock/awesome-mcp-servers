import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORY_TO_DOCS_PATH } from "../src/category-map.js";
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

  it("parses entries with extra markdown links before the separator", () => {
    const markdown = [
      "## 💰 Finance & Crypto",
      "- [HCS412/ventureautomated](https://github.com/HCS412/ventureautomated) [glama](https://glama.ai/mcp/connectors/io.github.HCS412/ventureautomated-omnis): Remote venture intelligence MCP for autonomous agents.",
    ].join("\n");

    const entries = parseMarkdownEntries(markdown, "README.md");

    expect(entries).toEqual([
      {
        category: "Finance & Crypto",
        name: "HCS412/ventureautomated",
        url: "https://github.com/HCS412/ventureautomated",
        description: "Remote venture intelligence MCP for autonomous agents.",
        sourcePath: "README.md",
        line: 2,
      },
    ]);
  });

  it("parses entries with status icons before the separator", () => {
    const markdown = [
      "## 💰 Finance & Crypto",
      "- [hive-intel/hive-crypto-mcp](https://github.com/hive-intel/hive-crypto-mcp) 🎖️ 📇 ☁️ 🏠 - Institutional-grade crypto market infrastructure for AI.",
    ].join("\n");

    const entries = parseMarkdownEntries(markdown, "README.md");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.description).toBe("Institutional-grade crypto market infrastructure for AI.");
  });

  it("parses entries with status badges before the separator", () => {
    const markdown = [
      "## 🔎 Search",
      "- [Badge Server](https://example.com/badge) [![Status](https://example.com/status.svg)](https://example.com/status) - Badge-backed MCP server.",
    ].join("\n");

    const entries = parseMarkdownEntries(markdown, "README.md");

    expect(entries).toHaveLength(1);
    expect(entries[0]?.description).toBe("Badge-backed MCP server.");
  });

  it("parses entries with whitespace description fallback", () => {
    const markdown = [
      "## 🛠️ Developer Productivity & Utilities",
      "- [Kiln-AI](https://github.com/Kiln-AI/Kiln) Kiln is a free tool for building production-ready AI systems.",
    ].join("\n");

    const entries = parseMarkdownEntries(markdown, "README.md");

    expect(entries).toEqual([
      {
        category: "Developer Productivity & Utilities",
        name: "Kiln-AI",
        url: "https://github.com/Kiln-AI/Kiln",
        description: "Kiln is a free tool for building production-ready AI systems.",
        sourcePath: "README.md",
        line: 2,
      },
    ]);
  });
});

describe("slugFromUrl", () => {
  it("creates stable hash-suffixed GitHub slugs", () => {
    const slug = slugFromUrl("https://github.com/Owner/Repo");

    expect(slug).toMatch(/^github-owner-repo-[a-f0-9]{8}$/);
    expect(slugFromUrl("https://github.com/Owner/Repo")).toBe(slug);
  });

  it("creates stable hash-suffixed domain slugs", () => {
    expect(slugFromUrl("https://example.com/mcp/server")).toMatch(/^example-com-mcp-server-[a-f0-9]{8}$/);
  });

  it("does not collide when normalized readable slugs match", () => {
    const first = slugFromUrl("https://github.com/besthand/mcp-server-taiwan-aqi");
    const second = slugFromUrl("https://github.com/besthand/mcp-server-taiwan-aqi--");

    expect(first).toMatch(/^github-besthand-mcp-server-taiwan-aqi-[a-f0-9]{8}$/);
    expect(second).toMatch(/^github-besthand-mcp-server-taiwan-aqi-[a-f0-9]{8}$/);
    expect(first).not.toBe(second);
  });
});

describe("CATEGORY_TO_DOCS_PATH", () => {
  it("maps every README category heading to an existing docs file", () => {
    const readme = readFileSync("README.md", "utf8");
    const lines = readme.split(/\r?\n/);
    const startIndex = lines.findIndex((line) => line === "## Server Categories");
    const categories = lines
      .slice(startIndex + 1)
      .filter((line) => /^##\s+/.test(line))
      .map(cleanCategoryHeading);

    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(categories).toHaveLength(Object.keys(CATEGORY_TO_DOCS_PATH).length);
    expect(categories.filter((category) => !CATEGORY_TO_DOCS_PATH[category])).toEqual([]);
    expect(Object.values(CATEGORY_TO_DOCS_PATH).filter((docsPath) => !existsSync(docsPath))).toEqual([]);
  });
});
