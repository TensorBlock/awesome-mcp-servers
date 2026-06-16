# Awesome MCP Servers ![Awesome](https://cdn.rawgit.com/sindresorhus/awesome/d7305f38d29fed78fa85652e3a63e154dd8e8829/media/badge.svg)

[![Website](https://img.shields.io/badge/Website-tensorblock.co-blue?logo=google-chrome&logoColor=white)](https://tensorblock.co)
[![Twitter](https://img.shields.io/twitter/follow/tensorblock_aoi?style=social)](https://twitter.com/tensorblock_aoi)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?logo=discord&logoColor=white)](https://discord.gg/yefvtqDd2w)
[![🤗 Hugging Face](https://img.shields.io/badge/HuggingFace-TensorBlock-yellow?logo=huggingface&logoColor=white)](https://huggingface.co/tensorblock)
[![Telegram](https://img.shields.io/badge/Telegram-Group-blue?logo=telegram)](https://t.me/TensorBlock)

<div style="text-align: left; margin: 20px 0;">
    <a href="https://discord.com/invite/Ej5NmeHFf2" style="display: inline-block; padding: 10px 20px; background-color: #5865F2; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
        Join the TensorBlock Discord
    </a>
</div>
<div style="text-align: left; margin: 20px 0;">
    <a href="https://github.com/TensorBlock/forge" style="display: inline-block; padding: 10px 20px; background-color: #24292e; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
        Explore Forge, our open-source middleware for AI model provider management
    </a>
</div>
TensorBlock MCP Index turns this community-curated MCP server directory into a hosted, searchable registry for agents and applications. Contributors add servers in markdown; TensorBlock normalizes the entries, generates structured profiles and install-config previews, and serves the index through a free public API.

**MCP Index website:** [https://www.tensorblock.co/mcp](https://www.tensorblock.co/mcp)

**Hosted API:** [https://mcp-index.tensorblock.co](https://mcp-index.tensorblock.co)

## Coverage

This repo currently indexes **7,493 unique MCP server links** from the category docs. The README stays lightweight while the full directory lives in `docs/*.md`, `data/catalog.json`, and the registry MCP server.

## How to Participate

This repo is a community directory plus a hosted index. Every useful contribution makes the MCP Index easier for people and agents to search, compare, install, and verify.

Choose the path that matches what you want to do.

**If you maintain an MCP server:**

- Share your public MCP profile from [https://www.tensorblock.co/mcp](https://www.tensorblock.co/mcp) so users can inspect metadata, install configs, source links, and badges without reading the raw markdown.
- Add your server to the best category under [Browse by Category](#browse-by-category), or use the [Add MCP server issue form](https://github.com/TensorBlock/awesome-mcp-servers/issues/new?template=add-mcp-server.yml).
- Improve your existing entry with install command, transport, auth requirements, supported clients, docs URL, license, endpoint, and tool details. Use the [metadata issue form](https://github.com/TensorBlock/awesome-mcp-servers/issues/new?template=improve-metadata.yml) if you do not want to open a PR directly.
- Claim your TensorBlock MCP profile with the [claim profile issue form](https://github.com/TensorBlock/awesome-mcp-servers/issues/new?template=claim-profile.yml).
- Add the TensorBlock MCP Index badge to your project README so users can jump from your repo to the indexed profile.

**If you build MCP clients, agents, or developer tools:**

- Use the hosted API at [https://mcp-index.tensorblock.co](https://mcp-index.tensorblock.co) to search servers, fetch normalized profiles, list categories, or generate install-config previews.
- Request another install target with the [client config issue form](https://github.com/TensorBlock/awesome-mcp-servers/issues/new?template=request-client-config.yml). Include the client name, expected config shape, example config, and official docs.
- Help improve the config generator for Claude Desktop, Cursor, Codex, VS Code, and future clients.

**If you want to improve the index itself:**

- Fix duplicate, stale, broken, or poorly categorized entries. Use the [broken entry issue form](https://github.com/TensorBlock/awesome-mcp-servers/issues/new?template=report-broken-entry.yml) when you want maintainers to triage it.
- Add missing metadata that makes search and install generation more accurate.
- Propose verification signals, health checks, ranking improvements, or better category rules.
- Join the [TensorBlock Discord](https://discord.com/invite/Ej5NmeHFf2) to discuss roadmap work before opening a larger PR.

Issue forms are routed automatically. When you submit a server, metadata update, profile claim, client config request, or broken-entry report, the repo adds the right triage labels and posts the next steps so contributors and maintainers can keep the workflow moving. Server submissions with a clear category can also generate a draft docs PR automatically.

New server entries can be simple, but high-quality metadata makes the profile much more useful. The best entries answer:

- What can an agent do with this server?
- How does a user install or connect to it?
- Does it use `stdio`, `sse`, or `streamable-http`?
- Does it require an API key, OAuth, bearer token, or no auth?
- Which MCP clients does it support?
- Where are the setup docs, source repo, license, and public endpoint?

After a PR lands on `main`, the deploy workflow rebuilds the catalog and profiles. The hosted API and public profile pages refresh after the Railway deployment succeeds.

## TensorBlock MCP Index

This repo is both a community directory and an agent-ready index. Humans add MCP servers in markdown category pages; the indexer turns those entries into structured data that agents can search, inspect, and use to draft install configs.

### Hosted MCP Index API

TensorBlock provides the MCP Index API as free community infrastructure. We contribute the compute, hosting, data normalization, and ongoing maintenance needed to make this directory usable by agents and applications without requiring every user to clone the repo or parse markdown.

Public website:

```text
https://www.tensorblock.co/mcp
```

Base URL:

```text
https://mcp-index.tensorblock.co
```

Useful endpoints:

- `GET /` - discover available endpoints and current catalog size.
- `GET /v1/categories` - list categories with entry counts and source docs.
- `GET /v1/servers?query=postgres&limit=5` - search servers by name, description, category, or URL.
- `GET /v1/servers?category=Databases&transport=stdio` - filter by category, transport, auth type, and result limit.
- `GET /v1/servers/{id}` - fetch the normalized profile for one MCP server.
- `GET /v1/servers/{id}/badge.svg` - render a TensorBlock MCP Index badge for project READMEs.
- `GET /v1/servers/{id}/install-config?client=claude-desktop` - generate an MCP client config for Claude Desktop, Cursor, Codex, or VS Code.
- `https://tensorblock.co/mcp/servers/{id}` - share a public website profile for an indexed server.

What the API supports today:

- Search MCP servers by keyword.
- Filter by category, transport, auth type, and result limit.
- Browse all categories with entry counts.
- Fetch a normalized server profile by stable server id.
- Generate install-config previews for Claude Desktop, Cursor, Codex, and VS Code.

We want this registry to support more MCP clients and installation formats over time. If you want another client, package manager, transport, auth flow, or metadata field supported, please open an issue or PR with the expected config shape and examples.

We plan to keep investing in this hosted registry: improving metadata quality, expanding install-config coverage, adding verification signals, and keeping the service available for the MCP community. Contributors are welcome to help build the registry by adding servers, improving metadata, reporting bad entries, and proposing better search or verification workflows. When changes land on `main`, the deploy workflow rebuilds the catalog and profiles before publishing, so newly merged server entries become searchable after the Railway deployment succeeds.

How entries become index data:

1. The source of truth is the category markdown under `docs/*.md`.
2. Optional `data/server-metadata/*.json` sidecars preserve structured install, transport, auth, client, and license metadata without making the markdown entry long.
3. Each server entry is parsed from a markdown bullet with a link and description.
4. `npm run catalog:build` merges markdown entries with sidecar metadata and generates `data/catalog.json`.
5. `npm run profiles:build` generates `data/profiles/*.json` for stable per-server profiles.
6. The deploy workflow publishes the refreshed catalog to the hosted API after changes land on `main`.

For local development:

- `npm run registry:mcp` starts a local registry MCP server with `search_servers`, `get_server_profile`, and `get_install_config` tools.
- `npm run registry:api:dev` starts a local HTTP API for search, category browsing, profiles, and install configs. See [TensorBlock MCP Index API](docs/index-api.md).

Contributors still submit normal awesome-list entries, but better metadata makes each entry more useful to agents. See the [MCP Index Metadata Contribution Guide](docs/index-alpha/contribution-guide.md) for examples.

## Add or Improve an Entry

To add a new MCP server:

1. Pick the best category from [Browse by Category](#browse-by-category).
2. Open that category page under `docs/`.
3. Add one markdown bullet using this format:
   ```
   - [Server Name](https://github.com/owner/repo): Brief description of what the MCP server lets an agent do. Install: `npx your-package`.
   ```
4. Search the repo for your URL or project name to avoid duplicates.
5. Open a pull request.

If you are not sure where the server belongs, use the [Add MCP server issue form](https://github.com/TensorBlock/awesome-mcp-servers/issues/new?template=add-mcp-server.yml) and we can help route it. When the form has enough information, automation can draft a PR with both the markdown entry and a metadata sidecar.

To improve an existing server, edit the same markdown bullet where the server is listed. Add missing install, transport, auth, docs, license, client, tool, endpoint, or maintainer information in the description when possible.

`data/server-metadata/*.json` files are source metadata used by the indexer. Generated files such as `data/catalog.json` and `data/profiles/*.json` are maintained by the indexer. If you only add a simple server entry, editing the relevant `docs/*.md` category page is enough for the PR.

For metadata and indexer examples, see the [MCP Index Metadata Contribution Guide](docs/index-alpha/contribution-guide.md).

For maintainers validating a metadata/indexer change:

```
npm run catalog:build
npm run profiles:build
npm test
npm run typecheck
npm run build
```

## Browse by Category

The README is now a lightweight entry point. Browse the full directory in the category pages below, or use `data/catalog.json` and the registry MCP server for agent-native search.

| Category | Listed entries | Full list |
| --- | ---: | --- |
| AI & LLM Integration | 1,619 | [Browse](docs/ai--llm-integration.md) |
| Art, Culture & Media | 78 | [Browse](docs/art-culture--media.md) |
| Browser Automation & Web Scraping | 275 | [Browse](docs/browser-automation--web-scraping.md) |
| Build & Deployment Tools | 88 | [Browse](docs/build--deployment-tools.md) |
| Cloud Platforms & Services | 371 | [Browse](docs/cloud-platforms--services.md) |
| Code Analysis & Quality | 105 | [Browse](docs/code-analysis--quality.md) |
| Code Execution | 165 | [Browse](docs/code-execution.md) |
| Communication & Messaging | 327 | [Browse](docs/communication--messaging.md) |
| Content Management Systems | 59 | [Browse](docs/content-management-systems-cms.md) |
| Data Analysis & Business Intelligence | 238 | [Browse](docs/data-analysis--business-intelligence.md) |
| Databases | 290 | [Browse](docs/databases.md) |
| Developer Productivity & Utilities | 393 | [Browse](docs/developer-productivity--utilities.md) |
| Filesystems | 56 | [Browse](docs/filesystems.md) |
| Finance & Crypto | 408 | [Browse](docs/finance--crypto.md) |
| Frameworks | 244 | [Browse](docs/frameworks.md) |
| Gaming | 106 | [Browse](docs/gaming.md) |
| Hardware & IoT | 59 | [Browse](docs/hardware--iot.md) |
| Healthcare & Life Sciences | 57 | [Browse](docs/healthcare--life-sciences.md) |
| Infrastructure | 156 | [Browse](docs/infrastructure.md) |
| Knowledge Management & Memory | 559 | [Browse](docs/knowledge-management--memory.md) |
| Location & Maps | 89 | [Browse](docs/location--maps.md) |
| Marketing, Sales & CRM | 167 | [Browse](docs/marketing-sales--crm.md) |
| Monitoring & Observability | 83 | [Browse](docs/monitoring--observability.md) |
| Multimedia Processing | 204 | [Browse](docs/multimedia-processing.md) |
| Operating System & Command Line | 106 | [Browse](docs/operating-system--command-line.md) |
| Project & Task Management | 219 | [Browse](docs/project--task-management.md) |
| Science & Research | 106 | [Browse](docs/science--research.md) |
| Search | 168 | [Browse](docs/search.md) |
| Security | 121 | [Browse](docs/security.md) |
| Social Media & Content Platforms | 107 | [Browse](docs/social-media--content-platforms.md) |
| Sports | 6 | [Browse](docs/sport.md) |
| Travel & Transportation | 45 | [Browse](docs/travel--transportation.md) |
| Utilities & Helpers | 353 | [Browse](docs/utilities--helpers.md) |
| Version Control | 76 | [Browse](docs/version-control.md) |
