import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
    const profile = renderProfile(createEntry(), "https://tensorblock.co/mcp");

    expect(profile.id).toBe("github-owner-demo");
    expect(profile.profileUrl).toBe("https://tensorblock.co/mcp/github-owner-demo");
    expect(profile.badgeMarkdown).toContain("Listed on TensorBlock MCP Index");
    expect(profile.summary.installConfidence).toBe("medium");
  });

  it("removes stale profile JSON files before writing current profiles", () => {
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
