# @simplysf/simply-gemini-core

Skill and subagent discovery, the source registries, and the selection rules that
[`@simplysf/simply-gemini`](../simply-gemini) (the `simply gemini` CLI) is built on.

Nothing in this package touches a terminal or runs a process: it reads and writes files under a
home directory you can pass in — including installing a subagent, which is a file copy — and
leaves running `gemini` to its caller.

You want this package directly if you are building other tooling around Gemini CLI skills or
subagents in TypeScript. If you want a CLI, install `@simplysf/simply-cli` and run `simply gemini`.

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

Subagents have no `gemini` command, so core installs them itself:

```ts
import { discoverAgents, installAgent, registerAgentSource, selectAgents } from '@simplysf/simply-gemini-core';

await registerAgentSource('my-team', '/src/team-agents');

const { agents } = await discoverAgents();
const { targets } = selectAgents(agents, ['code-reviewer'], 'install', { force: true });
for (const agent of targets) await installAgent(agent); // copies to ~/.gemini/agents/<name>.md
```

Every function that touches Gemini's state takes an optional `{ home }` (default `os.homedir()`).

## What is in here

**Registries** — `readRegistry`, `writeRegistry`, `registerSkillSource`, `deregisterSkillSource`,
`registerAgentSource`, `deregisterAgentSource`, `registryFile`, `geminiDir`. The files are
`~/.gemini/skills-registry.json` and `~/.gemini/agents-registry.json` (pass `{ kind: 'agents' }`),
shared with the Salesforce `sf gemini` plugin. A malformed file is refused, never overwritten.

**Discovery** — `discoverSkills`, `skillsDir`, `readDescription`, `SKILL_FILE`. Finds flat and
one-level categorized skills in every registered source, plus anything already installed under
`~/.gemini/skills`, and reports registered sources that have disappeared.

**Subagents** — `discoverAgents`, `selectAgents`, `installAgent`, `uninstallAgent`, `agentsDir`,
`assertAgentName`, `AGENT_EXTENSION`. The same rules as skills, for `.md` files installed into
`~/.gemini/agents`. A front-matter name that is not a plain file name is rejected, not installed.

**Selection** — `selectSkills`, `assertSkillName`, `groupByCategory`, `DEFAULT_CATEGORY`.

**Rendering** — `formatTable`, `skillColumns`, `agentColumns`, `stripControl`, `stripControlOneLine`.

**Errors** — `CliError` (with an `exitCode`), `ConfigError` (2), `NotFoundError` (2).

## License

Apache-2.0.
