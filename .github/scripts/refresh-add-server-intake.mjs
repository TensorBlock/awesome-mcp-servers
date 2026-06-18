#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import {
  buildIntakeLabelPlan,
  findDuplicateByUrl,
  INTAKE_STATUS_LABELS,
  parseAddServerIssue,
  validateSubmission,
} from "./create-add-server-pr.mjs";

const API_BASE = "https://api.github.com";
const COMMENT_MARKER = "<!-- tensorblock-mcp-add-server-pr:v1 -->";
const SERVER_SUBMISSION_LABEL = "server-submission";

export function classifyAddServerIssue({ issue, docsDir = "docs", comments = [], pullRequests = [] }) {
  const submission = parseAddServerIssue(issue.body ?? "");
  const errors = validateSubmission(submission);
  const duplicate = errors.length > 0 ? null : findDuplicateByUrl(submission.projectUrl, docsDir);
  const pullRequest = errors.length > 0 || duplicate ? null : findGeneratedPullRequest(issue.number, comments, pullRequests);
  const statusLabel = statusLabelFor({ errors, duplicate, pullRequest });
  const plan = buildIntakeLabelPlan({ issue, errors, duplicate, pullRequest });

  return {
    issue,
    submission,
    errors,
    duplicate,
    pullRequest,
    statusLabel,
    plan,
  };
}

export async function applyRefreshResult(request, result, { dryRun = true } = {}) {
  if (dryRun || (result.plan.add.length === 0 && result.plan.remove.length === 0)) {
    return false;
  }

  await ensureIntakeLabels(request, result.plan.add);

  for (const label of result.plan.remove) {
    try {
      await request(`/issues/${result.issue.number}/labels/${encodeURIComponent(label)}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
  }

  if (result.plan.add.length > 0) {
    await request(`/issues/${result.issue.number}/labels`, {
      method: "POST",
      body: {
        labels: result.plan.add,
      },
    });
  }

  return true;
}

export function summarizeRefreshResults(results) {
  const lines = [`${results.length} server submissions inspected.`];

  for (const result of results) {
    lines.push(
      [
        `#${result.issue.number}`,
        result.statusLabel ?? "no-status",
        `add=${formatLabels(result.plan.add)}`,
        `remove=${formatLabels(result.plan.remove)}`,
        result.issue.title,
      ].join(" "),
    );
  }

  return lines.join("\n");
}

function statusLabelFor({ errors, duplicate, pullRequest }) {
  if (errors.length > 0) {
    return "needs-metadata";
  }

  if (duplicate) {
    return "duplicate";
  }

  if (pullRequest?.blocked) {
    return "automation-blocked";
  }

  if (pullRequest) {
    return "ready-for-pr";
  }

  return null;
}

function findGeneratedPullRequest(issueNumber, comments, pullRequests) {
  const generatedBranch = `mcp/add-server-issue-${issueNumber}`;
  const openPullRequest = pullRequests.find((pullRequest) => pullRequest.head?.ref === generatedBranch);

  if (openPullRequest) {
    return openPullRequest;
  }

  const automationComment = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));
  if (!automationComment) {
    return null;
  }

  if (/could not open the draft PR automatically/i.test(automationComment.body)) {
    return {
      blocked: true,
      branch: generatedBranch,
    };
  }

  const pullRequestUrl = automationComment.body.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/)?.[0];
  return pullRequestUrl ? { html_url: pullRequestUrl } : null;
}

async function ensureIntakeLabels(request, labels) {
  for (const label of labels) {
    const definition = INTAKE_STATUS_LABELS[label];
    if (!definition) {
      continue;
    }

    try {
      await request(`/labels/${encodeURIComponent(label)}`);
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }

      await request("/labels", {
        method: "POST",
        body: {
          name: label,
          color: definition.color,
          description: definition.description,
        },
      });
    }
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
  }

  const dryRun = parseBoolean(process.env.INPUT_DRY_RUN ?? "true");
  const limit = Number.parseInt(process.env.INPUT_LIMIT ?? "100", 10);
  const issueNumber = process.env.INPUT_ISSUE_NUMBER ? Number.parseInt(process.env.INPUT_ISSUE_NUMBER, 10) : null;
  const [owner, repo] = repository.split("/");
  const request = createGitHubRequest({ token, owner, repo });
  const issues = issueNumber
    ? [await request(`/issues/${issueNumber}`)]
    : await listServerSubmissionIssues(request, { limit });
  const pullRequests = await request("/pulls?state=open&per_page=100");
  const results = [];

  for (const issue of issues) {
    const comments = await request(`/issues/${issue.number}/comments?per_page=100`);
    const result = classifyAddServerIssue({ issue, comments, pullRequests });
    await applyRefreshResult(request, result, { dryRun });
    results.push(result);
  }

  console.log(dryRun ? "Dry run only. No labels were changed." : "Applied intake label refresh.");
  console.log(summarizeRefreshResults(results));
}

async function listServerSubmissionIssues(request, { limit }) {
  const issues = [];
  let page = 1;

  while (issues.length < limit) {
    const pageIssues = await request(
      `/issues?state=open&labels=${encodeURIComponent(SERVER_SUBMISSION_LABEL)}&per_page=100&page=${page}`,
    );

    if (pageIssues.length === 0) {
      break;
    }

    issues.push(...pageIssues.filter((issue) => !issue.pull_request));
    page += 1;
  }

  return issues.slice(0, limit);
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

function parseBoolean(value) {
  return /^(1|true|yes)$/i.test(String(value));
}

function formatLabels(labels) {
  return labels.length > 0 ? labels.join(",") : "-";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
