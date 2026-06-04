import type { ParsedMarkdownEntry } from "./types.js";

const ENTRY_RE = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*(?::|-|\u2014|\u2013)\s*(.+)$/;

export function cleanCategoryHeading(raw: string): string {
  return raw
    .replace(/^#+\s*/, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

export function parseMarkdownEntries(markdown: string, sourcePath: string): ParsedMarkdownEntry[] {
  const entries: ParsedMarkdownEntry[] = [];
  let category: string | null = null;
  const lines = markdown.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (/^##\s+/.test(line)) {
      category = cleanCategoryHeading(line);
      return;
    }

    const match = line.match(ENTRY_RE);
    if (!match || !category) {
      return;
    }

    const [, name, url, rawDescription] = match;
    const description = rawDescription.trim();
    if (!description) {
      return;
    }

    entries.push({
      category,
      name: name.trim(),
      url: url.trim(),
      description,
      sourcePath,
      line: index + 1,
    });
  });

  return entries;
}

export function slugFromUrl(url: string): string {
  const parsed = new URL(url);
  const hostname = parsed.hostname.replace(/^www\./i, "");
  const githubMatch = hostname.toLowerCase() === "github.com"
    ? parsed.pathname.match(/^\/([^/]+)\/([^/]+)/)
    : null;

  if (githubMatch) {
    const [, owner, repo] = githubMatch;
    return `github-${owner}-${repo.replace(/\.git$/i, "")}`
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
  }

  const parts = [hostname, parsed.pathname]
    .join("/")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return parts || "unknown-server";
}
