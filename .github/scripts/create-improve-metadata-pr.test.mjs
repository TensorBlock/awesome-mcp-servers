import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImproveMetadataSidecar,
  buildIssueComment,
  buildPrBody,
  findCatalogEntry,
  parseImproveMetadataIssue,
  validateMetadataSubmission,
} from "./create-improve-metadata-pr.mjs";

const issueBody = [
  "### TensorBlock profile URL or server id",
  "",
  "https://tensorblock.co/mcp/servers/github-owner-demo-mcp-12345678",
  "",
  "### Project URL",
  "",
  "https://github.com/owner/demo-mcp",
  "",
  "### Metadata to update",
  "",
  "- [x] Description",
  "- [x] Install command",
  "- [x] Environment variables",
  "- [x] Transport",
  "- [x] Auth requirements",
  "- [x] Supported clients",
  "- [x] Tool names or tool count",
  "- [x] Docs URL",
  "- [x] License",
  "- [x] Health or verification status",
  "",
  "### Correct metadata",
  "",
  "Description: Demo MCP exposes production project telemetry to AI agents.",
  "Install: `npx -y @owner/demo-mcp`",
  "Environment variables: DEMO_API_KEY, DEMO_API_URL",
  "Transport: stdio",
  "Auth: api-key, requires DEMO_API_KEY",
  "Supported clients: Claude Desktop, Cursor",
  "Tools: inspect_project, summarize_incidents",
  "Tool count: 2",
  "Docs URL: https://docs.example.com/demo-mcp",
  "License: MIT",
  "Verification: verified",
  "",
  "### Source or proof",
  "",
  "README documents the install and auth fields: https://github.com/owner/demo-mcp#readme",
].join("\n");

const catalogEntry = {
  id: "github-owner-demo-mcp-12345678",
  name: "owner/demo-mcp",
  description: "Old description.",
  category: "Developer Productivity & Utilities",
  links: {
    primary: "https://github.com/owner/demo-mcp",
    repo: "https://github.com/owner/demo-mcp",
    homepage: null,
    docs: null,
    endpoint: null,
  },
  install: {
    commands: ["npx old-demo-mcp"],
    env: [],
    confidence: "low",
  },
  transport: ["unknown"],
  auth: {
    type: "unknown",
    notes: [],
  },
  clients: [],
  tools: {
    count: null,
    names: [],
    source: "unknown",
  },
  license: "unknown",
  verification: {
    status: "unknown",
    notes: [],
  },
  community: {
    maintainedBy: ["@existing"],
    verifiedBy: [],
    claimed: true,
  },
};

test("parses improve-metadata issue fields and checked update types", () => {
  assert.deepEqual(parseImproveMetadataIssue(issueBody), {
    profileReference: "https://tensorblock.co/mcp/servers/github-owner-demo-mcp-12345678",
    serverId: "github-owner-demo-mcp-12345678",
    projectUrl: "https://github.com/owner/demo-mcp",
    fields: [
      "Description",
      "Install command",
      "Environment variables",
      "Transport",
      "Auth requirements",
      "Supported clients",
      "Tool names or tool count",
      "Docs URL",
      "License",
      "Health or verification status",
    ],
    changes: [
      "Description: Demo MCP exposes production project telemetry to AI agents.",
      "Install: `npx -y @owner/demo-mcp`",
      "Environment variables: DEMO_API_KEY, DEMO_API_URL",
      "Transport: stdio",
      "Auth: api-key, requires DEMO_API_KEY",
      "Supported clients: Claude Desktop, Cursor",
      "Tools: inspect_project, summarize_incidents",
      "Tool count: 2",
      "Docs URL: https://docs.example.com/demo-mcp",
      "License: MIT",
      "Verification: verified",
    ].join("\n"),
    source: "README documents the install and auth fields: https://github.com/owner/demo-mcp#readme",
  });
});

test("validates metadata submissions against indexed project URLs and structured changes", () => {
  const submission = parseImproveMetadataIssue(issueBody);

  assert.deepEqual(validateMetadataSubmission(submission, catalogEntry, {}), []);
  assert.deepEqual(
    validateMetadataSubmission({
      ...submission,
      projectUrl: "https://example.com/not-the-project",
    }, catalogEntry, {}),
    ["Project URL must match the indexed profile source URL, repository, homepage, docs URL, or existing sidecar project URL."],
  );
  assert.deepEqual(
    validateMetadataSubmission({
      ...submission,
      changes: "Please make this better.",
      fields: [],
    }, catalogEntry, {}),
    ["Correct metadata must include at least one recognizable field such as Description:, Install:, Transport:, Auth:, Docs URL:, License:, Tools:, or Verification:."],
  );
});

test("builds an improve-metadata sidecar while preserving existing metadata", () => {
  const submission = parseImproveMetadataIssue(issueBody);
  const sidecar = buildImproveMetadataSidecar({
    issue: { number: 812 },
    submission,
    entry: catalogEntry,
    existingMetadata: {
      id: catalogEntry.id,
      source: {
        issue: 700,
        projectUrl: "https://github.com/owner/demo-mcp",
      },
      community: {
        maintainedBy: ["@existing"],
        claimed: true,
      },
    },
  });
  const metadata = JSON.parse(sidecar.content);

  assert.equal(sidecar.path, "data/server-metadata/github-owner-demo-mcp-12345678.json");
  assert.equal(metadata.source.issue, 812);
  assert.equal(metadata.source.projectUrl, "https://github.com/owner/demo-mcp");
  assert.equal(metadata.description, "Demo MCP exposes production project telemetry to AI agents.");
  assert.deepEqual(metadata.links, {
    docs: "https://docs.example.com/demo-mcp",
  });
  assert.deepEqual(metadata.install, {
    commands: ["npx -y @owner/demo-mcp"],
    env: ["DEMO_API_KEY", "DEMO_API_URL"],
    confidence: "medium",
  });
  assert.deepEqual(metadata.transport, ["stdio"]);
  assert.deepEqual(metadata.auth, {
    type: "api-key",
    notes: ["api-key, requires DEMO_API_KEY"],
  });
  assert.deepEqual(metadata.clients, ["Claude Desktop", "Cursor"]);
  assert.deepEqual(metadata.tools, {
    count: 2,
    names: ["inspect_project", "summarize_incidents"],
    source: "self_reported",
  });
  assert.equal(metadata.license, "MIT");
  assert.equal(metadata.verification.status, "verified");
  assert.ok(metadata.verification.notes.some((note) => /Metadata updated from issue #812/.test(note)));
  assert.deepEqual(metadata.community, {
    maintainedBy: ["@existing"],
    claimed: true,
  });
});

test("finds catalog entries and builds actionable comments and PR body", () => {
  const submission = parseImproveMetadataIssue(issueBody);
  const entry = findCatalogEntry([catalogEntry], catalogEntry.id);
  const sidecar = buildImproveMetadataSidecar({
    issue: { number: 812 },
    submission,
    entry,
    existingMetadata: {},
  });
  const comment = buildIssueComment({
    issue: { number: 812 },
    submission,
    pullRequest: {
      html_url: "https://github.com/TensorBlock/awesome-mcp-servers/pull/812",
    },
  });
  const body = buildPrBody({
    issue: { number: 812, html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/812" },
    submission,
    entry,
    sidecar,
  });

  assert.equal(entry, catalogEntry);
  assert.match(comment, /tensorblock-mcp-improve-metadata-pr:v1/);
  assert.match(comment, /draft metadata PR/);
  assert.match(comment, /github-owner-demo-mcp-12345678/);
  assert.match(body, /## Summary/);
  assert.match(body, /Generated metadata sidecar/);
  assert.match(body, /Closes #812/);
});
