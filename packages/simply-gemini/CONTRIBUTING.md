# Contributing to @simplysf/simply-gemini

The `simply gemini` command-line interface. This package is part of the [`simply-gemini`](https://github.com/SimplySF/simply-gemini) monorepo.

**Start with the [root CONTRIBUTING.md](https://github.com/SimplySF/simply-gemini/blob/main/CONTRIBUTING.md).** It covers repository structure, environment setup, commit conventions, versioning, CI, git hooks, and the pull request process — all of which apply here. This file covers only what is specific to this package.

## Working on this package

Run from this directory to target just this package:

```sh
pnpm run build       # command-snapshot + compile + lint
pnpm test            # the full gate CI runs
pnpm run test:only   # just the unit tests, skipping lint
pnpm run readme      # regenerate the command reference in README.md
./bin/dev.js gemini skills list   # run without compiling
```

`bin/dev.js` runs the TypeScript directly through ts-node; `bin/run.js` runs the compiled `lib/`.

## Where the logic goes

Not here, mostly. A command parses flags, calls into `@simplysf/simply-gemini-core`, renders the
result, and returns the value oclif prints under `--json`. Discovery, the registry, and the rules
for which named skills or subagents are acted on or skipped all belong in core — so does copying a
subagent into place, which is a file operation rather than a process.

Four things are deliberately here and nowhere else:

- [`src/shared/gemini-cli.ts`](src/shared/gemini-cli.ts) — the only code that runs a process.
- [`src/shared/prompt.ts`](src/shared/prompt.ts) — the interactive picker, and the check for
  whether there is a terminal to show it on.
- [`src/shared/skill-change.ts`](src/shared/skill-change.ts) — the flow `install` and `uninstall`
  share; each of them only supplies a direction and the gemini command to run.
- [`src/shared/agent-change.ts`](src/shared/agent-change.ts) — the same for `gemini agents`, plus
  the warnings every agent command prints about sources and names discovery left out.

## Adding a command

1. Write the design document first — see [docs/design/README.md](../../docs/design/README.md).
2. Put the behavior in `@simplysf/simply-gemini-core`, with its tests.
3. Add the command under `src/commands/gemini/`, extending `GeminiCommand`.
4. Run `pnpm run build` and commit the regenerated `command-snapshot.json`.
5. Run `pnpm run readme` and commit the regenerated `README.md`. On Windows, check that it holds a
   single `<!-- commandsstop -->` marker afterwards.

## Printing

Use `this.logSafe()`, not `this.log()`, for anything that came from a skill or subagent source:
names, descriptions, paths. `formatTable` from core sanitises its cells already.

## Testing

Tests replace only the two things that reach outside the process — `gemini` and the picker — with
`vi.mock`. Everything else runs for real against a temporary home directory; `test/helpers.ts`
creates one and points `HOME` and `USERPROFILE` at it.
