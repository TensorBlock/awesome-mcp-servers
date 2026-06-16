import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildIssueComment,
  buildPrBody,
  buildMetadataSidecar,
  buildMarkdownEntry,
  docPathForCategory,
  findDuplicateByUrl,
  parseAddServerIssue,
  validateSubmission,
} from "./create-add-server-pr.mjs";

const issueBody = [
  "### Server name",
  "",
  "owner/example-mcp",
  "",
  "### Project URL",
  "",
  "https://github.com/owner/example-mcp",
  "",
  "### Best category",
  "",
  "Databases",
  "",
  "### What can an agent do with this server?",
  "",
  "Lets agents inspect example database schemas",
  "",
  "### Install or connection instructions",
  "",
  "npx -y example-mcp",
  "",
  "### Transport",
  "",
  "stdio",
  "",
  "### Auth requirements",
  "",
  "no auth",
  "",
  "### Known supported clients",
  "",
  "Claude Desktop, Cursor",
  "",
  "### License",
  "",
  "MIT",
].join("\n");

test("parses add-server issue form fields", () => {
  assert.deepEqual(parseAddServerIssue(issueBody), {
    serverName: "owner/example-mcp",
    projectUrl: "https://github.com/owner/example-mcp",
    category: "Databases",
    description: "Lets agents inspect example database schemas",
    install: "npx -y example-mcp",
    transport: "stdio",
    auth: "no auth",
    clients: "Claude Desktop, Cursor",
    license: "MIT",
  });
});

test("maps category to docs path", () => {
  assert.equal(docPathForCategory("Databases"), "docs/databases.md");
});

test("builds catalog markdown entry", () => {
  const entry = buildMarkdownEntry(parseAddServerIssue(issueBody));

  assert.equal(
    entry,
    "- [owner/example-mcp](https://github.com/owner/example-mcp): Lets agents inspect example database schemas.",
  );
});

test("keeps install metadata in the draft PR body instead of the catalog entry", () => {
  const submission = parseAddServerIssue(issueBody);
  const entry = buildMarkdownEntry(submission);
  const body = buildPrBody({
    issue: {
      number: 123,
      html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/123",
    },
    submission,
    docPath: "docs/databases.md",
    entry,
  });

  assert.match(body, /## Submitted metadata/);
  assert.match(body, /\*\*Install:\*\* npx -y example-mcp/);
  assert.match(body, /\*\*Transport:\*\* stdio/);
  assert.match(body, /\*\*Clients:\*\* Claude Desktop, Cursor/);
  assert.doesNotMatch(entry, /Install:/);

  const bodyWithLabeledInstall = buildPrBody({
    issue: { number: 123 },
    submission: { ...submission, install: "Install: npx -y example-mcp" },
    docPath: "docs/databases.md",
    entry,
  });
  assert.match(bodyWithLabeledInstall, /\*\*Install:\*\* npx -y example-mcp/);
  assert.doesNotMatch(bodyWithLabeledInstall, /\*\*Install:\*\* Install:/);
});

test("builds a metadata sidecar for submitted install and compatibility fields", () => {
  const submission = parseAddServerIssue(issueBody);
  const sidecar = buildMetadataSidecar({
    issue: { number: 123 },
    submission,
  });
  const metadata = JSON.parse(sidecar.content);

  assert.match(sidecar.path, /^data\/server-metadata\/github-owner-example-mcp-[a-f0-9]{8}\.json$/);
  assert.equal(metadata.id, sidecar.serverId);
  assert.deepEqual(metadata.source, {
    issue: 123,
    projectUrl: "https://github.com/owner/example-mcp",
  });
  assert.deepEqual(metadata.install, {
    commands: ["npx -y example-mcp"],
    env: [],
    confidence: "medium",
  });
  assert.deepEqual(metadata.transport, ["stdio"]);
  assert.deepEqual(metadata.auth, {
    type: "none",
    notes: [],
  });
  assert.deepEqual(metadata.clients, ["Claude Desktop", "Cursor"]);
  assert.equal(metadata.license, "MIT");
});

test("validates required fields and category", () => {
  const submission = parseAddServerIssue(issueBody);
  assert.deepEqual(validateSubmission(submission), []);

  assert.deepEqual(
    validateSubmission({ ...submission, category: "Other / not sure" }),
    ['Category "Other / not sure" needs maintainer routing before a draft PR can be generated.'],
  );
});

test("finds duplicate project URLs across docs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-docs-"));
  fs.writeFileSync(
    path.join(tempDir, "databases.md"),
    [
      "## Databases",
      "",
      "- [owner/example-mcp](https://github.com/owner/example-mcp): Existing entry.",
    ].join("\n"),
  );

  assert.deepEqual(findDuplicateByUrl("https://github.com/owner/example-mcp.git", tempDir), {
    path: path.join(tempDir, "databases.md"),
    line: 3,
    entry: "- [owner/example-mcp](https://github.com/owner/example-mcp): Existing entry.",
  });
});

test("builds issue comment for generated PR", () => {
  const comment = buildIssueComment({
    issue: { number: 123 },
    submission: parseAddServerIssue(issueBody),
    pullRequest: { html_url: "https://github.com/TensorBlock/awesome-mcp-servers/pull/999" },
  });

  assert.match(comment, /tensorblock-mcp-add-server-pr:v1/);
  assert.match(comment, /pull\/999/);
  assert.match(comment, /hosted API and public MCP Index website/);
});

test("builds issue comment when Actions cannot create a pull request", () => {
  const comment = buildIssueComment({
    issue: { number: 123 },
    submission: parseAddServerIssue(issueBody),
    pullRequest: {
      blocked: true,
      branch: "mcp/add-server-issue-123",
      compareUrl: "https://github.com/TensorBlock/awesome-mcp-servers/compare/main...mcp/add-server-issue-123?expand=1",
    },
  });

  assert.match(comment, /could not open the draft PR automatically/);
  assert.match(comment, /mcp\/add-server-issue-123/);
  assert.match(comment, /compare\/main\.\.\.mcp\/add-server-issue-123/);
});
