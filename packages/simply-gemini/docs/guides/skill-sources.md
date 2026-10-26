---
title: Skill sources
description: How simply gemini finds skills, what counts as installed, and how sources interact.
---

A **skill source** is a directory you register. Every skill it holds becomes available to
`simply gemini skills install`.

## Layout

A skill is a directory with a `SKILL.md` in it. A source can hold skills directly, or group them one
level deep into category folders; the two can be mixed:

```
team-skills/
├── code-reviewer/SKILL.md
├── apex/
│   ├── apex-test-generator/SKILL.md
│   └── apex-doc-writer/SKILL.md
└── lwc/
    └── lwc-reviewer/SKILL.md
```

A folder without a `SKILL.md` is treated as a category and searched one more level. Anything deeper
is not searched. The category is what the interactive picker groups by; a skill with none is listed
under **General**.

## Descriptions

`list` and the picker show the `description:` field from the `SKILL.md` front matter:

```markdown
---
name: code-reviewer
description: Reviews a diff for correctness bugs before you open a pull request.
---
```

Only the front matter is read. Quoted values and folded (`>`) values both work.

## What "installed" means

A skill is installed when `~/.gemini/skills/<name>` exists — whether it got there through
`simply gemini skills install`, the Gemini CLI directly, or any other tool. `list` shows installed
skills that no registered source provides too, with no source, and `uninstall` can remove them.

`install` uses `gemini skills link`, so the installed skill reads from the source directory rather
than from a copy. Update the source — `git pull`, say — and the installed skill is updated with it.
That also means deleting or moving a source breaks the skills installed from it; uninstall them
first.

## Defaults

A source can name the skills everyone who registers it should have, in a `gemini-source.json` at
its root:

```json
{ "defaults": ["code-reviewer", "apex-test-generator"] }
```

`simply gemini skills register` installs those straight after registering the source. A default
that is already installed is skipped. A name the source doesn't provide, or that another source
registered earlier provides instead, is warned about and not installed; it never stops the source
being registered, and neither does a `gemini-source.json` that isn't valid. Pass
`--no-install-defaults` to register without installing anything.

Registering the same source again installs any default that is missing, including one you
uninstalled. Use `--no-install-defaults` when re-registering if you don't want that.

## Two sources, one name

Gemini installs a skill under its directory name and can hold only one skill per name. When two
registered sources each provide `code-reviewer`, the source registered first wins and the other one
is not listed. To switch, deregister the first source or rename one of the directories.

## The registry

Registrations are kept in `~/.gemini/skills-registry.json`:

```json
{
  "registrations": [
    {
      "id": "my-team",
      "path": "/home/me/src/team-skills",
      "description": "Shared team skills",
      "registeredAt": "2026-10-19T12:00:00.000Z"
    }
  ]
}
```

It is the same file, in the same shape, that the Salesforce `sf gemini skills` plugin uses, so
sources registered with either tool are visible to both.

Registering an id that already exists, or a directory that is already registered under another id,
replaces the earlier entry. A registered directory that no longer exists is skipped with a warning
on every command, rather than failing it. A registry file that is not valid JSON is never
overwritten: every command refuses until you fix or delete it.
