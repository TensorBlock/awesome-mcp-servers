# Codex CLI / desktop / IDE direct MCP configuration in `config.toml`. The existing Codex install tab needs a destination-specific format, or an explicit label that its JSON is only an intermediate representation. client config support

Status: requested
Source issue: https://github.com/TensorBlock/awesome-mcp-servers/issues/3428

## Client Or Install Target

Codex CLI / desktop / IDE direct MCP configuration in `config.toml`. The existing Codex install tab needs a destination-specific format, or an explicit label that its JSON is only an intermediate representation.

## Official Docs Or Reference

https://learn.chatgpt.com/docs/extend/mcp?surface=cli

## Expected Config Shape

```json
[mcp_servers.example]
url = "https://example.invalid/mcp"
```

## Notes

The expected example above is **TOML**, for direct Codex configuration. The destination is the MCP section of an existing user or trusted-project `config.toml`, not a replacement for the whole file. Codex plugin `.mcp.json` is a separate JSON format; if the current output targets a plugin instead, the install panel should say so and document the required packaging.

I maintain Remnant. I found this while checking the install path of our accepted directory entry; this report concerns configuration generation only. Prepared with Codex assistance.

Reproduced on 10 October 2026:

1. Open [the existing Remnant Read profile](https://www.tensorblock.co/mcp/servers/github-dedale-project-remnant-connect-5e389687).
2. Select **Codex / Agent config** and let generation finish.
3. The **Codex config / Copy config** panel shows JSON with `mcpServers` and the correct anonymous endpoint, without a target filename or a plugin-packaging explanation.
4. [The public install-config API for client=codex](https://mcp-index.tensorblock.co/v1/servers/github-dedale-project-remnant-connect-5e389687/install-config?client=codex) returns the same object.

The endpoint itself is correct. That JSON is not directly pasteable into the documented TOML configuration file. It may be useful as an API intermediate value; the missing distinction is on the install/copy surface.

At [source revision 5d57e4b](https://github.com/TensorBlock/awesome-mcp-servers/blob/5d57e4b751efba62bb18023deea12741ac92f424/packages/config-generator/src/generateConfig.ts), the generator uses the same `config.mcpServers` wrapper for every client. The `client` field identifies the requested target but does not select serialization.

I also ran the unchanged generator from that revision under Node 24.13.0 with a synthetic anonymous remote endpoint (`https://example.invalid/mcp`). Codex and Cursor outputs differed only in their top-level `client` field; seven local assertions passed. No dependency installation, network request or client import was involved in that reproduction.

Suggested acceptance criteria:

- Show the destination and copyable TOML for direct Codex configuration, or clearly identify a complete plugin setup route.
- Preserve the URL exactly, without inventing authentication headers, credentials or a local command.
- Preserve existing JSON consumers; an additional format/text field could avoid changing the current object contract.
- Add a remote-endpoint regression that distinguishes the Codex copy output from the Cursor JSON output.

I inspected the rendered profile, public API and source. I did not edit a user's Codex configuration, install a client, invoke Remnant tools or establish an external tester outcome. This request does not ask to increase install-confidence or verification scores.

## Implementation checklist

- Confirm the target's official MCP config file location or API endpoint.
- Map stdio server configs from generated command, args, and env values.
- Map remote server configs from generated URL values.
- Add config-generator tests for this client or install target.
- Expose the target through the HTTP API install-config endpoint after support lands.
