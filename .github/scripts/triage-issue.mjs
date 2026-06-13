#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.github.com";
const COMMENT_MARKER_PREFIX = "<!-- tensorblock-mcp-issue-triage:v1";

const LABEL_DEFINITIONS = {
  "community-intake": {
    color: "C5DEF5",
    description: "Community-submitted MCP Index issue.",
  },
  "needs-triage": {
    color: "FBCA04",
    description: "Needs maintainer routing or verification.",
  },
  "priority-high": {
    color: "D73A4A",
    description: "High priority security, safety, or broken core-flow issue.",
  },
  "good-first-metadata": {
    color: "7057FF",
    description: "Good first contribution for MCP metadata cleanup.",
  },
  verification: {
    color: "0E8A16",
    description: "Needs maintainer or source verification.",
  },
};

const ROUTES = [
  {
    id: "server-submission",
    label: "server-submission",
    titlePrefix: "Add MCP server:",
    name: "server submission",
  },
  {
    id: "metadata",
    label: "metadata",
    titlePrefix: "Improve metadata:",
    name: "metadata improvement",
  },
  {
    id: "claim-profile",
    label: "claim-profile",
    titlePrefix: "Claim MCP profile:",
    name: "profile claim",
  },
  {
    id: "client-config",
    label: "client-config",
    titlePrefix: "Request client config support:",
    name: "client config request",
  },
  {
    id: "broken-entry",
    label: "broken-entry",
    titlePrefix: "Report broken MCP entry:",
    name: "broken entry report",
  },
];

export function routeIssue(issue) {
  const labels = new Set(labelNames(issue));
  const title = issue.title ?? "";

  return (
    ROUTES.find((route) => labels.has(route.label)) ??
    ROUTES.find((route) => title.startsWith(route.titlePrefix)) ??
    null
  );
}

export function labelsForIssue(issue, action = "opened") {
  const route = routeIssue(issue);
  if (!route) {
    return [];
  }

  const labels = new Set(["community-intake"]);

  if (action === "opened" || action === "reopened") {
    labels.add("needs-triage");
  }

  if (route.id === "metadata") {
    labels.add("good-first-metadata");
  }

  if (route.id === "claim-profile") {
    labels.add("verification");
  }

  if (route.id === "broken-entry" && isSafetyReport(issue.body ?? "")) {
    labels.add("priority-high");
    labels.add("verification");
  }

  return Array.from(labels).filter((label) => !labelNames(issue).includes(label));
}

export function buildTriageComment(issue) {
  const route = routeIssue(issue);
  if (!route) {
    return null;
  }

  const issueNumber = issue.number ? `#${issue.number}` : "this issue";
  const body = issue.body ?? "";

  const templates = {
    "server-submission": [
      `Thanks for submitting this MCP server in ${issueNumber}.`,
      "",
      "What happens next:",
      "- We will check for duplicates and route it to the closest category page.",
      "- If the category and required fields are clear, automation will draft a docs entry PR for maintainer review.",
      "- Once merged, the Railway deploy rebuilds the catalog and the server becomes searchable through the hosted MCP Index API.",
      "",
      describeCapturedFields(body, [
        ["Server", "Server name"],
        ["Project", "Project URL"],
        ["Category", "Best category"],
      ]),
    ],
    metadata: [
      `Thanks for improving MCP metadata in ${issueNumber}.`,
      "",
      "What happens next:",
      "- We will verify the corrected values against the source links or project docs.",
      "- Small metadata fixes are good first contributions; a direct PR against the matching `docs/*.md` category page is welcome.",
      "- Better install, transport, auth, docs, license, and tool metadata improves search and install-config generation.",
      "",
      describeCapturedFields(body, [
        ["Profile", "TensorBlock profile URL or server id"],
        ["Project", "Project URL"],
      ]),
    ],
    "claim-profile": [
      `Thanks for claiming this MCP profile in ${issueNumber}.`,
      "",
      "What happens next:",
      "- We will verify the maintainer relationship using the repo, package, organization, or docs proof you provided.",
      "- After verification, the profile can show maintainer and claim metadata in the index.",
      "- If the profile also needs install/auth/docs updates, include them here or open a metadata PR.",
      "",
      describeCapturedFields(body, [
        ["Profile", "TensorBlock profile URL or server id"],
        ["Project", "Project URL"],
        ["Maintainer", "Maintainer handle"],
      ]),
    ],
    "client-config": [
      `Thanks for requesting client config support in ${issueNumber}.`,
      "",
      "What happens next:",
      "- We will compare the requested config shape with the existing Claude Desktop, Cursor, Codex, and VS Code generators.",
      "- Official docs and real examples are the fastest way to add reliable support for a new client or install target.",
      "- Once support lands, indexed profiles can expose generated install-config previews for that target.",
      "",
      describeCapturedFields(body, [["Client", "Client or install target"]]),
    ],
    "broken-entry": [
      `Thanks for reporting a broken MCP entry in ${issueNumber}.`,
      "",
      "What happens next:",
      "- We will verify the duplicate, dead link, stale metadata, wrong category, or safety concern.",
      "- If there is a clear correction, a direct PR against the matching `docs/*.md` entry is welcome.",
      "- Safety or security reports are routed with higher priority.",
      "",
      describeCapturedFields(body, [["Entry", "TensorBlock profile URL, server id, or project URL"]]),
    ],
  };

  return [
    markerForRoute(route.id),
    ...templates[route.id].filter(Boolean),
    commonFooter(),
  ].join("\n");
}

export function extractField(body, label) {
  const pattern = new RegExp(`###\\s+${escapeRegex(label)}\\s*\\n+([\\s\\S]*?)(?=\\n###\\s+|$)`, "i");
  const match = body.match(pattern);
  if (!match) {
    return "";
  }

  return match[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

export function markerForRoute(routeId) {
  return `${COMMENT_MARKER_PREFIX}:${routeId} -->`;
}

function commonFooter() {
  return [
    "",
    "Useful links:",
    "- Contribution guide: https://github.com/TensorBlock/awesome-mcp-servers/blob/main/docs/index-alpha/contribution-guide.md",
    "- Hosted MCP Index API: https://mcp-index.tensorblock.co",
    "- TensorBlock Discord: https://discord.com/invite/Ej5NmeHFf2",
    "",
    "If the index is useful for your project, starring the repo helps more MCP builders discover it.",
  ].join("\n");
}

function describeCapturedFields(body, fields) {
  const rows = fields
    .map(([label, fieldName]) => [label, compactField(extractField(body, fieldName))])
    .filter(([, value]) => value);

  if (rows.length === 0) {
    return "";
  }

  return ["Captured from the form:", ...rows.map(([label, value]) => `- ${label}: ${value}`)].join("\n");
}

function compactField(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 240);
}

function labelNames(issue) {
  return (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name)).filter(Boolean);
}

function isSafetyReport(body) {
  return /security or safety concern/i.test(body);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  const route = routeIssue(issue);
  if (!route) {
    console.log(`Issue #${issue.number} does not match an MCP community issue form; skipping.`);
    return;
  }

  const [owner, repo] = repository.split("/");
  const request = createGitHubRequest({ token, owner, repo });
  const labelsToAdd = labelsForIssue(issue, event.action);

  await ensureLabels(request, labelsToAdd);

  if (labelsToAdd.length > 0) {
    await request(`/issues/${issue.number}/labels`, {
      method: "POST",
      body: { labels: labelsToAdd },
    });
    console.log(`Added labels to #${issue.number}: ${labelsToAdd.join(", ")}`);
  } else {
    console.log(`No labels to add to #${issue.number}.`);
  }

  const commentBody = buildTriageComment(issue);
  await upsertTriageComment(request, issue.number, route.id, commentBody);
}

function createGitHubRequest({ token, owner, repo }) {
  return async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}/repos/${owner}/${repo}${path}`, {
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
      const error = new Error(`GitHub API ${options.method ?? "GET"} ${path} failed: ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  };
}

async function ensureLabels(request, labelNamesToEnsure) {
  for (const name of labelNamesToEnsure) {
    const definition = LABEL_DEFINITIONS[name];
    if (!definition) {
      continue;
    }

    try {
      await request(`/labels/${encodeURIComponent(name)}`);
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }

      await request("/labels", {
        method: "POST",
        body: {
          name,
          color: definition.color,
          description: definition.description,
        },
      });
      console.log(`Created missing label: ${name}`);
    }
  }
}

async function upsertTriageComment(request, issueNumber, routeId, body) {
  const marker = markerForRoute(routeId);
  const comments = await request(`/issues/${issueNumber}/comments?per_page=100`);
  const existing = comments.find((comment) => comment.body?.includes(marker));

  if (existing) {
    await request(`/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: { body },
    });
    console.log(`Updated triage comment on #${issueNumber}.`);
    return;
  }

  await request(`/issues/${issueNumber}/comments`, {
    method: "POST",
    body: { body },
  });
  console.log(`Created triage comment on #${issueNumber}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
