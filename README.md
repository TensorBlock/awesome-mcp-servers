# Awesome MCP Servers ![Awesome](https://cdn.rawgit.com/sindresorhus/awesome/d7305f38d29fed78fa85652e3a63e154dd8e8829/media/badge.svg)

[![Website](https://img.shields.io/badge/Website-tensorblock.co-blue?logo=google-chrome&logoColor=white)](https://tensorblock.co)
[![Twitter](https://img.shields.io/twitter/follow/tensorblock_aoi?style=social)](https://twitter.com/tensorblock_aoi)
[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?logo=discord&logoColor=white)](https://discord.gg/yefvtqDd2w)
[![🤗 Hugging Face](https://img.shields.io/badge/HuggingFace-TensorBlock-yellow?logo=huggingface&logoColor=white)](https://huggingface.co/tensorblock)
[![Telegram](https://img.shields.io/badge/Telegram-Group-blue?logo=telegram)](https://t.me/TensorBlock)

<div style="text-align: left; margin: 20px 0;">
    <a href="https://discord.com/invite/Ej5NmeHFf2" style="display: inline-block; padding: 10px 20px; background-color: #5865F2; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
        Join our Discord to learn more about what we're building ↗
    </a>
</div>
<div style="text-align: left; margin: 20px 0;">
    <a href="https://github.com/TensorBlock/forge" style="display: inline-block; padding: 10px 20px; background-color: #24292e; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
         ✨✨✨ Learn more about Forge - an open-source middleware service that simplifies AI model provider management. ✨✨✨
    </a>
</div>
A comprehensive, community-curated collection of [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers — covering AI assistants, browser automation, databases, cloud platforms, developer tools, and much more.

> **What is MCP?** The Model Context Protocol is an open standard that lets AI models securely connect to external tools, APIs, databases, and filesystems. Think of it as a USB-C port for AI — a universal interface that any model can use to interact with the world.

## Coverage

This repo currently indexes **7,490 unique MCP server links** from the category docs. The README stays lightweight while the full directory lives in `docs/*.md`, `data/catalog.json`, and the registry MCP server.

## TensorBlock MCP Index

This list is becoming an agent-ready MCP Index: a structured catalog that agents can search, compare, and use to generate install configs.

The alpha indexer now produces:

- `data/catalog.json` - normalized MCP server metadata from the markdown list.
- `data/profiles/*.json` - stable server profile artifacts with badge links.
- Client install configs for Claude Desktop, Cursor, Codex, and VS Code.
- A local MCP registry server with `search_servers`, `get_server_profile`, and `get_install_config` tools.

If you submit a server, include install command, transport, auth, supported clients, tool count, license, docs URL, and remote MCP endpoint when possible. Better metadata makes your server easier for agents and users to discover. See [MCP Index Metadata Contribution Guide](docs/index-alpha/contribution-guide.md).

## Contributing

We welcome submissions! To add your MCP server:

1. Fork this repository
2. Add your server to the relevant category page under `docs/`, following the existing format:
   ```
   - [Server Name](https://github.com/owner/repo) - Brief one-sentence description.
   ```
3. Open a pull request — we review regularly

**Guidelines:**
- Server must be publicly accessible (open source or a hosted service with a public endpoint)
- Search the list before submitting to avoid duplicates
- Place entries in the most relevant category

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
| Communication & Messaging | 326 | [Browse](docs/communication--messaging.md) |
| Content Management Systems | 59 | [Browse](docs/content-management-systems-cms.md) |
| Data Analysis & Business Intelligence | 238 | [Browse](docs/data-analysis--business-intelligence.md) |
| Databases | 290 | [Browse](docs/databases.md) |
| Developer Productivity & Utilities | 389 | [Browse](docs/developer-productivity--utilities.md) |
| Filesystems | 56 | [Browse](docs/filesystems.md) |
| Finance & Crypto | 404 | [Browse](docs/finance--crypto.md) |
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
