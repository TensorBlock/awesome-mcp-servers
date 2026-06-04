# MCP Index Metadata Contribution Guide

TensorBlock MCP Index turns this awesome list into structured data that agents and users can search.

When adding a server, include as much of this metadata as possible in the PR body or entry description:

- Install command: `npx`, `uvx`, `pip`, Docker, or remote endpoint.
- Transport: `stdio`, `streamable-http`, or `sse`.
- Auth: none, API key, OAuth, bearer token, or other.
- Supported clients: Claude Desktop, Cursor, Codex, VS Code, or other MCP clients.
- Tool count and important tool names.
- License.
- Docs URL.
- Remote MCP endpoint, if public.

Complete metadata helps TensorBlock generate:

- server profiles,
- install configs,
- registry entries,
- install confidence notes,
- and future verification reports.
