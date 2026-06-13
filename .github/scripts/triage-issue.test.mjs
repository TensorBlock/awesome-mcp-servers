import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTriageComment,
  extractField,
  labelsForIssue,
  routeIssue,
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

test("routes issues by issue-form label", () => {
  assert.equal(routeIssue(metadataIssue)?.id, "metadata");
});

test("routes issues by title prefix when labels are missing", () => {
  const issue = { ...metadataIssue, labels: [], title: "Claim MCP profile: example" };
  assert.equal(routeIssue(issue)?.id, "claim-profile");
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

test("builds a deduplicated route-specific comment", () => {
  const comment = buildTriageComment(metadataIssue);

  assert.match(comment, /tensorblock-mcp-issue-triage:v1:metadata/);
  assert.match(comment, /Thanks for improving MCP metadata/);
  assert.match(comment, /https:\/\/github.com\/owner\/example/);
});

