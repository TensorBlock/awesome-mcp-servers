import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { FormatsPlugin } from "ajv-formats";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../src/types.js";

const schema = JSON.parse(readFileSync("schemas/server.schema.json", "utf8"));
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats") as FormatsPlugin;

const createValidator = () => {
  const ajv = new Ajv();
  addFormats(ajv);
  return ajv.compile(schema);
};

const createValidEntry = (): CatalogEntry => ({
  id: "github-owner-repo",
  name: "owner/repo",
  description: "Example MCP server.",
  category: "Search",
  source: {
    readmePath: "README.md",
    docsPath: "docs/search.md",
    featuredInReadme: true
  },
  links: {
    primary: "https://github.com/owner/repo",
    repo: "https://github.com/owner/repo",
    homepage: null,
    docs: null,
    endpoint: null
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

const expectInvalidMutation = (
  mutate: (entry: CatalogEntry) => void
) => {
  const validate = createValidator();
  const entry = createValidEntry();
  mutate(entry);

  expect(validate(entry)).toBe(false);
  expect(validate.errors).not.toBeNull();
};

describe("server.schema.json", () => {
  it("accepts a minimal catalog entry", () => {
    const validate = createValidator();
    const valid = validate(createValidEntry());

    expect(valid).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it.each([
    [
      "omitted source.docsPath",
      (entry: CatalogEntry) => {
        delete (entry.source as Partial<CatalogEntry["source"]>).docsPath;
      }
    ],
    [
      "extra properties",
      (entry: CatalogEntry) => {
        Object.assign(entry, { extra: true });
      }
    ],
    [
      "invalid enum values",
      (entry: CatalogEntry) => {
        (entry.auth as { type: string }).type = "basic";
      }
    ],
    [
      "empty transport",
      (entry: CatalogEntry) => {
        entry.transport = [];
      }
    ],
    [
      "bad tools.count",
      (entry: CatalogEntry) => {
        entry.tools.count = -1;
      }
    ],
    [
      "malformed id",
      (entry: CatalogEntry) => {
        entry.id = "GitHub/Owner Repo";
      }
    ],
    [
      "malformed URI",
      (entry: CatalogEntry) => {
        entry.links.primary = "not a uri";
      }
    ],
    [
      "malformed date-time",
      (entry: CatalogEntry) => {
        entry.health.lastCheckedAt = "2026-06-04";
      }
    ]
  ])("rejects %s", (_, mutate) => {
    expectInvalidMutation(mutate);
  });
});
