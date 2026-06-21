#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CATEGORY_TO_DOCS_PATH } from "./create-add-server-pr.mjs";
import { extractField, serverIdFromProfileReference } from "./triage-issue.mjs";

const API_BASE = "https://api.github.com";
const COMMENT_MARKER = "<!-- tensorblock-mcp-improve-metadata-pr:v1 -->";
const DEFAULT_BASE_BRANCH = "main";
const DEFAULT_SCHEMA = "../../schemas/server-metadata.schema.json";

const FIELD_ALIASES = new Map([
  ["description", "description"],
  ["summary", "description"],
  ["category", "category"],
  ["install", "install"],
  ["install command", "install"],
  ["install commands", "install"],
  ["command", "install"],
  ["commands", "install"],
  ["environment variables", "env"],
  ["environment variable", "env"],
  ["env", "env"],
  ["transport", "transport"],
  ["auth", "auth"],
  ["authentication", "auth"],
  ["auth requirements", "auth"],
  ["supported clients", "clients"],
  ["clients", "clients"],
  ["tool names or tool count", "tools"],
  ["tool names", "tools"],
  ["tools", "tools"],
  ["tool count", "tool_count"],
  ["docs url", "docs"],
  ["docs", "docs"],
  ["documentation", "docs"],
  ["endpoint", "endpoint"],
  ["mcp endpoint", "endpoint"],
  ["license", "license"],
  ["health or verification status", "verification"],
  ["verification", "verification"],
  ["verification status", "verification"],
  ["health", "verification"],
  ["status", "verification"],
]);

export function parseImproveMetadataIssue(body) {
  const profileReference = normalizeField(extractField(body, "TensorBlock profile URL or server id"));

  return {
    profileReference,
    serverId: serverIdFromProfileReference(profileReference),
    projectUrl: normalizeField(extractField(body, "Project URL")),
    fields: parseCheckedFields(extractField(body, "Metadata to update")),
    changes: normalizeField(extractField(body, "Correct metadata")),
    source: normalizeField(extractField(body, "Source or proof")),
  };
}

export function validateMetadataSubmission(submission, entry, existingMetadata) {
  const errors = [];

  if (!submission.serverId) {
    errors.push("A valid TensorBlock profile URL or server id is required.");
  }

  if (!entry) {
    errors.push(`Indexed profile not found for server id "${submission.serverId || submission.profileReference}".`);
  }

  if (submission.projectUrl) {
    if (!isValidHttpUrl(submission.projectUrl)) {
      errors.push("Project URL must be a valid HTTP or HTTPS URL.");
    } else if (entry && !projectUrlMatchesEntry(submission.projectUrl, entry, existingMetadata)) {
      errors.push("Project URL must match the indexed profile source URL, repository, homepage, docs URL, or existing sidecar project URL.");
    }
  }

  const patch = parseMetadataPatch(submission);
  if (!hasStructuredPatch(patch)) {
    errors.push("Correct metadata must include at least one recognizable field such as Description:, Install:, Transport:, Auth:, Docs URL:, License:, Tools:, or Verification:.");
  }

  if (patch.category && !CATEGORY_TO_DOCS_PATH[patch.category]) {
    errors.push(`Category "${patch.category}" must match one of the existing MCP Index categories.`);
  }

  return errors;
}

export function buildImproveMetadataSidecar({ issue, submission, entry, existingMetadata = {} }) {
  const patch = parseMetadataPatch(submission);
  const source = {
    ...(existingMetadata.source ?? {}),
    issue: issue.number,
    projectUrl: submission.projectUrl || existingMetadata.source?.projectUrl || entry.links.primary,
  };
  const metadata = {
    "$schema": existingMetadata.$schema ?? DEFAULT_SCHEMA,
    ...existingMetadata,
    id: entry.id,
    source,
  };

  if (patch.description) metadata.description = patch.description;
  if (patch.category) metadata.category = patch.category;

  if (patch.links) {
    metadata.links = {
      ...(existingMetadata.links ?? {}),
      ...patch.links,
    };
  }

  if (patch.install) {
    metadata.install = {
      ...(existingMetadata.install ?? {}),
      ...patch.install,
    };
  }

  if (patch.transport) metadata.transport = patch.transport;
  if (patch.auth) metadata.auth = patch.auth;
  if (patch.clients) metadata.clients = patch.clients;
  if (patch.tools) {
    metadata.tools = {
      ...(existingMetadata.tools ?? {}),
      ...patch.tools,
    };
  }
  if (patch.license) metadata.license = patch.license;

  metadata.verification = {
    ...(existingMetadata.verification ?? {}),
    ...(patch.verification ?? {}),
    status: patch.verification?.status ?? existingMetadata.verification?.status ?? "self_reported",
    notes: unique([
      ...(existingMetadata.verification?.notes ?? []),
      ...(patch.verification?.notes ?? []),
      buildSourceNote(issue.number, submission),
    ].filter(Boolean)),
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
      "I could not create an improve-metadata PR yet.",
      "",
      "What needs attention:",
      ...errors.map((error) => `- ${error}`),
      "",
      "Update this issue with the corrected profile id and structured metadata fields. The automation will try again when the issue is edited.",
    ].join("\n");
  }

  if (pullRequest?.blocked) {
    return [
      COMMENT_MARKER,
      `Generated branch \`${pullRequest.branch}\` for this metadata update, but GitHub Actions could not create the pull request automatically.`,
      "",
      `Open the PR manually: ${pullRequest.compareUrl}`,
    ].join("\n");
  }

  return [
    COMMENT_MARKER,
    `Created a draft metadata PR for this profile update: ${pullRequest.html_url}`,
    "",
    "A maintainer should verify the submitted source links before merging. Once merged and deployed, the public profile and API metadata will reflect the update.",
    "",
    `Updated profile id: \`${submission.serverId}\``,
  ].join("\n");
}

export function buildPrBody({ issue, submission, entry, sidecar }) {
  return [
    "## Summary",
    `- improve TensorBlock MCP metadata for \`${entry.id}\` / \`${entry.name}\``,
    `- update structured sidecar \`${sidecar.path}\` from community issue #${issue.number}`,
    "- preserve existing sidecar metadata unless this issue explicitly provides a replacement",
    "",
    "## Submitted fields",
    submission.fields.length ? submission.fields.map((field) => `- ${field}`).join("\n") : "- Not specified",
    "",
    "## Correct metadata",
    "",
    "```text",
    submission.changes,
    "```",
    ...(submission.source
      ? [
          "",
          "## Source or proof",
          "",
          "```text",
          submission.source,
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
    issue.html_url ?? `#${issue.number}`,
    "",
    `Closes #${issue.number}`,
  ].join("\n");
}

function parseMetadataPatch(submission) {
  const values = labeledValues(submission.changes);

  if (values.size === 0 && submission.fields.length === 1) {
    const key = canonicalFieldName(submission.fields[0]);
    if (key) {
      values.set(key, submission.changes);
    }
  }

  const patch = {};
  const description = compactText(values.get("description") ?? "", 520);
  const category = normalizeCategory(values.get("category") ?? "");
  const installValue = values.get("install") ?? "";
  const envValue = values.get("env") ?? "";
  const docsValue = values.get("docs") ?? "";
  const endpointValue = values.get("endpoint") ?? "";
  const transport = parseTransportMetadata(values.get("transport") ?? installValue);
  const auth = buildAuthMetadata(values.get("auth") ?? "");
  const clients = parseListMetadata(values.get("clients") ?? "");
  const tools = buildToolsMetadata(values.get("tools") ?? "", values.get("tool_count") ?? "");
  const license = normalizeMetadataScalar(values.get("license") ?? "");
  const verification = buildVerificationMetadata(values.get("verification") ?? "");
  const install = buildInstallMetadata(installValue, envValue);
  const links = definedObject({
    docs: extractFirstUrl(docsValue),
    endpoint: extractFirstUrl(endpointValue),
  });

  if (description) patch.description = description;
  if (category) patch.category = category;
  if (Object.keys(links).length > 0) patch.links = links;
  if (install) patch.install = install;
  if (transport) patch.transport = transport;
  if (auth) patch.auth = auth;
  if (clients) patch.clients = clients;
  if (tools) patch.tools = tools;
  if (license) patch.license = license;
  if (verification) patch.verification = verification;

  return patch;
}

function hasStructuredPatch(patch) {
  return [
    "description",
    "category",
    "links",
    "install",
    "transport",
    "auth",
    "clients",
    "tools",
    "license",
    "verification",
  ].some((key) => patch[key] !== undefined);
}

function labeledValues(changes) {
  const values = new Map();
  let activeKey = "";

  for (const rawLine of changes.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = line.match(/^([A-Za-z][A-Za-z /_-]{1,80}):\s*(.*)$/);
    const key = match ? canonicalFieldName(match[1]) : "";

    if (key) {
      activeKey = key;
      appendValue(values, key, match[2]);
      continue;
    }

    if (activeKey) {
      appendValue(values, activeKey, line);
    }
  }

  return values;
}

function appendValue(values, key, value) {
  const cleaned = cleanMetadataLine(value);
  if (!cleaned) {
    return;
  }

  const previous = values.get(key);
  values.set(key, previous ? `${previous}\n${cleaned}` : cleaned);
}

function canonicalFieldName(value) {
  return FIELD_ALIASES.get(value.toLowerCase().trim()) ?? "";
}

function parseCheckedFields(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.match(/-\s+\[[xX]\]\s+(.+)/)?.[1]?.trim() ?? "")
    .filter(Boolean);
}

function buildInstallMetadata(installValue, envValue) {
  const commands = parseInstallCommands(installValue);
  const env = unique([
    ...parseListMetadata(envValue) ?? [],
    ...extractEnvVars(`${installValue}\n${envValue}`),
  ]);

  if (commands.length === 0 && env.length === 0) {
    return null;
  }

  return {
    commands,
    env,
    confidence: commands.length > 0 ? "medium" : "low",
  };
}

function parseInstallCommands(value) {
  const backtickCommands = Array.from(value.matchAll(/`([^`]+)`/g))
    .map((match) => cleanMetadataLine(match[1]))
    .filter(isLikelyLaunchCommand);

  if (backtickCommands.length > 0) {
    return unique(backtickCommands);
  }

  return unique(
    value
      .split(/\r?\n/)
      .map(cleanMetadataLine)
      .filter(isLikelyLaunchCommand),
  );
}

function parseTransportMetadata(value) {
  const lower = value.toLowerCase();
  const transports = [];

  if (/\bstdio\b/.test(lower)) transports.push("stdio");
  if (/\bsse\b/.test(lower)) transports.push("sse");
  if (/\bstreamable\b/.test(lower) || /\bhttp\b/.test(lower)) transports.push("streamable-http");
  if (/\bunknown\b/.test(lower) && transports.length === 0) transports.push("unknown");

  return transports.length > 0 ? unique(transports) : null;
}

function buildAuthMetadata(value) {
  if (!value) {
    return null;
  }

  const lower = value.toLowerCase();
  let type = "unknown";

  if (/\b(no auth|none|not required|no authentication)\b/.test(lower)) type = "none";
  else if (lower.includes("oauth")) type = "oauth";
  else if (lower.includes("api key") || lower.includes("api-key") || /\b[A-Z][A-Z0-9_]*API_KEY\b/.test(value)) type = "api-key";
  else if (lower.includes("bearer")) type = "bearer";

  return {
    type,
    notes: type === "none" ? [] : [compactText(value, 240)],
  };
}

function buildToolsMetadata(toolsValue, countValue) {
  const combined = [toolsValue, countValue].filter(Boolean).join("\n");
  if (!combined) {
    return null;
  }

  const explicitCount = countValue.match(/\d+/)?.[0];
  const inlineCount = combined.match(/\b(\d+)\s+(?:mcp\s+)?tools?\b/i)?.[1];
  const count = explicitCount ?? inlineCount;
  const names = parseListMetadata(toolsValue)
    ?.filter((item) => !/^\d+\s*(?:mcp\s+)?tools?$/i.test(item))
    ?? [];

  return definedObject({
    count: count === undefined ? undefined : Number(count),
    names,
    source: "self_reported",
  });
}

function buildVerificationMetadata(value) {
  if (!value) {
    return null;
  }

  const lower = value.toLowerCase().replace(/[-\s]+/g, "_");
  const status = ["verified", "partial", "failing", "unknown", "self_reported"].find((candidate) => lower.includes(candidate));

  return {
    status: status ?? "self_reported",
    notes: status && lower === status ? [] : [compactText(value, 240)],
  };
}

function normalizeCategory(value) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  return Object.keys(CATEGORY_TO_DOCS_PATH).find((category) => category.toLowerCase() === normalized.toLowerCase()) ?? normalized;
}

function parseListMetadata(value) {
  const values = value
    .split(/[,;\n]/)
    .map(cleanMetadataLine)
    .filter(Boolean);

  return values.length > 0 ? unique(values) : null;
}

function normalizeMetadataScalar(value) {
  const normalized = compactText(value, 120);
  return normalized || null;
}

function extractEnvVars(value) {
  const matches = value.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
  return unique(matches.filter((match) => /(KEY|TOKEN|SECRET|PASSWORD|ENDPOINT|URL)$/.test(match)));
}

function extractFirstUrl(value) {
  const raw = value.match(/https?:\/\/[^\s`,)\]]+/i)?.[0] ?? "";
  return raw ? stripUrlPunctuation(raw) : null;
}

function cleanMetadataLine(value) {
  return value
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^```[a-z]*|```$/gi, "")
    .replace(/^`+|`+$/g, "")
    .trim();
}

function isLikelyLaunchCommand(value) {
  return /^(?:npx|uvx|npm|docker|node|python3?|pip|[a-z0-9._-]*mcp)\b/i.test(value);
}

function buildSourceNote(issueNumber, submission) {
  const source = submission.source ? ` Source: ${compactText(submission.source, 220)}` : "";
  return `Metadata updated from issue #${issueNumber}.${source}`;
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

function stripUrlPunctuation(url) {
  return url.replace(/[.;:!?"']+$/, "");
}

function definedObject(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== null && value !== undefined && value !== ""));
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
  const submission = parseImproveMetadataIssue(issue.body ?? "");
  const catalog = JSON.parse(fs.readFileSync("data/catalog.json", "utf8"));
  const entry = findCatalogEntry(catalog, submission.serverId);
  const existingMetadata = entry ? loadExistingMetadata(entry.id) : {};
  const errors = validateMetadataSubmission(submission, entry, existingMetadata);

  if (errors.length > 0) {
    await upsertIssueComment(request, issue.number, buildIssueComment({ issue, submission, errors }));
    console.log(`Issue #${issue.number} cannot be converted to a metadata PR: ${errors.join(" ")}`);
    return;
  }

  const sidecar = buildImproveMetadataSidecar({
    issue,
    submission,
    entry,
    existingMetadata,
  });
  const branch = `mcp/improve-metadata-issue-${issue.number}`;
  const title = `Improve ${entry.name} MCP metadata`;
  const body = buildPrBody({ issue, submission, entry, sidecar });

  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["fetch", "origin", DEFAULT_BASE_BRANCH]);
  run("git", ["checkout", "-B", branch, `origin/${DEFAULT_BASE_BRANCH}`]);

  writeSidecar(sidecar);
  run("git", ["add", sidecar.path]);

  if (!hasStagedChanges()) {
    console.log(`No metadata changes generated for issue #${issue.number}.`);
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
