# Contributing to @simplysf/simply-gemini-core

Skill and subagent discovery, the source registries, and the selection rules behind `simply gemini`. This package is part of the [`simply-gemini`](https://github.com/SimplySF/simply-gemini) monorepo.

**Start with the [root CONTRIBUTING.md](https://github.com/SimplySF/simply-gemini/blob/main/CONTRIBUTING.md).** This file covers only what is specific to this package.

## Working on this package

```sh
pnpm run build       # compile + lint
pnpm test            # the full gate CI runs
pnpm run test:only   # just the unit tests, skipping lint
```

## This is a library, not a CLI

There are no commands here. The public surface is whatever [`src/index.ts`](src/index.ts)
re-exports; anything else is internal. Adding to the surface means adding an export **and**
mentioning it in [`README.md`](README.md). `test/index.test.ts` asserts the exported-key list, so an
accidental removal fails loudly.

## The no-terminal rule

Nothing here may touch a terminal or a process: no oclif, no child processes, no `process.argv`,
nothing written to stdout or stderr. The lint config refuses `@oclif/*` and `node:child_process`
imports in this package. Every function that reads Gemini's state takes `{ home }`, defaulting to
`os.homedir()`, so a caller can point it anywhere.

## Testing

Test against real temporary directories (`fs.mkdtempSync`) rather than mocking `fs`. Discovery is
mostly about what is on disk — links, missing directories, odd front matter — and a mocked `fs`
only proves the code agrees with the mock.
