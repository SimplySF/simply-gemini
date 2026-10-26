# 0004 — Installing a source's default skills and subagents when it is registered

**Status:** Implemented
**Package:** `simply-gemini-core`, `simply-gemini`
**Date:** 2026-10-26

## Problem

A team that publishes a skill or subagent source usually has a handful everyone on the team should
have, and a longer tail that only some people want. Today onboarding is two steps and a list of
names passed around by hand: `register`, then `install --skill a --skill b …`. Whoever forgets the
second step, or copies an old list, ends up with a different toolset from everyone else, and the
source has no way to say which of its entries are the baseline.

## Decision

A source may carry a manifest, `gemini-source.json`, at its root. Its `defaults` array names the
skills (in a skill source) or subagents (in a subagent source) that the source's author wants
installed for everyone. `gemini skills register` and `gemini agents register` install those
defaults straight after registering the source, unless `--no-install-defaults` is given. Reading
the manifest and resolving its names live in `simply-gemini-core`; installing reuses the code path
`install` already uses.

The list belongs to the source, not the person registering it, so it is updated by a `git pull`
like everything else in the source, and the shared registry files keep the sf plugin's shape.

## Behavior

**The manifest.** `<source>/gemini-source.json`:

```json
{ "defaults": ["apex-test-generator", "lwc-reviewer"] }
```

| Manifest state                                  | Result                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| No file                                         | No defaults. Not mentioned — most sources will not have one       |
| Valid, `defaults` an array of strings           | Those names are the defaults                                      |
| Valid, no `defaults` key                        | No defaults                                                       |
| Not JSON, or `defaults` not an array of strings | Warning naming the file; no defaults; registration still succeeds |
| Other top-level keys                            | Ignored, so the file can grow later without breaking older CLIs   |

The file is the same name in a skill source and a subagent source; a source is only ever registered
as one kind, so there is no ambiguity. Discovery already ignores it: it is a file, not a skill
directory, and it is not a `.md`.

**Resolving names.** Each default name is matched against what discovery found **from this source**:

| Name                                                              | Result                                                  |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| Provided by this source, not installed                            | Installed                                               |
| Provided by this source, already installed                        | Skipped and reported, as `install` would. Never forced  |
| Provided by this source, installed but outdated (subagents)       | Skipped, with the `install --agent <name> --force` hint |
| Not provided by this source (including a name no file could have) | Warning; not installed                                  |
| A subagent file discovery rejected for its name                   | Not installed; discovery's own warning is the only one  |
| Provided, but shadowed by an earlier-registered source            | Warning naming the source that wins; not installed      |

A bad name never fails the registration. The source is someone else's file, and the registration
itself is valid; refusing it would leave the person unable to use the rest of the source.

**`register`.** New flag on both subtopics:

| Flag                                           | Meaning                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `--install-defaults` / `--no-install-defaults` | Install the source's defaults after registering. Default on |

The order is: write the registration, discover, install the defaults one at a time through the same
code `install` uses. The registration is written first, so a failed install never loses it.

- A skill install needs `gemini` on PATH. `register` never needed `gemini` before this flag, so a
  missing one is not an error: `gemini` is looked for only when a default needs installing, and if
  it is absent the registration stands, the defaults stay uninstalled (`changed` is empty), and a
  warning names them with the install hint and the `skills install --skill …` command that finishes
  the job. If `gemini` disappears between that check and the install, the command fails (exit 2)
  as `install` does.
- A failure's message ends with the full `register` command to retry with (`--id`, `--path`, and
  `--description` when there is one), since re-registering without the description would drop it.
- The manifest is read alongside discovery, not after it.
- One default failing does not stop the rest; the command then fails (exit 1) listing failures, as
  `install` does.
- Under `--json`, nothing is prompted (nothing ever is on this path) and the output gains:

```json
{
  "entry": { "...": "..." },
  "replaced": [],
  "skills": 12,
  "defaults": { "changed": ["lwc-reviewer"], "skipped": ["apex-test-generator"], "unavailable": ["typo-name"] }
}
```

`agents register` uses the same `defaults` shape. With `--no-install-defaults`, or a source with no
defaults, `defaults` is `{ "changed": [], "skipped": [], "unavailable": [] }`.

- The closing hint changes when defaults were installed: `Installed 2 default skill(s). 10 more
available: simply gemini skills install`.

**Re-registering.** Registering the same source again installs any default that is not installed,
including one the person uninstalled on purpose. `--no-install-defaults` is the way to re-register
without that. This is the cost of keeping `register` stateless; see the open questions.

## Alternatives considered

- **`default: true` in each `SKILL.md` / subagent front matter.** No extra file, but the baseline is
  scattered across many files and cannot be reviewed in one place; and a subagent's front matter is
  read by Gemini itself, which may not tolerate a key it does not know.
- **The person registering chooses (`register --default a --default b`), stored on the registry
  entry.** It changes the registry shape shared with the sf plugin, and the list no longer follows the
  source when its author changes it.
- **A simply-owned config file of defaults, independent of sources.** It solves "my own defaults"
  rather than "my team's defaults", which is the problem here.
- **`install --defaults` instead of installing on register.** Explicit, but it keeps onboarding two
  steps, which is the problem. It can be added later on top of the same core function.
- **Pre-selecting defaults in the `install` picker.** Only helps in a terminal; nothing for CI or
  `--json`.
- **Off by default (`--install-defaults` to opt in).** Safer, but then a team's onboarding
  instructions have to remember the flag, and that is the step that gets forgotten.

## Implementation plan

1. Core: `source-manifest.ts` — `MANIFEST_FILE`, `readSourceManifest(dir)` returning
   `{ defaults: string[]; problem?: string }`, and `resolveDefaults(items, sourceId, defaults)`
   returning `{ targets, skipped, unavailable }` for either skills or subagents; a shadowed name is
   unavailable with `providedBy` set. Export from `index.ts`.
2. CLI: lift the sequential apply loops out of `SkillChangeCommand` and `AgentChangeCommand` into
   `shared/apply-each.ts`, which each command and `register` call; `applySkills` keeps the
   stop-on-missing-gemini rule for skills. The register side is `shared/source-defaults.ts`.
3. CLI: `--install-defaults` on both `register` commands; warnings, `defaults` in the output.
4. Docs: the two source guides in `packages/simply-gemini/docs/guides/` gain a "Defaults" section;
   snapshot and README regenerated.

## Testing

Core, against real temporary directories: no manifest, empty and missing `defaults`, malformed JSON,
wrong-shape `defaults`, unknown keys ignored; resolution of provided, installed, outdated, unknown,
shadowed and badly-named defaults, for both kinds.

CLI: `register` installs defaults (skills with `gemini` replaced, as the install tests do; agents
for real into the temporary home); `--no-install-defaults` installs nothing; a malformed manifest
warns and still registers; a manifest starting with a BOM is read; `gemini` not on PATH warns,
names the defaults and still registers, and is not looked for when nothing needs installing;
`gemini` vanishing mid-install exits 2 with the full `register` retry command; a failed default
exits 1 after attempting the others; an outdated subagent default gets the `--force` hint; a
rejected subagent name is warned about once; the `--json` `defaults` shape.

## Open questions

- Whether re-registering should skip defaults the person has uninstalled. That needs remembering
  what was installed as a default, which is state the tool does not keep today.
- Whether `list` should mark defaults (a `DEFAULT` column, `"default": true` in `--json`).
- Whether to add `install --defaults` for sources registered before this lands; until then,
  re-running `register` does the same.
