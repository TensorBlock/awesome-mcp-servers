import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCatalogFromMarkdown } from "./buildCatalog.js";
import { readMetadataSidecars } from "./metadata.js";

const readme = readFileSync("README.md", "utf8");
const docsByPath = new Map<string, string>();

for (const file of readdirSync("docs")) {
  if (file.endsWith(".md")) {
    const path = join("docs", file);
    docsByPath.set(path, readFileSync(path, "utf8"));
  }
}

const result = buildCatalogFromMarkdown(readme, docsByPath, readMetadataSidecars());

mkdirSync("data", { recursive: true });
writeFileSync("data/catalog.json", `${JSON.stringify(result.entries, null, 2)}\n`);
writeFileSync("data/catalog-errors.json", `${JSON.stringify(result.errors, null, 2)}\n`);

console.log(`Catalog entries: ${result.entries.length}`);
console.log(`Catalog errors: ${result.errors.length}`);
