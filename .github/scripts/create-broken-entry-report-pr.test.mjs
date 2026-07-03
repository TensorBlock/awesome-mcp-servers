import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeadEntryCleanupCandidate,
  buildDeadEntryCleanupPrBody,
  buildBrokenEntryReportSpec,
  buildIssueComment,
  buildPrBody,
  findBrokenEntryTargets,
  parseBrokenEntryIssue,
  removeEntryLineFromMarkdown,
  slugFromEntryReference,
  validateBrokenEntryReport,
} from "./create-broken-entry-report-pr.mjs";

const issueBody = [
  "### TensorBlock profile URL, server id, or project URL",
  "",
  "https://www.tensorblock.co/mcp/servers/github-owner-demo-mcp-12345678",
  "",
  "### What is wrong?",
  "",
  "- [x] Dead link",
  "- [ ] Duplicate entry",
  "- [x] Wrong category",
  "- [ ] Incorrect install command",
  "- [ ] Incorrect auth or transport metadata",
  "- [ ] Stale project",
  "- [ ] Security or safety concern",
  "- [ ] Other",
  "",
  "### Details",
  "",
  "The project moved from the Utilities category to Databases and the README link now redirects.",
  "",
  "### Source or proof",
  "",
  "https://github.com/owner/demo-mcp#readme",
].join("\n");

test("parses broken-entry report issue fields", () => {
  assert.deepEqual(parseBrokenEntryIssue(issueBody), {
    entryReference: "https://www.tensorblock.co/mcp/servers/github-owner-demo-mcp-12345678",
    serverId: "github-owner-demo-mcp-12345678",
    issueTypes: ["Dead link", "Wrong category"],
    details: "The project moved from the Utilities category to Databases and the README link now redirects.",
    source: "https://github.com/owner/demo-mcp#readme",
  });
});

test("validates required broken-entry report fields and optional proof URL", () => {
  const report = parseBrokenEntryIssue(issueBody);

  assert.deepEqual(validateBrokenEntryReport(report), []);
  assert.deepEqual(validateBrokenEntryReport({ ...report, entryReference: "", serverId: "" }), ["TensorBlock profile URL, server id, or project URL is required."]);
  assert.deepEqual(validateBrokenEntryReport({ ...report, issueTypes: [] }), ["Select at least one broken-entry issue type."]);
  assert.deepEqual(validateBrokenEntryReport({ ...report, details: "" }), ["Details are required."]);
  assert.deepEqual(validateBrokenEntryReport({ ...report, source: "not-a-url" }), ["Source or proof must be a valid HTTP or HTTPS URL."]);
});

test("normalizes broken-entry report slugs for stable spec paths", () => {
  assert.equal(slugFromEntryReference("github-owner-demo-mcp-12345678"), "github-owner-demo-mcp-12345678");
  assert.equal(slugFromEntryReference("https://github.com/owner/demo-mcp"), "github-owner-demo-mcp");
  assert.equal(slugFromEntryReference("https://example.com/mcp-servers/demo"), "example-com-mcp-servers-demo");
});

test("builds a broken-entry report markdown spec", () => {
  const report = parseBrokenEntryIssue(issueBody);
  const spec = buildBrokenEntryReportSpec({
    issue: {
      number: 901,
      html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/901",
    },
    report,
  });

  assert.equal(spec.path, "docs/broken-entry-reports/901-github-owner-demo-mcp-12345678.md");
  assert.match(spec.content, /^# Broken entry report: github-owner-demo-mcp-12345678/m);
  assert.match(spec.content, /Status: needs verification/);
  assert.match(spec.content, /Source issue: https:\/\/github\.com\/TensorBlock\/awesome-mcp-servers\/issues\/901/);
  assert.match(spec.content, /- Dead link/);
  assert.match(spec.content, /- Wrong category/);
  assert.match(spec.content, /https:\/\/github\.com\/owner\/demo-mcp#readme/);
  assert.match(spec.content, /Maintainer checklist/);
});

test("builds actionable comments and PR body", () => {
  const report = parseBrokenEntryIssue(issueBody);
  const spec = buildBrokenEntryReportSpec({
    issue: { number: 901 },
    report,
  });
  const comment = buildIssueComment({
    issue: { number: 901 },
    report,
    pullRequest: {
      html_url: "https://github.com/TensorBlock/awesome-mcp-servers/pull/902",
    },
  });
  const body = buildPrBody({
    issue: { number: 901, html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/901" },
    report,
    spec,
  });

  assert.match(comment, /tensorblock-mcp-broken-entry-report-pr:v1/);
  assert.match(comment, /draft broken-entry report PR/);
  assert.match(comment, /github-owner-demo-mcp-12345678/);
  assert.match(body, /## Summary/);
  assert.match(body, /docs\/broken-entry-reports\/901-github-owner-demo-mcp-12345678\.md/);
  assert.match(body, /Closes #901/);
});

test("builds direct cleanup changes for verified dead docs entries", async () => {
  const report = {
    ...parseBrokenEntryIssue(issueBody),
    issueTypes: ["Dead link"],
    source: "https://github.com/owner/demo-mcp",
  };
  const entry = {
    id: "github-owner-demo-mcp-12345678",
    name: "owner/demo-mcp",
    source: {
      docsPath: "docs/developer-productivity--utilities.md",
    },
    links: {
      primary: "https://github.com/owner/demo-mcp",
      repo: "https://github.com/owner/demo-mcp",
      homepage: null,
      docs: null,
      endpoint: null,
    },
  };
  const targets = findBrokenEntryTargets([entry], report);
  const cleanup = await buildDeadEntryCleanupCandidate({
    catalog: [entry],
    report,
    fetchImpl: async () => ({ status: 404 }),
  });
  const removal = removeEntryLineFromMarkdown([
    "## Developer Productivity",
    "",
    "- [owner/demo-mcp](https://github.com/owner/demo-mcp): Dead server.",
    "- [Keep](https://github.com/owner/keep): Healthy server.",
    "",
  ].join("\n"), entry);
  const body = buildDeadEntryCleanupPrBody({
    issue: { number: 901, html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/901" },
    report,
    cleanup,
    removal,
  });
  const comment = buildIssueComment({
    issue: { number: 901 },
    report,
    pullRequest: {
      cleanup: true,
      html_url: "https://github.com/TensorBlock/awesome-mcp-servers/pull/902",
      checkedUrl: cleanup.checkedUrl,
      statusCode: cleanup.statusCode,
      path: cleanup.path,
    },
  });

  assert.equal(targets.length, 1);
  assert.equal(cleanup.path, "docs/developer-productivity--utilities.md");
  assert.equal(cleanup.statusCode, 404);
  assert.deepEqual(removal.removedLines, [
    "- [owner/demo-mcp](https://github.com/owner/demo-mcp): Dead server.",
  ]);
  assert.doesNotMatch(removal.content, /demo-mcp/);
  assert.match(body, /remove verified-dead catalog entry/);
  assert.match(body, /HTTP 404/);
  assert.match(comment, /Created a cleanup PR/);
});

test("skips direct cleanup for mixed or proof-only dead-link reports", async () => {
  const entry = {
    id: "github-owner-demo-mcp-12345678",
    name: "owner/demo-mcp",
    source: {
      docsPath: "docs/developer-productivity--utilities.md",
    },
    links: {
      primary: "https://github.com/owner/demo-mcp",
      repo: "https://github.com/owner/demo-mcp",
      homepage: null,
      docs: null,
      endpoint: null,
    },
  };
  const mixedReport = {
    ...parseBrokenEntryIssue(issueBody),
    issueTypes: ["Dead link", "Wrong category"],
    source: "https://github.com/owner/demo-mcp",
  };
  const proofOnlyReport = {
    ...parseBrokenEntryIssue(issueBody),
    issueTypes: ["Dead link"],
    source: "https://example.com/proof-of-broken-link",
  };
  const fetchImpl = async () => {
    throw new Error("fetch should not be called for skipped cleanup candidates");
  };

  assert.equal(await buildDeadEntryCleanupCandidate({ catalog: [entry], report: mixedReport, fetchImpl }), null);
  assert.equal(await buildDeadEntryCleanupCandidate({ catalog: [entry], report: proofOnlyReport, fetchImpl }), null);
});

test("skips direct cleanup when the dead primary URL maps to multiple catalog entries", async () => {
  const report = {
    ...parseBrokenEntryIssue(issueBody),
    issueTypes: ["Dead link"],
    source: "https://github.com/owner/demo-mcp",
  };
  const firstEntry = {
    id: "github-owner-demo-mcp-12345678",
    name: "owner/demo-mcp",
    source: {
      docsPath: "docs/developer-productivity--utilities.md",
    },
    links: {
      primary: "https://github.com/owner/demo-mcp",
      repo: "https://github.com/owner/demo-mcp",
      homepage: null,
      docs: null,
      endpoint: null,
    },
  };
  const duplicateEntry = {
    ...firstEntry,
    id: "github-owner-demo-mcp-87654321",
    name: "owner/demo-mcp duplicate",
  };
  const cleanup = await buildDeadEntryCleanupCandidate({
    catalog: [firstEntry, duplicateEntry],
    report,
    fetchImpl: async () => ({ status: 404 }),
  });

  assert.equal(cleanup, null);
});
