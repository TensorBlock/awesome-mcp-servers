import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  buildTriageComment,
  extractField,
  labelsForIssue,
  routeIssue,
  serverIdFromProfileReference,
} from "./triage-issue.mjs";

const metadataIssue = {
  number: 42,
  title: "Improve metadata: example",
  labels: [{ name: "metadata" }],
  body: [
    "### TensorBlock profile URL or server id",
    "",
    "https://tensorblock.co/mcp/servers/github-owner-example",
    "",
    "### Project URL",
    "",
    "https://github.com/owner/example",
  ].join("\n"),
};

const claimProfileIssue = {
  number: 77,
  title: "Claim MCP profile: github-owner-demo",
  labels: [{ name: "claim-profile" }],
  body: [
    "### TensorBlock profile URL or server id",
    "",
    "https://www.tensorblock.co/mcp/servers/github-owner-demo-12345678?utm_source=readme",
    "",
    "### Project URL",
    "",
    "https://github.com/owner/demo",
    "",
    "### Maintainer handle",
    "",
    "@owner",
    "",
    "### Maintainer proof",
    "",
    "I am an owner of the GitHub repository.",
  ].join("\n"),
};

const clientConfigIssue = {
  number: 88,
  title: "Request client config support: Windsurf",
  labels: [{ name: "client-config" }],
  body: [
    "### Client or install target",
    "",
    "Windsurf",
    "",
    "### Expected config shape",
    "",
    "{\"mcpServers\":{\"example\":{\"command\":\"npx\",\"args\":[\"-y\",\"example-mcp\"]}}}",
  ].join("\n"),
};

const brokenEntryIssue = {
  number: 99,
  title: "Report broken MCP entry: github-owner-demo-mcp",
  labels: [{ name: "broken-entry" }],
  body: [
    "### TensorBlock profile URL, server id, or project URL",
    "",
    "github-owner-demo-mcp-12345678",
    "",
    "### What is wrong?",
    "",
    "- [x] Dead link",
    "",
    "### Details",
    "",
    "The project URL is now 404.",
  ].join("\n"),
};

test("routes issues by issue-form label", () => {
  assert.equal(routeIssue(metadataIssue)?.id, "metadata");
});

test("routes issues by title prefix when labels are missing", () => {
  const issue = { ...metadataIssue, labels: [], title: "Claim MCP profile: example" };
  assert.equal(routeIssue(issue)?.id, "claim-profile");
});

test("routes free-form add-server issue titles", () => {
  assert.equal(
    routeIssue({
      title: "Add server: ENTIA",
      labels: [],
      body: "**Repository:** https://github.com/ENTIA-IA/entia-mcp-server",
    })?.id,
    "server-submission",
  );

  assert.equal(
    routeIssue({
      title: "Add 400860 Radar to Finance & DeFi",
      labels: [],
      body: "Server URL: https://github.com/wangletiand/400860-radar",
    })?.id,
    "server-submission",
  );

  assert.equal(
    routeIssue({
      title: "Add VeraData LATAM Compliance MCP Server",
      labels: [],
      body: "- [VeraData](https://api.veradata.dev): LATAM compliance MCP server.",
    })?.id,
    "server-submission",
  );
});

test("adds triage and metadata labels on opened issues", () => {
  assert.deepEqual(labelsForIssue(metadataIssue, "opened"), [
    "community-intake",
    "needs-triage",
    "good-first-metadata",
  ]);
});

test("does not re-add needs-triage on edited issues", () => {
  assert.deepEqual(labelsForIssue(metadataIssue, "edited"), [
    "community-intake",
    "good-first-metadata",
  ]);
});

test("labels safety reports as high priority", () => {
  const issue = {
    number: 7,
    title: "Report broken MCP entry: example",
    labels: [{ name: "broken-entry" }],
    body: "- [X] Security or safety concern",
  };

  assert.deepEqual(labelsForIssue(issue, "opened"), [
    "community-intake",
    "needs-triage",
    "priority-high",
    "verification",
  ]);
});

test("extracts issue form fields", () => {
  assert.equal(
    extractField(metadataIssue.body, "Project URL"),
    "https://github.com/owner/example",
  );
});

test("normalizes server ids from supported profile references", () => {
  assert.equal(serverIdFromProfileReference("github-owner-demo-12345678"), "github-owner-demo-12345678");
  assert.equal(
    serverIdFromProfileReference("https://www.tensorblock.co/mcp/servers/github-owner-demo-12345678?utm_source=readme"),
    "github-owner-demo-12345678",
  );
  assert.equal(
    serverIdFromProfileReference("https://mcp-index.tensorblock.co/v1/servers/github-owner-demo-12345678"),
    "github-owner-demo-12345678",
  );
  assert.equal(
    serverIdFromProfileReference("https://mcp-index.tensorblock.co/servers/github-owner-demo-12345678"),
    "github-owner-demo-12345678",
  );
});

test("builds a deduplicated route-specific comment", () => {
  const comment = buildTriageComment(metadataIssue);

  assert.match(comment, /tensorblock-mcp-issue-triage:v1:metadata/);
  assert.match(comment, /Thanks for improving MCP metadata/);
  assert.match(comment, /automation will draft a metadata sidecar PR/);
  assert.match(comment, /https:\/\/github.com\/owner\/example/);
});

test("builds claim profile comments with normalized profile links and claim steps", () => {
  const comment = buildTriageComment(claimProfileIssue);

  assert.match(comment, /tensorblock-mcp-issue-triage:v1:claim-profile/);
  assert.match(comment, /https:\/\/tensorblock\.co\/mcp\/servers\/github-owner-demo-12345678/);
  assert.match(comment, /https:\/\/mcp-index\.tensorblock\.co\/v1\/servers\/github-owner-demo-12345678/);
  assert.match(comment, /badge\.svg/);
  assert.match(comment, /Profile claim checklist:/);
  assert.match(comment, /Claiming is separate from TensorBlock verification/);
});

test("builds client config comments that mention the generated request spec", () => {
  const comment = buildTriageComment(clientConfigIssue);

  assert.match(comment, /tensorblock-mcp-issue-triage:v1:client-config/);
  assert.match(comment, /automation will draft a client-config request spec PR/);
  assert.match(comment, /Windsurf/);
});

test("builds broken-entry comments that mention the generated report spec", () => {
  const comment = buildTriageComment(brokenEntryIssue);

  assert.match(comment, /tensorblock-mcp-issue-triage:v1:broken-entry/);
  assert.match(comment, /automation can draft a cleanup PR/);
  assert.match(comment, /investigation spec PR/);
  assert.match(comment, /github-owner-demo-mcp-12345678/);
});

test("issue forms avoid GitHub reserved dropdown options", () => {
  assert.doesNotThrow(() => {
    execFileSync("node", [".github/scripts/validate-issue-forms.mjs"], {
      stdio: "pipe",
    });
  });
});
