import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { recommendForNeeds, recommendServers, tokenize } from "../src/recommend.js";

interface EntrySpec {
  id: string;
  name: string;
  description: string;
  primary?: string;
  endpoint?: string | null;
  commands?: string[];
  confidence?: CatalogEntry["install"]["confidence"];
  verification?: CatalogEntry["verification"]["status"];
}

const entry = (spec: EntrySpec): CatalogEntry => ({
  id: spec.id,
  name: spec.name,
  description: spec.description,
  category: "Demo",
  source: {
    readmePath: null,
    docsPath: "docs/demo.md",
    featuredInReadme: false,
  },
  links: {
    primary: spec.primary ?? `https://github.com/example/${spec.id}`,
    repo: null,
    homepage: null,
    docs: null,
    endpoint: spec.endpoint === undefined ? `https://${spec.id}.example.net/mcp` : spec.endpoint,
  },
  install: {
    commands: spec.commands ?? [],
    env: [],
    confidence: spec.confidence ?? "medium",
  },
  transport: spec.endpoint === null ? ["stdio"] : ["streamable-http"],
  auth: {
    type: "oauth",
    notes: [],
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
    status: spec.verification ?? "unknown",
    notes: [],
  },
  community: {
    maintainedBy: [],
    verifiedBy: [],
    claimed: false,
  },
});

const catalog: CatalogEntry[] = [
  entry({ id: "slack", name: "Slack", description: "Official Slack server: read channels and send messages.", endpoint: "https://mcp.slack.com/mcp", confidence: "high", verification: "partial" }),
  entry({ id: "github", name: "github/github-mcp-server", description: "Work with repositories, issues and pull requests.", primary: "https://github.com/github/github-mcp-server", confidence: "high", verification: "partial" }),
  entry({ id: "github-two", name: "someone/github-tools", description: "Another GitHub server.", confidence: "low" }),
  entry({ id: "morning", name: "Morning Digest", description: "Posts a morning summary every day." }),
  entry({ id: "registry-id", name: "Seonix (io.github.someone/seonix)", description: "SEO audits for your site." }),
  entry({ id: "exa", name: "exa-labs/exa-mcp-server", description: "Real-time web searches using Exa's API.", confidence: "high", verification: "partial" }),
  entry({ id: "word-match", name: "Helper Kit", description: "Shares words with web search but is unreviewed.", confidence: "low" }),
  entry({ id: "local-only", name: "Slack Desktop Bridge", description: "Slack through a local bridge.", endpoint: null, commands: ["docker run slack/bridge"] }),
  ...Array.from({ length: 20 }, (_, index) => entry({ id: `filler-${index}`, name: `Filler ${index}`, description: "A server for something else entirely." })),
];

describe("recommendServers", () => {
  it("suggests one server per tool the agent names before a second of the same", () => {
    const servers = recommendServers(catalog, {
      text: "Triage new GitHub issues every morning and post a summary to Slack",
    });

    expect(servers.map((server) => server.id).slice(0, 2).sort()).toEqual(["github", "slack"]);
    expect(servers.findIndex((server) => server.id === "github-two")).not.toBe(2);
  });

  it("doesn't suggest a server for sharing everyday words with the description", () => {
    const servers = recommendServers(catalog, {
      text: "Triage new GitHub issues every morning and post a summary to Slack",
    });

    expect(servers.map((server) => server.id)).not.toContain("morning");
  });

  it("doesn't read a registry id in a server's name as the service it works with", () => {
    const servers = recommendServers(catalog, { text: "Review GitHub pull requests" });

    expect(servers.map((server) => server.id)).not.toContain("registry-id");
  });

  it("leaves out servers the cloud can't run unless asked", () => {
    expect(recommendServers(catalog, { text: "slack" }).map((server) => server.id)).not.toContain("local-only");
    expect(recommendServers(catalog, { text: "slack desktop bridge", cloudOnly: false }).map((server) => server.id)).toContain("local-only");
  });

  it("includes the lgr.yaml entry for each suggestion", () => {
    const [slack] = recommendServers(catalog, { text: "Post to Slack" });

    expect(slack.lagrange.mcp).toEqual({ name: "slack", url: "https://mcp.slack.com/mcp" });
    expect(slack.lagrange.signIn).toBe(true);
  });

  it("returns nothing for a description without any tool in it", () => {
    expect(recommendServers(catalog, { text: "please help me with this" })).toEqual([]);
  });
});

describe("recommendForNeeds", () => {
  it("ranks servers separately for each need", () => {
    const groups = recommendForNeeds(catalog, { needs: ["github", "web search"] });

    expect(groups.map((group) => group.need)).toEqual(["github", "web search"]);
    expect(groups[0].servers[0].id).toBe("github");
    expect(groups[1].servers[0].id).toBe("exa");
  });

  it("only counts a reviewed server's description as saying what it does", () => {
    const [webSearch] = recommendForNeeds(catalog, { needs: ["web search"] });

    expect(webSearch.servers.map((server) => server.id)).toEqual(["exa"]);
  });

  it("returns an empty group for a need nothing in the catalog covers", () => {
    expect(recommendForNeeds(catalog, { needs: ["google sheets"] })).toEqual([{ need: "google sheets", servers: [] }]);
  });
});

describe("tokenize", () => {
  it("matches word forms an agent description and a server description use", () => {
    expect(tokenize("searches scraping databases")).toEqual(tokenize("search scrape database"));
  });
});
