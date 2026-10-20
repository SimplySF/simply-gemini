# 0001 — Installing Gemini CLI skills from registered sources

**Status:** Implemented
**Package:** `simply-gemini-core`, `simply-gemini`
**Date:** 2026-10-19

## Problem

The Gemini CLI installs one skill at a time, from a path you type: `gemini skills link <path>`.
A team that keeps its skills in a repository has no way to see which skills that repository
offers, which of them are installed, or to install several at once.

Salesforce's `sf gemini skills` plugin (`@salesforce/plugin-gemini-skills`) solved this for `sf`
users. This repo ports that tooling to the `simply` CLI so it installs beside `simply gitlab` and
`simply atlassian` without depending on `sf`.

## Decision

Two packages, following simply-gitlab and simply-atlassian:

- **`@simplysf/simply-gemini-core`** — the registry of skill sources, skill discovery, and the
  selection rules. No oclif, no child processes, no terminal; the home directory is injectable.
- **`@simplysf/simply-gemini`** — the `simply gemini skills …` commands, the interactive picker,
  and the one place that runs `gemini`.

There is no MCP package. Every command here changes the agent's own toolset or only lists it, and
an agent that can run `simply gemini skills install` can already run the CLI. A list tool can be
added later without moving anything, because the behavior is already in core.

## Behavior

| Command                    | What it does                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `gemini skills list`       | Every skill the sources provide plus every skill under `~/.gemini/skills`. `--installed`, `--available` filter. |
| `gemini skills install`    | `gemini skills link <path>` per skill. `--skill` (repeatable) or an interactive picker.                         |
| `gemini skills uninstall`  | `gemini skills uninstall <name>` per skill. `--skill` or the picker.                                            |
| `gemini skills register`   | Adds `{ id, path, description?, registeredAt }` to `~/.gemini/skills-registry.json`.                            |
| `gemini skills deregister` | Removes a registration by id.                                                                                   |

**Discovery.** A directory holding `SKILL.md` is a skill; a directory without one is a category,
searched one level further. The description is the `description:` field of the `SKILL.md` front
matter. A skill is installed when `~/.gemini/skills/<name>` exists. When two sources provide a
name, the source registered first wins, because Gemini installs by name.

**Registry.** Same path and shape as the sf plugin, so registrations are shared between the two
tools. Registering an id or directory again replaces the earlier entry. The directory must exist.

**Selection.** Every `--skill` name is resolved before anything runs. An unknown name fails the
whole request (exit 2). A name already in the wanted state is reported and skipped, not counted as
changed. Without `--skill`, the picker needs a terminal on both stdin and stdout and is never used
under `--json`; otherwise the command fails with exit 2 and says to pass `--skill`.

**Running gemini.** One invocation at a time, answering its confirmation with `y` on stdin, with a
two-minute timeout. A failure for one skill does not stop the rest; the command then fails (exit

1. listing each failure. A missing `gemini` stops at once (exit 2) with an install hint. `gemini`
   is looked up on PATH (with PATHEXT on Windows) before spawning, because on Windows a missing `.cmd`
   otherwise surfaces as cmd.exe exiting 1, indistinguishable from gemini failing.

**Output.** `--json` prints the result (`{ changed, skipped }` for install and uninstall; the skill
list; the registry entry). Failures under `--json` are one JSON object on stderr. Text from a skill
source — names, descriptions — is stripped of control characters before it is printed.

## What changed from the sf plugin

| sf plugin                                                                 | Here                                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `SfCommand`, `@salesforce/core` messages bundles                          | Plain oclif commands with inline copy, like every other simply product                 |
| Bundled `skills/` directory scanned first                                 | Dropped; this package ships no skills. Sources come only from the registry             |
| Malformed registry read as empty, then overwritten by the next `register` | Refused with exit 2, leaving the file for a person to fix                              |
| `--skill` with an unknown name silently ignored, yet counted as installed | Rejected before anything runs                                                          |
| `--skill` with an already-installed name counted as installed             | Reported as skipped                                                                    |
| First failure aborted the run via `process.exit(1)`                       | Every skill is attempted; failures are reported together through oclif's exit handling |
| Picker shown with no terminal (hangs or garbles a pipe)                   | Refused with a pointer to `--skill`                                                    |
| `description:` matched anywhere in `SKILL.md`                             | Front matter only                                                                      |
| `deregister` of an unknown id succeeded silently                          | Fails, listing the registered ids                                                      |
| No way to list skills                                                     | `gemini skills list`, with `--json`                                                    |
| Installed skills from outside any source were invisible to `uninstall`    | Listed, and uninstallable                                                              |
| `chalk` logger                                                            | oclif's own output                                                                     |

## Alternatives considered

- **Copy skills instead of linking them.** `gemini skills link` keeps the installed skill reading
  from its source, so pulling the source updates it. The sf plugin made the same choice.
- **Write `~/.gemini/skills` directly instead of running `gemini`.** Faster and testable without
  gemini, but it would bypass whatever validation and bookkeeping gemini does on link, and break
  silently when that changes.
- **A registry of our own under the simply data directory.** Sharing the sf plugin's file means
  someone moving between the two tools keeps their sources.
- **Parallel installs.** Every invocation writes the same directory, and gemini makes no promise
  about concurrent runs.

## Testing

Core tests run against real temporary directories rather than a mocked `fs`: registry round trips,
malformed and wrong-shape files, replace-on-reregister, discovery of flat, categorized, linked,
shadowed, missing, and orphan skills, front-matter parsing, and selection. CLI tests replace only
`gemini` and the picker. `runGemini` itself is tested by running Node in gemini's place, which
covers argument passing, the stdin answer, exit codes, and the not-found path.

## Open questions

- Whether gemini exposes a non-interactive consent flag for `skills link`/`skills uninstall`, which
  would replace the `y` on stdin.
- Whether a skill's `name:` front matter can differ from its directory name in a way gemini honours;
  discovery assumes it cannot, as the sf plugin did.
