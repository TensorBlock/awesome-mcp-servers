import type { CatalogEntry, Confidence } from "../../catalog-builder/src/types.js";

export type ClientName = "claude" | "cursor" | "codex" | "vscode";

export interface GeneratedConfig {
  serverId: string;
  client: ClientName;
  confidence: Confidence;
  config: {
    mcpServers: Record<string, ServerConfig>;
  };
  notes: string[];
}

type ServerConfig =
  | {
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  | {
      url: string;
    };

const PLACEHOLDER_CONFIG: ServerConfig = {
  command: "<command>",
  args: ["<args>"],
};

export const generateClientConfig = (
  entry: CatalogEntry,
  client: ClientName
): GeneratedConfig => {
  const serverConfig = buildServerConfig(entry);

  return {
    serverId: entry.id,
    client,
    confidence: entry.install.confidence,
    config: {
      mcpServers: {
        [entry.id]: serverConfig,
      },
    },
    notes: buildNotes(entry),
  };
};

const buildServerConfig = (entry: CatalogEntry): ServerConfig => {
  const commandParts = splitCommand(entry.install.commands[0] ?? "");

  if (commandParts.length > 0) {
    const [command, ...args] = commandParts;
    const config: ServerConfig = {
      command,
      args,
    };

    if (entry.install.env.length > 0) {
      config.env = Object.fromEntries(
        entry.install.env.map((name) => [name, `<${name}>`])
      );
    }

    return config;
  }

  if (entry.links.endpoint) {
    return {
      url: entry.links.endpoint,
    };
  }

  return PLACEHOLDER_CONFIG;
};

const buildNotes = (entry: CatalogEntry): string[] => {
  const notes: string[] = [];

  if (entry.install.confidence === "low") {
    notes.push("Install confidence is low; verify this config before use.");
  }

  if (entry.auth.type === "unknown") {
    notes.push("Authentication requirements are unknown.");
  } else if (entry.auth.type !== "none") {
    notes.push(`Authentication type: ${entry.auth.type}.`);
  }

  return notes;
};

const splitCommand = (command: string): string[] => {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | "\"" | null = null;
  let escaping = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += "\\";
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
};
