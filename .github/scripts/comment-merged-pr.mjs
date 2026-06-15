#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const API_BASE = "https://api.github.com";
const API_PROFILE_BASE_URL = "https://mcp-index.tensorblock.co/v1/servers";
const WEB_PROFILE_BASE_URL = "https://tensorblock.co/mcp/servers";
const DISCORD_URL = "https://discord.com/invite/Ej5NmeHFf2";
const CLAIM_PROFILE_URL = "https://github.com/TensorBlock/awesome-mcp-servers/issues/new?template=claim-profile.yml";
const COMMENT_MARKER = "<!-- tensorblock-mcp-merge-follow-up:v1 -->";
const MAX_ENTRIES_IN_COMMENT = 10;

export function extractAddedCatalogEntries(files) {
  const entriesById = new Map();

  for (const file of files) {
    if (!file.path?.startsWith("docs/") || !file.path.endsWith(".md") || !file.patch) {
      continue;
    }

    for (const line of file.patch.split(/\r?\n/)) {
      const entry = parseAddedMarkdownEntry(line);
      if (!entry) {
        continue;
      }

      entriesById.set(entry.id, {
        ...entry,
        sourcePath: file.path,
      });
    }
  }

  return Array.from(entriesById.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function parseAddedMarkdownEntry(line) {
  const match = line.match(/^\+-\s+\[([^\]]+)\]\(([^)]+)\)(.*)$/);
  if (!match) {
    return null;
  }

  const [, rawName, rawUrl, rawRemainder] = match;
  const name = rawName.trim();
  const url = rawUrl.trim();
  const description = parseDescriptionRemainder(rawRemainder);

  if (!name || !url || !description) {
    return null;
  }

  try {
    return {
      id: slugFromUrl(url),
      name,
      url,
      description,
    };
  } catch {
    return null;
  }
}

export function buildMergedPrComment({ pullRequest, entries }) {
  const visibleEntries = entries.slice(0, MAX_ENTRIES_IN_COMMENT);
  const omittedCount = Math.max(0, entries.length - visibleEntries.length);

  return [
    COMMENT_MARKER,
    `Thanks for contributing to the TensorBlock MCP Index. PR #${pullRequest.number} has been merged into \`main\`.`,
    "",
    "After the registry deploy finishes, the new server entry will be searchable through the public MCP Index website and API.",
    "",
    ...visibleEntries.flatMap(formatEntryFollowUp),
    ...(omittedCount > 0 ? [`_Omitted ${omittedCount} additional entries from this comment._`, ""] : []),
    "Useful next steps:",
    "- Add the TensorBlock MCP Index badge to your project README.",
    `- Share the public profile link with users who want install/config metadata.`,
    `- Claim or improve your profile metadata: ${CLAIM_PROFILE_URL}`,
    `- Join the community: ${DISCORD_URL}`,
  ].join("\n");
}

function formatEntryFollowUp(entry) {
  const profileUrl = webProfileUrl(entry.id);
  const apiProfileUrl = apiProfileUrlFor(entry.id);
  const badgeMarkdown = badgeMarkdownFor(entry);

  return [
    `### ${entry.name}`,
    `- Profile: ${profileUrl}`,
    `- API profile: ${apiProfileUrl}`,
    `- Install config preview: ${apiProfileUrl}/install-config?client=claude-desktop`,
    "",
    "README badge:",
    "",
    "```md",
    badgeMarkdown,
    "```",
    "",
  ];
}

function parseDescriptionRemainder(raw) {
  const remainder = raw.trim();
  const explicitSeparator = remainder.match(/^.*?(?::\s*|(?:^|\s)[-\u2014\u2013]\s+)(.+)$/u);
  const description = explicitSeparator ? explicitSeparator[1].trim() : remainder.trim();

  return /[\p{L}\p{N}]/u.test(description) ? description : "";
}

export function slugFromUrl(url) {
  const canonicalUrl = canonicalizeUrl(url);
  const parsed = new URL(canonicalUrl);
  const hostname = parsed.hostname;
  const githubMatch = hostname.toLowerCase() === "github.com"
    ? parsed.pathname.match(/^\/([^/]+)\/([^/]+)/)
    : null;
  const readableSlug = githubMatch ? githubSlug(githubMatch) : domainSlug(hostname, parsed.pathname);
  const hash = createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 8);

  return `${readableSlug}-${hash}`;
}

function canonicalizeUrl(url) {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }

  return parsed.toString();
}

function githubSlug(githubMatch) {
  const [, owner, repo] = githubMatch;
  return `github-${owner}-${repo.replace(/\.git$/i, "")}`
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function domainSlug(hostname, pathname) {
  const parts = [hostname, pathname]
    .join("/")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return parts || "unknown-server";
}

function webProfileUrl(serverId) {
  return `${WEB_PROFILE_BASE_URL}/${encodeURIComponent(serverId)}`;
}

function apiProfileUrlFor(serverId) {
  return `${API_PROFILE_BASE_URL}/${encodeURIComponent(serverId)}`;
}

function badgeMarkdownFor(entry) {
  return `[![Indexed on TensorBlock MCP Index](${apiProfileUrlFor(entry.id)}/badge.svg)](${webProfileUrl(entry.id)})`;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !eventPath || !repository) {
    throw new Error("GITHUB_TOKEN, GITHUB_EVENT_PATH, and GITHUB_REPOSITORY are required.");
  }

  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const pullRequest = event.pull_request;

  if (!pullRequest?.merged) {
    console.log("Pull request is not merged; skipping follow-up comment.");
    return;
  }

  const [owner, repo] = repository.split("/");
  const request = createGitHubRequest({ token, owner, repo });
  const files = await request(`/pulls/${pullRequest.number}/files?per_page=100`);
  const entries = extractAddedCatalogEntries(files);

  if (!entries.length) {
    console.log(`No added docs catalog entries found for PR #${pullRequest.number}; skipping.`);
    return;
  }

  const body = buildMergedPrComment({
    pullRequest: {
      number: pullRequest.number,
      title: pullRequest.title,
      html_url: pullRequest.html_url,
    },
    entries,
  });

  await upsertIssueComment(request, pullRequest.number, body);
  console.log(`Posted TensorBlock MCP Index follow-up for PR #${pullRequest.number}.`);
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
