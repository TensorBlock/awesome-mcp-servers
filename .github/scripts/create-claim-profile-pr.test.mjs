import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClaimMetadataSidecar,
  buildIssueComment,
  findCatalogEntry,
  parseClaimProfileIssue,
  validateClaimSubmission,
} from "./create-claim-profile-pr.mjs";

const issueBody = [
  "### TensorBlock profile URL or server id",
  "",
  "https://tensorblock.co/mcp/servers/github-owner-demo-mcp-12345678",
  "",
  "### Project URL",
  "",
  "https://github.com/owner/demo-mcp",
  "",
  "### Maintainer handle",
  "",
  "owner",
  "",
  "### Maintainer proof",
  "",
  "I am an owner of the GitHub repository. Verification link: https://github.com/owner/demo-mcp/issues/1",
  "",
  "### Metadata you want displayed",
  "",
  "Maintained by the demo-mcp core team.",
].join("\n");

const catalogEntry = {
  id: "github-owner-demo-mcp-12345678",
  name: "owner/demo-mcp",
  links: {
    primary: "https://github.com/owner/demo-mcp",
    repo: "https://github.com/owner/demo-mcp",
    homepage: null,
    docs: null,
  },
};

test("parses claim-profile issue fields", () => {
  assert.deepEqual(parseClaimProfileIssue(issueBody), {
    profileReference: "https://tensorblock.co/mcp/servers/github-owner-demo-mcp-12345678",
    serverId: "github-owner-demo-mcp-12345678",
    projectUrl: "https://github.com/owner/demo-mcp",
    maintainer: "@owner",
    proof: "I am an owner of the GitHub repository. Verification link: https://github.com/owner/demo-mcp/issues/1",
    requestedMetadata: "Maintained by the demo-mcp core team.",
  });
});

test("validates profile claim submissions against indexed project URLs", () => {
  const submission = parseClaimProfileIssue(issueBody);

  assert.deepEqual(validateClaimSubmission(submission, catalogEntry, {}), []);
  assert.deepEqual(
    validateClaimSubmission({
      ...submission,
      projectUrl: "https://example.com/not-the-project",
    }, catalogEntry, {}),
    ["Project URL must match the indexed profile source URL, repository, homepage, docs URL, or existing sidecar project URL."],
  );
});

test("builds a claimed profile metadata sidecar while preserving existing metadata", () => {
  const submission = parseClaimProfileIssue(issueBody);
  const sidecar = buildClaimMetadataSidecar({
    issue: { number: 761 },
    submission,
    entry: catalogEntry,
    existingMetadata: {
      id: catalogEntry.id,
      source: {
        issue: 700,
        projectUrl: "https://github.com/owner/demo-mcp",
      },
      install: {
        commands: ["npx demo-mcp"],
        confidence: "medium",
      },
      verification: {
        status: "self_reported",
        notes: ["Initial self-reported metadata."],
      },
      community: {
        maintainedBy: ["@co-maintainer"],
        verifiedBy: [],
        claimed: false,
      },
    },
  });
  const metadata = JSON.parse(sidecar.content);

  assert.equal(sidecar.path, "data/server-metadata/github-owner-demo-mcp-12345678.json");
  assert.equal(metadata.source.issue, 700);
  assert.deepEqual(metadata.install, {
    commands: ["npx demo-mcp"],
    confidence: "medium",
  });
  assert.equal(metadata.verification.status, "verified");
  assert.ok(metadata.verification.notes.some((note) => /Claimed by @owner in #761/.test(note)));
  assert.ok(metadata.verification.notes.some((note) => /Requested profile metadata in #761/.test(note)));
  assert.deepEqual(metadata.community, {
    maintainedBy: ["@co-maintainer", "@owner"],
    verifiedBy: ["TensorBlock"],
    claimed: true,
  });
});

test("finds catalog entries and builds actionable comments", () => {
  const entry = findCatalogEntry([catalogEntry], catalogEntry.id);
  assert.equal(entry, catalogEntry);

  const comment = buildIssueComment({
    issue: { number: 761 },
    submission: parseClaimProfileIssue(issueBody),
    pullRequest: {
      html_url: "https://github.com/TensorBlock/awesome-mcp-servers/pull/761",
    },
  });

  assert.match(comment, /tensorblock-mcp-claim-profile-pr:v1/);
  assert.match(comment, /draft metadata PR/);
  assert.match(comment, /github-owner-demo-mcp-12345678/);
});
