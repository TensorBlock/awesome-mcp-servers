import type { CatalogEntry } from "../../catalog-builder/src/types.js";

export interface ServerProfile {
  id: string;
  name: string;
  description: string;
  category: string;
  profileUrl: string;
  badgeMarkdown: string;
  links: CatalogEntry["links"];
  summary: {
    transport: string[];
    auth: string;
    installConfidence: string;
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
    badgeMarkdown: `[![Listed on TensorBlock MCP Index](https://img.shields.io/badge/TensorBlock-MCP%20Index-blue)](${profileUrl})`,
    links: entry.links,
    summary: {
      transport: entry.transport,
      auth: entry.auth.type,
      installConfidence: entry.install.confidence,
      verification: entry.verification.status,
      toolCount: entry.tools.count,
    },
  };
};
