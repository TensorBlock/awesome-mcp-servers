import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { badgeMarkdown } from "../../registry-api/src/badge.js";

export interface ServerProfile {
  id: string;
  name: string;
  description: string;
  category: string;
  profileUrl: string;
  badgeMarkdown: string;
  links: CatalogEntry["links"];
  install: CatalogEntry["install"];
  transport: CatalogEntry["transport"];
  auth: CatalogEntry["auth"];
  clients: CatalogEntry["clients"];
  license: CatalogEntry["license"];
  installReady: CatalogEntry["installReady"];
  verifiedAt: CatalogEntry["verifiedAt"];
  health: CatalogEntry["health"];
  verification: CatalogEntry["verification"];
  community: CatalogEntry["community"];
  summary: {
    transport: string[];
    auth: string;
    installConfidence: string;
    installReady: boolean;
    verification: string;
    toolCount: number | null;
  };
}

export const renderProfile = (entry: CatalogEntry, baseUrl: string): ServerProfile => {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const profileUrl = `${normalizedBaseUrl}/${entry.id}`;

  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    profileUrl,
    badgeMarkdown: badgeMarkdown(entry, profileUrl),
    links: entry.links,
    install: entry.install,
    transport: entry.transport,
    auth: entry.auth,
    clients: entry.clients,
    license: entry.license,
    installReady: entry.installReady,
    verifiedAt: entry.verifiedAt,
    health: entry.health,
    verification: entry.verification,
    community: entry.community,
    summary: {
      transport: entry.transport,
      auth: entry.auth.type,
      installConfidence: entry.install.confidence,
      installReady: entry.installReady,
      verification: entry.verification.status,
      toolCount: entry.tools.count,
    },
  };
};

export const writeProfiles = (
  catalog: CatalogEntry[],
  baseUrl: string,
  outputDir: string
): number => {
  mkdirSync(outputDir, { recursive: true });
  removeStaleProfiles(outputDir);

  for (const entry of catalog) {
    const profile = renderProfile(entry, baseUrl);
    writeFileSync(join(outputDir, `${entry.id}.json`), `${JSON.stringify(profile, null, 2)}\n`);
  }

  return catalog.length;
};

const removeStaleProfiles = (outputDir: string): void => {
  for (const fileName of readdirSync(outputDir)) {
    if (fileName.endsWith(".json")) {
      rmSync(join(outputDir, fileName));
    }
  }
};
