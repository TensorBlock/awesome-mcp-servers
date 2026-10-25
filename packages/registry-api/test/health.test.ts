import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { HealthMonitor, npmPackageName, pypiPackageName, type ServerHealth } from "../src/health.js";
import { probeMcpEndpoint, type ProbeResult } from "../src/mcpProbe.js";
import { isPublicAddress } from "../src/outbound.js";
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

// Checks of hosted servers may only reach 127.0.0.1 in tests, where the
// stand-in servers run; every other address gets the production rules.
const LOCAL_ONLY = (address: string) => address === "127.0.0.1";

interface Received {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

// A local stand-in for a hosted MCP server.
const serve = async (handler: (request: Received, response: ServerResponse) => void) => {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const seen = { method: request.method ?? "", path: request.url ?? "", headers: request.headers, body };
      received.push(seen);
      handler(seen, response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, port, received };
};

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

const initializeResult = { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "demo", version: "1.0" } } };

const json = (response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}) => {
  response.writeHead(status, { "Content-Type": "application/json", ...headers });
  response.end(JSON.stringify(value));
};

// What a check of `spec`'s endpoint finds. The catalog never queues a
// localhost endpoint for checks, so the probe is called directly here.
const check = (spec: EntrySpec, options: { allowAddress?: (address: string) => boolean; timeoutMs?: number } = {}): Promise<ProbeResult> =>
  probeMcpEndpoint(spec.endpoint!, {
    deadline: Date.now() + (options.timeoutMs ?? 2000),
    allowAddress: "allowAddress" in options ? options.allowAddress : LOCAL_ONLY,
    legacySse: spec.transport?.includes("sse"),
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

describe("checking a hosted server", () => {
  it("passes a server that answers initialize with a valid result, then finishes the handshake", async () => {
    const server = await serve((request, response) => {
      if (request.method === "POST" && JSON.parse(request.body).method === "initialize") {
        return json(response, 200, initializeResult);
      }
      response.writeHead(202).end();
    });

    expect(await check({ id: "open", endpoint: `${server.url}/mcp` })).toEqual({ status: "ok", auth: "none", detail: null });
    expect(server.received.map((request) => JSON.parse(request.body).method)).toEqual(["initialize", "notifications/initialized"]);
  });

  it("reads the result from an event stream and ends the session it opened", async () => {
    const server = await serve((request, response) => {
      if (request.method === "POST" && JSON.parse(request.body).method === "initialize") {
        response.writeHead(200, { "Content-Type": "text/event-stream", "Mcp-Session-Id": "session-1" });
        response.write(": keep-alive\n\n");
        response.end(`event: message\ndata: ${JSON.stringify(initializeResult)}\n\n`);
        return;
      }
      response.writeHead(request.method === "DELETE" ? 200 : 202).end();
    });

    expect(await check({ id: "stream", endpoint: `${server.url}/mcp` })).toMatchObject({ status: "ok" });
    expect(server.received.slice(1).map((request) => [request.method, request.headers["mcp-session-id"]])).toEqual([
      ["POST", "session-1"],
      ["DELETE", "session-1"],
    ]);
  });

  it.each([
    ["an HTML page that mentions protocolVersion", (response: ServerResponse) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<html><body>Set protocolVersion in your client.</body></html>");
    }, "Not an MCP response (text/html)"],
    ["a JSON-RPC error", (response: ServerResponse) => json(response, 200, { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Unsupported protocolVersion" } }), "initialize failed: Unsupported protocolVersion (-32602)"],
    ["a result without capabilities", (response: ServerResponse) => json(response, 200, { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } }), "initialize result has no capabilities"],
    ["a response to another request", (response: ServerResponse) => json(response, 200, { ...initializeResult, id: 7 }), "No JSON-RPC response to initialize"],
    ["JSON that isn't JSON-RPC", (response: ServerResponse) => json(response, 200, { protocolVersion: "2025-06-18", capabilities: {} }), "No JSON-RPC response to initialize"],
    ["an event stream without the result", (response: ServerResponse) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end('event: message\ndata: {"jsonrpc":"2.0","method":"notifications/message","params":{"protocolVersion":"x"}}\n\n');
    }, "No JSON-RPC response to initialize"],
  ])("fails %s", async (_name, answer, detail) => {
    const server = await serve((_request, response) => answer(response));

    expect(await check({ id: "bad", endpoint: `${server.url}/mcp` })).toMatchObject({ status: "failing", detail });
  });

  it("counts a sign-in challenge as up, and reads OAuth from it", async () => {
    const oauth = await serve((_request, response) => json(response, 401, { error: "unauthorized" }, {
      "WWW-Authenticate": `Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource"`,
    }));
    const token = await serve((_request, response) => {
      response.writeHead(401, { "WWW-Authenticate": 'Bearer error="invalid_request"' });
      response.end();
    });

    expect(await check({ id: "oauth", endpoint: `${oauth.url}/mcp` })).toMatchObject({ status: "auth-required", auth: "oauth" });
    expect(await check({ id: "token", endpoint: `${token.url}/mcp` })).toMatchObject({ status: "auth-required", auth: "bearer" });
  });

  it("counts a bare 401 from a server that wants an API key as a sign-in challenge", async () => {
    const server = await serve((_request, response) => {
      response.writeHead(401, { "Content-Type": "text/plain" });
      response.end("Unauthorized: missing x-api-key");
    });

    expect(await check({ id: "key", endpoint: `${server.url}/mcp` })).toMatchObject({ status: "auth-required", auth: "bearer" });
  });

  it("doesn't count a bot wall's 403 page as a sign-in challenge", async () => {
    const server = await serve((_request, response) => {
      response.writeHead(403, { "Content-Type": "text/plain" });
      response.end("Forbidden");
    });

    expect(await check({ id: "wall", endpoint: `${server.url}/mcp` })).toMatchObject({ status: "failing", detail: "HTTP 403 without an auth challenge" });
  });

  it("doesn't count a login page as a sign-in challenge", async () => {
    const server = await serve((_request, response) => {
      response.writeHead(401, { "Content-Type": "text/html" });
      response.end("<form>Log in</form>");
    });

    expect(await check({ id: "login", endpoint: `${server.url}/mcp` })).toMatchObject({ status: "failing", detail: "HTTP 401 without an auth challenge" });
  });

  it("says why a connection failed", async () => {
    const server = await serve(() => undefined);
    const port = server.port;
    await new Promise<void>((resolve) => servers.pop()!.close(() => resolve()));

    expect(await check({ id: "closed", endpoint: `http://127.0.0.1:${port}/mcp` })).toMatchObject({ status: "failing", detail: expect.stringMatching(/ECONNREFUSED/) });
  });

  it("gives up on a server that never answers", async () => {
    const server = await serve(() => undefined);

    expect(await check({ id: "slow", endpoint: `${server.url}/mcp` }, { timeoutMs: 100 })).toMatchObject({ status: "failing", detail: "Timed out" });
  });
});

describe("checking a server on the older HTTP+SSE transport", () => {
  // Opens the event stream, names /messages as the endpoint, and answers
  // initialize on the stream once it is POSTed there.
  const legacyServer = async (options: { endpoint?: (url: string) => string; answer?: boolean } = {}) => {
    let stream: ServerResponse | undefined;
    const server = await serve((request, response) => {
      if (request.method === "POST" && request.path === "/sse") {
        response.writeHead(405).end();
      } else if (request.method === "GET" && request.path === "/sse") {
        stream = response;
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.write(`event: endpoint\ndata: ${options.endpoint?.(server.url) ?? "/messages?session=1"}\n\n`);
      } else if (request.method === "POST" && request.path.startsWith("/messages")) {
        response.writeHead(202).end();
        if (JSON.parse(request.body).method === "initialize" && options.answer !== false) {
          stream?.write(`event: message\ndata: ${JSON.stringify(initializeResult)}\n\n`);
        }
      } else {
        response.writeHead(404).end();
      }
    });
    return server;
  };

  it("completes the handshake: stream, endpoint, initialize, result, initialized", async () => {
    const server = await legacyServer();

    expect(await check({ id: "sse", endpoint: `${server.url}/sse`, transport: ["sse"] })).toMatchObject({ status: "ok" });
    expect(server.received.map((request) => `${request.method} ${request.path} ${request.body ? JSON.parse(request.body).method : ""}`.trim())).toEqual([
      "POST /sse initialize",
      "GET /sse",
      "POST /messages?session=1 initialize",
      "POST /messages?session=1 notifications/initialized",
    ]);
  });

  it("fails when the result never comes back on the stream", async () => {
    const server = await legacyServer({ answer: false });

    expect(await check({ id: "sse", endpoint: `${server.url}/sse`, transport: ["sse"] }, { timeoutMs: 300 })).toMatchObject({ status: "failing", detail: "Timed out" });
  });

  it("won't POST to an endpoint on another origin", async () => {
    const server = await legacyServer({ endpoint: () => "http://169.254.169.254/latest/meta-data" });

    expect(await check({ id: "sse", endpoint: `${server.url}/sse`, transport: ["sse"] })).toMatchObject({
      status: "failing",
      detail: "The event stream named an endpoint on another origin (http://169.254.169.254)",
    });
    expect(server.received.some((request) => request.path.includes("meta-data"))).toBe(false);
  });
});

describe("where checks may connect", () => {
  it("refuses a private address written into the listing, before connecting", async () => {
    const server = await serve((_request, response) => json(response, 200, initializeResult));

    expect(await check({ id: "private", endpoint: `${server.url}/mcp` }, { allowAddress: undefined })).toMatchObject({
      status: "failing",
      detail: "Refused 127.0.0.1: not a public address",
    });
    expect(server.received).toEqual([]);
  });

  it("refuses a host name that resolves to a private address, before connecting", async () => {
    const server = await serve((_request, response) => json(response, 200, initializeResult));

    const health = await check({ id: "named", endpoint: `http://localhost:${server.port}/mcp` }, { allowAddress: undefined });

    expect(health).toMatchObject({ status: "failing" });
    expect(health.detail).toMatch(/^Refused localhost: resolves to (127\.0\.0\.1|::1), not a public address$/);
    expect(server.received).toEqual([]);
  });

  it("checks where a redirect goes before following it", async () => {
    const toMetadata = await serve((_request, response) => {
      response.writeHead(307, { Location: "http://169.254.169.254/latest/meta-data" });
      response.end();
    });
    const toPrivateName = await serve((_request, response) => {
      response.writeHead(308, { Location: `http://localhost:${toMetadata.port}/mcp` });
      response.end();
    });

    expect(await check({ id: "metadata", endpoint: `${toMetadata.url}/mcp` })).toMatchObject({ status: "failing", detail: "Refused 169.254.169.254: not a public address" });
    expect(await check({ id: "rename", endpoint: `${toPrivateName.url}/mcp` })).toMatchObject({ status: "failing" });
    // Only the first check's own POST reached it; the redirect to it by a private name never did.
    expect(toMetadata.received).toHaveLength(1);
  });

  it("follows a redirect that keeps the POST and stays allowed", async () => {
    const server = await serve((request, response) => {
      if (request.path === "/old") {
        response.writeHead(307, { Location: "/mcp" });
        return response.end();
      }
      if (JSON.parse(request.body).method === "initialize") {
        return json(response, 200, initializeResult);
      }
      response.writeHead(202).end();
    });

    expect(await check({ id: "moved", endpoint: `${server.url}/old` })).toMatchObject({ status: "ok" });
  });

  it("doesn't turn the initialize POST into a GET to follow a redirect", async () => {
    const server = await serve((_request, response) => {
      response.writeHead(302, { Location: "/elsewhere" });
      response.end();
    });

    expect(await check({ id: "found", endpoint: `${server.url}/mcp` })).toMatchObject({ status: "failing", detail: "HTTP 302" });
    expect(server.received.map((request) => request.path)).toEqual(["/mcp"]);
  });

  it("stops after a few redirects", async () => {
    const server = await serve((_request, response) => {
      response.writeHead(307, { Location: "/again" });
      response.end();
    });

    expect(await check({ id: "loop", endpoint: `${server.url}/mcp` })).toMatchObject({ status: "failing", detail: "More than 3 redirects" });
  });

  it.each([
    ["8.8.8.8", true],
    ["1.1.1.1", true],
    ["2606:4700:4700::1111", true],
    ["127.0.0.1", false],
    ["10.1.2.3", false],
    ["172.20.0.1", false],
    ["192.168.1.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["0.0.0.0", false],
    ["224.0.0.1", false],
    ["255.255.255.255", false],
    ["::1", false],
    ["::", false],
    ["fd00:ec2::254", false],
    ["fe80::1", false],
    ["::ffff:127.0.0.1", false],
    ["::ffff:7f00:1", false],
    ["::ffff:8.8.8.8", true],
    ["64:ff9b::a9fe:a9fe", false],
    ["2002:a00:1::", false],
    ["2001:0:4136:e378::", false],
    ["not-an-address", false],
  ])("treats %s as public: %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe("HealthMonitor", () => {
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
