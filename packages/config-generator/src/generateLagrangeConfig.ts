import type { CatalogEntry, Confidence } from "../../catalog-builder/src/types.js";
import { findLaunchCommand } from "./generateConfig.js";

// LagrangeCloud runs an agent in a Linux sandbox that has Node 22 and uv, so a
// server can join an agent either as a hosted URL or as an `npx`/`uvx` package
// the sandbox starts itself. Local paths, Docker and git checkouts can't.
export type CloudRuntime =
  | { kind: "remote"; url: string }
  | { kind: "command"; command: "npx" | "uvx"; args: string[] };

// One entry under `mcp_servers:` in an agent's lgr.yaml, in the shape `lgr import` writes.
export type LagrangeMcpServer =
  | {
      name: string;
      url: string;
      secret?: string;
    }
  | {
      name: string;
      command: string;
      args: string[];
      env?: Record<string, string>;
    };

export interface LagrangeConfig {
  serverId: string;
  client: "lagrange";
  confidence: Confidence;
  cloudReady: boolean;
  mcp: LagrangeMcpServer | null;
  secrets: string[];
  signIn: boolean;
  notes: string[];
}

const REMOTE_TRANSPORTS = new Set(["streamable-http", "sse"]);

export const cloudRuntime = (entry: CatalogEntry): CloudRuntime | null => {
  const endpoint = entry.links.endpoint;

  if (endpoint && isPublicHttpUrl(endpoint) && entry.transport.some((transport) => REMOTE_TRANSPORTS.has(transport))) {
    return { kind: "remote", url: endpoint };
  }

  const parts = findLaunchCommand(entry.install.commands);

  if (!parts) {
    return null;
  }

  const [binary, ...args] = parts;

  if (binary === "npx") {
    return { kind: "command", command: "npx", args: args[0] === "-y" || args[0] === "--yes" ? args : ["-y", ...args] };
  }

  if (binary === "uvx") {
    return { kind: "command", command: "uvx", args };
  }

  return null;
};

export const generateLagrangeConfig = (entry: CatalogEntry): LagrangeConfig => {
  const runtime = cloudRuntime(entry);
  const name = serverName(entry);
  const notes: string[] = [];
  let mcp: LagrangeMcpServer | null = null;
  let secrets: string[] = [];
  let signIn = false;

  if (!runtime) {
    notes.push("No hosted endpoint or npx/uvx package is known, so LagrangeCloud's sandbox can't start this server.");
  } else if (runtime.kind === "remote") {
    if (entry.auth.type === "api-key" || entry.auth.type === "bearer") {
      // Keep the vendor's own name for its token when the catalog knows it.
      const secret = entry.install.env.length === 1 ? entry.install.env[0] : `${envName(name)}_TOKEN`;
      mcp = { name, url: runtime.url, secret };
      secrets = [secret];
      notes.push(`Store the server's token as secret ${secret}; it is sent as a bearer token.`);
      if (entry.auth.type === "api-key") {
        notes.push("If the server expects its key in another header, set it under headers: with ${" + secret + "} instead.");
      }
    } else {
      mcp = { name, url: runtime.url };
      signIn = entry.auth.type === "oauth";
      if (signIn) {
        notes.push("Sign in to this server on the agent's page after deploying.");
      }
    }
  } else {
    mcp = { name, command: runtime.command, args: runtime.args };
    secrets = [...new Set(entry.install.env)];
    if (secrets.length > 0) {
      mcp.env = Object.fromEntries(secrets.map((variable) => [variable, `\${${variable}}`]));
      notes.push("Every environment variable is listed as a secret; drop the ones this agent doesn't need.");
    }
  }

  if (mcp && entry.auth.type === "unknown") {
    notes.push("Authentication requirements are unknown; if the server needs a key, add it as a secret.");
  }

  if (entry.install.confidence === "low") {
    notes.push("Install confidence is low; verify this config before use.");
  }

  return {
    serverId: entry.id,
    client: "lagrange",
    confidence: entry.install.confidence,
    cloudReady: mcp !== null,
    mcp,
    secrets,
    signIn,
    notes,
  };
};

// Short, readable server names: "crystaldba/postgres-mcp" becomes "postgres-mcp".
const serverName = (entry: CatalogEntry): string => {
  const base = entry.name.split("/").filter(Boolean).at(-1) ?? entry.id;
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return slug || "mcp";
};

const envName = (name: string): string => name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");

const isPublicHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.host);
  } catch {
    return false;
  }
};
