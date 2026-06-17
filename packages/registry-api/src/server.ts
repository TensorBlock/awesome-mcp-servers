import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalogEntry, AuthType, Transport } from "../../catalog-builder/src/types.js";
import {
  generateClientConfig,
  type ClientName,
} from "../../config-generator/src/generateConfig.js";
import {
  findServer,
  listCategories,
  normalizeLimit,
  searchCatalog,
} from "./search.js";
import { renderServerProfilePage } from "./profilePage.js";
import { webProfileTemplate } from "./webProfile.js";
import { renderBadgeSvg } from "./badge.js";

const CLIENT_ALIASES: Record<string, ClientName> = {
  "claude": "claude",
  "claude-desktop": "claude",
  "cursor": "cursor",
  "codex": "codex",
  "vscode": "vscode",
  "vs-code": "vscode",
};

const TRANSPORTS = new Set<Transport>(["stdio", "streamable-http", "sse", "unknown"]);
const AUTH_TYPES = new Set<AuthType>(["none", "api-key", "oauth", "bearer", "unknown"]);

interface RegistryApiState {
  catalog: CatalogEntry[];
  loadedAt: string;
}

const startedAt = new Date();

export const loadCatalog = (catalogPath = process.env.CATALOG_PATH ?? "data/catalog.json"): CatalogEntry[] =>
  JSON.parse(readFileSync(resolve(catalogPath), "utf8")) as CatalogEntry[];

export const createRegistryApiServer = (state: RegistryApiState) =>
  createServer((request, response) => {
    void handleRequest(request, response, state);
  });

const handleRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  state: RegistryApiState
): Promise<void> => {
  const method = request.method ?? "GET";

  if (method === "OPTIONS") {
    sendJson(response, 204, null);
    return;
  }

  if (method !== "GET") {
    sendError(response, 405, "Method not allowed");
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);

  try {
    if (url.pathname === "/" || url.pathname === "/v1" || url.pathname === "/v1/") {
      sendJson(response, 200, discoveryPayload(state));
      return;
    }

    if (url.pathname === "/health") {
      sendJson(response, 200, {
        status: "ok",
        catalogEntries: state.catalog.length,
        loadedAt: state.loadedAt,
        uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      });
      return;
    }

    if (segments[0] === "servers" && segments.length === 2) {
      const entry = findServer(state.catalog, segments[1]);

      if (!entry) {
        sendError(response, 404, `Server not found: ${segments[1]}`);
        return;
      }

      sendHtml(response, 200, renderServerProfilePage(entry));
      return;
    }

    if (segments[0] === "servers" && segments[2] === "badge.svg" && segments.length === 3) {
      const entry = findServer(state.catalog, segments[1]);

      if (!entry) {
        sendError(response, 404, `Server not found: ${segments[1]}`);
        return;
      }

      sendSvg(response, 200, renderBadgeSvg(entry));
      return;
    }

    if (segments[0] !== "v1") {
      sendError(response, 404, "Not found");
      return;
    }

    if (segments[1] === "categories" && segments.length === 2) {
      const categories = listCategories(state.catalog);
      sendJson(response, 200, {
        count: categories.length,
        categories,
      });
      return;
    }

    if (segments[1] === "servers" && segments.length === 2) {
      handleSearch(url, response, state.catalog);
      return;
    }

    if (segments[1] === "servers" && segments.length === 3) {
      const entry = findServer(state.catalog, segments[2]);

      if (!entry) {
        sendError(response, 404, `Server not found: ${segments[2]}`);
        return;
      }

      sendJson(response, 200, entry);
      return;
    }

    if (segments[1] === "servers" && segments[3] === "badge.svg" && segments.length === 4) {
      handleBadge(response, state.catalog, segments[2]);
      return;
    }

    if (segments[1] === "servers" && segments[3] === "install-config" && segments.length === 4) {
      handleInstallConfig(url, response, state.catalog, segments[2]);
      return;
    }

    sendError(response, 404, "Not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(response, 500, message);
  }
};

const discoveryPayload = (state: RegistryApiState) => ({
  name: "TensorBlock MCP Index API",
  version: "v1",
  description: "Search MCP servers, inspect catalog profiles, and generate MCP client install configs.",
  catalogEntries: state.catalog.length,
  endpoints: {
    health: "/health",
    categories: "/v1/categories",
    searchServers: "/v1/servers?query=postgres&limit=5",
    getServer: "/v1/servers/{id}",
    serverProfile: webProfileTemplate(),
    apiHtmlProfile: "/servers/{id}",
    badge: "/v1/servers/{id}/badge.svg",
    getInstallConfig: "/v1/servers/{id}/install-config?client=claude-desktop",
  },
  docs: "https://github.com/TensorBlock/awesome-mcp-servers/blob/main/docs/index-api.md",
});

const handleSearch = (
  url: URL,
  response: ServerResponse,
  catalog: CatalogEntry[]
): void => {
  const transport = optionalTransport(url.searchParams.get("transport"));
  const auth = optionalAuthType(url.searchParams.get("auth"));

  if (transport instanceof Error) {
    sendError(response, 400, transport.message);
    return;
  }

  if (auth instanceof Error) {
    sendError(response, 400, auth.message);
    return;
  }

  const rawLimit = url.searchParams.get("limit");
  const limit = normalizeLimit(rawLimit ? Number(rawLimit) : undefined);
  const servers = searchCatalog(catalog, {
    query: url.searchParams.get("query") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    transport,
    auth,
    limit,
  });

  sendJson(response, 200, {
    count: servers.length,
    limit,
    query: url.searchParams.get("query") ?? "",
    filters: {
      category: url.searchParams.get("category"),
      transport: transport ?? null,
      auth: auth ?? null,
    },
    servers,
  });
};

const handleInstallConfig = (
  url: URL,
  response: ServerResponse,
  catalog: CatalogEntry[],
  serverId: string
): void => {
  const entry = findServer(catalog, serverId);

  if (!entry) {
    sendError(response, 404, `Server not found: ${serverId}`);
    return;
  }

  const client = normalizeClientName(url.searchParams.get("client") ?? "claude-desktop");

  if (!client) {
    sendError(response, 400, "Unsupported client. Use claude-desktop, cursor, codex, or vscode.");
    return;
  }

  sendJson(response, 200, generateClientConfig(entry, client));
};

const handleBadge = (
  response: ServerResponse,
  catalog: CatalogEntry[],
  serverId: string
): void => {
  const entry = findServer(catalog, serverId);

  if (!entry) {
    sendError(response, 404, `Server not found: ${serverId}`);
    return;
  }

  sendSvg(response, 200, renderBadgeSvg(entry));
};

const normalizeClientName = (client: string): ClientName | null =>
  CLIENT_ALIASES[client.toLowerCase()] ?? null;

const optionalTransport = (transport: string | null): Transport | undefined | Error => {
  if (!transport) {
    return undefined;
  }

  return TRANSPORTS.has(transport as Transport)
    ? transport as Transport
    : new Error(`Unsupported transport: ${transport}`);
};

const optionalAuthType = (auth: string | null): AuthType | undefined | Error => {
  if (!auth) {
    return undefined;
  }

  return AUTH_TYPES.has(auth as AuthType)
    ? auth as AuthType
    : new Error(`Unsupported auth type: ${auth}`);
};

const sendJson = (response: ServerResponse, statusCode: number, value: unknown): void => {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": statusCode === 200 ? "public, max-age=60" : "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });

  if (statusCode === 204) {
    response.end();
    return;
  }

  response.end(`${JSON.stringify(value, null, 2)}\n`);
};

const sendError = (response: ServerResponse, statusCode: number, message: string): void => {
  sendJson(response, statusCode, {
    error: {
      message,
      statusCode,
    },
  });
};

const sendHtml = (response: ServerResponse, statusCode: number, value: string): void => {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": statusCode === 200 ? "public, max-age=300" : "no-store",
    "Content-Type": "text/html; charset=utf-8",
  });

  response.end(value);
};

const sendSvg = (response: ServerResponse, statusCode: number, value: string): void => {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": statusCode === 200 ? "public, max-age=3600" : "no-store",
    "Content-Type": "image/svg+xml; charset=utf-8",
  });

  response.end(value);
};

export const main = (): void => {
  const catalog = loadCatalog();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";
  const server = createRegistryApiServer({
    catalog,
    loadedAt: new Date().toISOString(),
  });

  server.listen(port, host, () => {
    console.log(`TensorBlock MCP Index API listening on ${host}:${port}`);
    console.log(`Loaded ${catalog.length} catalog entries`);
  });
};

const isDirectRun = (): boolean => {
  if (!process.argv[1]) {
    return false;
  }

  return import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
};

if (isDirectRun()) {
  main();
}
