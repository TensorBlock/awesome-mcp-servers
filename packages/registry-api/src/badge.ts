import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { webProfileUrl } from "./webProfile.js";

const DEFAULT_API_BASE_URL = "https://mcp-index.tensorblock.co";

export const badgeImageUrl = (serverId: string): string =>
  `${apiBaseUrl()}/v1/servers/${encodeURIComponent(serverId)}/badge.svg`;

export const badgeMarkdown = (
  entry: CatalogEntry,
  profileUrl = webProfileUrl(entry.id)
): string =>
  `[![Indexed on TensorBlock MCP Index](${badgeImageUrl(entry.id)})](${profileUrl})`;

export const renderBadgeSvg = (entry: CatalogEntry): string => {
  const title = `${entry.name} is indexed on TensorBlock MCP Index`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="246" height="34" viewBox="0 0 246 34" role="img" aria-label="${escapeAttribute(title)}">
  <title>${escapeXml(title)}</title>
  <defs>
    <clipPath id="r">
      <rect width="246" height="34" rx="6"/>
    </clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="246" height="34" fill="#f8f7f3"/>
    <rect width="136" height="34" fill="#0c0a09"/>
    <rect x="135.5" y="0.5" width="110" height="33" fill="#f8f7f3" stroke="#e6e3db"/>
    <path d="M14 8h16l8 4-8 4H14l8-4-8-4Zm0 9h16l8 4-8 4H14l8-4-8-4Zm0 9h16l8 4-8 4H14l8-4-8-4Z" fill="none" stroke="#f8f7f3" stroke-width="1.25" stroke-linejoin="round"/>
    <text x="48" y="21.5" fill="#f8f7f3" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="650">TensorBlock</text>
    <text x="150" y="21.5" fill="#0c0a09" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="650">MCP Indexed</text>
  </g>
</svg>`;
};

const apiBaseUrl = (): string =>
  (process.env.MCP_INDEX_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");

const escapeAttribute = (value: string): string =>
  escapeXml(value).replace(/"/g, "&quot;");

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
