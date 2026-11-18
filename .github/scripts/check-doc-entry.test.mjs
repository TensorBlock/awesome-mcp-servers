import assert from "node:assert/strict";
import test from "node:test";

import {
  findEntry,
  formatResult,
  normalizeKey,
  parseEntry,
  validateEntry,
} from "./check-doc-entry.mjs";

const FULL = "- [battle.training](https://battle.training): A tactical combat arena. Hosted Streamable HTTP endpoint: `https://api.battle.training/mcp` (initialize is open). Auth: create_account tool. Docs: https://battle.training.";

test("normalizeKey trims, lowercases and collapses whitespace", () => {
  assert.equal(normalizeKey("  Battle.Training  "), "battle.training");
  assert.equal(normalizeKey(null), null);
});

test("parseEntry extracts name, url and body", () => {
  const e = parseEntry(FULL);
  assert.equal(e.name, "battle.training");
  assert.equal(e.url, "https://battle.training");
  assert.equal(e.nameKey, "battle.training");
  assert.match(e.body, /Streamable HTTP/);
});

test("parseEntry ignores headings and prose links", () => {
  assert.equal(parseEntry("# [Heading](https://x.example)"), null);
  assert.equal(parseEntry("prose [link](https://x.example)"), null);
});

test("findEntry matches by name across docs paths", () => {
  const docs = { "docs/gaming.md": FULL, "docs/other.md": "- [X](https://x.example): x.\n" };
  const found = findEntry(docs, "BATTLE.TRAINING");
  assert.equal(found.docsPath, "docs/gaming.md");
  assert.equal(found.url, "https://battle.training");
  assert.equal(findEntry(docs, "missing"), null);
});

test("validateEntry passes a complete entry", () => {
  const e = parseEntry(FULL);
  assert.deepEqual(validateEntry(e), { ok: true, problems: [] });
});

test("validateEntry names each missing field", () => {
  const e = parseEntry("- [battle.training](https://battle.training): arena.");
  const r = validateEntry(e);
  assert.equal(r.ok, false);
  assert.deepEqual(r.problems, [
    "missing hosted endpoint",
    "missing transport metadata",
    "missing auth metadata",
    "missing docs link",
  ]);
});

test("formatResult is bounded and informative", () => {
  const e = parseEntry(FULL);
  const ok = formatResult(e, validateEntry(e), "battle.training");
  assert.match(ok, /ok: endpoint, transport, auth and docs present/);
  const missing = formatResult(null, { ok: false, problems: [] }, "nope");
  assert.match(missing, /NOT FOUND/);
});
