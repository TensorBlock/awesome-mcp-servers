import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { CatalogMetadataOverride } from "./types.js";

export function readMetadataSidecars(
  metadataDir = "data/server-metadata",
): Map<string, CatalogMetadataOverride> {
  const metadataById = new Map<string, CatalogMetadataOverride>();

  if (!existsSync(metadataDir)) {
    return metadataById;
  }

  for (const fileName of readdirSync(metadataDir).filter((name) => name.endsWith(".json")).sort()) {
    const filePath = join(metadataDir, fileName);
    const metadata = JSON.parse(readFileSync(filePath, "utf8")) as CatalogMetadataOverride;
    const id = metadata.id ?? basename(fileName, ".json");

    metadataById.set(id, metadata);
  }

  return metadataById;
}
