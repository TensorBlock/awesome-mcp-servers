import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderProfile, writeProfiles } from "../src/renderProfiles.js";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";

const createEntry = (overrides: Partial<CatalogEntry> = {}): CatalogEntry => ({
  id: "github-owner-demo",
  name: "owner/demo",
  description: "Demo MCP server.",
  category: "Demo",
  source: {
    readmePath: "README.md",
    docsPath: null,
    featuredInReadme: true,
  },
  links: {
    primary: "https://github.com/owner/demo",
    repo: "https://github.com/owner/demo",
    homepage: null,
    docs: null,
    endpoint: null,
  },
  install: {
    commands: ["npx -y @owner/demo-mcp"],
    env: ["DEMO_API_KEY"],
    confidence: "medium",
  },
  transport: ["stdio"],
  auth: {
    type: "api-key",
    notes: ["Requires DEMO_API_KEY."],
  },
  clients: ["claude"],
  tools: {
    count: null,
    names: [],
    source: "unknown",
  },
  license: "MIT",
  installReady: true,
  verifiedAt: null,
  health: {
    repoPublic: null,
    packageFound: null,
    endpointReachable: null,
    lastCheckedAt: null,
  },
  verification: {
    status: "unknown",
    notes: [],
  },
  community: {
    maintainedBy: [],
    verifiedBy: [],
    claimed: false,
  },
  ...overrides,
});

describe("renderProfile", () => {
  it("renders static profile metadata for a catalog entry", () => {
    const profile = renderProfile(createEntry(), "https://tensorblock.co/mcp/servers");

    expect(profile.id).toBe("github-owner-demo");
    expect(profile.profileUrl).toBe("https://tensorblock.co/mcp/servers/github-owner-demo");
    expect(profile.badgeMarkdown).toBe(
      "[![Indexed on TensorBlock MCP Index](https://mcp-index.tensorblock.co/v1/servers/github-owner-demo/badge.svg)](https://tensorblock.co/mcp/servers/github-owner-demo)"
    );
    expect(profile.install).toEqual({
      commands: ["npx -y @owner/demo-mcp"],
      env: ["DEMO_API_KEY"],
      confidence: "medium",
    });
    expect(profile.transport).toEqual(["stdio"]);
    expect(profile.auth).toEqual({
      type: "api-key",
      notes: ["Requires DEMO_API_KEY."],
    });
    expect(profile.clients).toEqual(["claude"]);
    expect(profile.license).toBe("MIT");
    expect(profile.installReady).toBe(true);
    expect(profile.verifiedAt).toBeNull();
    expect(profile.health).toEqual({
      repoPublic: null,
      packageFound: null,
      endpointReachable: null,
      lastCheckedAt: null,
    });
    expect(profile.summary.installConfidence).toBe("medium");
    expect(profile.summary.installReady).toBe(true);
  });

  it("removes stale profile JSON files when writing current profiles", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "mcp-profiles-"));

    try {
      writeFileSync(join(outputDir, "stale-profile.json"), "{}\n");

      const written = writeProfiles([createEntry()], "https://tensorblock.co/mcp/", outputDir);
      const files = readdirSync(outputDir);

      expect(written).toBe(1);
      expect(files).toEqual(["github-owner-demo.json"]);
      expect(readFileSync(join(outputDir, "github-owner-demo.json"), "utf8")).toMatch(/\n$/);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

describe("incremental profile writes", () => {
  const baseUrl = "https://tensorblock.co/mcp/servers";
  const fixedTime = new Date("2000-01-01T00:00:00Z");

  it("preserves unchanged profile bytes and modification times", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "mcp-profiles-unchanged-"));
    try {
      const entries = [createEntry(), createEntry({ id: "second-server" })];
      writeProfiles(entries, baseUrl, outputDir);
      const before = entries.map(entry => {
        const path = join(outputDir, entry.id + ".json");
        utimesSync(path, fixedTime, fixedTime);
        return readFileSync(path, "utf8");
      });
      expect(writeProfiles(entries, baseUrl, outputDir)).toBe(2);
      entries.forEach((entry, index) => {
        const path = join(outputDir, entry.id + ".json");
        expect(readFileSync(path, "utf8")).toBe(before[index]);
        expect(statSync(path).mtimeMs).toBe(fixedTime.getTime());
      });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("updates changed profiles while retaining unchanged files and removing stale ones", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "mcp-profiles-changed-"));
    try {
      const first = createEntry();
      const second = createEntry({ id: "second-server" });
      writeProfiles([first, second], baseUrl, outputDir);
      const firstPath = join(outputDir, first.id + ".json");
      const secondPath = join(outputDir, second.id + ".json");
      utimesSync(firstPath, fixedTime, fixedTime);
      utimesSync(secondPath, fixedTime, fixedTime);
      writeFileSync(join(outputDir, "stale.json"), "{}\n");
      writeFileSync(join(outputDir, "README.txt"), "keep this file");
      const changed = { ...first, description: "Updated description." };
      expect(writeProfiles([changed, second], baseUrl, outputDir)).toBe(2);
      expect(JSON.parse(readFileSync(firstPath, "utf8")).description).toBe(changed.description);
      expect(statSync(firstPath).mtimeMs).not.toBe(fixedTime.getTime());
      expect(statSync(secondPath).mtimeMs).toBe(fixedTime.getTime());
      expect(readdirSync(outputDir).sort()).toEqual(["README.txt", first.id + ".json", second.id + ".json"].sort());
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("removes obsolete profiles for an empty catalog while retaining non-profile files", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "mcp-profiles-empty-"));
    try {
      writeProfiles([createEntry()], baseUrl, outputDir);
      writeFileSync(join(outputDir, "README.txt"), "keep this file");
      expect(writeProfiles([], baseUrl, outputDir)).toBe(0);
      expect(readdirSync(outputDir)).toEqual(["README.txt"]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
