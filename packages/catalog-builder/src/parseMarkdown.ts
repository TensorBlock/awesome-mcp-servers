import { createHash } from "node:crypto";
import type { ParsedMarkdownEntry } from "./types.js";

const BULLET_LINK_PREFIX_RE = /^-\s+\[([^\]]+)\]\(/;
const LEADING_METADATA_LINK_RE =
  /^(?:\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)|!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\))\s*/;
const TEXT_CONTENT_RE = /[\p{L}\p{N}]/u;
const HASH_LENGTH = 8;

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

    const match = parseBulletLink(line);
    if (!match || !category) {
      return;
    }

    const { name, url, remainder } = match;
    const description = parseDescriptionRemainder(remainder);
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

function parseBulletLink(line: string): { name: string; url: string; remainder: string } | null {
  const prefix = line.match(BULLET_LINK_PREFIX_RE);
  if (!prefix) {
    return null;
  }

  const start = prefix[0].length;
  let depth = 0;
  for (let index = start; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\") {
      index += 1;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      if (depth > 0) {
        depth -= 1;
      } else {
        const url = line.slice(start, index).trim().replace(/\\([\\()])/g, "$1");
        return url ? { name: prefix[1], url, remainder: line.slice(index + 1) } : null;
      }
    }
  }

  return null;
}

function parseDescriptionRemainder(raw: string): string | null {
  const remainder = stripLeadingMetadataLinks(raw);
  const explicitSeparator = remainder.match(/^.*?(?::\s*|(?:^|\s)[-\u2014\u2013]\s+)(.+)$/u);
  const description = explicitSeparator ? explicitSeparator[1].trim() : remainder.trim();

  return TEXT_CONTENT_RE.test(description) ? description : null;
}

function stripLeadingMetadataLinks(raw: string): string {
  let remainder = raw.trimStart();
  let previous: string;

  do {
    previous = remainder;
    remainder = remainder.replace(LEADING_METADATA_LINK_RE, "").trimStart();
  } while (remainder !== previous);

  return remainder;
}

export function slugFromUrl(url: string): string {
  const canonicalUrl = canonicalizeUrl(url);
  const parsed = new URL(canonicalUrl);
  const hostname = parsed.hostname;
  const githubMatch = hostname.toLowerCase() === "github.com"
    ? parsed.pathname.match(/^\/([^/]+)\/([^/]+)/)
    : null;

  const readableSlug = githubMatch ? githubSlug(githubMatch) : domainSlug(hostname, parsed.pathname);
  const hash = createHash("sha256").update(canonicalUrl).digest("hex").slice(0, HASH_LENGTH);

  return `${readableSlug}-${hash}`;
}

function canonicalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
    parsed.port = "";
  }

  return parsed.toString();
}

function githubSlug(githubMatch: RegExpMatchArray): string {
  const [, owner, repo] = githubMatch;
  return `github-${owner}-${repo.replace(/\.git$/i, "")}`
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function domainSlug(hostname: string, pathname: string): string {
  const parts = [hostname, pathname]
    .join("/")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return parts || "unknown-server";
}

