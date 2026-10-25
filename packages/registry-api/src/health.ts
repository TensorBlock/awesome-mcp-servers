import type { AuthType, CatalogEntry } from "../../catalog-builder/src/types.js";
import { cloudRuntime } from "../../config-generator/src/generateLagrangeConfig.js";
import { probeMcpEndpoint } from "./mcpProbe.js";

// What the last live check of a server found. A hosted server is "ok" when it
// answers an MCP initialize with a valid result (see mcpProbe.ts), and
// "auth-required" when it answers with a sign-in challenge, which still proves
// it is up. A package is "ok" when npm or PyPI has it.
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
  // For package lookups on npm and PyPI, which are fixed, trusted hosts.
  fetch?: typeof fetch;
  // Which addresses checks of hosted servers may connect to; public ones by default.
  allowAddress?: (address: string) => boolean;
  concurrency?: number;
  timeoutMs?: number;
  now?: () => Date;
}

const DEFAULT_CONCURRENCY = 16;
const DEFAULT_TIMEOUT_MS = 10_000;

// Checks every server LagrangeCloud could run, keeps the latest result per
// server in memory, and repeats on an interval, so new catalog entries are
// checked on the first run after they deploy and dead ones drop out of
// recommendations without anyone filing a report.
export class HealthMonitor {
  private readonly results = new Map<string, ServerHealth>();
  private readonly fetchImpl: typeof fetch;
  private readonly allowAddress: ((address: string) => boolean) | undefined;
  private readonly concurrency: number;
  private readonly timeoutMs: number;
  private readonly now: () => Date;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private lastRunStartedAt: string | null = null;
  private lastRunFinishedAt: string | null = null;

  constructor(private readonly catalog: CatalogEntry[], options: HealthMonitorOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
    this.allowAddress = options.allowAddress;
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
        const result = await probeMcpEndpoint(runtime.url, {
          deadline: Date.now() + this.timeoutMs,
          allowAddress: this.allowAddress,
          legacySse: entry.transport.includes("sse"),
        });
        return { ...result, checkedAt };
      }

      return { ...(await this.checkPackage(runtime.command, runtime.args)), checkedAt };
    } catch (error) {
      return { status: "failing", auth: null, detail: errorMessage(error), checkedAt };
    }
  }

  private async checkPackage(command: "npx" | "uvx", args: string[]): Promise<Omit<ServerHealth, "checkedAt">> {
    const name = command === "npx" ? npmPackageName(args) : pypiPackageName(args);

    if (!name) {
      return { status: "unchecked", auth: null, detail: "Package is not on a registry" };
    }

    const url = command === "npx"
      ? `https://registry.npmjs.org/${name.replace("/", "%2F")}`
      : `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
    const status = await this.registryStatus(url);
    const registry = command === "npx" ? "npm" : "PyPI";

    if (status === 200) {
      return { status: "ok", auth: null, detail: `${registry} package ${name}` };
    }

    return {
      status: "failing",
      auth: null,
      detail: status === 404 ? `${registry} has no package ${name}` : `${registry} answered HTTP ${status}`,
    };
  }

  // The HTTP status of a package registry lookup. npm and PyPI are fixed hosts,
  // so their redirects (PyPI's to a package's canonical name) are followed.
  private async registryStatus(url: string): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, { headers: { Accept: "application/json" }, redirect: "follow", signal: controller.signal });
      await response.body?.cancel().catch(() => undefined);
      return response.status;
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
