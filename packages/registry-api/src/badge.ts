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

// Sized to sit level with the shields.io badges it shares a README line with:
// 20px tall, 3px corners. Both blocks are opaque so the badge keeps its
// contrast on light and dark README backgrounds alike.
const BADGE_HEIGHT = 20;
const LABEL_WIDTH = 98;
const VALUE_WIDTH = 89;
const BADGE_WIDTH = LABEL_WIDTH + VALUE_WIDTH;
const FONT_STACK = "Inter,Segoe UI,Helvetica,Arial,sans-serif";
// Natural widths under the common Helvetica/Arial fallback. Pinning them with
// textLength keeps the text inside its block whatever font the viewer resolves.
const LABEL_TEXT_WIDTH = 66;
const VALUE_TEXT_WIDTH = 69;

export const renderBadgeSvg = (entry: CatalogEntry): string => {
  const title = `${entry.name} is indexed on TensorBlock MCP Index`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" viewBox="0 0 ${BADGE_WIDTH} ${BADGE_HEIGHT}" role="img" aria-label="${escapeAttribute(title)}">
  <title>${escapeXml(title)}</title>
  <defs>
    <clipPath id="r">
      <rect width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" rx="3"/>
    </clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="${LABEL_WIDTH}" height="${BADGE_HEIGHT}" fill="#0c0a09"/>
    <rect x="${LABEL_WIDTH}" width="${VALUE_WIDTH}" height="${BADGE_HEIGHT}" fill="#b5b09b"/>
    <g transform="translate(12.5,10) scale(0.37) translate(-26,-21)">
      <path d="M14 8h16l8 4-8 4H14l8-4-8-4Zm0 9h16l8 4-8 4H14l8-4-8-4Zm0 9h16l8 4-8 4H14l8-4-8-4Z" fill="none" stroke="#f8f7f3" stroke-width="3" stroke-linejoin="round"/>
    </g>
    <text x="24" y="14" fill="#f8f7f3" font-family="${FONT_STACK}" font-size="11" font-weight="600" textLength="${LABEL_TEXT_WIDTH}" lengthAdjust="spacingAndGlyphs">TensorBlock</text>
    <text x="${LABEL_WIDTH + 10}" y="14" fill="#0c0a09" font-family="${FONT_STACK}" font-size="11" font-weight="600" textLength="${VALUE_TEXT_WIDTH}" lengthAdjust="spacingAndGlyphs">MCP Indexed</text>
  </g>
</svg>`;
};

export const renderMissingServerBadgeSvg = (serverId: string): string => {
  const title = `${serverId} was not resolved in TensorBlock MCP Index`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="246" height="34" viewBox="0 0 246 34" role="img" aria-label="${escapeAttribute(title)}">
  <title>${escapeXml(title)}</title>
  <defs>
    <clipPath id="r">
      <rect width="246" height="34" rx="6"/>
    </clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="246" height="34" fill="#f8f7f3"/>
    <rect width="136" height="34" fill="#4b5563"/>
    <rect x="135.5" y="0.5" width="110" height="33" fill="#f8f7f3" stroke="#e6e3db"/>
    <path d="M14 8h16l8 4-8 4H14l8-4-8-4Zm0 9h16l8 4-8 4H14l8-4-8-4Zm0 9h16l8 4-8 4H14l8-4-8-4Z" fill="none" stroke="#f8f7f3" stroke-width="1.25" stroke-linejoin="round"/>
    <text x="48" y="21.5" fill="#f8f7f3" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="650">TensorBlock</text>
    <text x="150" y="21.5" fill="#0c0a09" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="650">MCP Profile</text>
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
