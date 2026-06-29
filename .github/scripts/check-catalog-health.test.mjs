import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGithubRepoFindings,
  buildHealthIssueBody,
  buildHealthIssueTitle,
  findDuplicatePrimaryLinkFindings,
  githubRepoFromUrl,
  healthFindingMarker,
  planIssueCreations,
} from "./check-catalog-health.mjs";

const catalog = [
  {
    id: "github-owner-alpha-11111111",
    name: "owner/alpha",
    category: "Developer Productivity & Utilities",
    links: {
      primary: "https://github.com/owner/alpha",
      repo: "https://github.com/owner/alpha",
    },
    source: {
      docsPath: "docs/developer-productivity--utilities.md",
    },
  },
  {
    id: "github-owner-alpha-22222222",
    name: "owner/alpha duplicate",
    category: "Utilities & Helpers",
    links: {
      primary: "https://github.com/owner/alpha/",
      repo: "https://github.com/owner/alpha/",
    },
    source: {
      docsPath: "docs/utilities--helpers.md",
    },
  },
  {
    id: "github-owner-archived-33333333",
    name: "owner/archived",
    category: "Search",
    links: {
      primary: "https://github.com/owner/archived",
      repo: "https://github.com/owner/archived",
    },
    source: {
      docsPath: "docs/search.md",
    },
  },
  {
    id: "github-owner-missing-44444444",
    name: "owner/missing",
    category: "Databases",
    links: {
      primary: "https://github.com/owner/missing",
      repo: "https://github.com/owner/missing",
    },
    source: {
      docsPath: "docs/databases.md",
    },
  },
  {
    id: "github-owner-disabled-55555555",
    name: "owner/disabled",
    category: "Security",
    links: {
      primary: "https://github.com/owner/disabled",
      repo: "https://github.com/owner/disabled",
    },
    source: {
      docsPath: "docs/security.md",
    },
  },
];

test("normalizes GitHub repository URLs from catalog links", () => {
  assert.deepEqual(githubRepoFromUrl("https://github.com/Owner/Example"), {
    owner: "Owner",
    repo: "Example",
    key: "owner/example",
    apiPath: "/repos/Owner/Example",
    htmlUrl: "https://github.com/Owner/Example",
  });
  assert.deepEqual(githubRepoFromUrl("https://github.com/owner/example/tree/main"), {
    owner: "owner",
    repo: "example",
    key: "owner/example",
    apiPath: "/repos/owner/example",
    htmlUrl: "https://github.com/owner/example",
  });
  assert.equal(githubRepoFromUrl("https://example.com/owner/example"), null);
});

test("finds duplicate primary links as broken-entry findings", () => {
  const findings = findDuplicatePrimaryLinkFindings(catalog);

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].issueTypes, ["Duplicate entry"]);
  assert.equal(findings[0].entryReference, "https://github.com/owner/alpha");
  assert.deepEqual(findings[0].serverIds, ["github-owner-alpha-11111111", "github-owner-alpha-22222222"]);
  assert.match(findings[0].details, /appears 2 times/);
  assert.match(findings[0].details, /docs\/developer-productivity--utilities\.md/);
  assert.match(findings[0].details, /docs\/utilities--helpers\.md/);
});

test("builds GitHub repo findings from real API-shaped repo checks", () => {
  const findings = buildGithubRepoFindings(catalog, new Map([
    ["owner/alpha", {
      status: 200,
      data: {
        html_url: "https://github.com/owner/alpha",
        archived: false,
        disabled: false,
      },
    }],
    ["owner/archived", {
      status: 200,
      data: {
        html_url: "https://github.com/owner/archived",
        archived: true,
        disabled: false,
      },
    }],
    ["owner/missing", {
      status: 404,
      data: {
        message: "Not Found",
        documentation_url: "https://docs.github.com/rest/repos/repos#get-a-repository",
      },
    }],
    ["owner/disabled", {
      status: 200,
      data: {
        html_url: "https://github.com/owner/disabled",
        archived: false,
        disabled: true,
      },
    }],
  ]));

  assert.deepEqual(
    findings.map((finding) => [finding.entryReference, finding.issueTypes]),
    [
      ["https://github.com/owner/archived", ["Stale project"]],
      ["https://github.com/owner/missing", ["Dead link"]],
      ["https://github.com/owner/disabled", ["Stale project"]],
    ],
  );
  assert.match(findings[0].details, /archived on GitHub/);
  assert.match(findings[1].details, /GitHub API returned 404/);
  assert.match(findings[2].details, /disabled on GitHub/);
});

test("builds broken-entry issue titles and bodies with stable health markers", () => {
  const [finding] = findDuplicatePrimaryLinkFindings(catalog);
  const title = buildHealthIssueTitle(finding);
  const body = buildHealthIssueBody(finding);

  assert.equal(title, "Report broken MCP entry: https://github.com/owner/alpha");
  assert.match(body, /tensorblock-mcp-catalog-health:v1 duplicate-primary-link:github-owner-alpha-11111111-github-owner-alpha-22222222/);
  assert.match(body, /### TensorBlock profile URL, server id, or project URL/);
  assert.match(body, /https:\/\/github\.com\/owner\/alpha/);
  assert.match(body, /- \[x\] Duplicate entry/);
  assert.match(body, /### Details/);
  assert.match(body, /### Source or proof/);
});

test("plans new issue creations without duplicating existing health reports", () => {
  const findings = [
    ...findDuplicatePrimaryLinkFindings(catalog),
    ...buildGithubRepoFindings(catalog, new Map([
      ["owner/missing", { status: 404, data: { message: "Not Found" } }],
      ["owner/archived", { status: 200, data: { html_url: "https://github.com/owner/archived", archived: true, disabled: false } }],
    ])),
  ];
  const existingIssues = [
    {
      number: 12,
      body: `${healthFindingMarker(findings[0])}\nAlready tracking this duplicate.`,
    },
  ];
  const planned = planIssueCreations({ findings, existingIssues, maxIssues: 1 });

  assert.equal(planned.length, 1);
  assert.equal(planned[0].finding.kind, "github-repo-not-found");
  assert.equal(planned[0].labels.includes("broken-entry"), true);
  assert.equal(planned[0].labels.includes("catalog-health"), true);
});
