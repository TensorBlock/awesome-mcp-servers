import { readFileSync } from "node:fs";
import { generateClientConfig, type ClientName } from "./generateConfig.js";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";

const clients = ["claude", "cursor", "codex", "vscode"] satisfies ClientName[];

const usage = "Usage: npm run config:generate -- <serverId> [claude|cursor|codex|vscode]";

const isClientName = (value: string): value is ClientName =>
  clients.includes(value as ClientName);

const [serverId, clientArg = "claude"] = process.argv.slice(2);

if (!serverId) {
  console.error(usage);
  process.exit(1);
}

if (!isClientName(clientArg)) {
  console.error(`Unsupported client: ${clientArg}`);
  console.error(usage);
  process.exit(1);
}

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as CatalogEntry[];
const entry = catalog.find((candidate) => candidate.id === serverId);

if (!entry) {
  console.error(`Server not found: ${serverId}`);
  process.exit(1);
}

console.log(JSON.stringify(generateClientConfig(entry, clientArg), null, 2));
