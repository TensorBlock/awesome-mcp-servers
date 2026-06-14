#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractField } from "./triage-issue.mjs";

const API_BASE = "https://api.github.com";
const COMMENT_MARKER = "<!-- tensorblock-mcp-add-server-pr:v1 -->";
const DEFAULT_BASE_BRANCH = "main";

export const CATEGORY_TO_DOCS_PATH = {
  "AI & LLM Integration": "docs/ai--llm-integration.md",
  "Browser Automation & Web Scraping": "docs/browser-automation--web-scraping.md",
  "Cloud Platforms & Services": "docs/cloud-platforms--services.md",
  "Code Execution": "docs/code-execution.md",
  Databases: "docs/databases.md",
  "Developer Productivity & Utilities": "docs/developer-productivity--utilities.md",
  Filesystems: "docs/filesystems.md",
  "Knowledge Management & Memory": "docs/knowledge-management--memory.md",
  "Monitoring & Observability": "docs/monitoring--observability.md",
  "Operating System & Command Line": "docs/operating-system--command-line.md",
  Search: "docs/search.md",
  Security: "docs/security.md",
};

export function parseAddServerIssue(body) {
  return {
    serverName: normalizeField(extractField(body, "Server name")),
    projectUrl: normalizeField(extractField(body, "Project URL")),
    category: normalizeField(extractField(body, "Best category")),
    description: normalizeField(extractField(body, "What can an agent do with this server?")),
    install: normalizeField(extractField(body, "Install or connection instructions")),
    transport: normalizeField(extractField(body, "Transport")),
    auth: normalizeField(extractField(body, "Auth requirements")),
    clients: normalizeField(extractField(body, "Known supported clients")),
    license: normalizeField(extractField(body, "License")),
  };
}

export function validateSubmission(submission) {
  const errors = [];

  if (!submission.serverName) {
    errors.push("Server name is required.");
  }

  if (!submission.projectUrl) {
    errors.push("Project URL is required.");
  } else if (!isValidHttpUrl(submission.projectUrl)) {
    errors.push("Project URL must be a valid HTTP or HTTPS URL.");
  }

  if (!submission.description) {
    errors.push("A short description is required.");
  }

  if (!submission.category) {
    errors.push("Category is required.");
  } else if (!CATEGORY_TO_DOCS_PATH[submission.category]) {
    errors.push(`Category "${submission.category}" needs maintainer routing before a draft PR can be generated.`);
  }

  return errors;
}

export function buildMarkdownEntry(submission) {
  const description = sentence(compactText(submission.description, 360));
  return `- [${sanitizeLinkText(submission.serverName)}](${submission.projectUrl}): ${description}`;
}

export function docPathForCategory(category) {
  return CATEGORY_TO_DOCS_PATH[category] ?? null;
}

export function appendEntryToDocs(docPath, entry) {
  const content = fs.readFileSync(docPath, "utf8");
  const nextContent = `${content.trimEnd()}\n${entry}\n`;
  fs.writeFileSync(docPath, nextContent);
}

export function findDuplicateByUrl(projectUrl, docsDir = "docs") {
  const targetUrl = canonicalizeUrl(projectUrl);

  for (const file of fs.readdirSync(docsDir).filter((name) => name.endsWith(".md")).sort()) {
    const filePath = path.join(docsDir, file);
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      const match = line.match(/^-\s+\[[^\]]+\]\(([^)]+)\)/);
      if (!match) {
        continue;
      }

      if (canonicalizeUrl(match[1]) === targetUrl) {
        return {
          path: filePath,
          line: index + 1,
          entry: line,
        };
      }
    }
  }

  return null;
}

export function buildPrBody({ issue, submission, docPath, entry }) {
  return [
    "## Summary",
    `- add \`${submission.serverName}\` to \`${docPath}\` from community issue #${issue.number}`,
    "- include submitted metadata below for maintainer verification",
    "",
    "## Generated entry",
    "",
    "```md",
    entry,
    "```",
    "",
    "## Submitted metadata",
    "",
    ...formatSubmittedMetadata(submission),
    "",
    "## Source issue",
    issue.html_url ?? `#${issue.number}`,
    "",
    "This is an automated draft PR. Maintainers should verify the project URL, category, metadata, and duplicate status before merging.",
  ].join("\n");
}

export function buildIssueComment({ issue, submission, pullRequest, duplicate, errors }) {
  if (errors?.length) {
    return [
      COMMENT_MARKER,
      "I could not create a draft docs PR for this server submission yet.",
      "",
      "What needs attention:",
      ...errors.map((error) => `- ${error}`),
      "",
      "A maintainer can update this issue or edit the category manually, and the automation will try again when the issue is edited.",
    ].join("\n");
  }

  if (duplicate) {
    return [
      COMMENT_MARKER,
      "I found an existing entry with the same project URL, so I did not create another docs PR.",
      "",
      `Existing entry: \`${duplicate.path}:${duplicate.line}\``,
      "",
      "```md",
      duplicate.entry,
      "```",
      "",
      "If this is a different MCP server, please update the Project URL or add details that distinguish it.",
    ].join("\n");
  }

  if (pullRequest?.blocked) {
    return [
      COMMENT_MARKER,
      `I generated a docs branch for \`${submission.serverName}\`, but could not open the draft PR automatically.`,
      "",
      "GitHub Actions currently does not have permission to create pull requests for this repository or organization.",
      "",
      "Maintainer action:",
      `- Open a draft PR from branch \`${pullRequest.branch}\`.`,
      `- Compare link: ${pullRequest.compareUrl}`,
      "- Or enable pull request creation for Actions and edit this issue to retry the automation.",
      "",
      `Source issue: #${issue.number}`,
    ].join("\n");
  }

  return [
    COMMENT_MARKER,
    `I created or updated a draft docs PR for \`${submission.serverName}\`: ${pullRequest.html_url}`,
    "",
    "What happens next:",
    "- Maintainers should verify the URL, category, description, and metadata.",
    "- Once the PR lands, the catalog and profiles rebuild on the next deploy.",
    "- The server will then become searchable from the hosted API and public MCP Index website.",
    "",
    `Source issue: #${issue.number}`,
  ].join("\n");
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

function compactText(value, maxLength = 240) {
  const compacted = value
    .replace(/\s+/g, " ")
    .trim();

  if (compacted.length <= maxLength) {
    return compacted;
  }

  const slice = compacted.slice(0, Math.max(0, maxLength - 3)).trimEnd();
  const lastSpace = slice.lastIndexOf(" ");
  const wordBoundary = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${wordBoundary.trimEnd()}...`;
}

function sentence(value) {
  const compacted = value.trim();
  if (!compacted) {
    return "";
  }

  return /[.!?)]$/.test(compacted) ? compacted : `${compacted}.`;
}

function formatSubmittedMetadata(submission) {
  const rows = [
    ["Install", submission.install],
    ["Transport", submission.transport],
    ["Auth", submission.auth],
    ["Clients", submission.clients],
    ["License", submission.license],
  ]
    .map(([label, value]) => [label, formatMetadataValue(label, value)])
    .filter(([, value]) => value && value !== "unknown");

  if (!rows.length) {
    return ["_No additional metadata submitted._"];
  }

  return rows.map(([label, value]) => `- **${label}:** ${value}`);
}

function formatMetadataValue(label, value) {
  return compactText(value, 500).replace(new RegExp(`^${label}:\\s*`, "i"), "");
}

function sanitizeLinkText(value) {
  return compactText(value, 120).replace(/[[\]]/g, "");
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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

  const submission = parseAddServerIssue(issue.body ?? "");
  const [owner, repo] = repository.split("/");
  const request = createGitHubRequest({ token, owner, repo });
  const errors = validateSubmission(submission);

  if (errors.length > 0) {
    await upsertIssueComment(request, issue.number, buildIssueComment({ issue, submission, errors }));
    console.log(`Issue #${issue.number} cannot be converted to a draft PR: ${errors.join(" ")}`);
    return;
  }

  const duplicate = findDuplicateByUrl(submission.projectUrl);
  if (duplicate) {
    await upsertIssueComment(request, issue.number, buildIssueComment({ issue, submission, duplicate }));
    console.log(`Issue #${issue.number} matches an existing entry at ${duplicate.path}:${duplicate.line}.`);
    return;
  }

  const docPath = docPathForCategory(submission.category);
  const entry = buildMarkdownEntry(submission);
  const branch = `mcp/add-server-issue-${issue.number}`;
  const title = `Add ${submission.serverName} MCP server`;
  const body = buildPrBody({ issue, submission, docPath, entry });

  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["fetch", "origin", DEFAULT_BASE_BRANCH]);
  run("git", ["checkout", "-B", branch, `origin/${DEFAULT_BASE_BRANCH}`]);

  appendEntryToDocs(docPath, entry);
  run("git", ["add", docPath]);

  if (!hasStagedChanges()) {
    console.log(`No docs changes generated for issue #${issue.number}.`);
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
        submission,
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

  await upsertIssueComment(request, issue.number, buildIssueComment({ issue, submission, pullRequest }));
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
