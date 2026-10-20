# @simplysf/simply-gemini-core

Skill discovery, the skill-source registry, and the selection rules that
[`@simplysf/simply-gemini`](../simply-gemini) (the `simply gemini` CLI) is built on.

Nothing in this package touches a terminal or runs a process: it reads and writes files under a
home directory you can pass in, and leaves running `gemini` to its caller.

You want this package directly if you are building other tooling around Gemini CLI skills in
TypeScript. If you want a CLI, install `@simplysf/simply-cli` and run `simply gemini skills`.

```sh
npm install @simplysf/simply-gemini-core
```

## Usage

```ts
import { discoverSkills, registerSkillSource, selectSkills } from '@simplysf/simply-gemini-core';

await registerSkillSource('my-team', '/src/team-skills', 'Shared team skills');

const { skills, missingSources } = await discoverSkills();
const { targets, skipped } = selectSkills(skills, ['code-reviewer'], 'install');
// targets[0].path is what to pass to `gemini skills link`.
```

Every function that touches Gemini's state takes an optional `{ home }` (default `os.homedir()`).

## What is in here

**Registry** — `readRegistry`, `writeRegistry`, `registerSkillSource`, `deregisterSkillSource`,
`registryFile`, `geminiDir`. The file is `~/.gemini/skills-registry.json`, shared with the
Salesforce `sf gemini skills` plugin. A malformed file is refused, never overwritten.

**Discovery** — `discoverSkills`, `skillsDir`, `readDescription`, `SKILL_FILE`. Finds flat and
one-level categorized skills in every registered source, plus anything already installed under
`~/.gemini/skills`, and reports registered sources that have disappeared.

**Selection** — `selectSkills`, `assertSkillName`, `groupByCategory`, `DEFAULT_CATEGORY`.

**Rendering** — `formatTable`, `skillColumns`, `stripControl`, `stripControlOneLine`.

**Errors** — `CliError` (with an `exitCode`), `ConfigError` (2), `NotFoundError` (2).

## License

Apache-2.0.
