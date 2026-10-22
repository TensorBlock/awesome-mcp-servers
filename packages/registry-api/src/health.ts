import type { AuthType, CatalogEntry } from "../../catalog-builder/src/types.js";
import { cloudRuntime } from "../../config-generator/src/generateLagrangeConfig.js";

// What the last live check of a server found. A hosted server is "ok" when it
// completes an MCP initialize, and "auth-required" when it answers 401/403, which
// still proves it is up. A package is "ok" when npm or PyPI has it.
export type HealthStatus = "ok" | "auth-required" | "failing" | "unchecked";

export interface ServerHealth {
  status: HealthStatus;
  auth: AuthType | null;
  detail: string | null;
  checkedAt: string;
}

export interface HealthSummary {
  enabled: boolean;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  checked: number;
  counts: Record<HealthStatus, number>;
}

export interface HealthMonitorOptions {
  fetch?: typeof fetch;
  concurrency?: number;
  timeoutMs?: number;
  now?: () => Date;
}

const DEFAULT_CONCURRENCY = 16;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 64 * 1024;

const INITIALIZE_REQUEST = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "tensorblock-mcp-index-health", version: "1.0" },
  },
});

// Checks every server LagrangeCloud could run, keeps the latest result per
// server in memory, and repeats on an interval, so new catalog entries are
// checked on the first run after they deploy and dead ones drop out of
// recommendations without anyone filing a report.
export class HealthMonitor {
  private readonly results = new Map<string, ServerHealth>();
  private readonly fetchImpl: typeof fetch;
  private readonly concurrency: number;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private lastRunStartedAt: string | null = null;
  private lastRunFinishedAt: string | null = null;

  constructor(private readonly catalog: CatalogEntry[], options: HealthMonitorOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
  }

  get(serverId: string): ServerHealth | undefined {
    return this.results.get(serverId);
  }

  start(intervalMs: number): void {
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  runOnce(): Promise<void> {
    this.running ??= this.run().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  summary(): HealthSummary {
    const counts: Record<HealthStatus, number> = { "ok": 0, "auth-required": 0, "failing": 0, "unchecked": 0 };

    for (const health of this.results.values()) {
      counts[health.status] += 1;
    }

    return {
      enabled: true,
      lastRunStartedAt: this.lastRunStartedAt,
      lastRunFinishedAt: this.lastRunFinishedAt,
      checked: this.results.size,
      counts,
    };
  }

  private async run(): Promise<void> {
    this.lastRunStartedAt = this.now().toISOString();
    // Servers never checked go first, so a fresh deploy covers new entries early.
    const queue = this.catalog
      .filter((entry) => cloudRuntime(entry) !== null)
      .sort((left, right) => Number(this.results.has(left.id)) - Number(this.results.has(right.id)));

    const worker = async (): Promise<void> => {
      for (let entry = queue.shift(); entry; entry = queue.shift()) {
        this.results.set(entry.id, await this.check(entry));
      }
    };

    await Promise.all(Array.from({ length: this.concurrency }, worker));
    this.lastRunFinishedAt = this.now().toISOString();
  }

  private async check(entry: CatalogEntry): Promise<ServerHealth> {
    const runtime = cloudRuntime(entry);
    const checkedAt = this.now().toISOString();

    try {
      if (!runtime) {
        return { status: "unchecked", auth: null, detail: null, checkedAt };
      }

      if (runtime.kind === "remote") {
        return { ...(await this.checkEndpoint(runtime.url, entry.transport.includes("sse"))), checkedAt };
      }

      return { ...(await this.checkPackage(runtime.command, runtime.args)), checkedAt };
    } catch (error) {
      return { status: "failing", auth: null, detail: errorMessage(error), checkedAt };
    }
  }

  private async checkEndpoint(url: string, legacySse: boolean): Promise<Omit<ServerHealth, "checkedAt">> {
    const posted = await this.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
      },
      body: INITIALIZE_REQUEST,
    });

    // Servers on the older SSE transport open their stream with a GET instead.
    const response = legacySse && (posted.status === 404 || posted.status === 405)
      ? await this.request(url, { method: "GET", headers: { Accept: "text/event-stream" } }, "event:")
      : posted;

    if (response.status === 401 || response.status === 403) {
      const challenge = response.headers.get("www-authenticate") ?? "";
      return {
        status: "auth-required",
        auth: /resource_metadata|realm="oauth"/i.test(challenge) ? "oauth" : "bearer",
        detail: `HTTP ${response.status}`,
      };
    }

    if (response.status === 200 && (response.matched || /protocolVersion/.test(response.body))) {
      return { status: "ok", auth: "none", detail: null };
    }

    return { status: "failing", auth: null, detail: `HTTP ${response.status}` };
  }

  private async checkPackage(command: "npx" | "uvx", args: string[]): Promise<Omit<ServerHealth, "checkedAt">> {
    const name = command === "npx" ? npmPackageName(args) : pypiPackageName(args);

    if (!name) {
      return { status: "unchecked", auth: null, detail: "Package is not on a registry" };
    }

    const url = command === "npx"
      ? `https://registry.npmjs.org/${name.replace("/", "%2F")}`
      : `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
    const response = await this.request(url, { method: "GET", headers: { Accept: "application/json" } });
    const registry = command === "npx" ? "npm" : "PyPI";

    if (response.status === 200) {
      return { status: "ok", auth: null, detail: `${registry} package ${name}` };
    }

    return {
      status: "failing",
      auth: null,
      detail: response.status === 404 ? `${registry} has no package ${name}` : `${registry} answered HTTP ${response.status}`,
    };
  }

  // Reads at most MAX_BODY_BYTES, and stops early once `until` shows up, since
  // an MCP server may hold an event stream open after its first message.
  private async request(
    url: string,
    init: RequestInit,
    until = "protocolVersion"
  ): Promise<{ status: number; headers: Headers; body: string; matched: boolean }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, { ...init, redirect: "follow", signal: controller.signal });
      let body = "";
      let matched = false;

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (body.length < MAX_BODY_BYTES) {
          const chunk = await reader.read().catch(() => ({ done: true, value: undefined }));
          if (chunk.done) {
            break;
          }
          body += decoder.decode(chunk.value, { stream: true });
          if (body.includes(until)) {
            matched = true;
            break;
          }
        }

        await reader.cancel().catch(() => undefined);
      }

      return { status: response.status, headers: response.headers, body, matched };
    } finally {
      clearTimeout(timeout);
    }
  }
}

// The catalog entry as the live check saw it: a server listed with unknown auth
// takes the auth its endpoint asked for, so its lgr.yaml entry gets a token
// secret or a sign-in instead of failing on the first run.
export const withCheckedAuth = (entry: CatalogEntry, health: ServerHealth | undefined): CatalogEntry =>
  entry.auth.type === "unknown" && health?.auth
    ? { ...entry, auth: { ...entry.auth, type: health.auth } }
    : entry;

export const isHealthy = (health: ServerHealth | undefined): boolean =>
  health?.status === "ok" || health?.status === "auth-required";

// "@scope/pkg@1.2.3" -> "@scope/pkg"; git URLs, tarballs and paths aren't on npm.
export const npmPackageName = (args: string[]): string | null => {
  const spec = args.find((arg) => !arg.startsWith("-"));

  if (!spec || /^(github:|git\+|https?:|file:|\.|\/)/.test(spec)) {
    return null;
  }

  const name = spec.startsWith("@")
    ? spec.split("@").slice(0, 2).join("@")
    : spec.split("@")[0];

  return /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name) ? name : null;
};

// "uvx --from pkg[extra]==1.0 cmd" -> "pkg"; "uvx pkg@latest" -> "pkg".
export const pypiPackageName = (args: string[]): string | null => {
  let spec: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--from") {
      spec = args[index + 1];
      break;
    }

    if (arg === "--with" || arg === "--python" || arg === "-p") {
      index += 1;
      continue;
    }

    if (!arg.startsWith("-")) {
      spec = arg;
      break;
    }
  }

  if (!spec || /^(git\+|https?:|file:|\.|\/)/.test(spec)) {
    return null;
  }

  const name = spec.split(/[@=<>~![\s]/)[0];
  return /^[a-z0-9][\w.-]*$/i.test(name) ? name : null;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "Timed out" : (error.cause instanceof Error ? error.cause.message : error.message);
  }

  return "Unknown error";
};
