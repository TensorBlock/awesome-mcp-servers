import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildIssueComment,
  buildIntakeLabelPlan,
  buildPrBody,
  buildMetadataSidecar,
  buildMarkdownEntry,
  docPathForCategory,
  findDuplicateByUrl,
  INTAKE_STATUS_LABELS,
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

const secondLevelHeadingIssueBody = [
  "## Server name",
  "",
  "friendlygeorge/cron-scheduler-mcp-server",
  "",
  "## Project URL",
  "",
  "https://github.com/friendlygeorge/cron-scheduler-mcp-server",
  "",
  "## Best category",
  "",
  "Developer Productivity & Utilities",
  "",
  "## What can an agent do with this server?",
  "",
  "7 tools for AI agent cron job scheduling.",
  "",
  "## Install or connection instructions",
  "",
  "Install: npx @supernova123/cron-scheduler-mcp-server",
  "Transport: stdio",
  "Auth: none",
  "",
  "## Known supported clients",
  "",
  "Claude Desktop, Cursor, Codex, VS Code",
  "",
  "## License",
  "",
  "MIT",
].join("\n");

const boldIssueBody = [
  "**Server name**: kaitoInfra/twitterapi-io-mcp-server",
  "",
  "**Project URL**: https://github.com/kaitoInfra/twitterapi-io-mcp-server",
  "",
  "**Best category**: Other / not sure — closest fit is `docs/social-media--content-platforms.md`.",
  "",
  "**What can an agent do with this server?**",
  "",
  "Official MCP server for twitterapi.io. 12 read-only tools let agents search tweets, fetch profiles, expand conversation threads, stream real-time tweets, get trends, and pull engagement metrics.",
  "",
  "**Install or connection instructions**",
  "",
  "Hosted endpoint: \"https://mcp.twitterapi.io/mcp\"",
  "",
  "```bash",
  "npx -y @kaitoinfra/twitterapi-io-mcp-server",
  "```",
  "",
  "Env: TWITTERAPI_API_KEY=...",
  "",
  "**Transport**: multiple (streamable-http for hosted, stdio for npm/local)",
  "",
  "**Auth**: API key (Bearer or env var)",
  "",
  "**License**: MIT",
].join("\n");

const suggestedCategoryIssueBody = [
  "### Server name",
  "",
  "sapph1re/findata-mcp",
  "",
  "### Project URL",
  "",
  "https://github.com/sapph1re/findata-mcp",
  "",
  "### Best category",
  "",
  "Other / not sure",
  "",
  "### What can an agent do with this server?",
  "",
  "Get real-time financial data, SEC filings, and crypto prices. Suggested category: Finance & Crypto.",
  "",
  "### Install or connection instructions",
  "",
  "Install: `pip install findata-mcp`",
  "Transport: streamable-http (remote hosted)",
  "",
  "### Transport",
  "",
  "streamable-http",
  "",
  "### Auth requirements",
  "",
  "no auth",
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

test("parses issue form fields that use second-level markdown headings", () => {
  const submission = parseAddServerIssue(secondLevelHeadingIssueBody);

  assert.deepEqual(submission, {
    serverName: "friendlygeorge/cron-scheduler-mcp-server",
    projectUrl: "https://github.com/friendlygeorge/cron-scheduler-mcp-server",
    category: "Developer Productivity & Utilities",
    description: "7 tools for AI agent cron job scheduling.",
    install: [
      "Install: npx @supernova123/cron-scheduler-mcp-server",
      "Transport: stdio",
      "Auth: none",
    ].join("\n"),
    transport: "",
    auth: "",
    clients: "Claude Desktop, Cursor, Codex, VS Code",
    license: "MIT",
  });

  assert.deepEqual(JSON.parse(buildMetadataSidecar({ issue: { number: 750 }, submission }).content).auth, {
    type: "none",
    notes: [],
  });
});

test("parses bold add-server issue fields and category path hints", () => {
  assert.deepEqual(parseAddServerIssue(boldIssueBody), {
    serverName: "kaitoInfra/twitterapi-io-mcp-server",
    projectUrl: "https://github.com/kaitoInfra/twitterapi-io-mcp-server",
    category: "Social Media & Content Platforms",
    description: "Official MCP server for twitterapi.io. 12 read-only tools let agents search tweets, fetch profiles, expand conversation threads, stream real-time tweets, get trends, and pull engagement metrics.",
    install: [
      "Hosted endpoint: \"https://mcp.twitterapi.io/mcp\"",
      "```bash",
      "npx -y @kaitoinfra/twitterapi-io-mcp-server",
      "```",
      "",
      "Env: TWITTERAPI_API_KEY=...",
    ].join("\n"),
    transport: "multiple (streamable-http for hosted, stdio for npm/local)",
    auth: "API key (Bearer or env var)",
    clients: "",
    license: "MIT",
  });
});

test("maps category to docs path", () => {
  assert.equal(docPathForCategory("Databases"), "docs/databases.md");
  assert.equal(docPathForCategory("Finance & Crypto"), "docs/finance--crypto.md");
  assert.equal(docPathForCategory("Social Media & Content Platforms"), "docs/social-media--content-platforms.md");
  assert.equal(docPathForCategory("Other / not sure — suggested category: Finance & Crypto"), "docs/finance--crypto.md");
});

test("uses suggested category from the issue description when category is unsure", () => {
  assert.equal(parseAddServerIssue(suggestedCategoryIssueBody).category, "Finance & Crypto");
  assert.deepEqual(validateSubmission(parseAddServerIssue(suggestedCategoryIssueBody)), []);
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

test("builds sidecar endpoint, command, and transport from install text", () => {
  const submission = parseAddServerIssue(boldIssueBody);
  const metadata = JSON.parse(buildMetadataSidecar({
    issue: { number: 724 },
    submission,
  }).content);

  assert.deepEqual(metadata.links, {
    endpoint: "https://mcp.twitterapi.io/mcp",
  });
  assert.deepEqual(metadata.install, {
    commands: ["npx -y @kaitoinfra/twitterapi-io-mcp-server"],
    env: ["TWITTERAPI_API_KEY"],
    confidence: "medium",
  });
  assert.deepEqual(metadata.transport, ["stdio", "streamable-http"]);
  assert.deepEqual(metadata.auth, {
    type: "api-key",
    notes: ["API key (Bearer or env var)"],
  });
});

test("validates required fields and category", () => {
  const submission = parseAddServerIssue(issueBody);
  assert.deepEqual(validateSubmission(submission), []);

  assert.deepEqual(validateSubmission(parseAddServerIssue(boldIssueBody)), []);
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

test("plans needs-metadata label for incomplete server submissions", () => {
  const plan = buildIntakeLabelPlan({
    issue: {
      labels: ["server-submission", "ready-for-pr", "duplicate"],
    },
    errors: ["Project URL is required."],
  });

  assert.equal(
    INTAKE_STATUS_LABELS["needs-metadata"].description,
    "Server submission needs required fields or category routing.",
  );
  assert.deepEqual(plan.add, ["needs-metadata"]);
  assert.deepEqual(plan.remove, ["duplicate", "ready-for-pr"]);
});

test("plans duplicate label when the submitted project URL already exists", () => {
  const plan = buildIntakeLabelPlan({
    issue: {
      labels: ["server-submission", "needs-metadata"],
    },
    duplicate: {
      path: "docs/databases.md",
      line: 42,
      entry: "- [owner/example](https://github.com/owner/example): Existing.",
    },
  });

  assert.deepEqual(plan.add, ["duplicate"]);
  assert.deepEqual(plan.remove, ["needs-metadata"]);
});

test("plans automation-blocked label when a branch is generated but no PR can be opened", () => {
  const plan = buildIntakeLabelPlan({
    issue: {
      labels: ["server-submission", "needs-metadata"],
    },
    pullRequest: {
      blocked: true,
      branch: "mcp/add-server-issue-123",
    },
  });

  assert.deepEqual(plan.add, ["automation-blocked"]);
  assert.deepEqual(plan.remove, ["needs-metadata"]);
});

test("plans ready-for-pr label when a draft PR is created", () => {
  const plan = buildIntakeLabelPlan({
    issue: {
      labels: ["server-submission", "needs-metadata", "automation-blocked"],
    },
    pullRequest: {
      html_url: "https://github.com/TensorBlock/awesome-mcp-servers/pull/999",
    },
  });

  assert.deepEqual(plan.add, ["ready-for-pr"]);
  assert.deepEqual(plan.remove, ["automation-blocked", "needs-metadata"]);
});
