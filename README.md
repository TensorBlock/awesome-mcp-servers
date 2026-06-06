# Awesome MCP Servers ![Awesome](https://cdn.rawgit.com/sindresorhus/awesome/d7305f38d29fed78fa85652e3a63e154dd8e8829/media/badge.svg)

[![Website](https://img.shields.io/badge/Website-tensorblock.co-blue?logo=google-chrome&logoColor=white)](https://tensorblock.co)
[![Twitter](https://img.shields.io/twitter/follow/tensorblock_aoi?style=social)](https://twitter.com/tensorblock_aoi)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?logo=discord&logoColor=white)](https://discord.gg/yefvtqDd2w)
[![🤗 Hugging Face](https://img.shields.io/badge/HuggingFace-TensorBlock-yellow?logo=huggingface&logoColor=white)](https://huggingface.co/tensorblock)
[![Telegram](https://img.shields.io/badge/Telegram-Group-blue?logo=telegram)](https://t.me/TensorBlock)

A community-curated MCP server index powered by TensorBlock.

TensorBlock turns MCP server submissions into a searchable public index with structured metadata, install-config previews, category browsing, and a hosted API that agents and applications can use directly.

**Hosted API:** [https://mcp-index.tensorblock.co](https://mcp-index.tensorblock.co)

[Submit your MCP server](#add-your-mcp-server) · [Use the API](#hosted-mcp-index-api) · [Browse categories](#browse-by-category) · [Improve metadata](#help-improve-the-index)

## Join The Community

Join the [TensorBlock Discord](https://discord.gg/yefvtqDd2w) if you want to help shape the index, request client support, share MCP servers, coordinate metadata cleanup, or join upcoming launch and digest workflows.

## Why Add Your MCP Server?

This repo is not just a list. When your MCP server is added, TensorBlock helps make it easier for users and agents to discover, understand, and install.

We are building:

- Searchable hosted API exposure.
- Structured server profiles.
- Install-config previews for popular MCP clients.
- Metadata quality signals.
- Client compatibility data.
- Weekly MCP launches and community digests.
- Badges for indexed and install-ready servers.
- Community help for fixing missing metadata.

Our goal is simple: if you build an MCP server, adding it here should give you more distribution than a markdown link.

## TensorBlock MCP Index

The TensorBlock MCP Index converts community submissions into agent-ready data.

Source entries live in `docs/*.md`. The indexer normalizes them into `data/catalog.json` and generated server profiles, then publishes the result through the hosted API.

TensorBlock contributes the compute, hosting, data normalization, and ongoing maintenance for this public index. The service is free for the MCP community, and we plan to keep improving it with better metadata, install support, verification signals, and community workflows.

## Hosted MCP Index API

Open the hosted API root for current catalog size and endpoint discovery.

Base URL:

```text
https://mcp-index.tensorblock.co
```

Examples:

```bash
curl "https://mcp-index.tensorblock.co/"
curl "https://mcp-index.tensorblock.co/v1/categories"
curl "https://mcp-index.tensorblock.co/v1/servers?query=postgres&limit=5"
curl "https://mcp-index.tensorblock.co/v1/servers/{id}"
curl "https://mcp-index.tensorblock.co/v1/servers/{id}/install-config?client=claude-desktop"
```

Supported install-config clients today:

- Claude Desktop
- Cursor
- Codex
- VS Code

Want support for Cline, Windsurf, Roo Code, Claude Code, or another client? Open an issue with the expected config shape and examples.

See [TensorBlock MCP Index API](docs/index-api.md) for full endpoint documentation.

How entries become index data:

1. The source of truth is the category markdown under `docs/*.md`.
2. Each server entry is parsed from a markdown bullet with a link and description.
3. `npm run catalog:build` generates `data/catalog.json` with normalized server metadata.
4. `npm run profiles:build` generates `data/profiles/*.json` for stable per-server profiles.
5. The deploy workflow publishes the refreshed catalog to the hosted API after changes land on `main`.

## For MCP Server Authors

To make your server more useful in the index, include as much of this metadata as possible:

- Install command.
- Transport: `stdio`, `sse`, or `streamable-http`.
- Auth type: API key, OAuth, no auth, local-only, or another required flow.
- Supported clients.
- Public remote endpoint, if available.
- Tool count.
- License.
- Docs URL.
- Example config.

Good metadata means your server can appear in better search results, compatibility views, install-config previews, weekly digests, and future server profile pages.

See the [MCP Index Metadata Contribution Guide](docs/index-alpha/contribution-guide.md) for examples.

## Community Roadmap

We are building this index as a community growth layer for MCP servers.

Coming next:

- **MCP Launches**: newly added servers get launch-style visibility.
- **Server Profiles**: every indexed server gets a shareable profile page.
- **Badges**: server authors can show indexed and install-ready status in their README.
- **Claim Profiles**: maintainers can improve and verify their own server metadata.
- **Compatibility Matrix**: see which servers work with which MCP clients.
- **Weekly Digest**: new servers, improved metadata, top categories, and contributor highlights.
- **MCP Stacks**: community-curated bundles of servers for common workflows.

## Add Your MCP Server

1. Pick the best category from [Browse by Category](#browse-by-category).
2. Open that category page under `docs/`.
3. Add one markdown bullet:

   ```md
   - [Server Name](https://github.com/owner/repo): Brief description of what the MCP server lets an agent do. Install: `npx your-package`.
   ```

4. Search the repo for your URL or project name to avoid duplicates.
5. Open a pull request.

Good entries answer these questions in one or two sentences:

- What can an agent do with this server?
- How does a user install or connect to it?
- Does it use `stdio`, `sse`, or `streamable-http`?
- Does it require an API key, OAuth, or no auth?
- Which MCP clients does it support?

## Help Improve The Index

You do not need to own a server to contribute.

Useful contributions include:

- Add missing install commands.
- Fix broken links.
- Add transport/auth metadata.
- Add supported client examples.
- Improve category placement.
- Report stale or duplicate entries.
- Request support for more MCP clients.

Generated files such as `data/catalog.json` and `data/profiles/*.json` are maintained by the indexer. If you only add a server entry, editing the relevant `docs/*.md` category page is enough for the PR.

## Local Development

- `npm run registry:mcp` starts a local registry MCP server with `search_servers`, `get_server_profile`, and `get_install_config` tools.
- `npm run registry:api:dev` starts a local HTTP API for search, category browsing, profiles, and install configs.

For maintainers validating a metadata/indexer change:

```bash
npm run catalog:build
npm run profiles:build
npm test
npm run typecheck
npm run build
```

## Browse by Category

The README stays lightweight. Browse the full directory through the category pages below, or use the hosted API for structured search.

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
