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
GET /v1/servers?query=&category=&transport=&auth=&cloud=&limit=
GET /v1/recommend?text=&cloud=&limit=
GET /v1/recommend?needs=&cloud=&perNeed=
GET /v1/servers/recent?limit=
GET /v1/servers/updated?limit=
GET /v1/servers/{id}
GET /v1/servers/{id}/badge.svg
GET /v1/servers/{id}/install-config?client=claude-desktop|cursor|codex|vscode|lagrange
```

## Examples

Discover available endpoints:

```bash
curl "$MCP_INDEX_API_URL/"
```

Check API health and deployment fingerprint:

```bash
curl "$MCP_INDEX_API_URL/health"
```

```json
{
  "status": "ok",
  "catalogEntries": 7729,
  "loadedAt": "2026-07-08T00:00:00.000Z",
  "build": {
    "commitSha": "694bc1a8c555e6d6df6dfe2ee1b04b7ae866eee5",
    "builtAt": "2026-07-08T00:11:55.000Z"
  },
  "uptimeSeconds": 60
}
```

Search for Postgres servers:

```bash
curl "$MCP_INDEX_API_URL/v1/servers?query=postgres&limit=5"
```

Filter by category and transport:

```bash
curl "$MCP_INDEX_API_URL/v1/servers?category=Databases&transport=stdio"
```

Only return servers a LagrangeCloud agent can use: a hosted endpoint, or an `npx`/`uvx` package its sandbox can start:

```bash
curl "$MCP_INDEX_API_URL/v1/servers?query=postgres&cloud=true"
```

Every server summary includes `cloudReady` for the same check.

Fetch recently added servers:

```bash
curl "$MCP_INDEX_API_URL/v1/servers/recent?limit=12"
```

Fetch recently updated catalog entries:

```bash
curl "$MCP_INDEX_API_URL/v1/servers/updated?limit=12"
```

Server summaries include `sourcePullRequest` when known and `lastUpdatedAt` when the catalog builder can derive it from git history. The `recent` and `updated` collections sort by `lastUpdatedAt`, using source pull request numbers as an additional ordering signal when timestamps tie.

Fetch a full server profile:

```bash
curl "$MCP_INDEX_API_URL/v1/servers/github-crystaldba-postgres-mcp-22e80ea8"
```

Open a shareable website profile page:

```text
https://tensorblock.co/mcp/servers/github-crystaldba-postgres-mcp-22e80ea8
```

The API also keeps `GET /servers/{id}` as a lightweight HTML fallback, but the canonical community profile is hosted on the TensorBlock website.

Embed an MCP Index badge in a project README:

```markdown
[![Indexed on TensorBlock MCP Index](https://mcp-index.tensorblock.co/v1/servers/github-crystaldba-postgres-mcp-22e80ea8/badge.svg)](https://tensorblock.co/mcp/servers/github-crystaldba-postgres-mcp-22e80ea8)
```

Generate an install config:

```bash
curl "$MCP_INDEX_API_URL/v1/servers/github-crystaldba-postgres-mcp-22e80ea8/install-config?client=claude-desktop"
```

## LagrangeCloud

LagrangeCloud runs agents in a cloud sandbox and lists their MCP servers under `mcp:` in `lgr.yaml`. These endpoints let it suggest servers when a user creates or deploys an agent.

Generate the `lgr.yaml` entry for a server:

```bash
curl "$MCP_INDEX_API_URL/v1/servers/github-crystaldba-postgres-mcp-22e80ea8/install-config?client=lagrange"
```

```json
{
  "serverId": "github-crystaldba-postgres-mcp-22e80ea8",
  "client": "lagrange",
  "confidence": "high",
  "cloudReady": true,
  "mcp": {
    "name": "postgres-mcp",
    "command": "uvx",
    "args": ["postgres-mcp", "--access-mode=restricted"],
    "env": { "DATABASE_URI": "${DATABASE_URI}" }
  },
  "secrets": ["DATABASE_URI"],
  "signIn": false,
  "notes": ["Every environment variable is listed as a secret; drop the ones this agent doesn't need."]
}
```

`mcp` is the entry to add under `mcp:`, or `null` when the sandbox can't run the server. A hosted server is `{ name, url, secret? }`, where `secret` names the secret sent as a bearer token. A package is `{ name, command, args, env? }`. `secrets` lists the names to store with `lgr secrets set`. `signIn` is true when the user signs in to the server through OAuth on the agent's page after deploying.

Recommend servers for an agent from a description of it, such as its AGENTS.md or what the user typed when creating it:

```bash
curl "$MCP_INDEX_API_URL/v1/recommend?text=Triage+new+GitHub+issues+every+morning+and+post+a+summary+to+Slack"
```

The ranking favors servers whose name or domain matches a tool the agent mentions, prefers reviewed servers with a high install confidence, and suggests one server per tool before a second for the same tool. Each result is a server summary plus `score`, `matchedTerms`, and the `lagrange` install config above.

When the caller can name what the agent needs, for example an LLM that read the agent's instructions, ask for each need instead. Common needs such as web search rank better this way than inside a longer description:

```bash
curl "$MCP_INDEX_API_URL/v1/recommend?needs=github,slack,web+search&perNeed=3"
```

```json
{
  "cloud": true,
  "needs": [
    { "need": "github", "servers": [{ "id": "github-github-github-mcp-server-faa31886", "...": "..." }] },
    { "need": "slack", "servers": [{ "id": "docs-slack-dev-ai-slack-mcp-server-6c5eedff", "...": "..." }] },
    { "need": "web search", "servers": [{ "id": "github-firecrawl-firecrawl-mcp-server-96f88187", "...": "..." }] }
  ]
}
```

Both forms return only servers LagrangeCloud can run; pass `cloud=false` to include the rest.

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

The deployment workflow runs on every push to `main` that touches the catalog, docs, API package, schema, or Railway config. It rebuilds `data/catalog.json` and `data/profiles/*.json`, writes `data/build-info.json`, and verifies the live `/health` deployment fingerprint before finishing, so newly merged server entries are reflected by the live API after the Railway deployment succeeds.

The workflow requires a GitHub repository secret named `RAILWAY_TOKEN` with deploy access to the Railway project.
