#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { slugFromUrl } from "./comment-merged-pr.mjs";
import { extractField } from "./triage-issue.mjs";

const API_BASE = "https://api.github.com";
const COMMENT_MARKER = "<!-- tensorblock-mcp-add-server-pr:v1 -->";
const DEFAULT_BASE_BRANCH = "main";

export const INTAKE_STATUS_LABELS = {
  "needs-metadata": {
    color: "F9D0C4",
    description: "Server submission needs required fields or category routing.",
  },
  duplicate: {
    color: "CFD3D7",
    description: "Server submission appears to duplicate an existing catalog entry.",
  },
  "ready-for-pr": {
    color: "0E8A16",
    description: "Server submission has a generated PR ready for maintainer review.",
  },
  "automation-blocked": {
    color: "D93F0B",
    description: "Automation generated a branch but could not complete the next GitHub action.",
  },
};

const INTAKE_STATUS_LABEL_NAMES = Object.keys(INTAKE_STATUS_LABELS);

export const CATEGORY_TO_DOCS_PATH = {
  "AI & LLM Integration": "docs/ai--llm-integration.md",
  "Art, Culture & Media": "docs/art-culture--media.md",
  "Browser Automation & Web Scraping": "docs/browser-automation--web-scraping.md",
  "Build & Deployment Tools": "docs/build--deployment-tools.md",
  "Cloud Platforms & Services": "docs/cloud-platforms--services.md",
  "Code Analysis & Quality": "docs/code-analysis--quality.md",
  "Code Execution": "docs/code-execution.md",
  "Communication & Messaging": "docs/communication--messaging.md",
  "Content Management Systems": "docs/content-management-systems-cms.md",
  "Data Analysis & Business Intelligence": "docs/data-analysis--business-intelligence.md",
  Databases: "docs/databases.md",
  "Developer Productivity & Utilities": "docs/developer-productivity--utilities.md",
  Filesystems: "docs/filesystems.md",
  "Finance & Crypto": "docs/finance--crypto.md",
  Frameworks: "docs/frameworks.md",
  Gaming: "docs/gaming.md",
  "Hardware & IoT": "docs/hardware--iot.md",
  "Healthcare & Life Sciences": "docs/healthcare--life-sciences.md",
  Infrastructure: "docs/infrastructure.md",
  "Knowledge Management & Memory": "docs/knowledge-management--memory.md",
  "Location & Maps": "docs/location--maps.md",
  "Marketing, Sales & CRM": "docs/marketing-sales--crm.md",
  "Monitoring & Observability": "docs/monitoring--observability.md",
  "Multimedia Processing": "docs/multimedia-processing.md",
  "Operating System & Command Line": "docs/operating-system--command-line.md",
  "Project & Task Management": "docs/project--task-management.md",
  "Science & Research": "docs/science--research.md",
  Search: "docs/search.md",
  Security: "docs/security.md",
  "Social Media & Content Platforms": "docs/social-media--content-platforms.md",
  Sports: "docs/sport.md",
  "Travel & Transportation": "docs/travel--transportation.md",
  "Utilities & Helpers": "docs/utilities--helpers.md",
  "Version Control": "docs/version-control.md",
};

const DOCS_PATH_TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORY_TO_DOCS_PATH).map(([category, docsPath]) => [docsPath, category]),
);

export function parseAddServerIssue(body) {
  return {
    serverName: normalizeField(extractIssueField(body, "Server name")),
    projectUrl: normalizeField(extractIssueField(body, "Project URL")),
    category: normalizeCategory(normalizeField(extractIssueField(body, "Best category")), body),
    description: normalizeField(extractIssueField(body, "What can an agent do with this server?")),
    install: normalizeField(extractIssueField(body, "Install or connection instructions")),
    transport: normalizeField(extractIssueField(body, "Transport")),
    auth: normalizeField(extractIssueField(body, "Auth requirements", "Auth")),
    clients: normalizeField(extractIssueField(body, "Known supported clients", "Clients")),
    license: normalizeField(extractIssueField(body, "License")),
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

export function buildIntakeLabelPlan({ issue = {}, errors = [], duplicate = null, pullRequest = null } = {}) {
  const existingLabels = new Set(labelNames(issue));
  let targetLabel = null;

  if (errors.length > 0) {
    targetLabel = "needs-metadata";
  } else if (duplicate) {
    targetLabel = "duplicate";
  } else if (pullRequest?.blocked) {
    targetLabel = "automation-blocked";
  } else if (pullRequest) {
    targetLabel = "ready-for-pr";
  }

  if (!targetLabel) {
    return {
      add: [],
      remove: [],
    };
  }

  return {
    add: existingLabels.has(targetLabel) ? [] : [targetLabel],
    remove: INTAKE_STATUS_LABEL_NAMES.filter((label) => label !== targetLabel && existingLabels.has(label)).sort(),
  };
}

export function buildMarkdownEntry(submission) {
  const description = sentence(compactText(submission.description, 360));
  return `- [${sanitizeLinkText(submission.serverName)}](${submission.projectUrl}): ${description}`;
}

export function docPathForCategory(category) {
  return CATEGORY_TO_DOCS_PATH[normalizeCategory(category)] ?? null;
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

export function buildPrBody({ issue, submission, docPath, entry, metadataSidecar }) {
  return [
    "## Summary",
    `- add \`${submission.serverName}\` to \`${docPath}\` from community issue #${issue.number}`,
    ...(metadataSidecar ? [`- add structured metadata sidecar \`${metadataSidecar.path}\``] : []),
    "- include submitted metadata below for maintainer verification",
    "",
    "## Generated entry",
    "",
    "```md",
    entry,
    "```",
    ...(metadataSidecar
      ? [
          "",
          "## Generated metadata sidecar",
          "",
          `\`${metadataSidecar.path}\``,
          "",
          "```json",
          metadataSidecar.content.trimEnd(),
          "```",
        ]
      : []),
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

export function buildMetadataSidecar({ issue, submission }) {
  const serverId = slugFromUrl(submission.projectUrl);
  const metadata = {
    "$schema": "../../schemas/server-metadata.schema.json",
    id: serverId,
    source: {
      issue: issue.number,
      projectUrl: submission.projectUrl,
    },
    ...definedObject({
      links: buildLinkMetadata(submission.install),
      install: buildInstallMetadata(submission.install),
      transport: parseTransportMetadata(`${submission.transport}\n${submission.install}`),
      auth: buildAuthMetadata(submission.auth || submission.install),
      clients: parseListMetadata(submission.clients),
      license: normalizeMetadataScalar(submission.license),
    }),
  };

  return {
    serverId,
    path: `data/server-metadata/${serverId}.json`,
    content: `${JSON.stringify(metadata, null, 2)}\n`,
  };
}

function extractIssueField(body, ...labels) {
  for (const label of labels) {
    const markdownField = extractField(body, label);
    if (markdownField) {
      return markdownField;
    }

    const boldField = extractBoldField(body, label);
    if (boldField) {
      return boldField;
    }
  }

  return "";
}

function extractBoldField(body, label) {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*\\*\\*${escapeRegex(label)}\\*\\*\\s*:?\\s*([^\\n]*)\\n?([\\s\\S]*?)(?=\\n\\s*(?:\\*\\*[^\\n*]+\\*\\*\\s*:?|###\\s+)|$)`,
    "i",
  );
  const match = body.match(pattern);
  if (!match) {
    return "";
  }

  return [match[1], match[2]]
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeCategory(value, context = "") {
  const lookupText = [value, context].filter(Boolean).join("\n");
  const docsPath = lookupText.match(/docs\/[a-z0-9-]+\.md/i)?.[0];
  if (docsPath && DOCS_PATH_TO_CATEGORY[docsPath]) {
    return DOCS_PATH_TO_CATEGORY[docsPath];
  }

  const normalizedValue = lookupText.toLowerCase();
  for (const category of Object.keys(CATEGORY_TO_DOCS_PATH)) {
    if (normalizedValue.includes(category.toLowerCase())) {
      return category;
    }
  }

  return value;
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

function buildLinkMetadata(value) {
  const endpoint = extractEndpoint(value);
  return endpoint ? { endpoint } : null;
}

function buildInstallMetadata(value) {
  const commands = parseInstallCommands(value);
  const env = extractEnvVars(value);

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
  if (/\bhttp\b/.test(lower) || lower.includes("streamable")) transports.push("streamable-http");

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
  else if (lower.includes("api key") || lower.includes("api-key") || /\b[A-Z][A-Z0-9_]*API_KEY\b/.test(value)) {
    type = "api-key";
  }
  else if (lower.includes("bearer")) type = "bearer";

  return {
    type,
    notes: type === "none" ? [] : [compactText(value, 240)],
  };
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

function extractEndpoint(value) {
  const urls = value.match(/https?:\/\/[^\s`,)\]]+/gi) ?? [];
  return urls.map(stripUrlPunctuation).find(looksLikeMcpEndpoint) ?? null;
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
  return /^(?:npx|uvx|npm|docker|node|python3?|[a-z0-9._-]*mcp)\b/i.test(value);
}

function stripUrlPunctuation(url) {
  return url.replace(/[.;:!?"']+$/, "");
}

function looksLikeMcpEndpoint(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, "");

    return hostname.startsWith("mcp.") || pathname === "/mcp" || pathname.endsWith("/mcp");
  } catch {
    return false;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function definedObject(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== null && value !== ""));
}

function unique(values) {
  return Array.from(new Set(values));
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

function writeMetadataSidecar(sidecar) {
  fs.mkdirSync(path.dirname(sidecar.path), { recursive: true });
  fs.writeFileSync(sidecar.path, sidecar.content);
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
    await applyIntakeLabelPlan(request, issue.number, buildIntakeLabelPlan({ issue, errors }));
    await upsertIssueComment(request, issue.number, buildIssueComment({ issue, submission, errors }));
    console.log(`Issue #${issue.number} cannot be converted to a draft PR: ${errors.join(" ")}`);
    return;
  }

  const duplicate = findDuplicateByUrl(submission.projectUrl);
  if (duplicate) {
    await applyIntakeLabelPlan(request, issue.number, buildIntakeLabelPlan({ issue, duplicate }));
    await upsertIssueComment(request, issue.number, buildIssueComment({ issue, submission, duplicate }));
    console.log(`Issue #${issue.number} matches an existing entry at ${duplicate.path}:${duplicate.line}.`);
    return;
  }

  const docPath = docPathForCategory(submission.category);
  const entry = buildMarkdownEntry(submission);
  const metadataSidecar = buildMetadataSidecar({ issue, submission });
  const branch = `mcp/add-server-issue-${issue.number}`;
  const title = `Add ${submission.serverName} MCP server`;
  const body = buildPrBody({ issue, submission, docPath, entry, metadataSidecar });

  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", ["fetch", "origin", DEFAULT_BASE_BRANCH]);
  run("git", ["checkout", "-B", branch, `origin/${DEFAULT_BASE_BRANCH}`]);

  appendEntryToDocs(docPath, entry);
  writeMetadataSidecar(metadataSidecar);
  run("git", ["add", docPath, metadataSidecar.path]);

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
    const blockedPullRequest = {
      blocked: true,
      branch,
      compareUrl,
    };

    await applyIntakeLabelPlan(
      request,
      issue.number,
      buildIntakeLabelPlan({
        issue,
        pullRequest: blockedPullRequest,
      }),
    );
    await upsertIssueComment(
      request,
      issue.number,
      buildIssueComment({
        issue,
        submission,
        pullRequest: blockedPullRequest,
      }),
    );
    console.log(`Generated branch ${branch} for issue #${issue.number}, but Actions cannot create pull requests.`);
    console.log(formatGitHubError(error));
    return;
  }

  await applyIntakeLabelPlan(request, issue.number, buildIntakeLabelPlan({ issue, pullRequest }));
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

function labelNames(issue) {
  return (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
}

async function applyIntakeLabelPlan(request, issueNumber, plan) {
  await ensureIntakeLabels(request, plan.add);

  for (const label of plan.remove) {
    try {
      await request(`/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
  }

  if (plan.add.length > 0) {
    await request(`/issues/${issueNumber}/labels`, {
      method: "POST",
      body: {
        labels: plan.add,
      },
    });
  }
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
