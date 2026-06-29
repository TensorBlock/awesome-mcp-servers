#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractField } from "./triage-issue.mjs";

const API_BASE = "https://api.github.com";
const COMMENT_MARKER = "<!-- tensorblock-mcp-client-config-request-pr:v1 -->";
const DEFAULT_BASE_BRANCH = "main";
const SPEC_DIR = "docs/client-config-requests";

export function parseClientConfigRequestIssue(body) {
  return {
    client: normalizeField(extractField(body, "Client or install target")),
    configShape: stripCodeFence(normalizeField(extractField(body, "Expected config shape"))),
    docsUrl: normalizeField(extractField(body, "Official docs or reference")),
    notes: normalizeField(extractField(body, "Notes")),
  };
}

export function validateClientConfigRequest(request) {
  const errors = [];

  if (!request.client) {
    errors.push("Client or install target is required.");
  }

  if (!request.configShape) {
    errors.push("Expected config shape is required.");
  }

  if (request.docsUrl && !isValidHttpUrl(request.docsUrl)) {
    errors.push("Official docs or reference must be a valid HTTP or HTTPS URL.");
  }

  return errors;
}

export function slugFromClientTarget(value) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildClientConfigSpec({ issue, request }) {
  const slug = slugFromClientTarget(request.client);
  const sourceIssue = issue.html_url ?? `#${issue.number}`;
  const docs = request.docsUrl || "Not provided";
  const notes = request.notes || "Not provided";
  const content = [
    `# ${request.client} client config support`,
    "",
    "Status: requested",
    `Source issue: ${sourceIssue}`,
    "",
    "## Client Or Install Target",
    "",
    request.client,
    "",
    "## Official Docs Or Reference",
    "",
    docs,
    "",
    "## Expected Config Shape",
    "",
    "```json",
    request.configShape,
    "```",
    "",
    "## Notes",
    "",
    notes,
    "",
    "## Implementation checklist",
    "",
    "- Confirm the target's official MCP config file location or API endpoint.",
    "- Map stdio server configs from generated command, args, and env values.",
    "- Map remote server configs from generated URL values.",
    "- Add config-generator tests for this client or install target.",
    "- Expose the target through the HTTP API install-config endpoint after support lands.",
    "",
  ].join("\n");

  return {
    path: `${SPEC_DIR}/${slug}.md`,
    content,
  };
}

export function buildIssueComment({ issue, request, pullRequest, errors }) {
  if (errors?.length) {
    return [
      COMMENT_MARKER,
      "I could not create a client-config request PR yet.",
      "",
      "What needs attention:",
      ...errors.map((error) => `- ${error}`),
      "",
      "Update this issue with the requested client name, expected config shape, and official docs if available. The automation will try again when the issue is edited.",
    ].join("\n");
  }

  if (pullRequest?.blocked) {
    return [
      COMMENT_MARKER,
      `Generated branch \`${pullRequest.branch}\` for this client-config request, but GitHub Actions could not create the pull request automatically.`,
      "",
      `Open the PR manually: ${pullRequest.compareUrl}`,
    ].join("\n");
  }

  return [
    COMMENT_MARKER,
    `Created a draft client-config request PR for \`${request.client}\`: ${pullRequest.html_url}`,
    "",
    "A maintainer should verify the config shape against official docs before implementing generator support.",
    "",
    `Source issue: #${issue.number}`,
  ].join("\n");
}

export function buildPrBody({ issue, request, spec }) {
  return [
    "## Summary",
    `- capture requested install-config support for \`${request.client}\``,
    `- add structured request spec at \`${spec.path}\``,
    "- keep the request reviewable before adding generator behavior",
    "",
    "## Expected config shape",
    "",
    "```json",
    request.configShape,
    "```",
    ...(request.docsUrl
      ? [
          "",
          "## Official docs",
          request.docsUrl,
        ]
      : []),
    ...(request.notes
      ? [
          "",
          "## Notes",
          request.notes,
        ]
      : []),
    "",
    "## Generated spec",
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

function normalizeField(value) {
  const normalized = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();

  if (!normalized || normalized === "_No response_") {
    return "";
  }

  return normalized;
}

function stripCodeFence(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n```$/);
  return (match?.[1] ?? trimmed).trim();
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
  const requestClientConfig = parseClientConfigRequestIssue(issue.body ?? "");
  const request = createGitHubRequest({ token, owner, repo });
  const errors = validateClientConfigRequest(requestClientConfig);

  if (errors.length > 0) {
    await upsertIssueComment(request, issue.number, buildIssueComment({ issue, request: requestClientConfig, errors }));
    console.log(`Issue #${issue.number} cannot be converted to a client-config request PR: ${errors.join(" ")}`);
    return;
  }

  const spec = buildClientConfigSpec({ issue, request: requestClientConfig });
  const branch = `mcp/client-config-issue-${issue.number}`;
  const title = `Request ${requestClientConfig.client} client config support`;
  const body = buildPrBody({ issue, request: requestClientConfig, spec });

  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["fetch", "origin", DEFAULT_BASE_BRANCH]);
  run("git", ["checkout", "-B", branch, `origin/${DEFAULT_BASE_BRANCH}`]);

  writeSpec(spec);
  run("git", ["add", spec.path]);

  if (!hasStagedChanges()) {
    console.log(`No client-config request changes generated for issue #${issue.number}.`);
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
        request: requestClientConfig,
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

  await upsertIssueComment(request, issue.number, buildIssueComment({ issue, request: requestClientConfig, pullRequest }));
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
