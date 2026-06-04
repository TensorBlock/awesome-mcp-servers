import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

const schema = JSON.parse(readFileSync("schemas/server.schema.json", "utf8"));

describe("server.schema.json", () => {
  it("accepts a minimal catalog entry", () => {
    const ajv = new Ajv();
    const validate = ajv.compile(schema);
    const valid = validate({
      id: "github-owner-repo",
      name: "owner/repo",
      description: "Example MCP server.",
      category: "Search",
      source: {
        readmePath: "README.md",
        docsPath: "docs/search.md"
      },
      links: {
        primary: "https://github.com/owner/repo",
        repo: "https://github.com/owner/repo"
      },
      install: {
        commands: [],
        env: [],
        confidence: "low"
      },
      transport: ["unknown"],
      auth: {
        type: "unknown",
        notes: []
      },
      clients: [],
      tools: {
        count: null,
        names: [],
        source: "unknown"
      },
      license: "unknown",
      health: {
        repoPublic: null,
        packageFound: null,
        endpointReachable: null,
        lastCheckedAt: null
      },
      verification: {
        status: "unknown",
        notes: []
      },
      community: {
        maintainedBy: [],
        verifiedBy: [],
        claimed: false
      }
    });

    expect(valid).toBe(true);
    expect(validate.errors).toBeNull();
  });
});
