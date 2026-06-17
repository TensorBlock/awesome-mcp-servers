import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClientConfigSpec,
  buildIssueComment,
  buildPrBody,
  parseClientConfigRequestIssue,
  slugFromClientTarget,
  validateClientConfigRequest,
} from "./create-client-config-request-pr.mjs";

const issueBody = [
  "### Client or install target",
  "",
  "Windsurf",
  "",
  "### Expected config shape",
  "",
  "```json",
  "{",
  '  "mcpServers": {',
  '    "example": {',
  '      "command": "npx",',
  '      "args": ["-y", "example-mcp"],',
  '      "env": {',
  '        "EXAMPLE_API_KEY": "${EXAMPLE_API_KEY}"',
  "      }",
  "    }",
  "  }",
  "}",
  "```",
  "",
  "### Official docs or reference",
  "",
  "https://docs.windsurf.com/mcp",
  "",
  "### Notes",
  "",
  "Uses the same top-level mcpServers shape as Claude Desktop, but docs mention workspace-level settings.",
].join("\n");

test("parses client-config request issue fields", () => {
  assert.deepEqual(parseClientConfigRequestIssue(issueBody), {
    client: "Windsurf",
    configShape: [
      "{",
      '  "mcpServers": {',
      '    "example": {',
      '      "command": "npx",',
      '      "args": ["-y", "example-mcp"],',
      '      "env": {',
      '        "EXAMPLE_API_KEY": "${EXAMPLE_API_KEY}"',
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n"),
    docsUrl: "https://docs.windsurf.com/mcp",
    notes: "Uses the same top-level mcpServers shape as Claude Desktop, but docs mention workspace-level settings.",
  });
});

test("validates required client-config request fields and optional docs URL", () => {
  const request = parseClientConfigRequestIssue(issueBody);

  assert.deepEqual(validateClientConfigRequest(request), []);
  assert.deepEqual(validateClientConfigRequest({ ...request, client: "" }), ["Client or install target is required."]);
  assert.deepEqual(validateClientConfigRequest({ ...request, configShape: "" }), ["Expected config shape is required."]);
  assert.deepEqual(validateClientConfigRequest({ ...request, docsUrl: "not-a-url" }), ["Official docs or reference must be a valid HTTP or HTTPS URL."]);
});

test("normalizes client target slugs for stable spec paths", () => {
  assert.equal(slugFromClientTarget("Claude Code"), "claude-code");
  assert.equal(slugFromClientTarget("VS Code / Continue"), "vs-code-continue");
});

test("builds a client-config request spec markdown file", () => {
  const request = parseClientConfigRequestIssue(issueBody);
  const spec = buildClientConfigSpec({
    issue: {
      number: 812,
      html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/812",
    },
    request,
  });

  assert.equal(spec.path, "docs/client-config-requests/windsurf.md");
  assert.match(spec.content, /^# Windsurf client config support/m);
  assert.match(spec.content, /Status: requested/);
  assert.match(spec.content, /Source issue: https:\/\/github\.com\/TensorBlock\/awesome-mcp-servers\/issues\/812/);
  assert.match(spec.content, /https:\/\/docs\.windsurf\.com\/mcp/);
  assert.match(spec.content, /"mcpServers"/);
  assert.match(spec.content, /Implementation checklist/);
});

test("builds actionable comments and PR body", () => {
  const request = parseClientConfigRequestIssue(issueBody);
  const spec = buildClientConfigSpec({
    issue: { number: 812 },
    request,
  });
  const comment = buildIssueComment({
    issue: { number: 812 },
    request,
    pullRequest: {
      html_url: "https://github.com/TensorBlock/awesome-mcp-servers/pull/813",
    },
  });
  const body = buildPrBody({
    issue: { number: 812, html_url: "https://github.com/TensorBlock/awesome-mcp-servers/issues/812" },
    request,
    spec,
  });

  assert.match(comment, /tensorblock-mcp-client-config-request-pr:v1/);
  assert.match(comment, /draft client-config request PR/);
  assert.match(comment, /Windsurf/);
  assert.match(body, /## Summary/);
  assert.match(body, /docs\/client-config-requests\/windsurf\.md/);
  assert.match(body, /Closes #812/);
});
