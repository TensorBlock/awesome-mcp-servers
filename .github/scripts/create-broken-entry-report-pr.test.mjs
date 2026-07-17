import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDeadEntryCleanupCandidate,
  buildDeadEntryCleanupGroup,
  buildDeadEntryCleanupGroupPrBody,
  buildDeadEntryCleanupPrBody,
  buildBrokenEntryReportSpec,
  buildIssueComment,
  buildPrBody,
  createOrUpdatePullRequest,
  findBrokenEntryTargets,
  parseBrokenEntryIssue,
  removeEntriesFromMarkdown,
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

test("groups same-file dead-entry cleanups into one pull request", async () => {
  const firstReport = {
    entryReference: "https://github.com/owner/first-mcp",
    serverId: "",
    issueTypes: ["Dead link"],
    details: "GitHub returned 404.",
    source: "https://github.com/owner/first-mcp",
  };
  const secondReport = {
    entryReference: "https://github.com/owner/second-mcp",
    serverId: "",
    issueTypes: ["Dead link"],
    details: "GitHub returned 404.",
    source: "https://github.com/owner/second-mcp",
  };
  const firstEntry = {
    id: "github-owner-first-mcp-11111111",
    name: "owner/first-mcp",
    source: { docsPath: "docs/ai--llm-integration.md" },
    links: { primary: "https://github.com/owner/first-mcp", repo: "https://github.com/owner/first-mcp" },
  };
  const secondEntry = {
    id: "github-owner-second-mcp-22222222",
    name: "owner/second-mcp",
    source: { docsPath: "docs/ai--llm-integration.md" },
    links: { primary: "https://github.com/owner/second-mcp", repo: "https://github.com/owner/second-mcp" },
  };
  const otherPathEntry = {
    id: "github-owner-other-mcp-33333333",
    name: "owner/other-mcp",
    source: { docsPath: "docs/security.md" },
    links: { primary: "https://github.com/owner/other-mcp", repo: "https://github.com/owner/other-mcp" },
  };
  const catalog = [firstEntry, secondEntry, otherPathEntry];
  const fetchImpl = async () => ({ status: 404 });
  const firstCleanup = await buildDeadEntryCleanupCandidate({ catalog, report: firstReport, fetchImpl });
  const group = await buildDeadEntryCleanupGroup({
    issue: { number: 1049, html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/1049" },
    report: firstReport,
    cleanup: firstCleanup,
    catalog,
    relatedIssues: [
      {
        number: 1051,
        html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/1051",
        body: [
          "### TensorBlock profile URL, server id, or project URL",
          "",
          "https://github.com/owner/second-mcp",
          "",
          "### What is wrong?",
          "",
          "- [x] Dead link",
          "",
          "### Details",
          "",
          "GitHub returned 404.",
          "",
          "### Source or proof",
          "",
          "https://github.com/owner/second-mcp",
        ].join("\n"),
      },
      {
        number: 1052,
        html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/1052",
        body: [
          "### TensorBlock profile URL, server id, or project URL",
          "",
          "https://github.com/owner/other-mcp",
          "",
          "### What is wrong?",
          "",
          "- [x] Dead link",
          "",
          "### Details",
          "",
          "GitHub returned 404.",
          "",
          "### Source or proof",
          "",
          "https://github.com/owner/other-mcp",
        ].join("\n"),
      },
    ],
    fetchImpl,
  });
  const removal = removeEntriesFromMarkdown([
    "## AI",
    "",
    "- [owner/first-mcp](https://github.com/owner/first-mcp): First dead server.",
    "- [owner/second-mcp](https://github.com/owner/second-mcp): Second dead server.",
    "- [Keep](https://github.com/owner/keep): Healthy server.",
    "",
  ].join("\n"), group.items.map((item) => item.cleanup.entry));
  const body = buildDeadEntryCleanupGroupPrBody({ group, removal });

  assert.equal(group.branch, "mcp/dead-entry-cleanup-ai-llm-integration");
  assert.equal(group.title, "Remove dead MCP entries from docs/ai--llm-integration.md");
  assert.deepEqual(group.items.map((item) => item.issue.number), [1049, 1051]);
  assert.deepEqual(removal.removedLines, [
    "- [owner/first-mcp](https://github.com/owner/first-mcp): First dead server.",
    "- [owner/second-mcp](https://github.com/owner/second-mcp): Second dead server.",
  ]);
  assert.doesNotMatch(removal.content, /first-mcp|second-mcp/);
  assert.match(body, /owner\/first-mcp/);
  assert.match(body, /owner\/second-mcp/);
  assert.match(body, /Closes #1049/);
  assert.match(body, /Closes #1051/);
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

test("marks an existing draft cleanup pull request ready through GraphQL", async () => {
  const calls = [];
  const graphqlCalls = [];
  const request = async (pathname, options = {}) => {
    calls.push({ pathname, options });

    if (pathname.startsWith("/pulls?")) {
      return [{
        number: 1027,
        draft: true,
        node_id: "PR_kwDOExample",
      }];
    }

    if (pathname === "/pulls/1027" && options.method === "PATCH") {
      return {
        number: 1027,
        draft: true,
        html_url: "https://github.com/TensorBlock/awesome-mcp-servers/pull/1027",
      };
    }

    if (pathname === "/pulls/1027") {
      return {
        number: 1027,
        draft: false,
        html_url: "https://github.com/TensorBlock/awesome-mcp-servers/pull/1027",
      };
    }

    throw new Error(`Unexpected request: ${pathname}`);
  };
  const graphqlRequest = async (query, variables) => {
    graphqlCalls.push({ query, variables });
    return {
      markPullRequestReadyForReview: {
        pullRequest: {
          id: variables.pullRequestId,
          isDraft: false,
        },
      },
    };
  };

  const pullRequest = await createOrUpdatePullRequest(request, {
    owner: "TensorBlock",
    branch: "mcp/broken-entry-issue-1022",
    title: "Remove dead MCP entry report #1022",
    body: "body",
    draft: false,
    graphqlRequest,
  });

  assert.equal(pullRequest.draft, false);
  assert.equal(graphqlCalls.length, 1);
  assert.match(graphqlCalls[0].query, /markPullRequestReadyForReview/);
  assert.deepEqual(graphqlCalls[0].variables, { pullRequestId: "PR_kwDOExample" });
  assert.deepEqual(calls.map((call) => `${call.options.method ?? "GET"} ${call.pathname}`), [
    "GET /pulls?head=TensorBlock%3Amcp%2Fbroken-entry-issue-1022&state=open",
    "PATCH /pulls/1027",
    "GET /pulls/1027",
  ]);
});
