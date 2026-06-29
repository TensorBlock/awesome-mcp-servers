#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractField, serverIdFromProfileReference } from "./triage-issue.mjs";

const API_BASE = "https://api.github.com";
const COMMENT_MARKER = "<!-- tensorblock-mcp-broken-entry-report-pr:v1 -->";
const DEFAULT_BASE_BRANCH = "main";
const REPORT_DIR = "docs/broken-entry-reports";

export function parseBrokenEntryIssue(body) {
  const entryReference = normalizeField(extractField(body, "TensorBlock profile URL, server id, or project URL"));

  return {
    entryReference,
    serverId: serverIdFromProfileReference(entryReference),
    issueTypes: parseCheckedIssueTypes(extractField(body, "What is wrong?")),
    details: normalizeField(extractField(body, "Details")),
    source: normalizeField(extractField(body, "Source or proof")),
  };
}

export function validateBrokenEntryReport(report) {
  const errors = [];

  if (!report.entryReference) {
    errors.push("TensorBlock profile URL, server id, or project URL is required.");
  }

  if (report.issueTypes.length === 0) {
    errors.push("Select at least one broken-entry issue type.");
  }

  if (!report.details) {
    errors.push("Details are required.");
  }

  if (report.source && !isValidHttpUrl(report.source)) {
    errors.push("Source or proof must be a valid HTTP or HTTPS URL.");
  }

  return errors;
}

export function slugFromEntryReference(value) {
  const serverId = serverIdFromProfileReference(value);
  if (serverId) {
    return serverId;
  }

  const reference = firstUrl(value) || value;
  try {
    const url = new URL(reference);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    const parts = hostname === "github.com" ? ["github", ...segments] : [hostname, ...segments];
    return slugify(parts.join("-")) || "unknown-entry";
  } catch {
    return slugify(reference) || "unknown-entry";
  }
}

export function buildBrokenEntryReportSpec({ issue, report }) {
  const slug = slugFromEntryReference(report.serverId || report.entryReference);
  const sourceIssue = issue.html_url ?? `#${issue.number}`;
  const source = report.source || "Not provided";
  const titleTarget = report.serverId || report.entryReference;
  const content = [
    `# Broken entry report: ${titleTarget}`,
    "",
    "Status: needs verification",
    `Source issue: ${sourceIssue}`,
    "",
    "## Entry Reference",
    "",
    report.entryReference,
    "",
    "## Normalized Server Id",
    "",
    report.serverId || "Not available",
    "",
    "## Reported Issue Types",
    "",
    ...report.issueTypes.map((issueType) => `- ${issueType}`),
    "",
    "## Details",
    "",
    report.details,
    "",
    "## Source Or Proof",
    "",
    source,
    "",
    "## Maintainer checklist",
    "",
    "- Verify the report against the indexed profile, source project, and generated API profile.",
    "- Check whether the fix belongs in a category markdown entry, metadata sidecar, or removal PR.",
    "- Search the repo for duplicate project URLs before changing category docs.",
    "- For safety or security concerns, verify with source links before exposing the profile as healthy.",
    "- Close the source issue after the fix, removal, or no-action decision is merged.",
    "",
  ].join("\n");

  return {
    path: `${REPORT_DIR}/${issue.number}-${slug}.md`,
    content,
  };
}

export function buildIssueComment({ issue, report, pullRequest, errors }) {
  if (errors?.length) {
    return [
      COMMENT_MARKER,
      "I could not create a broken-entry report PR yet.",
      "",
      "What needs attention:",
      ...errors.map((error) => `- ${error}`),
      "",
      "Update this issue with the entry reference, at least one issue type, details, and an HTTP/HTTPS source link if available. The automation will try again when the issue is edited.",
    ].join("\n");
  }

  if (pullRequest?.blocked) {
    return [
      COMMENT_MARKER,
      `Generated branch \`${pullRequest.branch}\` for this broken-entry report, but GitHub Actions could not create the pull request automatically.`,
      "",
      `Open the PR manually: ${pullRequest.compareUrl}`,
    ].join("\n");
  }

  const target = report.serverId || report.entryReference;
  return [
    COMMENT_MARKER,
    `Created a draft broken-entry report PR for \`${target}\`: ${pullRequest.html_url}`,
    "",
    "A maintainer should verify the report, decide whether the fix belongs in docs or metadata, then close the source issue through the PR.",
    "",
    `Source issue: #${issue.number}`,
  ].join("\n");
}

export function buildPrBody({ issue, report, spec }) {
  const target = report.serverId || report.entryReference;
  return [
    "## Summary",
    `- capture broken-entry report for \`${target}\``,
    `- add structured investigation spec at \`${spec.path}\``,
    "- keep the report reviewable before editing catalog docs or metadata sidecars",
    "",
    "## Reported issue types",
    report.issueTypes.map((issueType) => `- ${issueType}`).join("\n"),
    "",
    "## Details",
    "",
    "```text",
    report.details,
    "```",
    ...(report.source
      ? [
          "",
          "## Source or proof",
          report.source,
        ]
      : []),
    "",
    "## Generated report",
    "",
    `\`${spec.path}\``,
    "",
    issue.html_url ?? `#${issue.number}`,
    "",
    `Closes #${issue.number}`,
  ].join("\n");
}

function writeSpec(spec) {
  fs.mkdirSync(path.dirname(spec.path), { recursive: true });
  fs.writeFileSync(spec.path, spec.content);
}

function parseCheckedIssueTypes(value) {
  return value
    .split("\n")
    .map((line) => line.match(/^\s*-\s+\[[xX]\]\s+(.+?)\s*$/)?.[1])
    .filter(Boolean);
}

function normalizeField(value) {
  const normalized = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  if (!normalized || normalized === "_No response_") {
    return "";
  }

  return normalized;
}

function firstUrl(value) {
  return value.match(/https?:\/\/\S+/i)?.[0]?.replace(/[),.;]+$/g, "") ?? "";
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 100);
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !eventPath || !repository) {
    throw new Error("GITHUB_TOKEN, GITHUB_EVENT_PATH, and GITHUB_REPOSITORY are required.");
  }

  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const issue = event.issue;
  if (!issue) {
    console.log("No issue payload found; skipping.");
    return;
  }

  const [owner, repo] = repository.split("/");
  const report = parseBrokenEntryIssue(issue.body ?? "");
  const request = createGitHubRequest({ token, owner, repo });
  const errors = validateBrokenEntryReport(report);

  if (errors.length > 0) {
    await upsertIssueComment(request, issue.number, buildIssueComment({ issue, report, errors }));
    console.log(`Issue #${issue.number} cannot be converted to a broken-entry report PR: ${errors.join(" ")}`);
    return;
  }

  const spec = buildBrokenEntryReportSpec({ issue, report });
  const branch = `mcp/broken-entry-issue-${issue.number}`;
  const title = `Investigate broken MCP entry report #${issue.number}`;
  const body = buildPrBody({ issue, report, spec });

  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["fetch", "origin", DEFAULT_BASE_BRANCH]);
  run("git", ["checkout", "-B", branch, `origin/${DEFAULT_BASE_BRANCH}`]);

  writeSpec(spec);
  run("git", ["add", spec.path]);

  if (!hasStagedChanges()) {
    console.log(`No broken-entry report changes generated for issue #${issue.number}.`);
    return;
  }

  run("git", ["commit", "-m", title]);
  run("git", ["push", "--force-with-lease", "origin", `HEAD:${branch}`]);

  let pullRequest;
  try {
    pullRequest = await createOrUpdatePullRequest(request, {
      owner,
      branch,
      title,
      body,
    });
  } catch (error) {
    if (!isPullRequestCreationBlocked(error)) {
      throw error;
    }

    const compareUrl = `https://github.com/${owner}/${repo}/compare/${DEFAULT_BASE_BRANCH}...${branch}?expand=1`;
    await upsertIssueComment(
      request,
      issue.number,
      buildIssueComment({
        issue,
        report,
        pullRequest: {
          blocked: true,
          branch,
          compareUrl,
        },
      }),
    );
    console.log(`Generated branch ${branch} for issue #${issue.number}, but Actions cannot create pull requests.`);
    console.log(formatGitHubError(error));
    return;
  }

  await upsertIssueComment(request, issue.number, buildIssueComment({ issue, report, pullRequest }));
  console.log(`Created or updated draft PR ${pullRequest.html_url} for issue #${issue.number}.`);
}

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function hasStagedChanges() {
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"], { stdio: "ignore" });
    return false;
  } catch {
    return true;
  }
}

function createGitHubRequest({ token, owner, repo }) {
  return async function request(pathname, options = {}) {
    const response = await fetch(`${API_BASE}/repos/${owner}/${repo}${pathname}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error(`GitHub API ${options.method ?? "GET"} ${pathname} failed: ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  };
}

async function createOrUpdatePullRequest(request, { owner, branch, title, body }) {
  const query = new URLSearchParams({
    head: `${owner}:${branch}`,
    state: "open",
  });
  const existingPulls = await request(`/pulls?${query.toString()}`);
  const existingPull = existingPulls[0];

  if (existingPull) {
    return request(`/pulls/${existingPull.number}`, {
      method: "PATCH",
      body: { title, body },
    });
  }

  return request("/pulls", {
    method: "POST",
    body: {
      title,
      body,
      head: branch,
      base: DEFAULT_BASE_BRANCH,
      draft: true,
      maintainer_can_modify: true,
    },
  });
}

function isPullRequestCreationBlocked(error) {
  if (error?.status !== 403) {
    return false;
  }

  const message = `${error.data?.message ?? ""} ${JSON.stringify(error.data?.errors ?? [])}`;
  return /not permitted to create|Resource not accessible by integration|pull request/i.test(message);
}

function formatGitHubError(error) {
  if (!error?.data) {
    return error?.message ?? String(error);
  }

  return `${error.message}: ${JSON.stringify(error.data)}`;
}

async function upsertIssueComment(request, issueNumber, body) {
  const comments = await request(`/issues/${issueNumber}/comments?per_page=100`);
  const existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));

  if (existing) {
    await request(`/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: { body },
    });
    return;
  }

  await request(`/issues/${issueNumber}/comments`, {
    method: "POST",
    body: { body },
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
