# MCP Index Community Cleanup Queue

The cleanup queue is the fastest way to make the TensorBlock MCP Index more useful without adding a brand-new server.

Use it when you want a focused contribution: verify a stale entry, improve metadata, fix a category, close a duplicate, or help turn an automated health finding into a clean PR.

## Open Task Lanes

| Lane | Best for | Queue |
| --- | --- | --- |
| Good first metadata | Small install, docs, auth, transport, license, or tool metadata fixes | [Open good-first-metadata issues](https://github.com/TensorBlock/awesome-mcp-servers/issues?q=is%3Aissue%20is%3Aopen%20label%3Agood-first-metadata) |
| Broken entries | Dead links, duplicate entries, stale projects, bad categories, or unsafe entries | [Open broken-entry issues](https://github.com/TensorBlock/awesome-mcp-servers/issues?q=is%3Aissue%20is%3Aopen%20label%3Abroken-entry) |
| Catalog health | Automated reports from the scheduled catalog health checker | [Open catalog-health issues](https://github.com/TensorBlock/awesome-mcp-servers/issues?q=is%3Aissue%20is%3Aopen%20label%3Acatalog-health) |
| Needs triage | New community reports that need routing or verification | [Open needs-triage issues](https://github.com/TensorBlock/awesome-mcp-servers/issues?q=is%3Aissue%20is%3Aopen%20label%3Aneeds-triage) |
| Server submissions | New MCP server requests that need duplicate checks and category review | [Open server-submission issues](https://github.com/TensorBlock/awesome-mcp-servers/issues?q=is%3Aissue%20is%3Aopen%20label%3Aserver-submission) |
| Needs metadata | Server submissions missing required fields or category routing | [Open needs-metadata submissions](https://github.com/TensorBlock/awesome-mcp-servers/issues?q=is%3Aissue%20is%3Aopen%20label%3Aserver-submission%20label%3Aneeds-metadata) |
| Ready server PRs | Server submissions with automation-generated PRs ready for maintainer review | [Open ready-for-pr submissions](https://github.com/TensorBlock/awesome-mcp-servers/issues?q=is%3Aissue%20is%3Aopen%20label%3Aserver-submission%20label%3Aready-for-pr) |
| Duplicate submissions | Server submissions matching an existing project URL | [Open duplicate submissions](https://github.com/TensorBlock/awesome-mcp-servers/issues?q=is%3Aissue%20is%3Aopen%20label%3Aserver-submission%20label%3Aduplicate) |
| Client config requests | New MCP client or install target formats | [Open client-config issues](https://github.com/TensorBlock/awesome-mcp-servers/issues?q=is%3Aissue%20is%3Aopen%20label%3Aclient-config) |
| Profile claims | Maintainer verification for indexed profiles | [Open claim-profile issues](https://github.com/TensorBlock/awesome-mcp-servers/issues?q=is%3Aissue%20is%3Aopen%20label%3Aclaim-profile) |

## How To Pick A Task

Start with a task that has a clear source link. Good cleanup issues usually include a TensorBlock profile URL, server id, project URL, or generated catalog-health marker.

Before editing, check:

- whether the project URL already appears elsewhere in `docs/*.md`,
- whether the public project README or docs confirm the proposed change,
- whether the fix belongs in a category markdown file or `data/server-metadata/*.json`,
- whether the issue already has an automation-generated draft PR.

For server submissions, use the intake labels to pick the next action:

- `needs-metadata`: ask for the missing URL, category, or description before editing docs.
- `duplicate`: close or link to the existing entry unless the submitter shows it is a distinct MCP server.
- `ready-for-pr`: review the generated draft PR instead of hand-editing the issue.
- `automation-blocked`: open the PR from the generated branch or fix workflow permissions, then rerun by editing the issue.

Maintainers can backfill these labels with the **MCP Add Server Intake Refresh** workflow. Use `dry_run=true` to inspect the planned changes across open `server-submission` issues, then rerun with `dry_run=false` to apply the labels. Set `issue_number` when you only want to refresh one issue.

Comment on the issue before doing larger cleanup work so two contributors do not handle the same task.

## What To Change

Most cleanup PRs fall into one of these shapes:

- Edit a category page under `docs/*.md` to remove a duplicate, fix a broken link, or move an entry to a better category.
- Add or update a `data/server-metadata/{serverId}.json` sidecar for install, auth, transport, docs, license, client, tool, maintainer, or verification metadata.
- Update a generated investigation spec under `docs/broken-entry-reports/` with the maintainer decision.
- Add client config support after a request spec under `docs/client-config-requests/` is reviewed.

If you are fixing metadata, prefer structured labels in the issue or PR body:

```text
Install: npx -y example-mcp
Transport: stdio
Auth: api-key, requires EXAMPLE_API_KEY
Docs URL: https://docs.example.com/mcp
License: MIT
Tools: search, fetch_profile
Tool count: 2
```

## Validation

For docs-only cleanup, run the smallest useful check:

```bash
npm run catalog:build
```

For metadata, generator, API, or workflow changes, run:

```bash
npm run catalog:build
npm run profiles:build
npm test
npm run typecheck
npm run build
```

Generated files such as `data/catalog.json`, `data/catalog-errors.json`, and `data/profiles/*.json` are build outputs. Do not include them in a cleanup PR unless a maintainer explicitly asks for generated data.

## Community Flow

The queue is meant to turn drive-by reports into visible contribution opportunities:

- issue forms add route labels and next-step comments,
- clear reports can create draft PRs,
- catalog-health issues surface stale or broken entries proactively,
- merged server PRs post profile, API, install-config, and badge links,
- cleanup contributors can point maintainers to verified sources instead of leaving loose notes.

Join the [TensorBlock Discord](https://discord.com/invite/Ej5NmeHFf2) when a cleanup decision needs maintainer context or broader community discussion.
