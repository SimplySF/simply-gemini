# AGENTS.md

## Documentation map

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and the pull-request checklist.
Read [docs/design/README.md](docs/design/README.md) before changing a user-visible command,
shared module, or how `gemini` is invoked; it defines when a design document is required.

- [Installing skills](docs/design/0001-skills-install.md): the registry, discovery rules,
  selection, how `gemini` is run, and every behavior that differs from the Salesforce
  `sf gemini skills` plugin this was ported from.
- [Installing subagents](docs/design/0002-agents-install.md): the same for `gemini agents`, why a
  subagent is copied rather than linked, the name check, and what differs from the sf plugin.

The package [README](packages/simply-gemini/README.md) is the generated user-facing command
reference. Update command metadata first, then regenerate it as described in `CONTRIBUTING.md`.

The published documentation is built by [simply-cli](https://github.com/SimplySF/simply-cli) from
the **published packages**, not from this repo. Guides live in `packages/simply-gemini/docs/` and
are listed in the package's `files`, so they travel with a release. Never hand-write a reference
page.

## Working conventions

- **Behavior goes in `@simplysf/simply-gemini-core`; `simply-gemini` is a thin surface over it.**
  Discovery, the registries, the selection rules, and copying subagents into place all live in
  core. Anything touching a terminal, a process, `process.argv`, stdout or stderr stays out of
  core — the lint config refuses oclif and `node:child_process` there. The one process this repo
  runs, `gemini`, is run from `packages/simply-gemini/src/shared/gemini-cli.ts` and nowhere else.

- **Core takes the home directory as a parameter** (`{ home }`, defaulting to `os.homedir()`).
  Tests use real temporary directories rather than mocking `fs`; CLI tests point `HOME` and
  `USERPROFILE` at one (see `test/helpers.ts`).

- **Sources are untrusted text.** Skill directory names, subagent names, and descriptions are
  written by whoever published the source. A subagent name also becomes a file name, so it goes
  through `assertAgentName` before any path is built from it. Print them through `logSafe` or
  `formatTable`, never `this.log`.

- **The registry files are shared with the sf plugin.** `~/.gemini/skills-registry.json` and
  `~/.gemini/agents-registry.json` keep the sf plugin's paths and shape. Do not change either
  without a design document.

- A new command, user-visible flag/output/error change, or new shared module needs a design document
  in `docs/design/` **before** implementation.

- Before calling a command or flag change finished: run `pnpm run build` so `command-snapshot.json`
  regenerates, and `pnpm run readme` in `packages/simply-gemini`, and commit both. CI catches a
  stale snapshot but not a stale README.

- Command copy (summaries, descriptions, examples) lives inline as static class properties. There
  is no `messages/*.md` convention here, even though the sf plugin this came from used one.
