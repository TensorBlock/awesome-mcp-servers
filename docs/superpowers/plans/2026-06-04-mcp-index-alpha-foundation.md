# MCP Index Alpha Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shippable MCP Index alpha foundation: structured catalog generation, install config generation, static profile JSON, and a local registry MCP server.

**Architecture:** Add a small TypeScript workspace inside the existing markdown repo. The markdown list remains the source of truth while new packages parse it into structured JSON, generate client configs, render profile artifacts, and expose the catalog through an MCP registry server.

**Tech Stack:** TypeScript, Node.js 20+, Vitest, Zod, AJV, `@modelcontextprotocol/sdk`, GitHub CLI for manual validation.

---

## Scope

This plan implements the first alpha foundation only. It does not build a hosted web app, login, profile claiming, full sandbox verification, or production CI deployment.

## File Structure

Create:

- `package.json` - workspace scripts and dev dependencies.
- `tsconfig.base.json` - shared TypeScript compiler options.
- `vitest.config.ts` - test runner configuration.
- `schemas/server.schema.json` - JSON Schema for catalog entries.
- `packages/catalog-builder/src/types.ts` - shared catalog types.
- `packages/catalog-builder/src/category-map.ts` - category heading to docs path mapping.
- `packages/catalog-builder/src/parseMarkdown.ts` - README/docs markdown parser.
- `packages/catalog-builder/src/buildCatalog.ts` - catalog assembly and diagnostics.
- `packages/catalog-builder/src/cli.ts` - `catalog:build` CLI entrypoint.
- `packages/catalog-builder/test/parseMarkdown.test.ts` - parser tests.
- `packages/catalog-builder/test/buildCatalog.test.ts` - catalog build tests.
- `packages/config-generator/src/generateConfig.ts` - client config generation.
- `packages/config-generator/src/cli.ts` - config CLI entrypoint.
- `packages/config-generator/test/generateConfig.test.ts` - config tests.
- `packages/profile-renderer/src/renderProfiles.ts` - static profile JSON and badge output.
- `packages/profile-renderer/src/cli.ts` - profile renderer CLI.
- `packages/profile-renderer/test/renderProfiles.test.ts` - profile tests.
- `packages/registry-mcp/src/server.ts` - MCP registry server.
- `packages/registry-mcp/test/server.test.ts` - registry tool tests.
- `docs/index-alpha/contribution-guide.md` - contributor-facing metadata guidance.
- `docs/index-alpha/launch-plan.md` - alpha launch and engagement plan.

Generated during implementation:

- `data/catalog.json`
- `data/catalog-errors.json`
- `data/profiles/*.json`
- `data/install-configs/*.json`

Modify:

- `README.md` - add a short MCP Index Alpha section and point contributors to the new guide.

Do not modify:

- Existing category list content except the small README alpha section.
- Untracked `CLAUDE.md`.

## Task 1: Toolchain Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create workspace package manifest**

Create `package.json`:

```json
{
  "name": "awesome-mcp-servers",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.base.json --noEmit",
    "catalog:build": "tsx packages/catalog-builder/src/cli.ts",
    "profiles:build": "tsx packages/profile-renderer/src/cli.ts",
    "config:generate": "tsx packages/config-generator/src/cli.ts",
    "registry:mcp": "tsx packages/registry-mcp/src/server.ts"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "ajv": "^8.0.0",
    "zod": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist-ts"
  },
  "include": [
    "packages/**/*.ts",
    "vitest.config.ts"
  ]
}
```

- [ ] **Step 3: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and dependencies install without errors.

- [ ] **Step 5: Verify empty test suite**

Run:

```bash
npm test -- --passWithNoTests
npm run typecheck
```

Expected: typecheck passes; tests pass with no matching test files or no failures.

- [ ] **Step 6: Commit toolchain**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts
git commit -m "chore: add MCP Index TypeScript toolchain"
```

## Task 2: Server Schema and Shared Types

**Files:**
- Create: `schemas/server.schema.json`
- Create: `packages/catalog-builder/src/types.ts`
- Test: `packages/catalog-builder/test/schema.test.ts`

- [ ] **Step 1: Write schema validation test**

Create `packages/catalog-builder/test/schema.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Ajv from "ajv";

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
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- packages/catalog-builder/test/schema.test.ts
```

Expected: fails because `schemas/server.schema.json` does not exist.

- [ ] **Step 3: Create JSON schema**

Create `schemas/server.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://tensorblock.co/schemas/mcp-server.json",
  "type": "object",
  "required": [
    "id",
    "name",
    "description",
    "category",
    "source",
    "links",
    "install",
    "transport",
    "auth",
    "clients",
    "tools",
    "license",
    "health",
    "verification",
    "community"
  ],
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "name": { "type": "string", "minLength": 1 },
    "description": { "type": "string" },
    "category": { "type": "string", "minLength": 1 },
    "source": {
      "type": "object",
      "required": ["readmePath"],
      "properties": {
        "readmePath": { "type": "string" },
        "docsPath": { "type": ["string", "null"] },
        "pullRequest": { "type": ["integer", "null"] }
      },
      "additionalProperties": false
    },
    "links": {
      "type": "object",
      "required": ["primary"],
      "properties": {
        "primary": { "type": "string" },
        "repo": { "type": ["string", "null"] },
        "homepage": { "type": ["string", "null"] },
        "docs": { "type": ["string", "null"] },
        "endpoint": { "type": ["string", "null"] }
      },
      "additionalProperties": false
    },
    "install": {
      "type": "object",
      "required": ["commands", "env", "confidence"],
      "properties": {
        "commands": { "type": "array", "items": { "type": "string" } },
        "env": { "type": "array", "items": { "type": "string" } },
        "confidence": { "enum": ["high", "medium", "low"] }
      },
      "additionalProperties": false
    },
    "transport": {
      "type": "array",
      "items": { "enum": ["stdio", "streamable-http", "sse", "unknown"] },
      "minItems": 1
    },
    "auth": {
      "type": "object",
      "required": ["type", "notes"],
      "properties": {
        "type": { "enum": ["none", "api-key", "oauth", "bearer", "unknown"] },
        "notes": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    },
    "clients": { "type": "array", "items": { "type": "string" } },
    "tools": {
      "type": "object",
      "required": ["count", "names", "source"],
      "properties": {
        "count": { "type": ["integer", "null"], "minimum": 0 },
        "names": { "type": "array", "items": { "type": "string" } },
        "source": { "enum": ["self_reported", "verified", "unknown"] }
      },
      "additionalProperties": false
    },
    "license": { "type": "string" },
    "health": {
      "type": "object",
      "required": ["repoPublic", "packageFound", "endpointReachable", "lastCheckedAt"],
      "properties": {
        "repoPublic": { "type": ["boolean", "null"] },
        "packageFound": { "type": ["boolean", "null"] },
        "endpointReachable": { "type": ["boolean", "null"] },
        "lastCheckedAt": { "type": ["string", "null"] }
      },
      "additionalProperties": false
    },
    "verification": {
      "type": "object",
      "required": ["status", "notes"],
      "properties": {
        "status": { "enum": ["unknown", "self_reported", "partial", "verified", "failing"] },
        "notes": { "type": "array", "items": { "type": "string" } }
      },
      "additionalProperties": false
    },
    "community": {
      "type": "object",
      "required": ["maintainedBy", "verifiedBy", "claimed"],
      "properties": {
        "maintainedBy": { "type": "array", "items": { "type": "string" } },
        "verifiedBy": { "type": "array", "items": { "type": "string" } },
        "claimed": { "type": "boolean" }
      },
      "additionalProperties": false
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 4: Create TypeScript types**

Create `packages/catalog-builder/src/types.ts`:

```ts
export type Transport = "stdio" | "streamable-http" | "sse" | "unknown";
export type AuthType = "none" | "api-key" | "oauth" | "bearer" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type VerificationStatus = "unknown" | "self_reported" | "partial" | "verified" | "failing";

export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  source: {
    readmePath: string;
    docsPath: string | null;
    pullRequest?: number | null;
  };
  links: {
    primary: string;
    repo?: string | null;
    homepage?: string | null;
    docs?: string | null;
    endpoint?: string | null;
  };
  install: {
    commands: string[];
    env: string[];
    confidence: Confidence;
  };
  transport: Transport[];
  auth: {
    type: AuthType;
    notes: string[];
  };
  clients: string[];
  tools: {
    count: number | null;
    names: string[];
    source: "self_reported" | "verified" | "unknown";
  };
  license: string;
  health: {
    repoPublic: boolean | null;
    packageFound: boolean | null;
    endpointReachable: boolean | null;
    lastCheckedAt: string | null;
  };
  verification: {
    status: VerificationStatus;
    notes: string[];
  };
  community: {
    maintainedBy: string[];
    verifiedBy: string[];
    claimed: boolean;
  };
}

export interface ParsedMarkdownEntry {
  category: string;
  name: string;
  url: string;
  description: string;
  sourcePath: string;
  line: number;
}

export interface CatalogBuildError {
  code: "missing_docs_mirror" | "duplicate_url" | "parse_error";
  message: string;
  entryId?: string;
  sourcePath?: string;
  line?: number;
}
```

- [ ] **Step 5: Run schema test and typecheck**

Run:

```bash
npm test -- packages/catalog-builder/test/schema.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit schema and types**

```bash
git add schemas/server.schema.json packages/catalog-builder/src/types.ts packages/catalog-builder/test/schema.test.ts
git commit -m "feat: add MCP server catalog schema"
```

## Task 3: Markdown Catalog Parser

**Files:**
- Create: `packages/catalog-builder/src/category-map.ts`
- Create: `packages/catalog-builder/src/parseMarkdown.ts`
- Test: `packages/catalog-builder/test/parseMarkdown.test.ts`

- [ ] **Step 1: Write parser tests**

Create `packages/catalog-builder/test/parseMarkdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMarkdownEntries, slugFromUrl } from "../src/parseMarkdown.js";

describe("parseMarkdownEntries", () => {
  it("parses category entries from README-style markdown", () => {
    const markdown = [
      "# Awesome MCP Servers",
      "",
      "## 🔎 Search",
      "",
      "Servers providing web search capabilities.",
      "",
      "- [owner/search-mcp](https://github.com/owner/search-mcp): Search the web through MCP.",
      "- [Hosted Search](https://example.com/mcp) - Hosted search MCP endpoint.",
      "",
      "## 🔒 Security",
      "",
      "- [owner/security-mcp](https://github.com/owner/security-mcp): Security scanner."
    ].join("\n");

    const entries = parseMarkdownEntries(markdown, "README.md");

    expect(entries).toEqual([
      {
        category: "Search",
        name: "owner/search-mcp",
        url: "https://github.com/owner/search-mcp",
        description: "Search the web through MCP.",
        sourcePath: "README.md",
        line: 7
      },
      {
        category: "Search",
        name: "Hosted Search",
        url: "https://example.com/mcp",
        description: "Hosted search MCP endpoint.",
        sourcePath: "README.md",
        line: 8
      },
      {
        category: "Security",
        name: "owner/security-mcp",
        url: "https://github.com/owner/security-mcp",
        description: "Security scanner.",
        sourcePath: "README.md",
        line: 12
      }
    ]);
  });

  it("ignores non-entry links and malformed bullets", () => {
    const markdown = [
      "## 🔎 Search",
      "- This bullet has no link.",
      "- [No description](https://example.com)",
      "- [Valid](https://example.com/valid): Valid description."
    ].join("\n");

    const entries = parseMarkdownEntries(markdown, "README.md");

    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("Valid");
  });
});

describe("slugFromUrl", () => {
  it("creates stable GitHub slugs", () => {
    expect(slugFromUrl("https://github.com/Owner/Repo")).toBe("github-owner-repo");
  });

  it("creates stable domain slugs", () => {
    expect(slugFromUrl("https://example.com/mcp/server")).toBe("example-com-mcp-server");
  });
});
```

- [ ] **Step 2: Run parser tests to verify failure**

Run:

```bash
npm test -- packages/catalog-builder/test/parseMarkdown.test.ts
```

Expected: fails because `parseMarkdown.ts` does not exist.

- [ ] **Step 3: Create category map**

Create `packages/catalog-builder/src/category-map.ts`:

```ts
export const CATEGORY_TO_DOCS_PATH: Record<string, string> = {
  "AI & LLM Integration": "docs/ai--llm-integration.md",
  "Art, Culture & Media": "docs/art-culture--media.md",
  "Browser Automation & Web Scraping": "docs/browser-automation--web-scraping.md",
  "Build & Deployment Tools": "docs/build--deployment-tools.md",
  "Cloud Platforms & Services": "docs/cloud-platforms--services.md",
  "Code Analysis & Quality": "docs/code-analysis--quality.md",
  "Code Execution": "docs/code-execution.md",
  "Communication & Messaging": "docs/communication--messaging.md",
  "Content Management Systems": "docs/content-management-systems.md",
  "Data Analysis & Business Intelligence": "docs/data-analysis--business-intelligence.md",
  "Databases": "docs/databases.md",
  "Developer Productivity & Utilities": "docs/developer-productivity--utilities.md",
  "Filesystems": "docs/filesystems.md",
  "Finance & Crypto": "docs/finance--crypto.md",
  "Frameworks": "docs/frameworks.md",
  "Gaming": "docs/gaming.md",
  "Hardware & IoT": "docs/hardware--iot.md",
  "Healthcare & Life Sciences": "docs/healthcare--life-sciences.md",
  "Infrastructure": "docs/infrastructure.md",
  "Knowledge Management & Memory": "docs/knowledge-management--memory.md",
  "Location & Maps": "docs/location--maps.md",
  "Marketing, Sales & CRM": "docs/marketing-sales--crm.md",
  "Monitoring & Observability": "docs/monitoring--observability.md",
  "Multimedia Processing": "docs/multimedia-processing.md",
  "Operating System & Command Line": "docs/operating-system--command-line.md",
  "Project & Task Management": "docs/project--task-management.md",
  "Science & Research": "docs/science--research.md",
  "Search": "docs/search.md",
  "Security": "docs/security.md",
  "Social Media & Content Platforms": "docs/social-media--content-platforms.md",
  "Sports": "docs/sports.md",
  "Travel & Transportation": "docs/travel--transportation.md",
  "Utilities & Helpers": "docs/utilities--helpers.md",
  "Version Control": "docs/version-control.md"
};
```

- [ ] **Step 4: Implement parser**

Create `packages/catalog-builder/src/parseMarkdown.ts`:

```ts
import type { ParsedMarkdownEntry } from "./types.js";

const ENTRY_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*(?::|-|—|–)\s*(.+)$/;

export function cleanCategoryHeading(raw: string): string {
  return raw
    .replace(/^#+\s*/, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

export function parseMarkdownEntries(markdown: string, sourcePath: string): ParsedMarkdownEntry[] {
  const entries: ParsedMarkdownEntry[] = [];
  let category: string | null = null;
  const lines = markdown.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.startsWith("## ")) {
      category = cleanCategoryHeading(line);
      return;
    }

    const match = line.match(ENTRY_RE);
    if (!match || !category) {
      return;
    }

    const [, name, url, description] = match;
    entries.push({
      category,
      name: name.trim(),
      url: url.trim(),
      description: description.trim(),
      sourcePath,
      line: index + 1
    });
  });

  return entries;
}

export function slugFromUrl(url: string): string {
  const parsed = new URL(url);
  const parts = [parsed.hostname.replace(/^www\./, ""), parsed.pathname]
    .join("/")
    .replace(/^github\.com\/([^/]+)\/([^/]+).*$/i, "github-$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return parts || "unknown-server";
}
```

- [ ] **Step 5: Run parser tests**

Run:

```bash
npm test -- packages/catalog-builder/test/parseMarkdown.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit parser**

```bash
git add packages/catalog-builder/src/category-map.ts packages/catalog-builder/src/parseMarkdown.ts packages/catalog-builder/test/parseMarkdown.test.ts
git commit -m "feat: parse MCP catalog markdown entries"
```

## Task 4: Catalog Builder CLI

**Files:**
- Create: `packages/catalog-builder/src/buildCatalog.ts`
- Create: `packages/catalog-builder/src/cli.ts`
- Test: `packages/catalog-builder/test/buildCatalog.test.ts`
- Generated: `data/catalog.json`
- Generated: `data/catalog-errors.json`

- [ ] **Step 1: Write catalog build test**

Create `packages/catalog-builder/test/buildCatalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCatalogFromMarkdown } from "../src/buildCatalog.js";

describe("buildCatalogFromMarkdown", () => {
  it("builds entries and flags missing docs mirrors", () => {
    const readme = [
      "## 🔎 Search",
      "- [owner/search-mcp](https://github.com/owner/search-mcp): Search tool.",
      "- [Only README](https://github.com/owner/only-readme): Missing mirror."
    ].join("\n");

    const docs = new Map([
      [
        "docs/search.md",
        [
          "## 🔎 Search",
          "- [owner/search-mcp](https://github.com/owner/search-mcp): Search tool."
        ].join("\n")
      ]
    ]);

    const result = buildCatalogFromMarkdown(readme, docs);

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].id).toBe("github-owner-search-mcp");
    expect(result.entries[0].source.docsPath).toBe("docs/search.md");
    expect(result.errors).toEqual([
      {
        code: "missing_docs_mirror",
        message: "Entry is present in README.md but missing from docs/search.md",
        entryId: "github-owner-only-readme",
        sourcePath: "README.md",
        line: 3
      }
    ]);
  });

  it("flags duplicate URLs", () => {
    const readme = [
      "## 🔎 Search",
      "- [First](https://example.com/mcp): First entry.",
      "- [Second](https://example.com/mcp): Second entry."
    ].join("\n");

    const result = buildCatalogFromMarkdown(readme, new Map());

    expect(result.errors.some((error) => error.code === "duplicate_url")).toBe(true);
  });
});
```

- [ ] **Step 2: Run catalog build test to verify failure**

Run:

```bash
npm test -- packages/catalog-builder/test/buildCatalog.test.ts
```

Expected: fails because `buildCatalog.ts` does not exist.

- [ ] **Step 3: Implement catalog builder**

Create `packages/catalog-builder/src/buildCatalog.ts`:

```ts
import type { CatalogBuildError, CatalogEntry, ParsedMarkdownEntry } from "./types.js";
import { CATEGORY_TO_DOCS_PATH } from "./category-map.js";
import { parseMarkdownEntries, slugFromUrl } from "./parseMarkdown.js";

export interface CatalogBuildResult {
  entries: CatalogEntry[];
  errors: CatalogBuildError[];
}

export function buildCatalogFromMarkdown(
  readmeMarkdown: string,
  docsByPath: Map<string, string>
): CatalogBuildResult {
  const readmeEntries = parseMarkdownEntries(readmeMarkdown, "README.md");
  const docsEntriesByPath = new Map<string, ParsedMarkdownEntry[]>();

  for (const [path, markdown] of docsByPath.entries()) {
    docsEntriesByPath.set(path, parseMarkdownEntries(markdown, path));
  }

  const errors: CatalogBuildError[] = [];
  const seenUrls = new Map<string, ParsedMarkdownEntry>();

  const entries = readmeEntries.map((entry) => {
    const id = slugFromUrl(entry.url);
    const docsPath = CATEGORY_TO_DOCS_PATH[entry.category] ?? null;
    const docsEntries = docsPath ? docsEntriesByPath.get(docsPath) ?? [] : [];
    const mirrored = docsEntries.some((docsEntry) => normalizeUrl(docsEntry.url) === normalizeUrl(entry.url));

    const previous = seenUrls.get(normalizeUrl(entry.url));
    if (previous) {
      errors.push({
        code: "duplicate_url",
        message: `Duplicate URL also appears at ${previous.sourcePath}:${previous.line}`,
        entryId: id,
        sourcePath: entry.sourcePath,
        line: entry.line
      });
    } else {
      seenUrls.set(normalizeUrl(entry.url), entry);
    }

    if (docsPath && !mirrored) {
      errors.push({
        code: "missing_docs_mirror",
        message: `Entry is present in README.md but missing from ${docsPath}`,
        entryId: id,
        sourcePath: entry.sourcePath,
        line: entry.line
      });
    }

    return toCatalogEntry(entry, id, mirrored ? docsPath : docsPath);
  });

  return { entries, errors };
}

function toCatalogEntry(entry: ParsedMarkdownEntry, id: string, docsPath: string | null): CatalogEntry {
  const repo = entry.url.includes("github.com/") ? entry.url : null;

  return {
    id,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    source: {
      readmePath: entry.sourcePath,
      docsPath
    },
    links: {
      primary: entry.url,
      repo,
      homepage: repo ? null : entry.url,
      docs: null,
      endpoint: extractEndpoint(entry.description)
    },
    install: {
      commands: extractInstallCommands(entry.description),
      env: extractEnvVars(entry.description),
      confidence: extractInstallCommands(entry.description).length > 0 ? "medium" : "low"
    },
    transport: inferTransport(entry.description),
    auth: inferAuth(entry.description),
    clients: inferClients(entry.description),
    tools: {
      count: extractToolCount(entry.description),
      names: [],
      source: extractToolCount(entry.description) === null ? "unknown" : "self_reported"
    },
    license: inferLicense(entry.description),
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
  };
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "").toLowerCase();
}

function extractInstallCommands(text: string): string[] {
  const commands = text.match(/`([^`]*(?:npx|uvx|pip|docker|npm)[^`]*)`/gi) ?? [];
  return commands.map((command) => command.slice(1, -1));
}

function extractEnvVars(text: string): string[] {
  const matches = text.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
  return Array.from(new Set(matches.filter((match) => match.includes("KEY") || match.includes("TOKEN"))));
}

function extractEndpoint(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s`,)]+\/(?:mcp|sse|api\/mcp)[^\s`,)]*/i);
  return match?.[0] ?? null;
}

function inferTransport(text: string): CatalogEntry["transport"] {
  const lower = text.toLowerCase();
  const transports: CatalogEntry["transport"] = [];
  if (lower.includes("stdio")) transports.push("stdio");
  if (lower.includes("streamable") || lower.includes("http")) transports.push("streamable-http");
  if (lower.includes("sse")) transports.push("sse");
  return transports.length > 0 ? transports : ["unknown"];
}

function inferAuth(text: string): CatalogEntry["auth"] {
  const lower = text.toLowerCase();
  if (lower.includes("oauth")) return { type: "oauth", notes: [] };
  if (lower.includes("bearer")) return { type: "bearer", notes: [] };
  if (lower.includes("api key") || lower.includes("api-key")) return { type: "api-key", notes: [] };
  if (lower.includes("no api key") || lower.includes("no auth")) return { type: "none", notes: [] };
  return { type: "unknown", notes: [] };
}

function inferClients(text: string): string[] {
  const lower = text.toLowerCase();
  return ["claude", "cursor", "codex", "vscode"].filter((client) => lower.includes(client));
}

function extractToolCount(text: string): number | null {
  const match = text.match(/\b(\d+)\s+(?:mcp\s+)?tools?\b/i);
  return match ? Number(match[1]) : null;
}

function inferLicense(text: string): string {
  const match = text.match(/\b(MIT|Apache-2\.0|AGPL-3\.0|GPL-3\.0|BSD-3-Clause)\b/i);
  return match?.[1] ?? "unknown";
}
```

- [ ] **Step 4: Implement CLI**

Create `packages/catalog-builder/src/cli.ts`:

```ts
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCatalogFromMarkdown } from "./buildCatalog.js";

const readme = readFileSync("README.md", "utf8");
const docsByPath = new Map<string, string>();

for (const file of readdirSync("docs")) {
  if (file.endsWith(".md")) {
    const path = join("docs", file);
    docsByPath.set(path, readFileSync(path, "utf8"));
  }
}

const result = buildCatalogFromMarkdown(readme, docsByPath);

mkdirSync("data", { recursive: true });
writeFileSync("data/catalog.json", `${JSON.stringify(result.entries, null, 2)}\n`);
writeFileSync("data/catalog-errors.json", `${JSON.stringify(result.errors, null, 2)}\n`);

console.log(`Catalog entries: ${result.entries.length}`);
console.log(`Catalog errors: ${result.errors.length}`);
```

- [ ] **Step 5: Run tests and build catalog**

Run:

```bash
npm test -- packages/catalog-builder/test/buildCatalog.test.ts
npm run catalog:build
npm run typecheck
```

Expected:

- Tests pass.
- `data/catalog.json` and `data/catalog-errors.json` are written.
- CLI prints entry and error counts.

- [ ] **Step 6: Commit catalog builder**

```bash
git add packages/catalog-builder data/catalog.json data/catalog-errors.json
git commit -m "feat: build structured MCP catalog"
```

## Task 5: Install Config Generator

**Files:**
- Create: `packages/config-generator/src/generateConfig.ts`
- Create: `packages/config-generator/src/cli.ts`
- Test: `packages/config-generator/test/generateConfig.test.ts`

- [ ] **Step 1: Write config generator tests**

Create `packages/config-generator/test/generateConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { generateClientConfig } from "../src/generateConfig.js";

const baseEntry: CatalogEntry = {
  id: "github-owner-demo",
  name: "owner/demo",
  description: "Demo server.",
  category: "Developer Productivity & Utilities",
  source: { readmePath: "README.md", docsPath: "docs/developer-productivity--utilities.md" },
  links: { primary: "https://github.com/owner/demo", repo: "https://github.com/owner/demo" },
  install: { commands: ["npx -y @owner/demo-mcp"], env: ["DEMO_API_KEY"], confidence: "medium" },
  transport: ["stdio"],
  auth: { type: "api-key", notes: [] },
  clients: [],
  tools: { count: null, names: [], source: "unknown" },
  license: "MIT",
  health: { repoPublic: null, packageFound: null, endpointReachable: null, lastCheckedAt: null },
  verification: { status: "unknown", notes: [] },
  community: { maintainedBy: [], verifiedBy: [], claimed: false }
};

describe("generateClientConfig", () => {
  it("generates Claude Desktop stdio config", () => {
    const config = generateClientConfig(baseEntry, "claude");

    expect(config.confidence).toBe("medium");
    expect(config.config).toEqual({
      mcpServers: {
        "github-owner-demo": {
          command: "npx",
          args: ["-y", "@owner/demo-mcp"],
          env: {
            DEMO_API_KEY: "<DEMO_API_KEY>"
          }
        }
      }
    });
  });

  it("generates remote HTTP config for Cursor-like clients", () => {
    const entry = {
      ...baseEntry,
      install: { commands: [], env: [], confidence: "low" as const },
      links: { ...baseEntry.links, endpoint: "https://example.com/mcp" },
      transport: ["streamable-http" as const]
    };

    const config = generateClientConfig(entry, "cursor");

    expect(config.config).toEqual({
      mcpServers: {
        "github-owner-demo": {
          url: "https://example.com/mcp"
        }
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- packages/config-generator/test/generateConfig.test.ts
```

Expected: fails because `generateConfig.ts` does not exist.

- [ ] **Step 3: Implement config generator**

Create `packages/config-generator/src/generateConfig.ts`:

```ts
import type { CatalogEntry, Confidence } from "../../catalog-builder/src/types.js";

export type ClientName = "claude" | "cursor" | "codex" | "vscode";

export interface GeneratedConfig {
  serverId: string;
  client: ClientName;
  confidence: Confidence;
  config: Record<string, unknown>;
  notes: string[];
}

export function generateClientConfig(entry: CatalogEntry, client: ClientName): GeneratedConfig {
  const serverConfig = buildServerConfig(entry);

  return {
    serverId: entry.id,
    client,
    confidence: entry.install.confidence,
    config: {
      mcpServers: {
        [entry.id]: serverConfig
      }
    },
    notes: buildNotes(entry)
  };
}

function buildServerConfig(entry: CatalogEntry): Record<string, unknown> {
  const command = entry.install.commands[0];

  if (command) {
    const [binary, ...args] = splitCommand(command);
    return {
      command: binary,
      args,
      ...(entry.install.env.length > 0 ? { env: envPlaceholders(entry.install.env) } : {})
    };
  }

  if (entry.links.endpoint) {
    return {
      url: entry.links.endpoint
    };
  }

  return {
    command: "<command>",
    args: ["<args>"]
  };
}

function splitCommand(command: string): string[] {
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [command];
}

function envPlaceholders(env: string[]): Record<string, string> {
  return Object.fromEntries(env.map((name) => [name, `<${name}>`]));
}

function buildNotes(entry: CatalogEntry): string[] {
  const notes: string[] = [];
  if (entry.install.confidence === "low") {
    notes.push("Install metadata is incomplete; confirm command and environment variables before use.");
  }
  if (entry.auth.type !== "none" && entry.auth.type !== "unknown") {
    notes.push(`Authentication type: ${entry.auth.type}.`);
  }
  if (entry.auth.type === "unknown") {
    notes.push("Authentication requirements are unknown.");
  }
  return notes;
}
```

- [ ] **Step 4: Implement config CLI**

Create `packages/config-generator/src/cli.ts`:

```ts
import { readFileSync } from "node:fs";
import { generateClientConfig, type ClientName } from "./generateConfig.js";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";

const [serverId, client = "claude"] = process.argv.slice(2);

if (!serverId) {
  console.error("Usage: npm run config:generate -- <server-id> <claude|cursor|codex|vscode>");
  process.exit(1);
}

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as CatalogEntry[];
const entry = catalog.find((item) => item.id === serverId);

if (!entry) {
  console.error(`Server not found: ${serverId}`);
  process.exit(1);
}

console.log(JSON.stringify(generateClientConfig(entry, client as ClientName), null, 2));
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- packages/config-generator/test/generateConfig.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit config generator**

```bash
git add packages/config-generator
git commit -m "feat: generate MCP client configs"
```

## Task 6: Static Profile Renderer

**Files:**
- Create: `packages/profile-renderer/src/renderProfiles.ts`
- Create: `packages/profile-renderer/src/cli.ts`
- Test: `packages/profile-renderer/test/renderProfiles.test.ts`
- Generated: `data/profiles/*.json`

- [ ] **Step 1: Write profile renderer test**

Create `packages/profile-renderer/test/renderProfiles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { renderProfile } from "../src/renderProfiles.js";

const entry: CatalogEntry = {
  id: "github-owner-demo",
  name: "owner/demo",
  description: "Demo server.",
  category: "Search",
  source: { readmePath: "README.md", docsPath: "docs/search.md" },
  links: { primary: "https://github.com/owner/demo", repo: "https://github.com/owner/demo" },
  install: { commands: ["npx -y demo"], env: [], confidence: "medium" },
  transport: ["stdio"],
  auth: { type: "none", notes: [] },
  clients: [],
  tools: { count: 3, names: [], source: "self_reported" },
  license: "MIT",
  health: { repoPublic: true, packageFound: null, endpointReachable: null, lastCheckedAt: null },
  verification: { status: "unknown", notes: [] },
  community: { maintainedBy: [], verifiedBy: [], claimed: false }
};

describe("renderProfile", () => {
  it("renders profile metadata and badge", () => {
    const profile = renderProfile(entry, "https://tensorblock.co/mcp");

    expect(profile.id).toBe("github-owner-demo");
    expect(profile.profileUrl).toBe("https://tensorblock.co/mcp/github-owner-demo");
    expect(profile.badgeMarkdown).toContain("Listed on TensorBlock MCP Index");
    expect(profile.summary.installConfidence).toBe("medium");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- packages/profile-renderer/test/renderProfiles.test.ts
```

Expected: fails because `renderProfiles.ts` does not exist.

- [ ] **Step 3: Implement profile renderer**

Create `packages/profile-renderer/src/renderProfiles.ts`:

```ts
import type { CatalogEntry } from "../../catalog-builder/src/types.js";

export interface ServerProfile {
  id: string;
  name: string;
  description: string;
  category: string;
  profileUrl: string;
  badgeMarkdown: string;
  links: CatalogEntry["links"];
  summary: {
    transport: string[];
    auth: string;
    installConfidence: string;
    verification: string;
    toolCount: number | null;
  };
}

export function renderProfile(entry: CatalogEntry, baseUrl: string): ServerProfile {
  const profileUrl = `${baseUrl.replace(/\/$/, "")}/${entry.id}`;
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    category: entry.category,
    profileUrl,
    badgeMarkdown: `[![Listed on TensorBlock MCP Index](https://img.shields.io/badge/TensorBlock-MCP%20Index-blue)](${profileUrl})`,
    links: entry.links,
    summary: {
      transport: entry.transport,
      auth: entry.auth.type,
      installConfidence: entry.install.confidence,
      verification: entry.verification.status,
      toolCount: entry.tools.count
    }
  };
}
```

- [ ] **Step 4: Implement profile CLI**

Create `packages/profile-renderer/src/cli.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { renderProfile } from "./renderProfiles.js";

const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as CatalogEntry[];
const baseUrl = process.env.MCP_INDEX_BASE_URL ?? "https://tensorblock.co/mcp";

mkdirSync("data/profiles", { recursive: true });

for (const entry of catalog) {
  const profile = renderProfile(entry, baseUrl);
  writeFileSync(`data/profiles/${entry.id}.json`, `${JSON.stringify(profile, null, 2)}\n`);
}

console.log(`Profiles written: ${catalog.length}`);
```

- [ ] **Step 5: Run tests and build profiles**

Run:

```bash
npm test -- packages/profile-renderer/test/renderProfiles.test.ts
npm run catalog:build
npm run profiles:build
npm run typecheck
```

Expected:

- Tests pass.
- `data/profiles/` contains JSON profile files.

- [ ] **Step 6: Commit profile renderer**

```bash
git add packages/profile-renderer data/profiles
git commit -m "feat: render MCP server profiles"
```

## Task 7: Registry MCP Alpha

**Files:**
- Create: `packages/registry-mcp/src/server.ts`
- Test: `packages/registry-mcp/test/server.test.ts`

- [ ] **Step 1: Write registry search tests**

Create `packages/registry-mcp/test/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { searchServers, getServerProfile } from "../src/server.js";

const catalog: CatalogEntry[] = [
  {
    id: "shopify-analytics",
    name: "Shopify Analytics",
    description: "Analyze Shopify and Stripe data.",
    category: "Data Analysis & Business Intelligence",
    source: { readmePath: "README.md", docsPath: "docs/data-analysis--business-intelligence.md" },
    links: { primary: "https://example.com/shopify" },
    install: { commands: [], env: [], confidence: "low" },
    transport: ["streamable-http"],
    auth: { type: "oauth", notes: [] },
    clients: [],
    tools: { count: null, names: [], source: "unknown" },
    license: "unknown",
    health: { repoPublic: null, packageFound: null, endpointReachable: null, lastCheckedAt: null },
    verification: { status: "unknown", notes: [] },
    community: { maintainedBy: [], verifiedBy: [], claimed: false }
  }
];

describe("registry helpers", () => {
  it("searches by query terms", () => {
    const results = searchServers(catalog, "shopify stripe");
    expect(results[0].id).toBe("shopify-analytics");
  });

  it("gets a profile by id", () => {
    expect(getServerProfile(catalog, "shopify-analytics")?.name).toBe("Shopify Analytics");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- packages/registry-mcp/test/server.test.ts
```

Expected: fails because `server.ts` does not exist.

- [ ] **Step 3: Implement registry MCP server helpers and server**

Create `packages/registry-mcp/src/server.ts`:

```ts
import { readFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { generateClientConfig } from "../../config-generator/src/generateConfig.js";

export function searchServers(catalog: CatalogEntry[], query: string): CatalogEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog
    .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => item.entry);
}

export function getServerProfile(catalog: CatalogEntry[], serverId: string): CatalogEntry | undefined {
  return catalog.find((entry) => entry.id === serverId);
}

function scoreEntry(entry: CatalogEntry, terms: string[]): number {
  const text = `${entry.name} ${entry.description} ${entry.category}`.toLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

export async function main(): Promise<void> {
  const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as CatalogEntry[];
  const server = new Server(
    {
      name: "tensorblock-mcp-registry",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search_servers",
        description: "Search TensorBlock MCP Index servers.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" }
          }
        }
      },
      {
        name: "get_server_profile",
        description: "Get a TensorBlock MCP Index server profile.",
        inputSchema: {
          type: "object",
          required: ["serverId"],
          properties: {
            serverId: { type: "string" }
          }
        }
      },
      {
        name: "get_install_config",
        description: "Generate client-specific MCP install config.",
        inputSchema: {
          type: "object",
          required: ["serverId", "client"],
          properties: {
            serverId: { type: "string" },
            client: { type: "string", enum: ["claude", "cursor", "codex", "vscode"] }
          }
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments ?? {};
    if (request.params.name === "search_servers") {
      const results = searchServers(catalog, String(args.query ?? ""));
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    if (request.params.name === "get_server_profile") {
      const profile = getServerProfile(catalog, String(args.serverId ?? ""));
      return { content: [{ type: "text", text: JSON.stringify(profile ?? null, null, 2) }] };
    }

    if (request.params.name === "get_install_config") {
      const profile = getServerProfile(catalog, String(args.serverId ?? ""));
      if (!profile) {
        return { content: [{ type: "text", text: "Server not found." }], isError: true };
      }
      const config = generateClientConfig(profile, args.client as "claude" | "cursor" | "codex" | "vscode");
      return { content: [{ type: "text", text: JSON.stringify(config, null, 2) }] };
    }

    return { content: [{ type: "text", text: "Unknown tool." }], isError: true };
  });

  await server.connect(new StdioServerTransport());
}

if (process.argv[1]?.endsWith("server.ts")) {
  void main();
}
```

- [ ] **Step 4: Run registry tests and typecheck**

Run:

```bash
npm test -- packages/registry-mcp/test/server.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 5: Smoke test registry script starts**

Run:

```bash
npm run catalog:build
npm run registry:mcp
```

Expected: process starts and waits for stdio MCP requests. Stop with `Ctrl-C`.

- [ ] **Step 6: Commit registry MCP alpha**

```bash
git add packages/registry-mcp
git commit -m "feat: add TensorBlock MCP registry alpha"
```

## Task 8: Contributor Docs and README Alpha Section

**Files:**
- Create: `docs/index-alpha/contribution-guide.md`
- Create: `docs/index-alpha/launch-plan.md`
- Modify: `README.md`

- [ ] **Step 1: Create contribution guide**

Create `docs/index-alpha/contribution-guide.md`:

```md
# MCP Index Metadata Contribution Guide

TensorBlock MCP Index turns this awesome list into structured data that agents and users can search.

When adding a server, include as much of this metadata as possible in the PR body or entry description:

- Install command: `npx`, `uvx`, `pip`, Docker, or remote endpoint.
- Transport: `stdio`, `streamable-http`, or `sse`.
- Auth: none, API key, OAuth, bearer token, or other.
- Supported clients: Claude Desktop, Cursor, Codex, VS Code, or other MCP clients.
- Tool count and important tool names.
- License.
- Docs URL.
- Remote MCP endpoint, if public.

Complete metadata helps TensorBlock generate:

- server profiles,
- install configs,
- registry entries,
- install confidence notes,
- and future verification reports.
```

- [ ] **Step 2: Create launch plan**

Create `docs/index-alpha/launch-plan.md`:

```md
# MCP Index Alpha Launch Plan

## Message

TensorBlock MCP Index Alpha makes listed MCP servers searchable, install-ready, and discoverable by agents.

## Launch Checklist

- Build `data/catalog.json`.
- Build `data/profiles/*.json`.
- Confirm Claude, Cursor, Codex, and VS Code config generation works for at least five entries.
- Start registry MCP locally and test `search_servers`, `get_server_profile`, and `get_install_config`.
- Prepare merge comment template with profile URL, badge, and registry ID.

## Outreach

- Invite authors from the last 50 merged PRs to improve metadata.
- Post in TensorBlock Discord.
- Share examples from Finance & Crypto, Search, AI & LLM Integration, and Developer Productivity.

## Cadence

- Weekly catalog refresh.
- Biweekly public changelog.
- Monthly MCP Index report.
```

- [ ] **Step 3: Add README alpha section**

Add this section after the `Contributing` guidelines in `README.md`:

```md
## TensorBlock MCP Index Alpha

We are building a free MCP Index layer on top of this community list. The alpha will generate structured catalog data, install configs, server profiles, and an MCP registry endpoint that agents can search.

If you submit a server, include install command, transport, auth, supported clients, tool count, license, and docs URL when possible. See [MCP Index Metadata Contribution Guide](docs/index-alpha/contribution-guide.md).
```

- [ ] **Step 4: Run markdown smoke checks**

Run:

```bash
npm run catalog:build
git diff --check
```

Expected: catalog still builds and diff has no whitespace errors.

- [ ] **Step 5: Commit docs**

```bash
git add README.md docs/index-alpha/contribution-guide.md docs/index-alpha/launch-plan.md
git commit -m "docs: add MCP Index alpha contribution guidance"
```

## Task 9: End-to-End Validation

**Files:**
- Generated: `data/catalog.json`
- Generated: `data/catalog-errors.json`
- Generated: `data/profiles/*.json`

- [ ] **Step 1: Run full local validation**

Run:

```bash
npm test
npm run typecheck
npm run catalog:build
npm run profiles:build
```

Expected:

- All tests pass.
- Typecheck passes.
- Catalog and profiles regenerate.

- [ ] **Step 2: Test config generation for a known entry**

Pick the first server ID from `data/catalog.json`:

```bash
node -e "const c=require('./data/catalog.json'); console.log(c[0].id)"
```

Then run:

```bash
npm run config:generate -- <printed-server-id> claude
```

Expected: prints JSON with `serverId`, `client`, `confidence`, `config`, and `notes`.

- [ ] **Step 3: Inspect generated diagnostics**

Run:

```bash
node -e "const e=require('./data/catalog-errors.json'); console.log(e.slice(0, 5)); console.log('errors', e.length)"
```

Expected: prints a sample of actionable diagnostics. It is acceptable for alpha to report missing mirrors or duplicates.

- [ ] **Step 4: Commit regenerated data if changed**

If `git status --short` shows generated data changes, commit them:

```bash
git add data/catalog.json data/catalog-errors.json data/profiles
git commit -m "chore: generate MCP Index alpha data"
```

If generated data is unchanged, do not create an empty commit.

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short --branch
```

Expected: only pre-existing unrelated untracked files remain. In this workspace, `CLAUDE.md` may remain untracked and must not be staged unless explicitly requested.

## Execution Notes

- Keep commits small and aligned with tasks.
- Do not rewrite existing category entries during alpha implementation.
- Treat extraction errors as diagnostics, not blockers.
- Use low confidence for inferred install configs when metadata is incomplete.
- Avoid security claims. Use "install confidence" and "verification preview" language.

## Plan Self-Review

Spec coverage:

- Structured catalog: Tasks 2-4.
- Install config generator: Task 5.
- Static profiles and badge: Task 6.
- Registry MCP alpha: Task 7.
- PR/contributor guidance and launch cadence: Task 8.
- Validation and generated artifacts: Task 9.

Scope check:

- This plan intentionally excludes hosted web app, login, claim dashboard, full sandbox verification, and category maintainer systems.

Placeholder scan:

- The plan contains no TBD task, no undefined future task, and no open-ended validation step without an expected outcome.
