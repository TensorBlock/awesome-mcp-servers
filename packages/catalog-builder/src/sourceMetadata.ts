import { execFileSync } from "node:child_process";
import type { CatalogSourceMetadata } from "./types.js";

export const readGitLineMetadata = (
  paths: string[],
  cwd = process.cwd(),
): Map<string, CatalogSourceMetadata> => {
  const metadataByLocation = new Map<string, CatalogSourceMetadata>();

  for (const path of paths) {
    try {
      const blameOutput = execFileSync("git", [
        "blame",
        "--line-porcelain",
        "--",
        path,
      ], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });

      for (const [location, metadata] of parseGitBlamePorcelain(path, blameOutput)) {
        metadataByLocation.set(location, metadata);
      }
    } catch {
      // Source timestamps are additive metadata. Builds should still work outside a git checkout.
    }
  }

  return metadataByLocation;
};

export const parseGitBlamePorcelain = (
  path: string,
  blameOutput: string,
): Map<string, CatalogSourceMetadata> => {
  const metadataByLocation = new Map<string, CatalogSourceMetadata>();
  let currentLine: number | null = null;
  let currentUpdatedAt: string | null = null;
  let currentPullRequest: number | null = null;

  for (const line of blameOutput.split("\n")) {
    const header = line.match(/^[0-9a-f]{40,64}\s+\d+\s+(\d+)(?:\s+\d+)?$/);

    if (header) {
      currentLine = Number(header[1]);
      currentUpdatedAt = null;
      currentPullRequest = null;
      continue;
    }

    if (line.startsWith("committer-time ")) {
      currentUpdatedAt = unixSecondsToIso(line.slice("committer-time ".length));
      continue;
    }

    if (line.startsWith("author-time ") && currentUpdatedAt === null) {
      currentUpdatedAt = unixSecondsToIso(line.slice("author-time ".length));
      continue;
    }

    if (line.startsWith("summary ")) {
      currentPullRequest = extractPullRequestNumber(line.slice("summary ".length));
      continue;
    }

    if (line.startsWith("\t") && currentLine !== null) {
      if (currentUpdatedAt || currentPullRequest) {
        metadataByLocation.set(`${path}:${currentLine}`, {
          ...(currentUpdatedAt ? { lastUpdatedAt: currentUpdatedAt } : {}),
          ...(currentPullRequest ? { pullRequest: currentPullRequest } : {}),
        });
      }

      currentLine += 1;
    }
  }

  return metadataByLocation;
};

const extractPullRequestNumber = (summary: string): number | null => {
  const match = summary.match(/(?:\(#|pull request #)(\d+)/i);
  return match ? Number(match[1]) : null;
};

const unixSecondsToIso = (value: string): string | null => {
  const seconds = Number(value);

  if (!Number.isFinite(seconds)) {
    return null;
  }

  return new Date(seconds * 1000).toISOString();
};
