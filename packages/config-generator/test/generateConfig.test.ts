import { describe, expect, it } from "vitest";
import { generateClientConfig } from "../src/generateConfig.js";
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
    commands: [],
    env: [],
    confidence: "medium",
  },
  transport: ["stdio"],
  auth: {
    type: "none",
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
  ...overrides,
});

describe("generateClientConfig", () => {
  it("generates Claude Desktop stdio config from install command and env", () => {
    const entry = createEntry({
      install: {
        commands: ["npx -y @owner/demo-mcp"],
        env: ["DEMO_API_KEY"],
        confidence: "medium",
      },
    });

    expect(generateClientConfig(entry, "claude")).toMatchObject({
      serverId: "github-owner-demo",
      client: "claude",
      confidence: "medium",
      config: {
        mcpServers: {
          "github-owner-demo": {
            command: "npx",
            args: ["-y", "@owner/demo-mcp"],
            env: {
              DEMO_API_KEY: "<DEMO_API_KEY>",
            },
          },
        },
      },
    });
  });

  it("generates Cursor-like remote HTTP config from endpoint when no install command exists", () => {
    const entry = createEntry({
      links: {
        primary: "https://github.com/owner/demo",
        repo: "https://github.com/owner/demo",
        homepage: null,
        docs: null,
        endpoint: "https://example.com/mcp",
      },
      install: {
        commands: [],
        env: [],
        confidence: "medium",
      },
      transport: ["streamable-http"],
    });

    expect(generateClientConfig(entry, "cursor")).toMatchObject({
      serverId: "github-owner-demo",
      client: "cursor",
      confidence: "medium",
      config: {
        mcpServers: {
          "github-owner-demo": {
            url: "https://example.com/mcp",
          },
        },
      },
    });
  });

  it("falls back when install commands are setup steps instead of launch commands", () => {
    const entry = createEntry({
      install: {
        commands: [
          "git clone https://github.com/owner/demo.git && cd demo && npm install && npm run build",
        ],
        env: [],
        confidence: "low",
      },
    });

    const config = generateClientConfig(entry, "claude");

    expect(config.config).toEqual({
      mcpServers: {
        "github-owner-demo": {
          command: "<command>",
          args: ["<args>"],
        },
      },
    });
    expect(config.notes).toContain(
      "Install commands look like setup steps; provide the server launch command before use."
    );
  });
});
