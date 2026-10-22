import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { HealthMonitor, npmPackageName, pypiPackageName, type ServerHealth } from "../src/health.js";
import { recommendForNeeds } from "../src/recommend.js";

interface EntrySpec {
  id: string;
  name?: string;
  endpoint?: string;
  transport?: CatalogEntry["transport"];
  commands?: string[];
  auth?: CatalogEntry["auth"]["type"];
}

const entry = (spec: EntrySpec): CatalogEntry => ({
  id: spec.id,
  name: spec.name ?? spec.id,
  description: `${spec.id} server.`,
  category: "Demo",
  source: { readmePath: null, docsPath: "docs/demo.md", featuredInReadme: false },
  links: {
    primary: `https://github.com/example/${spec.id}`,
    repo: null,
    homepage: null,
    docs: null,
    endpoint: spec.endpoint ?? null,
  },
  install: { commands: spec.commands ?? [], env: [], confidence: "medium" },
  transport: spec.transport ?? (spec.endpoint ? ["streamable-http"] : ["stdio"]),
  auth: { type: spec.auth ?? "unknown", notes: [] },
  clients: [],
  tools: { count: null, names: [], source: "unknown" },
  license: "unknown",
  installReady: true,
  verifiedAt: null,
  health: { repoPublic: null, packageFound: null, endpointReachable: null, lastCheckedAt: null },
  verification: { status: "unknown", notes: [] },
  community: { maintainedBy: [], verifiedBy: [], claimed: false },
});

type Route = (init: RequestInit) => Response | Promise<Response>;

const fakeFetch = (routes: Record<string, Route>): typeof fetch =>
  (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const route = routes[`${init.method ?? "GET"} ${url}`];

    if (!route) {
      throw new TypeError("fetch failed", { cause: new Error(`getaddrinfo ENOTFOUND ${new URL(url).host}`) });
    }

    return route(init);
  }) as typeof fetch;

const initialized = () => new Response('event: message\ndata: {"result":{"protocolVersion":"2025-06-18"}}\n\n', {
  status: 200,
  headers: { "Content-Type": "text/event-stream" },
});

const checkAll = async (catalog: CatalogEntry[], routes: Record<string, Route>, timeoutMs = 1000): Promise<HealthMonitor> => {
  const monitor = new HealthMonitor(catalog, {
    fetch: fakeFetch(routes),
    timeoutMs,
    now: () => new Date("2026-10-22T00:00:00.000Z"),
  });
  await monitor.runOnce();
  return monitor;
};

describe("HealthMonitor", () => {
  it("passes a hosted server that completes an MCP initialize", async () => {
    const monitor = await checkAll([entry({ id: "open", endpoint: "https://open.example.com/mcp" })], {
      "POST https://open.example.com/mcp": initialized,
    });

    expect(monitor.get("open")).toEqual({ status: "ok", auth: "none", detail: null, checkedAt: "2026-10-22T00:00:00.000Z" });
  });

  it("counts a sign-in challenge as up, and reads OAuth from it", async () => {
    const monitor = await checkAll([
      entry({ id: "oauth", endpoint: "https://oauth.example.com/mcp" }),
      entry({ id: "token", endpoint: "https://token.example.com/mcp" }),
    ], {
      "POST https://oauth.example.com/mcp": () => new Response(null, {
        status: 401,
        headers: { "WWW-Authenticate": 'Bearer resource_metadata="https://oauth.example.com/.well-known/oauth-protected-resource"' },
      }),
      "POST https://token.example.com/mcp": () => new Response(null, {
        status: 401,
        headers: { "WWW-Authenticate": 'Bearer error="invalid_request"' },
      }),
    });

    expect(monitor.get("oauth")).toMatchObject({ status: "auth-required", auth: "oauth" });
    expect(monitor.get("token")).toMatchObject({ status: "auth-required", auth: "bearer" });
  });

  it("fails a server that is down, gone, or doesn't speak MCP", async () => {
    const monitor = await checkAll([
      entry({ id: "gone", endpoint: "https://gone.example.com/mcp" }),
      entry({ id: "html", endpoint: "https://html.example.com/mcp" }),
      entry({ id: "dns", endpoint: "https://dns.example.com/mcp" }),
    ], {
      "POST https://gone.example.com/mcp": () => new Response("Not found", { status: 404 }),
      "POST https://html.example.com/mcp": () => new Response("<html>Welcome</html>", { status: 200 }),
    });

    expect(monitor.get("gone")).toMatchObject({ status: "failing", detail: "HTTP 404" });
    expect(monitor.get("html")).toMatchObject({ status: "failing", detail: "HTTP 200" });
    expect(monitor.get("dns")).toMatchObject({ status: "failing", detail: "getaddrinfo ENOTFOUND dns.example.com" });
  });

  it("gives up on a server that never answers", async () => {
    const monitor = await checkAll([entry({ id: "slow", endpoint: "https://slow.example.com/mcp" })], {
      "POST https://slow.example.com/mcp": (init) => new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
    }, 20);

    expect(monitor.get("slow")).toMatchObject({ status: "failing", detail: "Timed out" });
  });

  it("opens an older SSE server's stream with a GET", async () => {
    const monitor = await checkAll([entry({ id: "sse", endpoint: "https://sse.example.com/sse", transport: ["sse"] })], {
      "POST https://sse.example.com/sse": () => new Response(null, { status: 405 }),
      "GET https://sse.example.com/sse": () => new Response("event: endpoint\ndata: /messages?session=1\n\n", { status: 200 }),
    });

    expect(monitor.get("sse")).toMatchObject({ status: "ok" });
  });

  it("looks a package up on npm or PyPI", async () => {
    const monitor = await checkAll([
      entry({ id: "npm-found", commands: ["npx -y @scope/demo-mcp@latest --stdio"] }),
      entry({ id: "npm-missing", commands: ["npx -y no-such-mcp"] }),
      entry({ id: "pypi-found", commands: ["uvx demo-mcp --access-mode=restricted"] }),
      entry({ id: "git-package", commands: ["npx -y github:owner/repo"] }),
    ], {
      "GET https://registry.npmjs.org/@scope%2Fdemo-mcp": () => new Response("{}", { status: 200 }),
      "GET https://registry.npmjs.org/no-such-mcp": () => new Response("{}", { status: 404 }),
      "GET https://pypi.org/pypi/demo-mcp/json": () => new Response("{}", { status: 200 }),
    });

    expect(monitor.get("npm-found")).toMatchObject({ status: "ok", detail: "npm package @scope/demo-mcp" });
    expect(monitor.get("npm-missing")).toMatchObject({ status: "failing", detail: "npm has no package no-such-mcp" });
    expect(monitor.get("pypi-found")).toMatchObject({ status: "ok", detail: "PyPI package demo-mcp" });
    expect(monitor.get("git-package")).toMatchObject({ status: "unchecked" });
  });

  it("only checks servers LagrangeCloud could run", async () => {
    const monitor = await checkAll([entry({ id: "docker", commands: ["docker run demo/mcp"] })], {});

    expect(monitor.get("docker")).toBeUndefined();
    expect(monitor.summary()).toMatchObject({ checked: 0, lastRunFinishedAt: "2026-10-22T00:00:00.000Z" });
  });
});

describe("package names", () => {
  it.each([
    [["-y", "demo-mcp"], "demo-mcp"],
    [["-y", "demo-mcp@1.2.3"], "demo-mcp"],
    [["-y", "@scope/demo@latest", "--port", "3000"], "@scope/demo"],
    [["-y", "https://example.com/demo.tgz"], null],
  ])("reads npm package from %j", (args, name) => {
    expect(npmPackageName(args)).toBe(name);
  });

  it.each([
    [["demo-mcp"], "demo-mcp"],
    [["demo-mcp==0.3.0"], "demo-mcp"],
    [["--with", "mcp", "demo-radar", "mcp"], "demo-radar"],
    [["--from", "demo-mcp[cli]", "demo"], "demo-mcp"],
    [["git+https://github.com/owner/repo"], null],
  ])("reads PyPI package from %j", (args, name) => {
    expect(pypiPackageName(args)).toBe(name);
  });
});

describe("recommendations with live checks", () => {
  const catalog = [
    entry({ id: "slack-dead", name: "Slack Old", endpoint: "https://dead.example.com/mcp" }),
    entry({ id: "slack-live", name: "Slack", endpoint: "https://slack.example.com/mcp" }),
    entry({ id: "slack-unchecked", name: "Slack Bridge", endpoint: "https://bridge.example.com/mcp" }),
    ...Array.from({ length: 10 }, (_, index) => entry({ id: `filler-${index}`, endpoint: `https://f${index}.example.com/mcp` })),
  ];
  const results: Record<string, ServerHealth> = {
    "slack-dead": { status: "failing", auth: null, detail: "HTTP 404", checkedAt: "2026-10-22T00:00:00.000Z" },
    "slack-live": { status: "auth-required", auth: "oauth", detail: "HTTP 401", checkedAt: "2026-10-22T00:00:00.000Z" },
  };
  const health = (serverId: string) => results[serverId];

  it("never suggests a server whose last check failed", () => {
    const [slack] = recommendForNeeds(catalog, { needs: ["slack"], health });

    expect(slack.servers.map((server) => server.id)).toEqual(["slack-live", "slack-unchecked"]);
  });

  it("keeps to checked servers when asked", () => {
    const [slack] = recommendForNeeds(catalog, { needs: ["slack"], health, checkedOnly: true });

    expect(slack.servers.map((server) => server.id)).toEqual(["slack-live"]);
  });

  it("fills in auth the catalog didn't know from what the check saw", () => {
    const [slack] = recommendForNeeds(catalog, { needs: ["slack"], health, checkedOnly: true });

    expect(slack.servers[0].check?.status).toBe("auth-required");
    expect(slack.servers[0].lagrange.signIn).toBe(true);
  });
});
