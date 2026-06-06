import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { createRegistryApiServer } from "../src/server.js";

const catalog: CatalogEntry[] = [
  {
    id: "postgres-mcp",
    name: "Postgres MCP",
    description: "Query PostgreSQL databases from agents.",
    category: "Databases",
    source: {
      readmePath: null,
      docsPath: "docs/databases.md",
      featuredInReadme: false,
    },
    links: {
      primary: "https://github.com/example/postgres-mcp",
      repo: "https://github.com/example/postgres-mcp",
      homepage: null,
      docs: null,
      endpoint: null,
    },
    install: {
      commands: ["npx postgres-mcp"],
      env: ["DATABASE_URL"],
      confidence: "high",
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
  },
];

const servers: Array<ReturnType<typeof createRegistryApiServer>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  })));
});

describe("registry API server", () => {
  it("returns API discovery from the root path", async () => {
    const baseUrl = await startServer();
    const response = await fetch(baseUrl);
    const body = await response.json() as {
      name: string;
      catalogEntries: number;
      endpoints: Record<string, string>;
    };

    expect(response.status).toBe(200);
    expect(body.name).toBe("TensorBlock MCP Index API");
    expect(body.catalogEntries).toBe(1);
    expect(body.endpoints.searchServers).toBe("/v1/servers?query=postgres&limit=5");
  });

  it("keeps the version discovery path available", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/v1`);
    const body = await response.json() as { version: string };

    expect(response.status).toBe(200);
    expect(body.version).toBe("v1");
  });
});

const startServer = async (): Promise<string> => {
  const server = createRegistryApiServer({
    catalog,
    loadedAt: "2026-06-06T00:00:00.000Z",
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};
