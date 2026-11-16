import { spawn } from "node:child_process";
import { once } from "node:events";
import { get } from "node:http";
import { describe, expect, it } from "vitest";

const request = (port: number, path: string): Promise<{ status: number; body: string }> =>
  new Promise((resolve, reject) => {
    const outgoing = get({ hostname: "127.0.0.1", port, path }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
      response.on("error", reject);
    });
    outgoing.on("error", reject);
    outgoing.setTimeout(3000, () => outgoing.destroy(new Error("Request timed out")));
  });

describe("malformed HTTP request targets", () => {
  it.each(["//[", "http://[", "http://localhost:bad", "http://"])(
    "rejects %s and keeps the same API process serving requests", async (target) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
        import { createRegistryApiServer } from "./packages/registry-api/src/server.ts";
        const server = createRegistryApiServer({
          catalog: [], loadedAt: "2026-06-06T00:00:00.000Z",
          build: { commitSha: null, builtAt: null },
        });
        server.listen(0, "127.0.0.1", () => console.log(server.address().port));
      `], { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

      try {
        const port = await new Promise<number>((resolve, reject) => {
          child.stdout.once("data", (chunk: Buffer) => resolve(Number(chunk.toString().trim())));
          child.once("error", reject);
          child.once("exit", (code) => reject(new Error(`API exited with ${code}: ${stderr}`)));
        });
        expect(port).toBeGreaterThan(0);

        const rejected = await request(port, target);
        expect(rejected.status).toBe(400);
        expect(JSON.parse(rejected.body)).toEqual({
          error: { statusCode: 400, message: "Invalid request URL" },
        });
        const healthy = await request(port, "/health");
        expect(healthy.status).toBe(200);
        expect(JSON.parse(healthy.body).status).toBe("ok");
        expect(child.exitCode).toBeNull();
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill();
          await exited;
        }
      }
    }, 10000);
});
