# 0002 — Installing Gemini CLI subagents from registered sources

**Status:** Implemented
**Package:** `simply-gemini-core`, `simply-gemini`
**Date:** 2026-10-20

## Problem

The Gemini CLI loads custom subagents from Markdown files in `~/.gemini/agents/`. Unlike skills,
it has no command to install one: a person copies the file in by hand. A team keeping its subagents
in a repository has the same problem [0001](0001-skills-install.md) solved for skills — nothing
shows which subagents a repository offers, which are installed, or installs several at once.

The Salesforce `sf gemini` plugin added `sf gemini agents …` for this (its MR !87). This ports it.

## Decision

A second subtopic, `simply gemini agents`, shaped exactly like `simply gemini skills` so knowledge
of one carries over: `list`, `install`, `uninstall`, `register`, `deregister`, with the same
selection rules, picker, `--json` output and exit codes. Discovery, selection, and installation
live in `simply-gemini-core`; the registry code becomes one implementation serving both registries.

## Behavior

| Command                    | What it does                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `gemini agents list`       | Every subagent the sources provide plus every `.md` under `~/.gemini/agents`. `--installed`, `--available`.     |
| `gemini agents install`    | Copies each subagent to `~/.gemini/agents/<name>.md`. `--agent` (repeatable) or the picker. `--force` replaces. |
| `gemini agents uninstall`  | Deletes `~/.gemini/agents/<name>.md`. `--agent` or the picker.                                                  |
| `gemini agents register`   | Adds `{ id, path, description?, registeredAt }` to `~/.gemini/agents-registry.json`.                            |
| `gemini agents deregister` | Removes a registration by id.                                                                                   |

**Discovery.** A subagent is a `.md` file other than `README.md`, either directly in a source or one
category folder down. Its name is the `name:` field of its front matter, falling back to the file
name without `.md`; its description is the `description:` field, read the same way as a skill's. A
subagent is installed when `~/.gemini/agents/<name>.md` exists. When two sources (or two files in
one source) provide a name, the one found first wins — sources in registration order, files in name
order.

**Names are checked.** The name becomes a file path under `~/.gemini/agents`, and it comes from a
file someone else wrote. A name must be a single file name of letters, digits, `.`, `_` and `-`,
starting with a letter or digit. A source file whose name fails that is not listed, and every
command warns about it. A `--agent` value that fails it is a usage error (exit 2).

**Registry.** `~/.gemini/agents-registry.json`, the same path and shape as the sf plugin, so
registrations are shared. Every rule from 0001 applies unchanged: same id or directory replaces,
the directory must exist, a malformed file is refused (exit 2) and never overwritten, deregistering
an unknown id fails.

**Selection.** As 0001: every `--agent` is resolved before anything changes, an unknown name fails
the request (exit 2), and a name already in the wanted state is reported and skipped. With
`--force`, `install` replaces an installed subagent instead of skipping it, and the picker offers
every subagent a source provides rather than only the uninstalled ones. `--force` cannot install a
subagent no source provides — there is no file to copy — and says so.

**Installing.** The file is copied, not linked. It is written to a temporary file beside the target
and renamed over it, so an interrupted install never leaves half a file, and a target that is a
symbolic link is replaced rather than written through. Each subagent is attempted even if one fails;
the command then fails (exit 1) listing the failures, the same as skills.

**Output.** `--json` prints `{ changed, skipped }` for install and uninstall, the subagent list, or
the registry entry. Names and descriptions from a source are stripped of control characters.

## What changed from the sf plugin

| sf plugin                                                                    | Here                                                                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Bundled `agents/sf-reviewer.md` scanned first                                | Dropped. It encodes one organisation's internal guide; sources come only from the registry, as for skills |
| `FileRegistry` reads a malformed or wrong-shape file as empty                | Refused, as 0001 already does for skills                                                                  |
| Front-matter `name:` used as a file name unchecked (`name: ../../x` escapes) | Checked; a bad name is skipped with a warning                                                             |
| `copyFile` onto the target                                                   | Temporary file and rename                                                                                 |
| `--agent` with an installed name skipped, with an unknown name failed        | Same, plus a not-installed name on `uninstall` is skipped and reported                                    |
| Agents installed some other way were invisible to `uninstall`                | Listed with no source, and uninstallable                                                                  |
| No way to list agents                                                        | `gemini agents list`, with `--json`                                                                       |
| `--json` with no `--agent` silently did nothing                              | Refused with exit 2, pointing at `--agent`, as skills                                                     |

## Alternatives considered

- **Symbolic links, so an installed subagent follows its source as a linked skill does.** Creating
  one on Windows needs Developer Mode or administrator rights, which cannot be assumed. The sf
  plugin rejected links for the same reason. `install --force` is the update path.
- **Run a `gemini` command.** There is none for subagents.
- **One registry file for skills and subagents.** It would break sharing with the sf plugin, which
  keeps them apart, and a directory of skills is not a directory of subagents.
- **A shared base command for both subtopics' install and uninstall.** The two differ in how a
  change is applied (a `gemini` process against a file copy), what `--force` means, and which
  errors stop a run. The shared parts are already shared: the picker, the registry, `formatTable`.

## Implementation plan

1. Core: generalize `registry.ts` over a registry kind; add the agent-registry functions.
2. Core: `front-matter.ts` (lifted from `skills.ts`), then `agents.ts` — discovery, name check,
   selection, install, uninstall.
3. CLI: generalize the picker and the missing-source warning; add `shared/agent-change.ts` and the
   five commands; add the `gemini:agents` topic.
4. Tests, snapshot, README, a guide in `packages/simply-gemini/docs/guides/`.

## Testing

Core tests use real temporary directories: the agent registry round trip and its refusal of a
malformed file; discovery of flat, categorized, named, unnamed, README, orphan, shadowed and
badly-named files; selection with and without `--force`; install replacing a file and a symbolic
link; uninstall. CLI tests replace only the picker.

## Open questions

- ~~Whether `list` should say when an installed copy differs from its source.~~ Yes:
  [0003](0003-outdated-agents.md).
