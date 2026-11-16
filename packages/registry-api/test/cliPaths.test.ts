import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const loaderUrl = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

describe("registry API CLI filesystem paths", () => {
  it.each(["hash#mark", "query?mark", "literal%20escape", "plain", "with space"])(
    "starts the API from a directory containing %s",
    async (suffix) => {
      const directory = mkdtempSync(join(tmpdir(), `registry-cli-${suffix}-`));
      cpSync(resolve("packages"), join(directory, "packages"), { recursive: true });
      cpSync(resolve("package.json"), join(directory, "package.json"));
      const catalogPath = join(directory, "catalog.json");
      writeFileSync(catalogPath, "[]");
      const child = spawn(process.execPath, [
        "--import", loaderUrl,
        join(directory, "packages/registry-api/src/server.ts"),
      ], {
        cwd: directory,
        env: {
          ...process.env,
          HOST: "127.0.0.1",
          PORT: "0",
          CATALOG_PATH: catalogPath,
          BUILD_INFO_PATH: join(directory, "missing-build-info.json"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      const closed = once(child, "close");

      try {
        const started = await new Promise<boolean>((resolveStart, reject) => {
          const timer = setTimeout(() => reject(new Error(`API startup timed out: ${stderr}`)), 10000);
          child.once("error", (error) => { clearTimeout(timer); reject(error); });
          child.once("exit", () => { clearTimeout(timer); resolveStart(false); });
          child.stdout.on("data", () => {
            if (stdout.includes("Loaded 0 catalog entries")) {
              clearTimeout(timer);
              resolveStart(true);
            }
          });
        });
        expect(started, `stdout: ${stdout}\nstderr: ${stderr}`).toBe(true);
        expect(stdout).toContain("TensorBlock MCP Index API listening on 127.0.0.1:0");
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
        await closed;
        rmSync(directory, { recursive: true, force: true });
      }
    },
    15000,
  );
});
