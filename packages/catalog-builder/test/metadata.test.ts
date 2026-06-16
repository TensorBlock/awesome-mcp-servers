import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readMetadataSidecars } from "../src/metadata.js";

describe("readMetadataSidecars", () => {
  it("returns an empty map when the metadata directory does not exist", () => {
    expect(readMetadataSidecars(join(tmpdir(), "missing-mcp-metadata-dir")).size).toBe(0);
  });

  it("loads sidecar metadata by explicit id", () => {
    const metadataDir = mkdtempSync(join(tmpdir(), "mcp-metadata-"));

    try {
      writeFileSync(
        join(metadataDir, "ignored-file-name.json"),
        JSON.stringify({
          id: "github-owner-demo-12345678",
          install: {
            commands: ["npx -y demo"],
            confidence: "medium",
          },
        }),
      );

      const metadata = readMetadataSidecars(metadataDir);

      expect(metadata.get("github-owner-demo-12345678")?.install?.commands).toEqual(["npx -y demo"]);
    } finally {
      rmSync(metadataDir, { recursive: true, force: true });
    }
  });
});
