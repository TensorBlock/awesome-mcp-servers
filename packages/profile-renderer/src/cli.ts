import { readFileSync } from "node:fs";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { writeProfiles } from "./renderProfiles.js";

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as CatalogEntry[];
const baseUrl = process.env.MCP_INDEX_BASE_URL ?? "https://tensorblock.co/mcp/servers";
const outputDir = "data/profiles";

const written = writeProfiles(catalog, baseUrl, outputDir);

console.log(`Profiles written: ${written}`);
