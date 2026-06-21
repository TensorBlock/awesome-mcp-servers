#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractField, serverIdFromProfileReference } from "./triage-issue.mjs";

const API_BASE = "https://api.github.com";
const COMMENT_MARKER = "<!-- tensorblock-mcp-claim-profile-pr:v1 -->";
const DEFAULT_BASE_BRANCH = "main";
const DEFAULT_SCHEMA = "../../schemas/server-metadata.schema.json";

export function parseClaimProfileIssue(body) {
  const profileReference = normalizeField(extractField(body, "TensorBlock profile URL or server id"));

  return {
    profileReference,
    serverId: serverIdFromProfileReference(profileReference),
    projectUrl: normalizeField(extractField(body, "Project URL")),
    maintainer: normalizeMaintainer(normalizeField(extractField(body, "Maintainer handle"))),
    proof: normalizeField(extractField(body, "Maintainer proof")),
    requestedMetadata: normalizeField(extractField(body, "Metadata you want displayed")),
  };
}

export function validateClaimSubmission(submission, entry, existingMetadata) {
  const errors = [];

  if (!submission.serverId) {
    errors.push("A valid TensorBlock profile URL or server id is required.");
  }

  if (!entry) {
    errors.push(`Indexed profile not found for server id "${submission.serverId || submission.profileReference}".`);
  }

  if (!submission.projectUrl) {
    errors.push("Project URL is required.");
  } else if (!isValidHttpUrl(submission.projectUrl)) {
    errors.push("Project URL must be a valid HTTP or HTTPS URL.");
  }

  if (!submission.maintainer) {
    errors.push("Maintainer handle is required.");
  }

  if (!submission.proof) {
    errors.push("Maintainer proof is required.");
  }

  if (entry && submission.projectUrl && !projectUrlMatchesEntry(submission.projectUrl, entry, existingMetadata)) {
    errors.push("Project URL must match the indexed profile source URL, repository, homepage, docs URL, or existing sidecar project URL.");
  }

  return errors;
}

export function buildClaimMetadataSidecar({ issue, submission, entry, existingMetadata = {} }) {
  const proofNote = `Claimed by ${submission.maintainer} in #${issue.number}. Proof: ${compactText(submission.proof, 220)}`;
  const requestedMetadataNote = submission.requestedMetadata
    ? `Requested profile metadata in #${issue.number}: ${compactText(submission.requestedMetadata, 220)}`
    : "";

  const source = {
    ...(existingMetadata.source ?? {}),
    issue: existingMetadata.source?.issue ?? issue.number,
    projectUrl: existingMetadata.source?.projectUrl ?? submission.projectUrl ?? entry.links.primary,
  };

  const metadata = {
    "$schema": existingMetadata.$schema ?? DEFAULT_SCHEMA,
    ...existingMetadata,
    id: entry.id,
    source,
    verification: {
      ...(existingMetadata.verification ?? {}),
      status: "verified",
      notes: unique([
        ...(existingMetadata.verification?.notes ?? []),
        proofNote,
        requestedMetadataNote,
      ].filter(Boolean)),
    },
    community: {
      ...(existingMetadata.community ?? {}),
      maintainedBy: unique([
        ...(existingMetadata.community?.maintainedBy ?? []),
        submission.maintainer,
      ]),
      verifiedBy: unique([
        ...(existingMetadata.community?.verifiedBy ?? []),
        "TensorBlock",
      ]),
      claimed: true,
    },
  };

  return {
    path: `data/server-metadata/${entry.id}.json`,
    content: `${JSON.stringify(metadata, null, 2)}\n`,
  };
}

export function findCatalogEntry(catalog, serverId) {
  return catalog.find((entry) => entry.id === serverId) ?? null;
}

export function buildIssueComment({ issue, submission, pullRequest, errors }) {
  if (errors?.length) {
    return [
      COMMENT_MARKER,
      "I could not create a claim-profile metadata PR yet.",
      "",
      "What needs attention:",
      ...errors.map((error) => `- ${error}`),
      "",
      "Update this issue with the corrected profile id, matching project URL, maintainer handle, and proof link. The automation will try again when the issue is edited.",
    ].join("\n");
  }

  if (pullRequest?.blocked) {
    return [
      COMMENT_MARKER,
      `Generated branch \`${pullRequest.branch}\` for this profile claim, but GitHub Actions could not create the pull request automatically.`,
      "",
      `Open the PR manually: ${pullRequest.compareUrl}`,
    ].join("\n");
  }

  return [
    COMMENT_MARKER,
    `Created a draft metadata PR for this profile claim: ${pullRequest.html_url}`,
    "",
    "A maintainer should verify the proof before merging. Once merged and deployed, the profile will show the claimed maintainer and verification metadata.",
    "",
    `Claimed profile id: \`${submission.serverId}\``,
  ].join("\n");
}

export function buildPrBody({ issue, submission, entry, sidecar }) {
  return [
    "## Summary",
    `- claim TensorBlock MCP profile \`${entry.id}\` for \`${entry.name}\``,
    `- add maintainer and verification metadata to \`${sidecar.path}\``,
    "- mark the profile as claimed once this PR is reviewed and merged",
    "",
    "## Maintainer verification",
    `- Maintainer: ${submission.maintainer}`,
    `- Project URL: ${submission.projectUrl}`,
    `- Indexed primary link: ${entry.links.primary}`,
    "",
    "Proof submitted in the issue:",
    "",
    "```text",
    submission.proof,
    "```",
    ...(submission.requestedMetadata
      ? [
          "",
          "Requested profile metadata:",
          "",
          "```text",
          submission.requestedMetadata,
          "```",
        ]
      : []),
    "",
    "## Generated metadata sidecar",
    "",
    `\`${sidecar.path}\``,
    "",
    "```json",
    sidecar.content.trimEnd(),
    "```",
    "",
    `Closes #${issue.number}`,
  ].join("\n");
}

function loadExistingMetadata(serverId) {
  const metadataPath = `data/server-metadata/${serverId}.json`;
  if (!fs.existsSync(metadataPath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
}

function writeSidecar(sidecar) {
  fs.mkdirSync(path.dirname(sidecar.path), { recursive: true });
  fs.writeFileSync(sidecar.path, sidecar.content);
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

function normalizeMaintainer(value) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  return normalized.startsWith("@") ? normalized : `@${normalized}`;
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function projectUrlMatchesEntry(projectUrl, entry, existingMetadata) {
  const submitted = canonicalizeUrl(projectUrl);
  const candidates = [
    entry.links.primary,
    entry.links.repo,
    entry.links.homepage,
    entry.links.docs,
    existingMetadata?.source?.projectUrl,
  ].filter(Boolean);

  return candidates.some((candidate) => canonicalizeUrl(candidate) === submitted);
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

function compactText(value, maxLength) {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) {
    return compacted;
  }

  const slice = compacted.slice(0, Math.max(0, maxLength - 3)).trimEnd();
  const lastSpace = slice.lastIndexOf(" ");
  const wordBoundary = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${wordBoundary.trimEnd()}...`;
}

function unique(values) {
  return Array.from(new Set(values));
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
  const request = createGitHubRequest({ token, owner, repo });
  const submission = parseClaimProfileIssue(issue.body ?? "");
  const catalog = JSON.parse(fs.readFileSync("data/catalog.json", "utf8"));
  const entry = findCatalogEntry(catalog, submission.serverId);
  const existingMetadata = entry ? loadExistingMetadata(entry.id) : {};
  const errors = validateClaimSubmission(submission, entry, existingMetadata);

  if (errors.length > 0) {
    await upsertIssueComment(request, issue.number, buildIssueComment({ issue, submission, errors }));
    console.log(`Issue #${issue.number} cannot be converted to a claim PR: ${errors.join(" ")}`);
    return;
  }

  const sidecar = buildClaimMetadataSidecar({
    issue,
    submission,
    entry,
    existingMetadata,
  });
  const branch = `mcp/claim-profile-issue-${issue.number}`;
  const title = `Claim ${entry.name} MCP profile`;
  const body = buildPrBody({ issue, submission, entry, sidecar });

  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["fetch", "origin", DEFAULT_BASE_BRANCH]);
  run("git", ["checkout", "-B", branch, `origin/${DEFAULT_BASE_BRANCH}`]);

  writeSidecar(sidecar);
  run("git", ["add", sidecar.path]);

  if (!hasStagedChanges()) {
    console.log(`No claim metadata changes generated for issue #${issue.number}.`);
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
