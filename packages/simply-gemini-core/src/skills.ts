/*
 * Copyright (c) 2026, SimplySF.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ConfigError, NotFoundError } from './errors.js';
import { geminiDir, readRegistry, type GeminiHomeOptions, type RegistryEntry } from './registry.js';

/** The file that makes a directory a skill. */
export const SKILL_FILE = 'SKILL.md';

/** The group a skill without a category folder is listed under. */
export const DEFAULT_CATEGORY = 'General';

export interface Skill {
  /** The skill's directory name, which is also the name Gemini installs it under. */
  readonly name: string;
  /** Where the skill lives: in its source, or under `~/.gemini/skills` if no source provides it. */
  readonly path: string;
  /** From the `description:` field of the skill's `SKILL.md` front matter, if it has one. */
  readonly description?: string;
  readonly installed: boolean;
  /** The folder a skill sits in when its source groups skills one level deep. */
  readonly category?: string;
  /** The id of the registered source that provides it; absent for a skill installed some other way. */
  readonly source?: string;
}

export interface Discovery {
  readonly skills: Skill[];
  /** Registered sources whose directory no longer exists, so a caller can say why a skill vanished. */
  readonly missingSources: RegistryEntry[];
}

/** The directory Gemini installs user-level skills into, one subdirectory or link per skill. */
export function skillsDir(options: GeminiHomeOptions = {}): string {
  return path.join(geminiDir(options), 'skills');
}

/**
 * Refuses a name that would not stay inside `~/.gemini/skills` once joined onto it. A name comes
 * from a flag and is passed straight to `gemini skills uninstall`, so this is the one check
 * between a typo like `../` and a path nobody meant.
 */
export function assertSkillName(name: string): void {
  if (name === '' || name === '.' || name === '..' || /[/\\]/.test(name)) {
    throw new ConfigError(`"${name}" is not a skill name. A skill name is a single directory name.`);
  }
}

/**
 * Reads `description:` out of a `SKILL.md`'s YAML front matter.
 *
 * Only the front matter is searched. The plugin this was ported from matched the first
 * `description:` anywhere in the file, so a skill whose body documented its own front matter could
 * end up described by its example.
 */
export function readDescription(content: string): string | undefined {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return undefined;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  const frontMatter = lines.slice(1, end === -1 ? lines.length : end);

  const start = frontMatter.findIndex((line) => line.startsWith('description:'));
  if (start === -1) return undefined;
  const value = frontMatter[start].slice('description:'.length).trim();

  // A block scalar (`>` or `|`, optionally with a chomping indicator) continues on the indented
  // lines that follow it. Folding them onto one line is all a listing needs.
  if (/^[>|][+-]?$/.test(value) || value === '') {
    const continuation: string[] = [];
    for (const line of frontMatter.slice(start + 1)) {
      if (!/^\s+\S/.test(line)) break;
      continuation.push(line.trim());
    }
    const folded = continuation.join(' ');
    return folded === '' ? undefined : folded;
  }

  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

/** Subdirectories of `dir`, following symbolic links, sorted by name. Missing or unreadable is empty. */
async function subdirectories(dir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  const checked = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) return entry.name;
      if (!entry.isSymbolicLink()) return undefined;
      const stat = await fs.promises.stat(path.join(dir, entry.name)).catch(() => undefined);
      return stat?.isDirectory() ? entry.name : undefined;
    }),
  );
  return checked.filter((name): name is string => name !== undefined).sort();
}

async function readSkillFile(dir: string): Promise<{ description?: string } | undefined> {
  const content = await fs.promises.readFile(path.join(dir, SKILL_FILE), 'utf8').catch(() => undefined);
  if (content === undefined) return undefined;
  const description = readDescription(content);
  return description === undefined ? {} : { description };
}

interface Found {
  readonly name: string;
  readonly path: string;
  readonly description?: string;
  readonly category?: string;
}

/**
 * Finds the skills in one source. A directory holding a `SKILL.md` is a skill; one without is
 * treated as a category and searched one level further, so both `source/my-skill/SKILL.md` and
 * `source/apex/my-skill/SKILL.md` are found. Deeper nesting is not searched.
 */
async function scanSource(root: string): Promise<Found[]> {
  const firstLevel = await subdirectories(root);
  const perEntry = await Promise.all(
    firstLevel.map(async (name): Promise<Found[]> => {
      const dir = path.join(root, name);
      const skill = await readSkillFile(dir);
      if (skill !== undefined) return [{ name, path: dir, ...skill }];

      const secondLevel = await subdirectories(dir);
      const nested = await Promise.all(
        secondLevel.map(async (child): Promise<Found | undefined> => {
          const childDir = path.join(dir, child);
          const childSkill = await readSkillFile(childDir);
          return childSkill === undefined ? undefined : { name: child, path: childDir, category: name, ...childSkill };
        }),
      );
      return nested.filter((found): found is Found => found !== undefined);
    }),
  );
  return perEntry.flat();
}

/**
 * Lists every skill the registered sources provide, plus any skill already installed into
 * `~/.gemini/skills` that no source provides — so `uninstall` can still reach a skill whose source
 * was deregistered or which was installed some other way.
 *
 * Gemini installs a skill under its directory name, so a name can be installed only once. When two
 * sources both provide a name, the source registered first wins and the later one is not listed.
 * A skill counts as installed when `~/.gemini/skills/<name>` exists.
 */
export async function discoverSkills(options: GeminiHomeOptions = {}): Promise<Discovery> {
  const { registrations } = await readRegistry(options);
  const present = await Promise.all(
    registrations.map(async (entry) => {
      const stat = await fs.promises.stat(entry.path).catch(() => undefined);
      return stat?.isDirectory() === true;
    }),
  );
  const sources = registrations.filter((_, index) => present[index]);
  const missingSources = registrations.filter((_, index) => !present[index]);

  const installedDir = skillsDir(options);
  const installedNames = new Set(await subdirectories(installedDir));
  const scanned = await Promise.all(sources.map((entry) => scanSource(entry.path)));

  const skills: Skill[] = [];
  const seen = new Set<string>();
  for (const [index, found] of scanned.entries()) {
    for (const skill of found) {
      if (seen.has(skill.name)) continue;
      seen.add(skill.name);
      skills.push({ ...skill, installed: installedNames.has(skill.name), source: sources[index].id });
    }
  }

  const orphans = [...installedNames].filter((name) => !seen.has(name));
  const orphanSkills = await Promise.all(
    orphans.map(async (name): Promise<Skill> => {
      const dir = path.join(installedDir, name);
      return { name, path: dir, ...(await readSkillFile(dir)), installed: true };
    }),
  );

  return { skills: [...skills, ...orphanSkills], missingSources };
}

/**
 * Groups skills for a picker, by category in first-seen order. A skill with no category is listed
 * under {@link DEFAULT_CATEGORY}.
 */
export function groupByCategory(skills: readonly Skill[]): Map<string, Skill[]> {
  const groups = new Map<string, Skill[]>();
  for (const skill of skills) {
    const key = skill.category ?? DEFAULT_CATEGORY;
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }
  return groups;
}

export type SkillAction = 'install' | 'uninstall';

export interface Selection {
  /** The skills to act on, in the order they were named. */
  readonly targets: Skill[];
  /** Named skills that are already in the wanted state, so there is nothing to do for them. */
  readonly skipped: Skill[];
}

/**
 * Resolves skill names given on the command line into what to act on.
 *
 * Every name is checked before anything runs: an unknown name fails the whole request rather than
 * the run stopping halfway with some skills changed. A skill already in the wanted state is
 * reported as skipped rather than treated as a failure, so a script can run the same install twice.
 * The plugin this was ported from counted those as successes and printed "installed 3 skills" after
 * installing one.
 */
export function selectSkills(skills: readonly Skill[], names: readonly string[], action: SkillAction): Selection {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const unique = [...new Set(names)];
  for (const name of unique) assertSkillName(name);

  const unknown = unique.filter((name) => !byName.has(name));
  if (unknown.length > 0) {
    const where =
      action === 'install'
        ? 'No registered skill source provides it. Run `simply gemini skills list` to see what is available.'
        : 'It is not installed. Run `simply gemini skills list --installed` to see what is.';
    throw new NotFoundError(`Unknown skill${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. ${where}`);
  }

  const wanted = action === 'install';
  const named = unique.map((name) => byName.get(name)!);
  return {
    targets: named.filter((skill) => skill.installed !== wanted),
    skipped: named.filter((skill) => skill.installed === wanted),
  };
}
