# @simplysf/simply-gemini

[![NPM](https://img.shields.io/npm/v/@simplysf/simply-gemini?label=@simplysf/simply-gemini)](https://npmjs.com/@simplysf/simply-gemini) [![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://raw.githubusercontent.com/SimplySF/simply-gemini/main/LICENSE.txt)

Install and manage [Gemini CLI](https://github.com/google-gemini/gemini-cli) skills and subagents,
built by
[SimplySF](https://github.com/SimplySF).

Register the directories your skills and subagents live in — a team repository, a clone of someone
else's — and then list, install, and uninstall what they hold, by name or from an interactive picker.
Output is human-readable by default and JSON with `--json`. See [Commands](#commands) below for the
full reference.

## Documentation

Guides and the full command reference: **https://simplysf.github.io/simply-cli/gemini/**

The guides also ship inside this package, under [`docs/`](docs).

## Install

`@simplysf/simply-gemini` is a plugin of the `simply` CLI, not a command of its own. Install the
host; this plugin installs itself the first time you run one of its commands.

```sh
npm install -g @simplysf/simply-cli

simply gemini skills --help
```

To install it ahead of time — in CI, a container image, or offline:

```sh
simply plugins install @simplysf/simply-gemini
```

Installing and uninstalling skills run the Gemini CLI itself, so it must be on your PATH (subagents
are plain files and do not need it):

```sh
npm install -g @google/gemini-cli
```

## Quick start

```sh
simply gemini skills register --id my-team --path ~/src/team-skills
simply gemini skills list
simply gemini skills install                       # pick from a list
simply gemini skills install --skill apex-test-generator
simply gemini skills uninstall --skill apex-test-generator

simply gemini agents register --id my-team --path ~/src/team-agents
simply gemini agents install --agent code-reviewer
```

## Skill sources

A skill is a directory holding a `SKILL.md`. A source is a directory of skills, either flat or
grouped one level deep into categories:

```
team-skills/
├── code-reviewer/SKILL.md          → code-reviewer
└── apex/                           → category "apex"
    ├── apex-test-generator/SKILL.md
    └── apex-doc-writer/SKILL.md
```

The description shown by `list` and the picker is the `description:` field of the `SKILL.md` front
matter. Sources are recorded in `~/.gemini/skills-registry.json` — the same file the Salesforce
`sf gemini skills` plugin uses, so a source registered with either tool is visible to both.

`install` runs `gemini skills link`, so an installed skill keeps reading from its source: pull the
source and the installed skill is up to date. Gemini installs a skill under its directory name, so
when two sources provide the same name, the source registered first wins.

## Subagent sources

A subagent is a Markdown file; a source is a directory of them, flat or one category folder deep.
`README.md` is skipped:

```
team-agents/
├── code-reviewer.md                → code-reviewer
└── apex/                           → category "apex"
    └── apex-doc-writer.md
```

The name is the `name:` field of the front matter, or the file name without `.md`; it must be
letters, digits, `.`, `_` and `-`. `install` copies the file to `~/.gemini/agents/<name>.md`, where
Gemini loads it from. It is a copy: `list` shows `outdated` once the source changes, and
`install --force` updates it.
Sources are recorded in `~/.gemini/agents-registry.json`, the file the Salesforce `sf gemini agents`
commands use.

## Scripting

Every command takes `--json`. `install` and `uninstall` need `--skill` (or `--agent`) when there is
no terminal to ask in — including under `--json` — and fail with exit 2 instead of waiting for input.

Naming a skill or subagent that is already installed (or, for `uninstall`, not installed) is not an error: it is
reported in `skipped`, so the same command can run twice. Naming one that does not exist fails
before anything changes.

## Exit codes

| Code | Meaning                                                              |
| ---- | -------------------------------------------------------------------- |
| 0    | Success                                                              |
| 1    | At least one skill or subagent failed to install or uninstall        |
| 2    | Usage or configuration: unknown name or id, no terminal, no `gemini` |

Under `--json`, a failure writes a single JSON object to **stderr** — `{"error":{name, message,
exitCode}}` — and nothing to stdout.

## Issues

Please report any issues at https://github.com/SimplySF/simply-gemini/issues

## Contributing

This package is part of the [`simply-gemini`](https://github.com/SimplySF/simply-gemini) monorepo.
See the repo's [CONTRIBUTING.md](https://github.com/SimplySF/simply-gemini/blob/main/CONTRIBUTING.md)
for setup, conventions, and how to submit a pull request.

## Commands

<!-- commands -->

- [`simply gemini agents deregister`](#simply-gemini-agents-deregister)
- [`simply gemini agents install`](#simply-gemini-agents-install)
- [`simply gemini agents list`](#simply-gemini-agents-list)
- [`simply gemini agents register`](#simply-gemini-agents-register)
- [`simply gemini agents uninstall`](#simply-gemini-agents-uninstall)
- [`simply gemini skills deregister`](#simply-gemini-skills-deregister)
- [`simply gemini skills install`](#simply-gemini-skills-install)
- [`simply gemini skills list`](#simply-gemini-skills-list)
- [`simply gemini skills register`](#simply-gemini-skills-register)
- [`simply gemini skills uninstall`](#simply-gemini-skills-uninstall)

## `simply gemini agents deregister`

Stop scanning a registered subagent source.

```
USAGE
  $ simply gemini agents deregister -i <value> [--json]

FLAGS
  -i, --id=<value>  (required) Id the source was registered under.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop scanning a registered subagent source.

  Removes the source from ~/.gemini/agents-registry.json. Its subagents stop appearing as available to install.
  Subagents already installed from it stay installed, because an installed subagent is a copy; uninstall them too if you
  want them gone. Naming an id that is not registered is an error.

EXAMPLES
  $ simply gemini agents deregister --id my-team
```

_See code: [lib/commands/gemini/agents/deregister.js](https://github.com/SimplySF/simply-gemini/blob/@simplysf/simply-gemini@0.2.0/packages/simply-gemini/lib/commands/gemini/agents/deregister.js)_

## `simply gemini agents install`

Install subagents from your registered subagent sources.

```
USAGE
  $ simply gemini agents install [--json] [-a <value>...] [-f]

FLAGS
  -a, --agent=<value>...  Name of a subagent to install. Repeat the flag for more than one.
  -f, --force             Replace subagents that are already installed.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Install subagents from your registered subagent sources.

  Copies each subagent file to ~/.gemini/agents/<name>.md, where the Gemini CLI loads it from. The name is the `name:`
  field of the file's front matter, or the file name without `.md`.

  It is a copy, not a link, so changing the source does not change the installed subagent; run install again with
  --force to pick up a change. With no --agent, lists every subagent not yet installed, grouped by category, and asks
  which to install. Naming one that is already installed is reported and skipped unless --force is given. Naming one no
  registered source provides fails before anything is installed.

EXAMPLES
  Pick from a list of every subagent not yet installed:

    $ simply gemini agents install

  Install two subagents without being asked:

    $ simply gemini agents install --agent code-reviewer --agent test-writer

  Reinstall a subagent after its source changed:

    $ simply gemini agents install --agent code-reviewer --force

FLAG DESCRIPTIONS
  -a, --agent=<value>...  Name of a subagent to install. Repeat the flag for more than one.

    Without it, you are asked to pick from a list, which needs an interactive terminal.

  -f, --force  Replace subagents that are already installed.

    With no --agent, the list then offers installed subagents too.
```

_See code: [lib/commands/gemini/agents/install.js](https://github.com/SimplySF/simply-gemini/blob/@simplysf/simply-gemini@0.2.0/packages/simply-gemini/lib/commands/gemini/agents/install.js)_

## `simply gemini agents list`

List subagents from your registered sources, and what is installed.

```
USAGE
  $ simply gemini agents list [--json] [--installed | --available] [--outdated]

FLAGS
  --available  List only subagents that are not yet installed.
  --installed  List only installed subagents.
  --outdated   List only installed subagents whose source file has changed since they were installed.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List subagents from your registered sources, and what is installed.

  Shows every subagent the registered sources provide, and every subagent installed under ~/.gemini/agents — including
  one copied there some other way, which is listed with no source. When two sources provide a subagent with the same
  name, the source registered first wins, because Gemini loads a subagent by its name and can hold only one of them.

  An installed subagent is a copy of its source file. INSTALLED reads "outdated" when the source file has changed since
  it was installed; `install --force` updates it.

EXAMPLES
  $ simply gemini agents list

  $ simply gemini agents list --available

  $ simply gemini agents list --outdated

  $ simply gemini agents list --installed --json
```

_See code: [lib/commands/gemini/agents/list.js](https://github.com/SimplySF/simply-gemini/blob/@simplysf/simply-gemini@0.2.0/packages/simply-gemini/lib/commands/gemini/agents/list.js)_

## `simply gemini agents register`

Register a directory of subagents as a subagent source.

```
USAGE
  $ simply gemini agents register -i <value> -p <value> [--json] [-d <value>]

FLAGS
  -d, --description=<value>  Short description of the source.
  -i, --id=<value>           (required) Unique id for the source. Used to deregister it, and shown as SOURCE in `list`.
  -p, --path=<value>         (required) Directory holding the subagents. A relative path is resolved against the current
                             directory.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Register a directory of subagents as a subagent source.

  A subagent source is any directory holding subagent definitions: Markdown files other than README.md, either directly
  (source/code-reviewer.md) or one level down in a category folder (source/apex/apex-doc-writer.md). Once registered,
  its subagents appear in `list` and can be installed with `install`.

  Sources are recorded in ~/.gemini/agents-registry.json, the same file the Salesforce `sf gemini agents` commands use,
  so a source registered with either tool is visible to both. Registering an id or a directory that is already
  registered replaces the earlier entry.

EXAMPLES
  $ simply gemini agents register --id my-team --path ./agents

  $ simply gemini agents register --id @my-org/gemini-agents --path ~/src/gemini-agents --description "Shared team subagents"
```

_See code: [lib/commands/gemini/agents/register.js](https://github.com/SimplySF/simply-gemini/blob/@simplysf/simply-gemini@0.2.0/packages/simply-gemini/lib/commands/gemini/agents/register.js)_

## `simply gemini agents uninstall`

Uninstall Gemini subagents.

```
USAGE
  $ simply gemini agents uninstall [--json] [-a <value>...]

FLAGS
  -a, --agent=<value>...  Name of a subagent to uninstall. Repeat the flag for more than one.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Uninstall Gemini subagents.

  Deletes ~/.gemini/agents/<name>.md for each subagent.

  Any subagent there can be uninstalled, including one no registered source provides. With no --agent, lists every
  installed subagent and asks which to remove. Naming one a registered source provides but that is not installed is
  reported and skipped; naming one that is neither installed nor available fails before anything is removed.

EXAMPLES
  Pick from a list of every installed subagent:

    $ simply gemini agents uninstall

  Uninstall one subagent without being asked:

    $ simply gemini agents uninstall --agent code-reviewer

FLAG DESCRIPTIONS
  -a, --agent=<value>...  Name of a subagent to uninstall. Repeat the flag for more than one.

    Without it, you are asked to pick from a list, which needs an interactive terminal.
```

_See code: [lib/commands/gemini/agents/uninstall.js](https://github.com/SimplySF/simply-gemini/blob/@simplysf/simply-gemini@0.2.0/packages/simply-gemini/lib/commands/gemini/agents/uninstall.js)_

## `simply gemini skills deregister`

Stop scanning a registered skill source.

```
USAGE
  $ simply gemini skills deregister -i <value> [--json]

FLAGS
  -i, --id=<value>  (required) Id the source was registered under.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Stop scanning a registered skill source.

  Removes the source from ~/.gemini/skills-registry.json. Its skills stop appearing as available to install. Skills
  already installed from it stay installed — uninstall them first if you want them gone, because a linked skill keeps
  reading from the source directory. Naming an id that is not registered is an error.

EXAMPLES
  $ simply gemini skills deregister --id my-team
```

_See code: [lib/commands/gemini/skills/deregister.js](https://github.com/SimplySF/simply-gemini/blob/@simplysf/simply-gemini@0.2.0/packages/simply-gemini/lib/commands/gemini/skills/deregister.js)_

## `simply gemini skills install`

Install skills from your registered skill sources.

```
USAGE
  $ simply gemini skills install [--json] [-s <value>...]

FLAGS
  -s, --skill=<value>...  Name of a skill to install. Repeat the flag for more than one.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Install skills from your registered skill sources.

  Runs `gemini skills link` for each skill, so Gemini reads it from its source directory rather than from a copy: a `git
  pull` in the source updates the installed skill. The Gemini CLI must be on your PATH.

  With no --skill, lists every skill that is not yet installed, grouped by category, and asks which to install. Naming a
  skill that is already installed is not an error; it is reported and skipped. Naming one no registered source provides
  fails before anything is installed.

EXAMPLES
  Pick from a list of every skill not yet installed:

    $ simply gemini skills install

  Install two skills without being asked:

    $ simply gemini skills install --skill apex-test-generator --skill lwc-reviewer

FLAG DESCRIPTIONS
  -s, --skill=<value>...  Name of a skill to install. Repeat the flag for more than one.

    Without it, you are asked to pick from a list, which needs an interactive terminal.
```

_See code: [lib/commands/gemini/skills/install.js](https://github.com/SimplySF/simply-gemini/blob/@simplysf/simply-gemini@0.2.0/packages/simply-gemini/lib/commands/gemini/skills/install.js)_

## `simply gemini skills list`

List skills from your registered sources, and what is installed.

```
USAGE
  $ simply gemini skills list [--json] [--installed | --available]

FLAGS
  --available  List only skills that are not yet installed.
  --installed  List only installed skills.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List skills from your registered sources, and what is installed.

  Shows every skill the registered sources provide, and every skill installed under ~/.gemini/skills — including one
  installed some other way, which is listed with no source. When two sources provide a skill with the same name, the
  source registered first wins, because Gemini installs a skill under its name and can hold only one of them.

EXAMPLES
  $ simply gemini skills list

  $ simply gemini skills list --available

  $ simply gemini skills list --installed --json
```

_See code: [lib/commands/gemini/skills/list.js](https://github.com/SimplySF/simply-gemini/blob/@simplysf/simply-gemini@0.2.0/packages/simply-gemini/lib/commands/gemini/skills/list.js)_

## `simply gemini skills register`

Register a directory of skills as a skill source.

```
USAGE
  $ simply gemini skills register -i <value> -p <value> [--json] [-d <value>]

FLAGS
  -d, --description=<value>  Short description of the source.
  -i, --id=<value>           (required) Unique id for the source. Used to deregister it, and shown as SOURCE in `list`.
  -p, --path=<value>         (required) Directory holding the skills. A relative path is resolved against the current
                             directory.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Register a directory of skills as a skill source.

  A skill source is any directory whose subdirectories hold a SKILL.md, either directly (source/my-skill/SKILL.md) or
  one level down in a category folder (source/apex/my-skill/SKILL.md). Once registered, its skills appear in `list` and
  can be installed with `install`.

  Sources are recorded in ~/.gemini/skills-registry.json, the same file the Salesforce `sf gemini skills` plugin uses,
  so a source registered with either tool is visible to both. Registering an id or a directory that is already
  registered replaces the earlier entry.

EXAMPLES
  $ simply gemini skills register --id my-team --path ./skills

  $ simply gemini skills register --id @my-org/gemini-skills --path ~/src/gemini-skills --description "Shared team skills"
```

_See code: [lib/commands/gemini/skills/register.js](https://github.com/SimplySF/simply-gemini/blob/@simplysf/simply-gemini@0.2.0/packages/simply-gemini/lib/commands/gemini/skills/register.js)_

## `simply gemini skills uninstall`

Uninstall Gemini skills.

```
USAGE
  $ simply gemini skills uninstall [--json] [-s <value>...]

FLAGS
  -s, --skill=<value>...  Name of a skill to uninstall. Repeat the flag for more than one.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Uninstall Gemini skills.

  Runs `gemini skills uninstall` for each skill. The Gemini CLI must be on your PATH.

  Any skill under ~/.gemini/skills can be uninstalled, including one no registered source provides. With no --skill,
  lists every installed skill and asks which to remove. Naming a skill a registered source provides but that is not
  installed is reported and skipped; naming one that is neither installed nor available fails before anything is
  removed.

EXAMPLES
  Pick from a list of every installed skill:

    $ simply gemini skills uninstall

  Uninstall one skill without being asked:

    $ simply gemini skills uninstall --skill apex-test-generator

FLAG DESCRIPTIONS
  -s, --skill=<value>...  Name of a skill to uninstall. Repeat the flag for more than one.

    Without it, you are asked to pick from a list, which needs an interactive terminal.
```

_See code: [lib/commands/gemini/skills/uninstall.js](https://github.com/SimplySF/simply-gemini/blob/@simplysf/simply-gemini@0.2.0/packages/simply-gemini/lib/commands/gemini/skills/uninstall.js)_
<!-- commandsstop -->
