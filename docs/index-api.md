# TensorBlock MCP Index API

The TensorBlock MCP Index API exposes the generated catalog as HTTP JSON. It is intended for agents, clients, and lightweight integrations that need to search MCP servers or generate install configs without parsing markdown.

Hosted API:

```text
https://mcp-index.tensorblock.co
```

## Endpoints

```text
GET /
GET /health
GET /v1
GET /v1/categories
GET /v1/servers?query=&category=&transport=&auth=&limit=
GET /v1/servers/{id}
GET /v1/servers/{id}/badge.svg
GET /v1/servers/{id}/install-config?client=claude-desktop|cursor|codex|vscode
```

## Examples

Discover available endpoints:

```bash
curl "$MCP_INDEX_API_URL/"
```

Search for Postgres servers:

```bash
curl "$MCP_INDEX_API_URL/v1/servers?query=postgres&limit=5"
```

Filter by category and transport:

```bash
curl "$MCP_INDEX_API_URL/v1/servers?category=Databases&transport=stdio"
```

Fetch a full server profile:

```bash
curl "$MCP_INDEX_API_URL/v1/servers/postgres-mcp"
```

Open a shareable website profile page:

```text
https://tensorblock.co/mcp/servers/postgres-mcp
```

The API also keeps `GET /servers/{id}` as a lightweight HTML fallback, but the canonical community profile is hosted on the TensorBlock website.

Embed an MCP Index badge in a project README:

```markdown
[![Indexed on TensorBlock MCP Index](https://mcp-index.tensorblock.co/v1/servers/postgres-mcp/badge.svg)](https://tensorblock.co/mcp/servers/postgres-mcp)
```

Generate an install config:

```bash
curl "$MCP_INDEX_API_URL/v1/servers/postgres-mcp/install-config?client=claude-desktop"
```

## Railway Deployment

The API is designed to run as a Railway service from this repository.

Build command:

```bash
npm run catalog:build && npm run profiles:build && npm run build
```

Start command:

```bash
npm run start
```

The service reads `data/catalog.json` on startup and keeps it in memory. Every deploy includes the latest generated catalog from the repository. No database is required for the MVP.

## Automatic Refresh

The deployment workflow runs on every push to `main` that touches the catalog, docs, API package, schema, or Railway config. It rebuilds `data/catalog.json` and `data/profiles/*.json` before deploying, so newly merged server entries are reflected by the live API after the Railway deployment succeeds.

The workflow requires a GitHub repository secret named `RAILWAY_TOKEN` with deploy access to the Railway project.
