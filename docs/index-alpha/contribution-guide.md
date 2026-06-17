# MCP Index Metadata Contribution Guide

TensorBlock MCP Index turns this awesome list into structured data that agents and users can search, compare, and install from.

The indexer reads the markdown catalog and generates:

- structured catalog entries,
- server profile JSON,
- install config previews,
- and a local MCP registry that agents can query directly.

When adding a server, include as much of this metadata as possible in the issue form, PR body, or entry description:

- Install command: `npx`, `uvx`, `pip`, Docker, or remote endpoint.
- Transport: `stdio`, `streamable-http`, or `sse`.
- Auth: none, API key, OAuth, bearer token, or other.
- Supported clients: Claude Desktop, Cursor, Codex, VS Code, or other MCP clients.
- Tool count and important tool names.
- License.
- Docs URL.
- Remote MCP endpoint, if public.

For short markdown entries, structured metadata can live in `data/server-metadata/{serverId}.json`. Server submissions created through the Add MCP server issue form can generate this sidecar automatically, so the category page stays readable while the profile/API still get install, transport, auth, client, and license fields.

For existing indexed servers, use the metadata improvement issue form with the TensorBlock profile id and structured values such as:

```text
Install: npx -y example-mcp
Transport: stdio
Auth: api-key, requires EXAMPLE_API_KEY
Docs URL: https://docs.example.com/mcp
License: MIT
Tools: search, fetch_profile
Tool count: 2
```

When the profile id matches the index and the values are clear, automation drafts a metadata sidecar PR for maintainer review.

Complete metadata helps TensorBlock generate:

- server profiles,
- install configs,
- registry entries,
- install confidence notes,
- and future verification reports.

This makes each listed server more useful than a directory link: agents can discover it by intent, inspect profile metadata, and draft a client config without manually reading every README.
