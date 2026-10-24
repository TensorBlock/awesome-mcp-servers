import { describe, expect, it } from "vitest";
import { cloudRuntime, generateLagrangeConfig } from "../src/generateLagrangeConfig.js";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";

type EntryOverrides = Partial<Omit<CatalogEntry, "links" | "install" | "auth">> & {
  links?: Partial<CatalogEntry["links"]>;
  install?: Partial<CatalogEntry["install"]>;
  auth?: Partial<CatalogEntry["auth"]>;
};

const createEntry = (overrides: EntryOverrides = {}): CatalogEntry => ({
  id: "github-owner-demo-12345678",
  name: "owner/Demo Server",
  description: "Demo MCP server.",
  category: "Demo",
  source: {
    readmePath: null,
    docsPath: "docs/demo.md",
    featuredInReadme: false,
  },
  clients: [],
  tools: {
    count: null,
    names: [],
    source: "unknown",
  },
  license: "unknown",
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
  transport: ["stdio"],
  ...overrides,
  links: {
    primary: "https://github.com/owner/demo",
    repo: "https://github.com/owner/demo",
    homepage: null,
    docs: null,
    endpoint: null,
    ...overrides.links,
  },
  install: {
    commands: [],
    env: [],
    confidence: "high",
    ...overrides.install,
  },
  auth: {
    type: "none",
    notes: [],
    ...overrides.auth,
  },
});

describe("cloudRuntime", () => {
  it("prefers a hosted endpoint over a package the sandbox would have to start", () => {
    const entry = createEntry({
      transport: ["streamable-http", "stdio"],
      links: { endpoint: "https://mcp.example.com/mcp" },
      install: { commands: ["npx -y demo-mcp"] },
    });

    expect(cloudRuntime(entry)).toEqual({ kind: "remote", url: "https://mcp.example.com/mcp" });
  });

  it("ignores an endpoint the cloud can't reach", () => {
    const entry = createEntry({
      transport: ["streamable-http"],
      links: { endpoint: "http://localhost:3000/mcp" },
    });

    expect(cloudRuntime(entry)).toBeNull();
  });

  it("adds -y to npx so the sandbox doesn't wait on an install prompt", () => {
    const entry = createEntry({ install: { commands: ["npx demo-mcp --stdio"] } });

    expect(cloudRuntime(entry)).toEqual({ kind: "command", command: "npx", args: ["-y", "demo-mcp", "--stdio"] });
  });

  it.each([
    "docker run -i --rm demo/mcp",
    "node /Users/me/demo/build/index.js",
    "git clone https://github.com/owner/demo && npm start",
  ])("can't run %s in the cloud", (command) => {
    expect(cloudRuntime(createEntry({ install: { commands: [command] } }))).toBeNull();
  });
});

describe("generateLagrangeConfig", () => {
  it("stores a hosted server's bearer token as a secret", () => {
    const entry = createEntry({
      transport: ["streamable-http"],
      links: { endpoint: "https://mcp.example.com/mcp" },
      auth: { type: "bearer" },
    });

    expect(generateLagrangeConfig(entry)).toMatchObject({
      client: "lagrange",
      cloudReady: true,
      mcp: { name: "demo-server", url: "https://mcp.example.com/mcp", secret: "DEMO_SERVER_TOKEN" },
      secrets: ["DEMO_SERVER_TOKEN"],
      signIn: false,
    });
  });

  it("names the token secret after the vendor's own variable when the catalog has one", () => {
    const entry = createEntry({
      transport: ["streamable-http"],
      links: { endpoint: "https://mcp.example.com/mcp" },
      auth: { type: "bearer" },
      install: { env: ["DEMO_PERSONAL_ACCESS_TOKEN"] },
    });

    expect(generateLagrangeConfig(entry).mcp).toEqual({
      name: "demo-server",
      url: "https://mcp.example.com/mcp",
      secret: "DEMO_PERSONAL_ACCESS_TOKEN",
    });
  });

  it("leaves an OAuth server's sign-in to the agent's page", () => {
    const entry = createEntry({
      transport: ["streamable-http"],
      links: { endpoint: "https://mcp.example.com/mcp" },
      auth: { type: "oauth" },
    });

    const config = generateLagrangeConfig(entry);

    expect(config.mcp).toEqual({ name: "demo-server", url: "https://mcp.example.com/mcp", secret: "DEMO_SERVER_TOKEN", oauth: true });
    expect(config.secrets).toEqual([]);
    expect(config.signIn).toBe(true);
  });

  it("passes a package's environment variables through as secrets", () => {
    const entry = createEntry({
      install: { commands: ["uvx demo-mcp"], env: ["DEMO_API_KEY", "DEMO_REGION"] },
    });

    expect(generateLagrangeConfig(entry)).toMatchObject({
      mcp: {
        name: "demo-server",
        command: "uvx",
        args: ["demo-mcp"],
        env: { DEMO_API_KEY: "${DEMO_API_KEY}", DEMO_REGION: "${DEMO_REGION}" },
      },
      secrets: ["DEMO_API_KEY", "DEMO_REGION"],
    });
  });

  it("says why a server can't join a cloud agent", () => {
    const config = generateLagrangeConfig(createEntry({ install: { commands: ["docker run demo/mcp"] } }));

    expect(config.cloudReady).toBe(false);
    expect(config.mcp).toBeNull();
    expect(config.notes[0]).toContain("can't start this server");
  });
});
