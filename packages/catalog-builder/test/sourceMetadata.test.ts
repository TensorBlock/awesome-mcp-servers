import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGitBlamePorcelain, readGitLineMetadata } from "../src/sourceMetadata.js";

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

describe("source metadata from large category files", () => {
  it("retains every line when real git blame exceeds the default output buffer", () => {
    const cwd = mkdtempSync(join(tmpdir(), "catalog-large-blame-"));
    const path = "docs/large category.md";
    const lines = Array.from({ length: 2048 }, (_, index) =>
      `- [Server ${index}](https://example.com/server-${index}): ${"Search metadata. ".repeat(32)}`);
    const git = (args: string[]) => execFileSync("git", args, {
      cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_AUTHOR_DATE: "2026-06-18T12:34:56Z", GIT_COMMITTER_DATE: "2026-06-18T12:34:56Z" },
    });
    try {
      git(["init", "--quiet"]);
      mkdirSync(join(cwd, "docs"));
      writeFileSync(join(cwd, path), `${lines.join("\n")}\n`);
      git(["add", "--", path]);
      git(["-c", "user.name=Catalog Test", "-c", "user.email=catalog@example.com", "-c", "commit.gpgsign=false",
        "commit", "--quiet", "-m", "Add large category (#42)"]);
      const blame = execFileSync("git", ["blame", "--line-porcelain", "--", path], {
        cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
      });
      expect(Buffer.byteLength(blame)).toBeGreaterThan(1024 * 1024);

      const metadata = readGitLineMetadata([path], cwd);
      expect(metadata.size).toBe(lines.length);
      for (let line = 1; line <= lines.length; line += 1) {
        expect(metadata.get(`${path}:${line}`)).toEqual({
          lastUpdatedAt: "2026-06-18T12:34:56.000Z", pullRequest: 42,
        });
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("keeps metadata optional outside a git checkout", () => {
    const cwd = mkdtempSync(join(tmpdir(), "catalog-without-git-"));
    try {
      expect(readGitLineMetadata(["missing.md"], cwd)).toEqual(new Map());
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
