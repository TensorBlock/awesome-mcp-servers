import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { renderProfile } from "./renderProfiles.js";

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as CatalogEntry[];
const baseUrl = process.env.MCP_INDEX_BASE_URL ?? "https://tensorblock.co/mcp";
const outputDir = "data/profiles";

mkdirSync(outputDir, { recursive: true });

for (const entry of catalog) {
  const profile = renderProfile(entry, baseUrl);
  writeFileSync(join(outputDir, `${entry.id}.json`), `${JSON.stringify(profile, null, 2)}\n`);
}

console.log(`Profiles written: ${catalog.length}`);
