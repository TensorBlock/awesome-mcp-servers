import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { renderServerProfilePage } from "../src/profilePage.js";

const entry: CatalogEntry = {
  id: "unsafe-demo",
  name: "Unsafe <Demo>",
  description: "Server with \"quoted\" metadata and <script>alert(1)</script>.",
  category: "Utilities & Helpers",
  source: {
    readmePath: null,
    docsPath: "docs/utilities--helpers.md",
    featuredInReadme: false,
  },
  links: {
    primary: "https://github.com/example/unsafe-demo",
    repo: "javascript:alert(1)",
    homepage: null,
    docs: null,
    endpoint: null,
  },
  install: {
    commands: ["npx unsafe-demo"],
    env: ["API_KEY"],
    confidence: "medium",
  },
  transport: ["stdio"],
  auth: {
    type: "api-key",
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

describe("renderServerProfilePage", () => {
  it("escapes text and blocks unsafe links", () => {
    const html = renderServerProfilePage(entry);

    expect(html).toContain("Unsafe &lt;Demo&gt;");
    expect(html).toContain("&quot;quoted&quot;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:alert");
    expect(html).toContain('href="#"');
  });
});
