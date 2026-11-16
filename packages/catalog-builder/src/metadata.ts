import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { CatalogMetadataOverride } from "./types.js";

export function readMetadataSidecars(
  metadataDir = "data/server-metadata",
): Map<string, CatalogMetadataOverride> {
  const metadataById = new Map<string, CatalogMetadataOverride>();
  const sourceById = new Map<string, string>();

  if (!existsSync(metadataDir)) {
    return metadataById;
  }

  for (const fileName of readdirSync(metadataDir).filter((name) => name.endsWith(".json")).sort()) {
    const filePath = join(metadataDir, fileName);
    const metadata = JSON.parse(readFileSync(filePath, "utf8")) as CatalogMetadataOverride;
    const id = metadata.id ?? basename(fileName, ".json");

    const previousSource = sourceById.get(id);
    if (previousSource) {
      throw new Error(`Duplicate metadata id ${JSON.stringify(id)} in ${previousSource} and ${filePath}`);
    }

    sourceById.set(id, filePath);
    metadataById.set(id, metadata);
  }

  return metadataById;
}

