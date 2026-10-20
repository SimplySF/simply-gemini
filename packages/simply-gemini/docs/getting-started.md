---
title: Get Started
description: Requirements, installation, and installing a first skill with simply gemini.
---

## Requirements

- Node.js 22 or later
- The [Gemini CLI](https://github.com/google-gemini/gemini-cli) on your PATH:
  `npm install -g @google/gemini-cli`
- A directory of skills — a skill is a folder holding a `SKILL.md`

## Install

```sh
npm install -g @simplysf/simply-cli
```

## Verify it worked

```sh
simply gemini skills --help
```

The first run installs this product's commands, which takes a moment and needs network access.

## Register where your skills live

```sh
simply gemini skills register --id my-team --path ~/src/team-skills
```

The output says how many skills were found there. Zero usually means the path points one level too
high or too low — see [Skill sources](/guides/skill-sources/).

## Install a skill

See what is available:

```sh
simply gemini skills list --available
```

Then install by name, or run `install` with no flags to pick from a list:

```sh
simply gemini skills install --skill code-reviewer
simply gemini skills install
```

Start Gemini and the skill is there. To remove it:

```sh
simply gemini skills uninstall --skill code-reviewer
```
