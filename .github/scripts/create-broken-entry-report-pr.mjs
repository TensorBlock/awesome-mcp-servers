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
const DEAD_LINK_STATUS_CODES = new Set([404, 410, 451]);

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

export function findBrokenEntryTargets(catalog, report) {
  if (report.serverId) {
    return catalog.filter((entry) => entry.id === report.serverId);
  }

  const references = unique([
    firstUrl(report.entryReference) || report.entryReference,
    firstUrl(report.source),
  ].filter(Boolean).map(canonicalizeUrl));

  if (references.length === 0) {
    return [];
  }

  return catalog.filter((entry) => {
    const links = [
      entry.links?.primary,
      entry.links?.repo,
      entry.links?.homepage,
      entry.links?.docs,
      entry.links?.endpoint,
    ].filter(Boolean).map(canonicalizeUrl);

    return links.some((link) => references.includes(link));
  });
}

export async function buildDeadEntryCleanupCandidate({ catalog, report, fetchImpl = fetch }) {
  if (report.issueTypes.length !== 1 || report.issueTypes[0] !== "Dead link") {
    return null;
  }

  const targets = findBrokenEntryTargets(catalog, report);
  if (targets.length !== 1) {
    return null;
  }

  const entry = targets[0];
  const sourcePath = entry.source?.docsPath;
  const checkedUrl = deadLinkCheckUrlForEntry(report, entry);

  if (!sourcePath || !checkedUrl || !isValidHttpUrl(checkedUrl)) {
    return null;
  }

  if (catalogPrimaryUrlMatches(catalog, checkedUrl).length !== 1) {
    return null;
  }

  const statusCode = await fetchHttpStatus(checkedUrl, fetchImpl);
  if (!DEAD_LINK_STATUS_CODES.has(statusCode)) {
    return null;
  }

  return {
    entry,
    path: sourcePath,
    checkedUrl,
    statusCode,
  };
}

export function removeEntryLineFromMarkdown(markdown, entry) {
  return removeEntriesFromMarkdown(markdown, [entry]);
}

export function removeEntriesFromMarkdown(markdown, entries) {
  const urls = unique(
    entries.flatMap((entry) => [
      entry.links?.primary,
      entry.links?.repo,
      entry.links?.homepage,
      entry.links?.docs,
      entry.links?.endpoint,
    ].filter(Boolean)),
  );
  const hadTrailingNewline = markdown.endsWith("\n");
  const removedLines = [];
  const keptLines = markdown.split(/\r?\n/).filter((line, index, lines) => {
    if (index === lines.length - 1 && line === "" && hadTrailingNewline) {
      return true;
    }

    const shouldRemove = /^\s*-\s+\[/.test(line) && urls.some((url) => line.includes(url));
    if (shouldRemove) {
      removedLines.push(line);
      return false;
    }

    return true;
  });

  let content = keptLines.join("\n");
  if (hadTrailingNewline && !content.endsWith("\n")) {
    content += "\n";
  }

  return {
    content,
    removedLines,
  };
}

export async function buildDeadEntryCleanupGroup({
  issue,
  report,
  cleanup,
  catalog,
  relatedIssues = [],
  fetchImpl = fetch,
}) {
  const itemsByIssueNumber = new Map();
  const targetPath = cleanup.path;
  const addItem = ({ itemIssue, itemReport, itemCleanup }) => {
    if (itemCleanup.path !== targetPath) {
      return;
    }

    itemsByIssueNumber.set(itemIssue.number, {
      issue: itemIssue,
      report: itemReport,
      cleanup: itemCleanup,
    });
  };

  addItem({ itemIssue: issue, itemReport: report, itemCleanup: cleanup });

  for (const relatedIssue of relatedIssues) {
    if (relatedIssue.number === issue.number || relatedIssue.pull_request) {
      continue;
    }

    const relatedReport = parseBrokenEntryIssue(relatedIssue.body ?? "");
    if (validateBrokenEntryReport(relatedReport).length > 0) {
      continue;
    }

    const relatedCleanup = await buildDeadEntryCleanupCandidate({
      catalog,
      report: relatedReport,
      fetchImpl,
    });

    if (relatedCleanup) {
      addItem({
        itemIssue: relatedIssue,
        itemReport: relatedReport,
        itemCleanup: relatedCleanup,
      });
    }
  }

  const items = Array.from(itemsByIssueNumber.values()).sort((left, right) => left.issue.number - right.issue.number);

  return {
    path: targetPath,
    branch: deadEntryCleanupBranchForPath(targetPath),
    title: `Remove dead MCP entries from ${targetPath}`,
    items,
  };
}

export function buildDeadEntryCleanupGroupPrBody({ group, removal }) {
  return [
    "## Summary",
    `- remove ${group.items.length} verified-dead catalog entries from \`${group.path}\``,
    ...group.items.map((item) => {
      return `- checked \`${item.cleanup.checkedUrl}\` and received HTTP ${item.cleanup.statusCode}`;
    }),
    "- keep the fix scoped to the source category docs; no generated catalog files are committed",
    "",
    "## Removed entries",
    "",
    "```md",
    ...removal.removedLines,
    "```",
    "",
    "## Source issues",
    "",
    ...group.items.map((item) => {
      return `- ${item.issue.html_url ?? `#${item.issue.number}`} (${item.cleanup.entry.name})`;
    }),
    "",
    ...group.items.map((item) => `Closes #${item.issue.number}`),
  ].join("\n");
}

export function buildDeadEntryCleanupPrBody({ issue, report, cleanup, removal }) {
  return [
    "## Summary",
    `- remove verified-dead catalog entry \`${cleanup.entry.name}\` from \`${cleanup.path}\``,
    `- checked \`${cleanup.checkedUrl}\` and received HTTP ${cleanup.statusCode}`,
    "- keep the fix scoped to the source category docs; no generated catalog files are committed",
    "",
    "## Reported issue types",
    report.issueTypes.map((issueType) => `- ${issueType}`).join("\n"),
    "",
    "## Removed entry",
    "",
    "```md",
    ...removal.removedLines,
    "```",
    "",
    "## Source issue",
    "",
    issue.html_url ?? `#${issue.number}`,
    "",
    `Closes #${issue.number}`,
  ].join("\n");
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

  if (pullRequest?.cleanup) {
    return [
      COMMENT_MARKER,
      `Created a cleanup PR for verified-dead entry \`${target}\`: ${pullRequest.html_url}`,
      "",
      `The automation rechecked ${pullRequest.checkedUrl} and received HTTP ${pullRequest.statusCode}, then removed the matching docs entry from \`${pullRequest.path}\`.`,
      "",
      `Source issue: #${issue.number}`,
    ].join("\n");
  }

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

function writeDeadEntryCleanup(cleanup) {
  const markdown = fs.readFileSync(cleanup.path, "utf8");
  const removal = removeEntryLineFromMarkdown(markdown, cleanup.entry);

  if (removal.removedLines.length === 0) {
    return null;
  }

  fs.writeFileSync(cleanup.path, removal.content);
  return removal;
}

function writeDeadEntryCleanupGroup(group) {
  const markdown = fs.readFileSync(group.path, "utf8");
  const removal = removeEntriesFromMarkdown(markdown, group.items.map((item) => item.cleanup.entry));

  if (removal.removedLines.length === 0) {
    return null;
  }

  fs.writeFileSync(group.path, removal.content);
  return removal;
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

function deadLinkCheckUrlForEntry(report, entry) {
  const primaryUrl = entry.links?.primary;
  if (!primaryUrl || !isValidHttpUrl(primaryUrl)) {
    return "";
  }

  const canonicalPrimary = canonicalizeUrl(primaryUrl);
  const reportedUrls = [
    firstUrl(report.entryReference),
    firstUrl(report.source),
  ].filter(Boolean);

  if (reportedUrls.length === 0) {
    return primaryUrl;
  }

  if (reportedUrls.some((url) => canonicalizeUrl(url) === canonicalPrimary)) {
    return primaryUrl;
  }

  if (report.serverId && !firstUrl(report.source)) {
    return primaryUrl;
  }

  return "";
}

function catalogPrimaryUrlMatches(catalog, url) {
  const canonicalUrl = canonicalizeUrl(url);
  return catalog.filter((entry) => {
    const primaryUrl = entry.links?.primary;
    return primaryUrl && canonicalizeUrl(primaryUrl) === canonicalUrl;
  });
}

function canonicalizeUrl(value) {
  try {
    const parsed = new URL(value.trim());
    parsed.hash = "";
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
      parsed.port = "";
    }

    parsed.pathname = parsed.pathname.replace(/\.git$/i, "").replace(/\/+$/g, "");
    return parsed.toString().replace(/\/$/g, "");
  } catch {
    return value.trim();
  }
}

async function fetchHttpStatus(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    return response.status;
  } catch {
    return 0;
  }
}

function unique(values) {
  return Array.from(new Set(values));
}

function deadEntryCleanupBranchForPath(sourcePath) {
  const docsSlug = sourcePath
    .replace(/^docs\//, "")
    .replace(/\.md$/i, "");
  return `mcp/dead-entry-cleanup-${slugify(docsSlug)}`;
}

async function listOpenBrokenEntryIssues(request) {
  const issues = [];
  let page = 1;

  while (true) {
    const pageIssues = await request(
      `/issues?state=open&labels=${encodeURIComponent("broken-entry")}&per_page=100&page=${page}`,
    );

    if (pageIssues.length === 0) {
      break;
    }

    issues.push(...pageIssues.filter((issue) => !issue.pull_request));
    page += 1;
  }

  return issues;
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
  const graphqlRequest = createGitHubGraphqlRequest({ token });
  const errors = validateBrokenEntryReport(report);
  const catalog = JSON.parse(fs.readFileSync("data/catalog.json", "utf8"));

  if (errors.length > 0) {
    await upsertIssueComment(request, issue.number, buildIssueComment({ issue, report, errors }));
    console.log(`Issue #${issue.number} cannot be converted to a broken-entry report PR: ${errors.join(" ")}`);
    return;
  }

  const cleanup = await buildDeadEntryCleanupCandidate({ catalog, report });
  const relatedIssues = cleanup ? await listOpenBrokenEntryIssues(request) : [];
  const cleanupGroup = cleanup
    ? await buildDeadEntryCleanupGroup({
        issue,
        report,
        cleanup,
        catalog,
        relatedIssues,
      })
    : null;
  const branch = cleanupGroup?.branch ?? `mcp/broken-entry-issue-${issue.number}`;

  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["fetch", "origin", DEFAULT_BASE_BRANCH]);
  run("git", ["checkout", "-B", branch, `origin/${DEFAULT_BASE_BRANCH}`]);

  const removal = cleanupGroup ? writeDeadEntryCleanupGroup(cleanupGroup) : null;
  const spec = removal ? null : buildBrokenEntryReportSpec({ issue, report });
  const title = removal
    ? cleanupGroup.title
    : `Investigate broken MCP entry report #${issue.number}`;
  const body = removal
    ? buildDeadEntryCleanupGroupPrBody({ group: cleanupGroup, removal })
    : buildPrBody({ issue, report, spec });
  const draft = !removal;

  if (removal) {
    run("git", ["add", cleanupGroup.path]);
  } else {
    writeSpec(spec);
    run("git", ["add", spec.path]);
  }

  if (!hasStagedChanges()) {
    console.log(`No broken-entry changes generated for issue #${issue.number}.`);
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
      draft,
      graphqlRequest,
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

  await upsertIssueComment(request, issue.number, buildIssueComment({
    issue,
    report,
    pullRequest: removal
      ? {
          ...pullRequest,
          cleanup: true,
          checkedUrl: cleanup.checkedUrl,
          statusCode: cleanup.statusCode,
          path: cleanup.path,
        }
      : pullRequest,
  }));

  if (removal) {
    for (const item of cleanupGroup.items.filter((item) => item.issue.number !== issue.number)) {
      await upsertIssueComment(request, item.issue.number, buildIssueComment({
        issue: item.issue,
        report: item.report,
        pullRequest: {
          ...pullRequest,
          cleanup: true,
          checkedUrl: item.cleanup.checkedUrl,
          statusCode: item.cleanup.statusCode,
          path: item.cleanup.path,
        },
      }));
    }
  }

  console.log(`Created or updated ${draft ? "draft report" : "cleanup"} PR ${pullRequest.html_url} for issue #${issue.number}.`);
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

function createGitHubGraphqlRequest({ token }) {
  return async function graphqlRequest(query, variables = {}) {
    const response = await fetch(`${API_BASE}/graphql`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ query, variables }),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok || data?.errors?.length) {
      const error = new Error(`GitHub GraphQL request failed: ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data?.data;
  };
}

export async function createOrUpdatePullRequest(request, { owner, branch, title, body, draft = true, graphqlRequest }) {
  const query = new URLSearchParams({
    head: `${owner}:${branch}`,
    state: "open",
  });
  const existingPulls = await request(`/pulls?${query.toString()}`);
  const existingPull = existingPulls[0];

  if (existingPull) {
    const updatedPull = await request(`/pulls/${existingPull.number}`, {
      method: "PATCH",
      body: { title, body },
    });

    if (!draft && existingPull.draft && graphqlRequest) {
      await markPullRequestReadyForReview(graphqlRequest, existingPull.node_id);
      return request(`/pulls/${existingPull.number}`);
    }

    return updatedPull;
  }

  return request("/pulls", {
    method: "POST",
    body: {
      title,
      body,
      head: branch,
      base: DEFAULT_BASE_BRANCH,
      draft,
      maintainer_can_modify: true,
    },
  });
}

async function markPullRequestReadyForReview(graphqlRequest, pullRequestId) {
  return graphqlRequest(
    `mutation MarkPullRequestReadyForReview($pullRequestId: ID!) {
      markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
        pullRequest {
          id
          isDraft
        }
      }
    }`,
    { pullRequestId },
  );
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
