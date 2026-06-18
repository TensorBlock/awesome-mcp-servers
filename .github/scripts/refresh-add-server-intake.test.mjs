import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyRefreshResult,
  classifyAddServerIssue,
  summarizeRefreshResults,
} from "./refresh-add-server-intake.mjs";

function issueBody({ url = "https://github.com/owner/example-mcp", category = "Databases" } = {}) {
  return [
    "### Server name",
    "",
    "owner/example-mcp",
    "",
    "### Project URL",
    "",
    url,
    "",
    "### Best category",
    "",
    category,
    "",
    "### What can an agent do with this server?",
    "",
    "Lets agents inspect example database schemas",
  ].join("\n");
}

function issue(overrides = {}) {
  return {
    number: 123,
    title: "Add MCP server: owner/example-mcp",
    body: issueBody(),
    labels: ["server-submission"],
    html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/123",
    ...overrides,
  };
}

test("classifies incomplete server submissions as needs-metadata", () => {
  const result = classifyAddServerIssue({
    issue: issue({
      body: [
        "### Server name",
        "",
        "owner/example-mcp",
        "",
        "### Best category",
        "",
        "Databases",
        "",
        "### What can an agent do with this server?",
        "",
        "Lets agents inspect example database schemas",
      ].join("\n"),
      labels: ["server-submission", "ready-for-pr"],
    }),
  });

  assert.equal(result.statusLabel, "needs-metadata");
  assert.deepEqual(result.errors, ["Project URL is required."]);
  assert.deepEqual(result.plan, {
    add: ["needs-metadata"],
    remove: ["ready-for-pr"],
  });
});

test("classifies duplicate server submissions from docs", () => {
  const docsDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-docs-"));
  fs.writeFileSync(
    path.join(docsDir, "databases.md"),
    "- [owner/example-mcp](https://github.com/owner/example-mcp): Existing entry.\n",
  );

  const result = classifyAddServerIssue({
    docsDir,
    issue: issue({
      labels: ["server-submission", "needs-metadata"],
    }),
  });

  assert.equal(result.statusLabel, "duplicate");
  assert.equal(result.duplicate.path, path.join(docsDir, "databases.md"));
  assert.deepEqual(result.plan, {
    add: ["duplicate"],
    remove: ["needs-metadata"],
  });
});

test("classifies submissions with generated open PRs as ready-for-pr", () => {
  const result = classifyAddServerIssue({
    issue: issue({
      number: 456,
      labels: ["server-submission", "needs-metadata", "automation-blocked"],
    }),
    pullRequests: [
      {
        html_url: "https://github.com/TensorBlock/awesome-mcp-servers/pull/999",
        head: {
          ref: "mcp/add-server-issue-456",
        },
      },
    ],
  });

  assert.equal(result.statusLabel, "ready-for-pr");
  assert.equal(result.pullRequest.html_url, "https://github.com/TensorBlock/awesome-mcp-servers/pull/999");
  assert.deepEqual(result.plan, {
    add: ["ready-for-pr"],
    remove: ["automation-blocked", "needs-metadata"],
  });
});

test("dry-run refresh does not call GitHub label APIs", async () => {
  const calls = [];
  const request = async (pathname, options = {}) => {
    calls.push({ pathname, options });
    return {};
  };

  const result = classifyAddServerIssue({
    issue: issue({
      body: issueBody({ url: "" }),
      labels: ["server-submission"],
    }),
  });

  const applied = await applyRefreshResult(request, result, { dryRun: true });

  assert.equal(applied, false);
  assert.deepEqual(calls, []);
});

test("apply refresh creates missing status labels and reconciles stale labels", async () => {
  const calls = [];
  const request = async (pathname, options = {}) => {
    calls.push({ pathname, options });
    if (pathname === "/labels/needs-metadata") {
      const error = new Error("Missing label");
      error.status = 404;
      throw error;
    }

    return {};
  };

  const result = classifyAddServerIssue({
    issue: issue({
      body: issueBody({ url: "" }),
      labels: ["server-submission", "ready-for-pr"],
    }),
  });

  const applied = await applyRefreshResult(request, result, { dryRun: false });

  assert.equal(applied, true);
  assert.deepEqual(calls, [
    {
      pathname: "/labels/needs-metadata",
      options: {},
    },
    {
      pathname: "/labels",
      options: {
        method: "POST",
        body: {
          name: "needs-metadata",
          color: "F9D0C4",
          description: "Server submission needs required fields or category routing.",
        },
      },
    },
    {
      pathname: "/issues/123/labels/ready-for-pr",
      options: {
        method: "DELETE",
      },
    },
    {
      pathname: "/issues/123/labels",
      options: {
        method: "POST",
        body: {
          labels: ["needs-metadata"],
        },
      },
    },
  ]);
});

test("summarizes refresh results for workflow logs", () => {
  const summary = summarizeRefreshResults([
    {
      issue: { number: 1, title: "Add MCP server: missing" },
      statusLabel: "needs-metadata",
      plan: { add: ["needs-metadata"], remove: [] },
    },
    {
      issue: { number: 2, title: "Add MCP server: ready" },
      statusLabel: "ready-for-pr",
      plan: { add: [], remove: [] },
    },
  ]);

  assert.match(summary, /2 server submissions inspected/);
  assert.match(summary, /#1 needs-metadata add=needs-metadata remove=- Add MCP server: missing/);
  assert.match(summary, /#2 ready-for-pr add=- remove=- Add MCP server: ready/);
});
