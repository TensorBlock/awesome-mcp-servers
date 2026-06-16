#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const issueTemplateDir = path.join(".github", "ISSUE_TEMPLATE");
const reservedDropdownOptions = new Set(["none"]);

function main() {
  const files = fs
    .readdirSync(issueTemplateDir)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => path.join(issueTemplateDir, file));

  const errors = files.flatMap(validateFile);

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }

  console.log(`Validated ${files.length} issue template files.`);
}

function validateFile(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const errors = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const optionMatch = line.match(/^(\s*)-\s+(.+?)\s*$/);
    if (!optionMatch) {
      continue;
    }

    const value = stripQuotes(optionMatch[2]);
    if (reservedDropdownOptions.has(value.toLowerCase())) {
      errors.push(
        `${file}:${index + 1}: dropdown options cannot use GitHub's reserved "${value}" option; use a clearer value like "no auth".`,
      );
    }
  }

  return errors;
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

main();

