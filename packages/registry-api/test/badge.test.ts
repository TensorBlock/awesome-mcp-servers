import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { badgeImageUrl, badgeMarkdown, renderBadgeSvg } from "../src/badge.js";

const entry: CatalogEntry = {
  id: "unsafe-demo",
  name: "Unsafe <Demo>",
  description: "Demo.",
  category: "Utilities & Helpers",
  source: {
    readmePath: null,
    docsPath: "docs/utilities--helpers.md",
    featuredInReadme: false,
  },
  links: {
    primary: "https://github.com/example/unsafe-demo",
    repo: "https://github.com/example/unsafe-demo",
    homepage: null,
    docs: null,
    endpoint: null,
  },
  install: {
    commands: ["npx unsafe-demo"],
    env: [],
    confidence: "medium",
  },
  transport: ["stdio"],
  auth: {
    type: "unknown",
    notes: [],
  },
  clients: [],
  tools: {
    count: null,
    names: [],
    source: "unknown",
  },
  license: "unknown",
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
};

describe("badge helpers", () => {
  it("renders a branded SVG badge and escapes server names", () => {
    const svg = renderBadgeSvg(entry);

    expect(svg).toContain("TensorBlock");
    expect(svg).toContain("MCP Indexed");
    expect(svg).toContain("Unsafe &lt;Demo&gt;");
    expect(svg).not.toContain("Unsafe <Demo>");
  });

  it("builds copy-ready badge markdown", () => {
    expect(badgeImageUrl(entry.id)).toBe("https://mcp-index.tensorblock.co/v1/servers/unsafe-demo/badge.svg");
    expect(badgeMarkdown(entry, "https://example.com/profile")).toBe(
      "[![Indexed on TensorBlock MCP Index](https://mcp-index.tensorblock.co/v1/servers/unsafe-demo/badge.svg)](https://example.com/profile)"
    );
  });
});
