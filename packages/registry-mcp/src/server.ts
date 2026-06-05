import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import {
  generateClientConfig,
  type ClientName,
} from "../../config-generator/src/generateConfig.js";

const CLIENTS = ["claude", "cursor", "codex", "vscode"] as const;

export const searchServers = (
  catalog: CatalogEntry[],
  query: string
): CatalogEntry[] => {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);

  if (terms.length === 0) {
    return [];
  }

  return catalog
    .map((entry) => ({
      entry,
      score: scoreEntry(entry, terms),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map(({ entry }) => entry);
};

export const getServerProfile = (
  catalog: CatalogEntry[],
  serverId: string
): CatalogEntry | undefined => catalog.find((entry) => entry.id === serverId);

export const catalogPath = (): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/catalog.json");

export const main = async (): Promise<void> => {
  const catalog = JSON.parse(
    readFileSync(catalogPath(), "utf8")
  ) as CatalogEntry[];
  const server = new McpServer({
    name: "tensorblock-mcp-registry",
    version: "0.1.0",
  });

  server.registerTool(
    "search_servers",
    {
      description: "Search TensorBlock MCP catalog entries.",
      inputSchema: {
        query: z.string().min(1),
      },
    },
    ({ query }) => jsonResult(searchServers(catalog, query))
  );

  server.registerTool(
    "get_server_profile",
    {
      description: "Get a TensorBlock MCP catalog entry by server id.",
      inputSchema: {
        serverId: z.string().min(1),
      },
    },
    ({ serverId }) => {
      const entry = getServerProfile(catalog, serverId);

      if (!entry) {
        return errorResult(`Server not found: ${serverId}`);
      }

      return jsonResult(entry);
    }
  );

  server.registerTool(
    "get_install_config",
    {
      description: "Generate an MCP client install config for a catalog entry.",
      inputSchema: {
        serverId: z.string().min(1),
        client: z.enum(CLIENTS),
      },
    },
    ({ serverId, client }) => {
      const entry = getServerProfile(catalog, serverId);

      if (!entry) {
        return errorResult(`Server not found: ${serverId}`);
      }

      if (!isClientName(client)) {
        return errorResult(`Unsupported client: ${client}`);
      }

      return jsonResult(generateClientConfig(entry, client));
    }
  );

  await server.connect(new StdioServerTransport());
};

const scoreEntry = (entry: CatalogEntry, terms: string[]): number => {
  const name = entry.name.toLowerCase();
  const description = entry.description.toLowerCase();
  const category = entry.category.toLowerCase();
  let matchedTerms = 0;

  const score = terms.reduce((currentScore, term) => {
    let nextScore = currentScore;
    let termMatched = false;

    if (name.includes(term)) {
      nextScore += 3;
      termMatched = true;
    }

    if (description.includes(term)) {
      nextScore += 2;
      termMatched = true;
    }

    if (category.includes(term)) {
      nextScore += 1;
      termMatched = true;
    }

    if (termMatched) {
      matchedTerms += 1;
    }

    return nextScore;
  }, 0);

  return score + matchedTerms * 10 + (matchedTerms === terms.length ? 100 : 0);
};

const jsonResult = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(value, null, 2),
    },
  ],
});

const errorResult = (message: string) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text: JSON.stringify({ error: message }, null, 2),
    },
  ],
});

const isClientName = (client: string): client is ClientName =>
  CLIENTS.includes(client as ClientName);

const isDirectRun = (): boolean => {
  if (!process.argv[1]) {
    return false;
  }

  return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
};

if (isDirectRun()) {
  void main();
}
