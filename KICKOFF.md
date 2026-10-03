# Paste this as your first message to Claude Code (in the repo root)

Read CLAUDE.md, then docs/SPEC.md, docs/TASKS.md and docs/PREREGISTRATION.md fully before writing code.

We are building Broke Date for the DEV Hacktoberfest Weekend Challenge. Deadline Mon Oct 5 06:59 UTC.
Start with milestone M0 in docs/TASKS.md. Work through the milestones strictly in order, ticking boxes
and committing after each one. Run `make check` before moving to the next milestone.

Key reminders:
- Verify the TabPFN, Ollama, pytest-socket and Entire APIs against the installed versions first and
  record findings in docs/NOTES.md. Adapt only the adapter layer.
- Never fabricate numbers. Never commit real data. Public demo uses scripts/simulate_statement.py data only.
- When you reach M2, stop and ask me for the statement file path. When you reach M3, show me the filled
  PREREGISTRATION.md and wait for my OK before committing it.
- If a milestone runs more than 50% over its timebox, propose what to cut from the cut list.

Begin with M0 now.
