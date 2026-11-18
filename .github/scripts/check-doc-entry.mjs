#!/usr/bin/env node

// Validate one link-style docs entry for the fields the catalog builder needs.
// Defaults to the battle.training entry so registrars can check it before a
// catalog rebuild. Read-only: no network, no writes.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DEFAULT_NAME = "battle.training";

export function normalizeKey(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase().replace(/\s+/g, " ");
  return key || null;
}

export function parseEntry(line) {
  const m = /^-\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\):\s*(.*)$/.exec(line || "");
  if (!m) return null;
  return { name: m[1].trim(), url: m[2].trim(), body: m[3], nameKey: normalizeKey(m[1]) };
}

export function findEntry(docsByPath, name) {
  const want = normalizeKey(name);
  for (const [docsPath, markdown] of Object.entries(docsByPath)) {
    for (const line of markdown.split(/\r?\n/)) {
      const entry = parseEntry(line);
      if (entry && entry.nameKey === want) return { docsPath, ...entry };
    }
  }
  return null;
}

export function validateEntry(entry) {
  if (!entry) return { ok: false, problems: ["entry not found in docs"] };
  const problems = [];
  const body = entry.body || "";
  if (!/^https?:\/\//.test(entry.url)) problems.push("missing project URL");
  if (!/endpoint:\s*`?https?:\/\//i.test(body)) problems.push("missing hosted endpoint");
  if (!/transport/i.test(body)) {
    // Older entries spell the transport as "Streamable HTTP" without the word transport.
    if (!/streamable\s+http/i.test(body)) problems.push("missing transport metadata");
  }
  if (!/auth/i.test(body) && !/account key|create_account|api key|oauth/i.test(body)) {
    problems.push("missing auth metadata");
  }
  if (!/docs:\s*https?:\/\//i.test(body)) problems.push("missing docs link");
  return { ok: problems.length === 0, problems };
}

export function formatResult(entry, result, name) {
  if (!entry) return `Entry "${name}": NOT FOUND\n`;
  const head = `Entry "${entry.name}" (${entry.docsPath})\n`;
  if (result.ok) return head + "  ok: endpoint, transport, auth and docs present\n";
  return head + result.problems.map((p) => `  missing: ${p}`).join("\n") + "\n";
}

export function loadDocs() {
  const docsDir = path.join(ROOT, "docs");
  const docsByPath = {};
  for (const file of fs.readdirSync(docsDir)) {
    if (file.endsWith(".md")) {
      docsByPath[`docs/${file}`] = fs.readFileSync(path.join(docsDir, file), "utf8");
    }
  }
  return docsByPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = process.argv[2] || DEFAULT_NAME;
  const docsByPath = loadDocs();
  const entry = findEntry(docsByPath, name);
  const result = validateEntry(entry);
  process.stdout.write(formatResult(entry, result, name));
  process.exitCode = result.ok ? 0 : 1;
}
