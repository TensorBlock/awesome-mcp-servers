import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { badgeImageUrl, badgeMarkdown, renderBadgeSvg, renderMissingServerBadgeSvg } from "../src/badge.js";

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

  it("matches the 20px badge geometry README rows expect", () => {
    const svg = renderBadgeSvg(entry);

    // Standard badge height and corner radius, so the badge sits level with
    // the shields.io badges it shares a line with.
    expect(svg).toContain('height="20"');
    expect(svg).toContain('rx="3"');
    expect(svg).toContain('viewBox="0 0 187 20"');
  });

  it("keeps both halves opaque and pins label widths", () => {
    const svg = renderBadgeSvg(entry);

    // An opaque value block reads on light and dark README backgrounds alike.
    expect(svg).toContain('fill="#0c0a09"');
    expect(svg).toContain('fill="#b5b09b"');
    // textLength keeps text inside its block whatever font the viewer resolves.
    expect(svg).toContain('textLength="66"');
    expect(svg).toContain('textLength="69"');
    expect(svg).not.toContain("stroke=\"#e6e3db\"");
  });

  it("builds copy-ready badge markdown", () => {
    expect(badgeImageUrl(entry.id)).toBe("https://mcp-index.tensorblock.co/v1/servers/unsafe-demo/badge.svg");
    expect(badgeMarkdown(entry, "https://example.com/profile")).toBe(
      "[![Indexed on TensorBlock MCP Index](https://mcp-index.tensorblock.co/v1/servers/unsafe-demo/badge.svg)](https://example.com/profile)"
    );
  });

  it("renders a non-broken fallback badge for unresolved server ids", () => {
    const svg = renderMissingServerBadgeSvg("unsafe <missing>");

    expect(svg).toContain("TensorBlock");
    expect(svg).toContain("MCP Profile");
    expect(svg).toContain("unsafe &lt;missing&gt; was not resolved in TensorBlock MCP Index");
    expect(svg).not.toContain("unsafe <missing>");
  });
});
