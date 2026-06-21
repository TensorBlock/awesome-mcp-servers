#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.github.com";
const DEFAULT_CATALOG_PATH = "data/catalog.json";
const DEFAULT_MAX_GITHUB_REPOS = 250;
const DEFAULT_MAX_ISSUES = 5;
const HEALTH_MARKER_PREFIX = "<!-- tensorblock-mcp-catalog-health:v1";

const BROKEN_ENTRY_ISSUE_TYPES = [
  "Dead link",
  "Duplicate entry",
  "Wrong category",
  "Incorrect install command",
  "Incorrect auth or transport metadata",
  "Stale project",
  "Security or safety concern",
  "Other",
];

const LABEL_DEFINITIONS = {
  "broken-entry": {
    color: "D73A4A",
    description: "Duplicate, dead, stale, unsafe, or incorrect MCP Index entry.",
  },
  "catalog-health": {
    color: "5319E7",
    description: "Automatically generated MCP catalog health report.",
  },
};

export function githubRepoFromUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
      return null;
    }

    const [owner, rawRepo] = url.pathname.split("/").filter(Boolean);
    if (!owner || !rawRepo) {
      return null;
    }

    const repo = rawRepo.replace(/\.git$/i, "");
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;

    return {
      owner,
      repo,
      key,
      apiPath: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      htmlUrl: `https://github.com/${owner}/${repo}`,
    };
  } catch {
    return null;
  }
}

export function findDuplicatePrimaryLinkFindings(catalog) {
  const groups = new Map();

  for (const entry of catalog) {
    const primary = normalizeUrl(entry.links?.primary);
    if (!primary) {
      continue;
    }

    const existing = groups.get(primary) ?? [];
    existing.push(entry);
    groups.set(primary, existing);
  }

  return Array.from(groups.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([url, entries]) => {
      const serverIds = entries.map((entry) => entry.id).sort();
      const categoryLines = entries.map((entry) => {
        return `- ${entry.id} (${entry.category || "unknown category"}, ${entry.source?.docsPath || "unknown source"})`;
      });

      return {
        kind: "duplicate-primary-link",
        key: `duplicate-primary-link:${serverIds.join("-")}`,
        priority: 10,
        entryReference: url,
        titleTarget: url,
        issueTypes: ["Duplicate entry"],
        serverIds,
        source: url,
        details: [
          `The primary link ${url} appears ${entries.length} times in the generated catalog.`,
          "",
          "Duplicate indexed entries:",
          ...categoryLines,
          "",
          "A maintainer should verify whether these are intentional aliases, then remove or merge duplicate docs entries if needed.",
        ].join("\n"),
      };
    });
}

export function buildGithubRepoFindings(catalog, repoChecks) {
  const entriesByRepo = new Map();

  for (const entry of catalog) {
    const repo = githubRepoFromEntry(entry);
    if (!repo) {
      continue;
    }

    const entries = entriesByRepo.get(repo.key) ?? [];
    entries.push(entry);
    entriesByRepo.set(repo.key, entries);
  }

  const findings = [];
  for (const [repoKey, check] of repoChecks.entries()) {
    const entries = entriesByRepo.get(repoKey) ?? [];
    for (const entry of entries) {
      const repo = githubRepoFromEntry(entry);
      if (!repo) {
        continue;
      }

      const base = {
        entryReference: repo.htmlUrl,
        titleTarget: entry.name || repo.htmlUrl,
        serverIds: [entry.id],
        source: repo.htmlUrl,
      };

      if (check.status === 404) {
        findings.push({
          ...base,
          kind: "github-repo-not-found",
          key: `github-repo-not-found:${entry.id}`,
          priority: 20,
          issueTypes: ["Dead link"],
          details: [
            `GitHub API returned 404 for ${repo.htmlUrl}.`,
            "",
            entrySummary(entry),
            "",
            "A maintainer should verify whether the project moved, became private, or should be removed from the catalog.",
          ].join("\n"),
        });
      } else if (check.status === 200 && check.data?.archived) {
        findings.push({
          ...base,
          kind: "github-repo-archived",
          key: `github-repo-archived:${entry.id}`,
          priority: 30,
          issueTypes: ["Stale project"],
          details: [
            `${repo.htmlUrl} is archived on GitHub.`,
            "",
            entrySummary(entry),
            "",
            "A maintainer should verify whether the archived project should stay indexed, be marked stale, or be replaced by an active fork.",
          ].join("\n"),
        });
      } else if (check.status === 200 && check.data?.disabled) {
        findings.push({
          ...base,
          kind: "github-repo-disabled",
          key: `github-repo-disabled:${entry.id}`,
          priority: 25,
          issueTypes: ["Stale project"],
          details: [
            `${repo.htmlUrl} is disabled on GitHub.`,
            "",
            entrySummary(entry),
            "",
            "A maintainer should verify whether the project should be removed or replaced with an active source.",
          ].join("\n"),
        });
      }
    }
  }

  return findings;
}

export function healthFindingMarker(finding) {
  return `${HEALTH_MARKER_PREFIX} ${finding.key} -->`;
}

export function buildHealthIssueTitle(finding) {
  return compactTitle(`Report broken MCP entry: ${finding.titleTarget || finding.entryReference}`);
}

export function buildHealthIssueBody(finding) {
  const checkedTypes = new Set(finding.issueTypes);
  return [
    healthFindingMarker(finding),
    "",
    "### TensorBlock profile URL, server id, or project URL",
    "",
    finding.entryReference,
    "",
    "### What is wrong?",
    "",
    ...BROKEN_ENTRY_ISSUE_TYPES.map((issueType) => {
      return `- [${checkedTypes.has(issueType) ? "x" : " "}] ${issueType}`;
    }),
    "",
    "### Details",
    "",
    finding.details,
    "",
    "### Source or proof",
    "",
    finding.source || "_No response_",
    "",
    "### Generated by",
    "",
    "TensorBlock MCP catalog health check.",
  ].join("\n");
}

export function planIssueCreations({ findings, existingIssues, maxIssues }) {
  const existingMarkers = new Set(
    existingIssues
      .flatMap((issue) => markersInText(issue.body ?? ""))
      .filter(Boolean),
  );

  return findings
    .filter((finding) => !existingMarkers.has(healthFindingMarker(finding)))
    .sort(compareFindings)
    .slice(0, maxIssues)
    .map((finding) => ({
      finding,
      title: buildHealthIssueTitle(finding),
      body: buildHealthIssueBody(finding),
      labels: ["broken-entry", "catalog-health"],
    }));
}

export function uniqueGithubReposFromCatalog(catalog, { limit = DEFAULT_MAX_GITHUB_REPOS, offset = 0 } = {}) {
  const repos = [];
  const seen = new Set();

  for (const entry of catalog) {
    const repo = githubRepoFromEntry(entry);
    if (!repo || seen.has(repo.key)) {
      continue;
    }

    seen.add(repo.key);
    repos.push(repo);
  }

  if (repos.length === 0) {
    return [];
  }

  const normalizedOffset = Math.max(0, offset) % repos.length;
  return [...repos.slice(normalizedOffset), ...repos.slice(0, normalizedOffset)].slice(0, limit);
}

function githubRepoFromEntry(entry) {
  return githubRepoFromUrl(entry.links?.repo || entry.links?.primary);
}

function normalizeUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    const pathname = url.pathname.replace(/\/+$/g, "");
    return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}`;
  } catch {
    return value.trim().replace(/\/+$/g, "");
  }
}

function entrySummary(entry) {
  return [
    `Indexed server id: ${entry.id}`,
    `Name: ${entry.name}`,
    `Category: ${entry.category || "unknown"}`,
    `Source docs: ${entry.source?.docsPath || "unknown"}`,
  ].join("\n");
}

function markersInText(value) {
  return value.match(new RegExp(`${escapeRegex(HEALTH_MARKER_PREFIX)} [^>]+-->`, "g")) ?? [];
}

function compareFindings(a, b) {
  return a.priority - b.priority || a.key.localeCompare(b.key);
}

function compactTitle(value) {
  return value.length <= 120 ? value : `${value.slice(0, 117).trimEnd()}...`;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function offsetForToday(totalRepos, value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  if (totalRepos <= 0) {
    return 0;
  }

  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start) / 86400000);
  return (dayOfYear * DEFAULT_MAX_GITHUB_REPOS) % totalRepos;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const catalogPath = process.env.CATALOG_PATH || DEFAULT_CATALOG_PATH;
  const maxIssues = parsePositiveInteger(process.env.HEALTH_CHECK_MAX_ISSUES, DEFAULT_MAX_ISSUES);
  const maxGithubRepos = parsePositiveInteger(process.env.HEALTH_CHECK_MAX_GITHUB_REPOS, DEFAULT_MAX_GITHUB_REPOS);
  const dryRun = process.env.HEALTH_CHECK_DRY_RUN === "1";

  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const duplicateFindings = findDuplicatePrimaryLinkFindings(catalog);
  const githubRepos = uniqueGithubReposFromCatalog(catalog, { limit: Number.MAX_SAFE_INTEGER });
  const githubReposToCheck = uniqueGithubReposFromCatalog(catalog, {
    limit: maxGithubRepos,
    offset: offsetForToday(githubRepos.length, process.env.HEALTH_CHECK_OFFSET),
  });

  const repoChecks = token
    ? await checkGithubRepos({ token, repos: githubReposToCheck })
    : new Map();
  const findings = [...duplicateFindings, ...buildGithubRepoFindings(catalog, repoChecks)].sort(compareFindings);

  if (dryRun) {
    console.log(JSON.stringify({
      catalogEntries: catalog.length,
      duplicateFindings: duplicateFindings.length,
      githubReposChecked: repoChecks.size,
      findings: findings.map((finding) => ({
        key: finding.key,
        kind: finding.kind,
        entryReference: finding.entryReference,
        issueTypes: finding.issueTypes,
      })),
    }, null, 2));
    return;
  }

  if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required unless HEALTH_CHECK_DRY_RUN=1.");
  }

  const [owner, repo] = repository.split("/");
  const request = createGitHubRequest({ token, owner, repo });

  await ensureLabels(request, ["broken-entry", "catalog-health"]);

  const existingIssues = await listExistingHealthIssues(request);
  const plannedIssues = planIssueCreations({
    findings,
    existingIssues,
    maxIssues,
  });

  for (const issue of plannedIssues) {
    const created = await request("/issues", {
      method: "POST",
      body: {
        title: issue.title,
        body: issue.body,
        labels: issue.labels,
      },
    });
    console.log(`Created catalog health issue #${created.number}: ${created.html_url}`);
  }

  console.log(`Catalog health check complete: ${findings.length} finding(s), ${plannedIssues.length} new issue(s).`);
}

async function checkGithubRepos({ token, repos }) {
  const checks = new Map();
  for (const repo of repos) {
    const response = await fetch(`${API_BASE}${repo.apiPath}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    checks.set(repo.key, {
      status: response.status,
      data,
    });
  }

  return checks;
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

async function ensureLabels(request, labelNames) {
  for (const name of labelNames) {
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

async function listExistingHealthIssues(request) {
  const query = new URLSearchParams({
    state: "open",
    labels: "catalog-health",
    per_page: "100",
  });
  return request(`/issues?${query.toString()}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
