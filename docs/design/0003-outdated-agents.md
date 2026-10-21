# 0003 — Showing which installed subagents are out of date

**Status:** Implemented
**Package:** `simply-gemini-core`, `simply-gemini`
**Date:** 2026-10-21

## Problem

An installed subagent is a copy of its source file ([0002](0002-agents-install.md)). After a
`git pull` in the source, the installed copy is stale, and nothing says so: `list` shows it as
installed, and `install` skips it as already installed. The only way to find out is to diff the two
files by hand. 0002 left this as an open question.

## Decision

Discovery compares each installed subagent with the file its source provides, and reports the
difference. Nothing is updated automatically; `install --force` remains the way to update.

## Behavior

**Outdated** means: installed, provided by a registered source, and the installed file's bytes differ
from the source file's. A subagent no source provides is never outdated — there is nothing to compare
it with. Neither is one whose files cannot be read; it is reported as up to date rather than failing
discovery.

- **Core:** `Agent` gains `outdated: boolean`, which `list --json` also prints.
- **`agents list`:** INSTALLED reads `outdated` instead of `yes`. A new `--outdated` flag lists only
  those; it cannot be combined with `--available`.
- **`agents install`:** naming an outdated subagent without `--force` still skips it, but says the
  source has changed and to pass `--force`. With no `--agent`, when nothing is left to install but
  some are outdated, it says how many and how to update them. The `--force` picker labels them
  `(outdated)` rather than `(installed)`.

## Alternatives considered

- **Compare modification times.** Cheaper, but a `git checkout` sets the source's time to now
  whether or not its content changed, and a copy can carry either time. Subagent files are small, so
  reading both is cheap and exact.
- **Update outdated subagents without `--force`.** It would overwrite an installed copy someone had
  edited on purpose. Showing the difference and leaving the decision with them keeps `install`
  predictable.
- **A separate `agents update` command.** It would be `install --force` restricted to outdated
  subagents. `list --outdated` plus `install --force --agent …` covers it without another command;
  it can be added later if people ask.

## Testing

Core: identical, changed, orphaned and not-installed subagents. CLI: `list --outdated`, the
INSTALLED column, and the install skip message.
