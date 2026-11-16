import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const loader = createRequire(import.meta.url).resolve("tsx");
const entry = "- [Demo](https://example.com/demo): Search server.";

const runBuild = (readme: string, docs: string) => {
  const cwd = mkdtempSync(join(tmpdir(), "catalog-cli-"));
  try {
    mkdirSync(join(cwd, "docs"));
    writeFileSync(join(cwd, "README.md"), readme);
    writeFileSync(join(cwd, "docs/search.md"), docs);
    const result = spawnSync(process.execPath, ["--import", loader, cli], {
      cwd, encoding: "utf8", timeout: 10000,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    return {
      status: result.status,
      stdout: result.stdout,
      entries: JSON.parse(readFileSync(join(cwd, "data/catalog.json"), "utf8")),
      errors: JSON.parse(readFileSync(join(cwd, "data/catalog-errors.json"), "utf8")) as Array<{ code: string }>,
    };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
};

describe("catalog build exit status", () => {
  it.each([
    ["duplicate_url", "", "## Search\n" + entry + "\n" + entry],
    ["parse_error", "", "## Search\n- [Broken](not-a-url): Invalid URL."],
    ["missing_docs_mirror", "## Search\n" + entry, "## Search\n"],
  ])("fails the process while preserving %s diagnostics", (code, readme, docs) => {
    const result = runBuild(readme, docs);
    expect(result.errors.some(error => error.code === code)).toBe(true);
    expect(result.stdout).toContain("Catalog errors: 1");
    expect(result.status).toBe(1);
  });

  it("succeeds for a valid README and category mirror", () => {
    const markdown = "## Search\n" + entry;
    const result = runBuild(markdown, markdown);
    expect(result.status).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
  });

  it("allows an empty catalog without inventing build errors", () => {
    const result = runBuild("# Empty catalog", "## Search");
    expect(result.status).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([]);
  });
});
