# Broken Entry Reports

This directory stores generated investigation specs from the broken entry issue form.

Each report captures the affected TensorBlock profile, server id, or project URL, the reported problem types, submitted details, source proof, and a maintainer checklist. Reports keep cleanup work reviewable before maintainers edit category markdown, metadata sidecars, or remove stale entries.

Generated report files are starting points, not final catalog data. After a report is verified, the actual fix should land in the relevant `docs/*.md` category page or `data/server-metadata/*.json` sidecar.

Reports may come from community-submitted broken-entry issues or from the scheduled catalog health check, which flags duplicate primary links and stale or unreachable GitHub repositories.
