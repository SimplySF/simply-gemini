# Simply Gemini

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Simply Gemini is a command-line interface built by [SimplySF](https://github.com/SimplySF) for
managing [Gemini CLI](https://github.com/google-gemini/gemini-cli) skills and subagents.

Register the directories your skills and subagents live in, then list, install, and uninstall what
they hold — by name for scripts, or from a grouped, interactive picker at a terminal. It is a port of
the Salesforce `sf gemini` plugin to the `simply` CLI, and shares that plugin's registry files.

This repo is a Lerna/pnpm monorepo, following the same conventions as SimplySF's
[`simply-gitlab`](https://github.com/SimplySF/simply-gitlab) and
[`simply-atlassian`](https://github.com/SimplySF/simply-atlassian).

## Packages

| Package                                                       | Description                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`@simplysf/simply-gemini`](packages/simply-gemini)           | The `simply gemini` CLI                                                  |
| [`@simplysf/simply-gemini-core`](packages/simply-gemini-core) | Skill and subagent discovery, the source registries, and selection rules |

## Installation

Node.js 22 or later, and the Gemini CLI on your PATH.

```sh
npm install -g @google/gemini-cli
npm install -g @simplysf/simply-cli
simply gemini skills --help
```

## Usage

```sh
simply gemini skills register --id my-team --path ~/src/team-skills
simply gemini skills list
simply gemini skills install                          # pick from a list
simply gemini skills install --skill code-reviewer    # or name them
simply gemini skills uninstall --skill code-reviewer
simply gemini skills deregister --id my-team

simply gemini agents register --id my-team --path ~/src/team-agents
simply gemini agents install --agent code-reviewer          # copies it into ~/.gemini/agents
simply gemini agents install --agent code-reviewer --force  # after the source changes
```

## Documentation

**[simplysf.github.io/simply-cli/gemini](https://simplysf.github.io/simply-cli/gemini/)** — getting
started, the skill and subagent source guides, and the full command reference.

In this repo:

- [Command reference](packages/simply-gemini/README.md) — every command, flag, and example
- [Design documents](docs/design/README.md) — why things are the way they are
- [Contributing](CONTRIBUTING.md) — setup, checks, and the pull-request checklist

## License

Apache-2.0. See [LICENSE.txt](LICENSE.txt).
