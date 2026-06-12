import type { CatalogEntry } from "../../catalog-builder/src/types.js";
import { webProfileUrl } from "./webProfile.js";

const CLIENTS = ["claude-desktop", "cursor", "codex", "vscode"] as const;

export const renderServerProfilePage = (entry: CatalogEntry): string => {
  const title = `${entry.name} - TensorBlock MCP Index`;
  const installCommands = entry.install.commands.length > 0
    ? entry.install.commands.map((command) => `<code>${escapeHtml(command)}</code>`).join("")
    : "<p>No install command has been indexed yet.</p>";
  const envVars = entry.install.env.length > 0
    ? entry.install.env.map((name) => `<code>${escapeHtml(name)}</code>`).join(" ")
    : "<span>None indexed</span>";
  const tools = entry.tools.count === null
    ? "Unknown"
    : `${entry.tools.count}`;
  const sourceLink = entry.source.docsPath
    ? `<a href="${githubSourceUrl(entry.source.docsPath)}">${escapeHtml(entry.source.docsPath)}</a>`
    : "Not indexed";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttribute(entry.description)}">
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #5d6978;
      --line: #dde3ea;
      --accent: #2457d6;
      --accent-soft: #eef3ff;
      --code: #111827;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.55;
    }
    main {
      width: min(960px, calc(100% - 32px));
      margin: 0 auto;
      padding: 40px 0 56px;
    }
    header {
      margin-bottom: 24px;
    }
    .eyebrow {
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0;
      margin: 0 0 10px;
      text-transform: uppercase;
    }
    h1 {
      font-size: clamp(30px, 5vw, 48px);
      line-height: 1.05;
      letter-spacing: 0;
      margin: 0 0 14px;
    }
    p {
      margin: 0 0 14px;
    }
    a {
      color: var(--accent);
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .summary {
      color: var(--muted);
      font-size: 18px;
      max-width: 760px;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }
    .badge {
      background: var(--accent-soft);
      border: 1px solid #dbe6ff;
      border-radius: 999px;
      color: #173f9f;
      display: inline-flex;
      font-size: 13px;
      font-weight: 650;
      padding: 5px 10px;
      white-space: nowrap;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      margin-top: 16px;
      padding: 20px;
    }
    h2 {
      font-size: 18px;
      margin: 0 0 14px;
      letter-spacing: 0;
    }
    dl {
      display: grid;
      gap: 14px;
      grid-template-columns: minmax(140px, 220px) 1fr;
      margin: 0;
    }
    dt {
      color: var(--muted);
      font-weight: 650;
    }
    dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    code {
      background: #f3f5f8;
      border: 1px solid #e1e6ee;
      border-radius: 6px;
      color: var(--code);
      display: inline-block;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 13px;
      margin: 0 6px 6px 0;
      padding: 3px 6px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .links {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 6px;
    }
    .button {
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 7px;
      display: inline-flex;
      font-weight: 650;
      min-height: 38px;
      padding: 7px 11px;
    }
    .footer {
      color: var(--muted);
      font-size: 14px;
      margin-top: 24px;
    }
    @media (max-width: 640px) {
      main {
        width: min(100% - 24px, 960px);
        padding-top: 28px;
      }
      dl {
        grid-template-columns: 1fr;
        gap: 4px;
      }
      dd {
        margin-bottom: 12px;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="eyebrow">TensorBlock MCP Index</p>
      <h1>${escapeHtml(entry.name)}</h1>
      <p class="summary">${escapeHtml(entry.description)}</p>
      <div class="badges">
        <span class="badge">${escapeHtml(entry.category)}</span>
        <span class="badge">Install confidence: ${escapeHtml(entry.install.confidence)}</span>
        <span class="badge">Auth: ${escapeHtml(entry.auth.type)}</span>
        <span class="badge">Transport: ${escapeHtml(entry.transport.join(", "))}</span>
      </div>
    </header>

    <section>
      <h2>Links</h2>
      <div class="links">
        <a class="button" href="${escapeAttribute(safeHref(entry.links.primary))}">Primary link</a>
        ${optionalLink("Repository", entry.links.repo)}
        ${optionalLink("Docs", entry.links.docs)}
        ${optionalLink("Homepage", entry.links.homepage)}
        ${optionalLink("Remote endpoint", entry.links.endpoint)}
        <a class="button" href="${escapeAttribute(webProfileUrl(entry.id))}">Website profile</a>
        <a class="button" href="/v1/servers/${encodeURIComponent(entry.id)}">JSON profile</a>
      </div>
    </section>

    <section>
      <h2>Install Metadata</h2>
      <dl>
        <dt>Commands</dt>
        <dd>${installCommands}</dd>
        <dt>Environment</dt>
        <dd>${envVars}</dd>
        <dt>Generated configs</dt>
        <dd>${CLIENTS.map((client) => `<a href="/v1/servers/${encodeURIComponent(entry.id)}/install-config?client=${client}">${client}</a>`).join(" · ")}</dd>
      </dl>
    </section>

    <section>
      <h2>Indexed Metadata</h2>
      <dl>
        <dt>Server ID</dt>
        <dd><code>${escapeHtml(entry.id)}</code></dd>
        <dt>Category</dt>
        <dd>${escapeHtml(entry.category)}</dd>
        <dt>Transport</dt>
        <dd>${escapeHtml(entry.transport.join(", "))}</dd>
        <dt>Auth</dt>
        <dd>${escapeHtml(entry.auth.type)}</dd>
        <dt>Tools</dt>
        <dd>${escapeHtml(tools)}</dd>
        <dt>License</dt>
        <dd>${escapeHtml(entry.license)}</dd>
        <dt>Verification</dt>
        <dd>${escapeHtml(entry.verification.status)}</dd>
        <dt>Claimed</dt>
        <dd>${entry.community.claimed ? "Yes" : "No"}</dd>
        <dt>Source</dt>
        <dd>${sourceLink}</dd>
      </dl>
    </section>

    <p class="footer">This profile is generated from the community-maintained <a href="https://github.com/TensorBlock/awesome-mcp-servers">TensorBlock MCP Index</a>.</p>
  </main>
</body>
</html>`;
};

const optionalLink = (label: string, href: string | null | undefined): string =>
  href
    ? `<a class="button" href="${escapeAttribute(safeHref(href))}">${escapeHtml(label)}</a>`
    : "";

const githubSourceUrl = (path: string): string =>
  `https://github.com/TensorBlock/awesome-mcp-servers/blob/main/${encodeURIComponent(path).replace(/%2F/g, "/")}`;

const escapeAttribute = (value: string): string =>
  escapeHtml(value).replace(/"/g, "&quot;");

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const safeHref = (href: string): string => {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return href;
  }

  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:"
      ? href
      : "#";
  } catch {
    return "#";
  }
};
