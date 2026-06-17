import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBrokenEntryReportSpec,
  buildIssueComment,
  buildPrBody,
  parseBrokenEntryIssue,
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
