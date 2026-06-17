const DEFAULT_WEB_PROFILE_BASE_URL = "https://tensorblock.co/mcp/servers";

export const webProfileBaseUrl = (): string =>
  (process.env.MCP_WEB_PROFILE_BASE_URL ?? DEFAULT_WEB_PROFILE_BASE_URL).replace(/\/+$/, "");

export const webProfileUrl = (serverId: string): string =>
  `${webProfileBaseUrl()}/${encodeURIComponent(serverId)}`;

export const webProfileTemplate = (): string =>
  `${webProfileBaseUrl()}/{id}`;
