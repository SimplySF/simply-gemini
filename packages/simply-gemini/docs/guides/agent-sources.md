---
title: Subagent sources
description: How simply gemini finds subagents, names them, installs them, and keeps them up to date.
---

A **subagent source** is a directory you register. Every subagent it holds becomes available to
`simply gemini agents install`.

## Layout

A subagent is a Markdown file — the same file the Gemini CLI loads from `~/.gemini/agents/`. A
source can hold them directly, or group them one level deep into category folders:

```
team-agents/
├── README.md                 (skipped)
├── code-reviewer.md
└── apex/
    ├── apex-doc-writer.md
    └── apex-test-writer.md
```

Any `.md` file other than `README.md` is a subagent. Anything deeper than one folder is not
searched. The category is what the interactive picker groups by; a subagent with none is listed
under **General**.

## Names and descriptions

`list` and the picker read the front matter:

```markdown
---
name: code-reviewer
description: Reviews a diff for correctness bugs before you open a pull request.
---

You are a careful code reviewer…
```

The name is the `name:` field, or the file name without `.md` when there is none, and the subagent
is installed as `~/.gemini/agents/<name>.md`. Because it becomes a file name, it must be letters,
digits, `.`, `_` and `-`, starting with a letter or digit. A file whose name breaks that rule is
skipped, and every command says so.

Only the front matter is read. Quoted values and folded (`>`) descriptions both work.

## Installing is copying

The Gemini CLI has no command to install a subagent, so `install` copies the file. Unlike a skill,
an installed subagent does **not** follow its source. `list` shows which copies have fallen behind:
INSTALLED reads `outdated` when the installed file no longer matches the source file, and

```sh
simply gemini agents list --outdated
```

lists only those. To update one, run

```sh
simply gemini agents install --agent code-reviewer --force
```

to replace the installed copy. Without `--force`, a subagent that is already installed is reported
and skipped. With `--force` and no `--agent`, the picker offers installed subagents too, marked
**(installed)**.

A subagent is installed when `~/.gemini/agents/<name>.md` exists, however it got there. `list` shows
installed subagents that no source provides, with no source, and `uninstall` can remove them —
uninstalling only ever deletes the file under `~/.gemini/agents`, never a source file.

## Defaults

A source can name the subagents everyone who registers it should have, in a `gemini-source.json`
at its root:

```json
{ "defaults": ["code-reviewer", "test-writer"] }
```

`simply gemini agents register` copies those into place straight after registering the source. A
default that is already installed is skipped, even if it is outdated; update it with
`install --force` as above. A name the source doesn't provide, or that another source registered
earlier provides instead, is warned about and not installed; it never stops the source being
registered, and neither does a `gemini-source.json` that isn't valid. Pass `--no-install-defaults`
to register without installing anything.

Registering the same source again installs any default that is missing, including one you
uninstalled. Use `--no-install-defaults` when re-registering if you don't want that.

## Two sources, one name

Gemini loads a subagent by name and can hold only one per name. When two registered sources each
provide `code-reviewer`, the source registered first wins and the other is not listed. Within one
source, a file directly in the source wins over one in a category folder, then files are taken in
name order.

## The registry

Registrations are kept in `~/.gemini/agents-registry.json`, separate from the skill registry and in
the same shape:

```json
{
  "registrations": [
    {
      "id": "my-team",
      "path": "/home/me/src/team-agents",
      "description": "Shared team subagents",
      "registeredAt": "2026-10-20T12:00:00.000Z"
    }
  ]
}
```

It is the file the Salesforce `sf gemini agents` commands use, so sources registered with either tool
are visible to both. The rules are the same as for skills: registering an id or directory again
replaces the earlier entry, a directory that has gone is skipped with a warning, and a file that is
not valid JSON is never overwritten.
