# TensorBlock MCP Index Alpha Design

## Objective

Turn `awesome-mcp-servers` from a community-maintained markdown directory into a free MCP discovery, installation, and registry infrastructure layer.

The alpha should validate whether structured metadata, generated install configs, static server profiles, and an agent-facing registry endpoint can convert one-time PR traffic into recurring developer engagement.

This phase does not include monetization, login, a full claim dashboard, paid verification, or a complex hosted platform.

## Strategic Positioning

TensorBlock MCP Index should be positioned as:

> Free infrastructure to discover, verify, install, and make MCP servers agent-searchable.

The immediate value exchange is:

- Server authors get profile pages, install configs, badges, and registry visibility.
- Users get cleaner discovery and copyable client configuration.
- Agents get a registry MCP endpoint for search and install guidance.
- TensorBlock gets structured ecosystem data, developer traffic, and community trust.

## Phase 1 Scope

Phase 1 should ship four core capabilities:

1. Structured catalog generation from the existing README and docs files.
2. Install config generation for Claude Desktop, Cursor, Codex, and VS Code-style MCP configs.
3. Static server profile output with badge and registry ID.
4. Registry MCP alpha exposing search, profile lookup, and install config generation.

The existing markdown contribution flow should continue to work. The alpha should improve review and post-merge engagement without blocking normal PR throughput.

## Non-Goals

Phase 1 should not build:

- User accounts or profile claim authentication.
- A full web app with database-backed editing.
- Sophisticated ranking or paid placement.
- Deep security sandboxing for every server.
- Category maintainer permission systems.
- A complete verification badge policy.

Those can be added after the catalog and registry prove useful.

## Repository Structure

Add a lightweight project structure alongside the current markdown catalog:

```text
schemas/
  server.schema.json

packages/
  catalog-builder/
  config-generator/
  registry-mcp/
  profile-renderer/

data/
  catalog.json
  profiles/
  install-configs/

docs/
  index-alpha/
    launch-plan.md
    contribution-guide.md
```

This can start as a simple Node or TypeScript workspace. The repo currently has no package structure, so the first engineering decision should be to add the smallest toolchain that supports parsing, tests, and CLI execution.

## Data Model

Each server should have a stable ID and normalized metadata.

Minimum fields:

```json
{
  "id": "github-owner-repo-or-domain-slug",
  "name": "Server Name",
  "description": "Short cleaned description",
  "category": "Finance & Crypto",
  "source": {
    "readmePath": "README.md",
    "docsPath": "docs/finance--crypto.md",
    "pullRequest": 123
  },
  "links": {
    "repo": "https://github.com/owner/repo",
    "homepage": null,
    "docs": null,
    "endpoint": null
  },
  "install": {
    "commands": [],
    "env": [],
    "notes": []
  },
  "transport": ["stdio", "streamable-http", "sse", "unknown"],
  "auth": {
    "type": "none|api-key|oauth|bearer|unknown",
    "notes": []
  },
  "clients": ["claude", "cursor", "codex", "vscode"],
  "tools": {
    "count": null,
    "names": [],
    "source": "self_reported|verified|unknown"
  },
  "license": "MIT|Apache-2.0|unknown",
  "health": {
    "repoPublic": true,
    "packageFound": null,
    "endpointReachable": null,
    "lastCheckedAt": null
  },
  "verification": {
    "status": "unverified|self_reported|partial|verified|failing",
    "notes": []
  },
  "community": {
    "maintainedBy": [],
    "verifiedBy": [],
    "claimed": false
  }
}
```

Unknown values are acceptable in alpha. The important part is to make missing data visible and easy to improve.

## Workstream 1: Catalog Builder

Purpose:

Parse the existing markdown list into a machine-readable catalog.

Initial behavior:

- Parse categories from README headings.
- Parse list entries from README and matching docs files.
- Match README and docs mirror entries where possible.
- Generate a stable server ID from GitHub owner/repo or domain slug.
- Enrich GitHub-backed entries with repo public status, description, license, stars, and last commit.
- Detect missing docs mirror entries, duplicate links, malformed entries, and category mismatches.

Outputs:

```text
data/catalog.json
data/catalog-errors.json
data/category-summary.json
```

Acceptance criteria:

- Catalog builder runs locally with one command.
- Every parsed README entry has an ID, category, source path, display name, URL, and description.
- Errors are reported without failing the whole build unless schema output is invalid.

## Workstream 2: Config Generator

Purpose:

Convert catalog metadata into copyable MCP client configuration.

Supported alpha targets:

- Claude Desktop
- Cursor
- Codex
- VS Code-style MCP JSON

Initial behavior:

- Generate config when install metadata is known.
- Fall back to a guided placeholder when env vars or command args are unknown.
- Mark config confidence as `high`, `medium`, or `low`.
- Never silently invent secrets, API keys, or unsupported transports.

Example CLI:

```bash
npx @tensorblock/mcp config getcutpro-mcp --client claude
npx @tensorblock/mcp search "shopify analytics"
```

Acceptance criteria:

- Known npm, uvx, pip, docker, and remote HTTP patterns produce valid config snippets.
- Missing data produces clear next steps for authors.
- Generated config includes source metadata and confidence level.

## Workstream 3: Static Profiles

Purpose:

Create a shareable profile for every listed server.

Alpha profile content:

- Name and cleaned description.
- Category and tags.
- Source repo/homepage/docs.
- Install configs.
- Supported clients.
- Transport and auth summary.
- Verification state.
- Similar servers from the same category.
- Badge snippet.
- Registry ID.

Initial badge:

```md
[![Listed on TensorBlock MCP Index](https://img.shields.io/badge/TensorBlock-MCP%20Index-blue)](PROFILE_URL)
```

Merge comment template:

```text
Your MCP server is now live on TensorBlock MCP Index:

Profile: PROFILE_URL
Registry ID: SERVER_ID
Install configs: PROFILE_URL#install

You can add this badge to your README:
BADGE_SNIPPET
```

Acceptance criteria:

- Every catalog entry gets a static profile JSON file.
- Entries with enough metadata get a human-readable profile page.
- Merge comments can be generated from profile metadata.

## Workstream 4: Registry MCP Alpha

Purpose:

Let agents search and use the catalog directly.

Initial MCP tools:

- `search_servers(query, filters)`
- `get_server_profile(server_id)`
- `get_install_config(server_id, client)`
- `recommend_servers(use_case, constraints)`
- `compare_servers(server_ids)`

Alpha implementation:

- Reads `data/catalog.json`.
- Uses keyword search first.
- Adds embeddings or hybrid semantic search after catalog quality is stable.
- Returns structured server cards, not raw markdown.

Acceptance criteria:

- Runs locally through `npx @tensorblock/mcp-registry`.
- Can answer "find a server for Shopify analytics" with relevant candidates.
- Can generate client-specific install config for entries with known install metadata.

## Workstream 5: PR Bot and Review Assist

Purpose:

Reduce repetitive maintainer work and invite contributors to improve metadata.

Alpha checks:

- README/docs mirror check.
- Category exists.
- Entry format parseable.
- Duplicate URL check.
- Metadata completeness check.

Bot comment should be helpful, not blocking by default:

```text
TensorBlock MCP Index metadata preview:

- Category: Finance & Crypto
- Transport: unknown
- Auth: unknown
- Install command: missing
- Docs mirror: missing docs/finance--crypto.md

Please add missing metadata so we can generate install configs and a better profile.
```

Acceptance criteria:

- Bot output maps directly to review requests maintainers already make manually.
- Missing metadata does not block merge unless it breaks existing repo rules.
- Reviewers can copy bot output into GitHub reviews when needed.

## Workstream 6: Verification Preview

Purpose:

Use available compute credits to provide useful trust signals without overpromising security.

Alpha checks:

- GitHub repo public.
- Package exists on npm/PyPI/Docker when detected.
- Install command parseable.
- Remote endpoint URL format valid.
- README contains install/auth docs.

Deferred checks:

- Full sandbox install.
- MCP initialize/list_tools handshake.
- Deep static security scan.
- Continuous endpoint monitoring.

Acceptance criteria:

- Profiles show `self_reported`, `partial`, or `unknown` clearly.
- Verification language avoids claiming security guarantees.
- Authors get concrete suggestions for improving install confidence.

## Publishing Rhythm

Weekly internal release:

- Regenerate catalog.
- Publish missing metadata report.
- Review broken mirror and duplicate issues.
- Update profile pages.

Biweekly public changelog:

- New catalog features.
- Newly indexed servers.
- Newly profile-ready servers.
- Contributor highlights.
- Known data quality gaps.

Monthly ecosystem report:

- New MCP servers by category.
- Top growing categories.
- Most complete profiles.
- Broken or stale entries.
- Featured contributors and category curators.

## Community Engagement Rhythm

PR created:

- Bot posts metadata preview and missing fields.
- Contributor sees how to improve profile quality.

PR merged:

- Maintainer or bot posts profile URL, badge, registry ID, and install config link.
- Author is invited to improve metadata or claim the profile.

Weekly:

- Post new servers and profile-ready servers in Discord.
- Open good-first-issues for missing install metadata, docs mirrors, and duplicate cleanup.
- Invite recent PR authors to add badges.

Monthly:

- Publish MCP Index report.
- Highlight contributors.
- Invite category curators for high-volume categories.

## Launch Plan

Alpha announcement should be framed around free infrastructure:

```text
TensorBlock MCP Index Alpha is live.

Every listed MCP server can now become:
- searchable,
- install-ready,
- profile-backed,
- and discoverable by agents through the TensorBlock MCP Registry.

We are starting with free metadata extraction and install config generation.
Verification and health monitoring will roll out next.
```

Initial outreach targets:

- Authors of the last 50 merged PRs.
- Authors of open PRs with missing metadata.
- MCP community Discords and GitHub discussions.
- Category-heavy maintainers in Finance, Search, AI & LLM, Browser Automation, and Developer Tools.

## Milestones

### Week 1

- Add schema.
- Add catalog builder.
- Generate first catalog and error report.
- Update PR template draft.

### Week 2

- Add config generator.
- Support Claude, Cursor, Codex, and VS Code-style configs.
- Generate profile JSON.

### Week 3

- Add static profile renderer.
- Add badge generation.
- Add merge comment template.

### Week 4

- Add registry MCP alpha.
- Publish alpha announcement.
- Invite recent authors to improve metadata and add badges.

### Weeks 5-6

- Add metadata extraction assist.
- Add verification preview checks.
- Publish first MCP Index report.

## Success Metrics

Phase 1 should be judged by engagement and data quality, not revenue.

Primary metrics:

- Percent of entries with structured install metadata.
- Percent of new PRs with complete metadata.
- Number of generated install config views or copies.
- Number of authors adding TensorBlock badge.
- Registry MCP searches.
- Profile page visits.
- Contributor metadata fixes.
- Discord joins from MCP Index links.

Secondary metrics:

- Reduction in manual review comments for docs mirror issues.
- Number of duplicate submissions detected automatically.
- Number of profiles improved after merge.
- Number of category curator volunteers.

## Risks and Mitigations

Risk: The catalog parser is noisy because the current markdown is inconsistent.

Mitigation: Treat extraction confidence as first-class data. Do not block builds on individual parse failures. Emit clear repair tasks.

Risk: Generated configs are wrong for unclear install commands.

Mitigation: Use confidence levels and placeholders. Never present low-confidence configs as verified.

Risk: Verification is interpreted as a security guarantee.

Mitigation: Use "install confidence" and "verification preview" language until deeper sandbox checks exist.

Risk: The project becomes too broad before validating engagement.

Mitigation: Ship the static catalog, install configs, profiles, and registry alpha first. Defer login, dashboards, complex ranking, and paid features.

## Recommended Next Step

Create a Phase 1 implementation plan with tasks grouped by:

1. Toolchain setup.
2. Schema and parser.
3. Config generator.
4. Profile output.
5. Registry MCP server.
6. PR bot and templates.
7. Launch and engagement operations.

The implementation plan should keep each task independently shippable so the repo continues to function as an awesome list throughout the transition.
