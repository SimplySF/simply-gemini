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
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError, NotFoundError } from '../src/errors.js';
import { readDescription } from '../src/front-matter.js';
import { registerSkillSource } from '../src/registry.js';
import {
  assertSkillName,
  discoverSkills,
  groupByCategory,
  selectSkills,
  skillsDir,
  type Skill,
} from '../src/skills.js';

let root: string;
let home: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'simply-gemini-skills-'));
  home = path.join(root, 'home');
  fs.mkdirSync(home);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Creates `<root>/<relative>/SKILL.md` and returns the skill directory. */
function skill(relative: string, description?: string): string {
  const dir = path.join(root, relative);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    description === undefined ? '# no front matter\n' : `---\ndescription: ${description}\n---\n`,
  );
  return dir;
}

function install(name: string): void {
  fs.mkdirSync(path.join(skillsDir({ home }), name), { recursive: true });
}

describe('readDescription', () => {
  it('reads a plain value', () => {
    expect(readDescription('---\nname: a\ndescription: Does a thing.\n---\nbody')).toBe('Does a thing.');
  });

  it('unquotes a quoted value', () => {
    expect(readDescription('---\ndescription: "Quoted: yes"\n---')).toBe('Quoted: yes');
    expect(readDescription("---\ndescription: 'single'\n---")).toBe('single');
  });

  it('folds a block scalar onto one line', () => {
    expect(readDescription('---\ndescription: >-\n  first line\n  second line\nname: a\n---')).toBe(
      'first line second line',
    );
  });

  it('reads Windows line endings', () => {
    expect(readDescription('---\r\ndescription: crlf\r\n---\r\n')).toBe('crlf');
  });

  it('ignores a description: line in the body', () => {
    expect(readDescription('---\nname: a\n---\ndescription: from the body')).toBeUndefined();
    expect(readDescription('description: no front matter at all')).toBeUndefined();
  });
});

describe('discoverSkills', () => {
  it('finds nothing when nothing is registered', async () => {
    expect(await discoverSkills({ home })).toStrictEqual({ skills: [], missingSources: [] });
  });

  it('finds flat and categorized skills, and ignores directories without a SKILL.md', async () => {
    const flat = skill('src/alpha', 'Alpha');
    const nested = skill('src/apex/apex-gen', 'Apex');
    fs.mkdirSync(path.join(root, 'src/apex/not-a-skill'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/apex/deeper/still-not'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/README.md'), 'a file, not a skill');
    await registerSkillSource('team', path.join(root, 'src'), undefined, { home });

    const { skills } = await discoverSkills({ home });

    expect(skills).toStrictEqual([
      { name: 'alpha', path: flat, description: 'Alpha', installed: false, source: 'team' },
      { name: 'apex-gen', path: nested, category: 'apex', description: 'Apex', installed: false, source: 'team' },
    ]);
  });

  it('marks a skill installed when ~/.gemini/skills/<name> exists', async () => {
    skill('src/alpha', 'Alpha');
    skill('src/beta', 'Beta');
    await registerSkillSource('team', path.join(root, 'src'), undefined, { home });
    install('beta');

    const { skills } = await discoverSkills({ home });

    expect(skills.map((found) => [found.name, found.installed])).toStrictEqual([
      ['alpha', false],
      ['beta', true],
    ]);
  });

  it('lists a skill only once when two sources provide it, from the source registered first', async () => {
    skill('first/shared', 'From first');
    skill('second/shared', 'From second');
    await registerSkillSource('one', path.join(root, 'first'), undefined, { home });
    await registerSkillSource('two', path.join(root, 'second'), undefined, { home });

    const { skills } = await discoverSkills({ home });

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ source: 'one', description: 'From first' });
  });

  it('reports a registered source whose directory is gone instead of failing', async () => {
    skill('src/alpha', 'Alpha');
    await registerSkillSource('kept', path.join(root, 'src'), undefined, { home });
    fs.mkdirSync(path.join(root, 'deleted'));
    await registerSkillSource('gone', path.join(root, 'deleted'), undefined, { home });
    fs.rmdirSync(path.join(root, 'deleted'));

    const { skills, missingSources } = await discoverSkills({ home });

    expect(skills.map((found) => found.name)).toStrictEqual(['alpha']);
    expect(missingSources.map((entry) => entry.id)).toStrictEqual(['gone']);
  });

  it('lists an installed skill that no source provides, so it can still be uninstalled', async () => {
    install('orphan');
    fs.writeFileSync(path.join(skillsDir({ home }), 'orphan', 'SKILL.md'), '---\ndescription: Lone\n---\n');

    const { skills } = await discoverSkills({ home });

    expect(skills).toStrictEqual([
      { name: 'orphan', path: path.join(skillsDir({ home }), 'orphan'), description: 'Lone', installed: true },
    ]);
  });

  it('follows a linked skill directory', async () => {
    const target = skill('elsewhere/linked', 'Linked');
    fs.mkdirSync(path.join(root, 'src'));
    // A junction on Windows, which needs no elevation; ignored elsewhere.
    fs.symlinkSync(target, path.join(root, 'src', 'linked'), 'junction');
    await registerSkillSource('team', path.join(root, 'src'), undefined, { home });

    const { skills } = await discoverSkills({ home });

    expect(skills.map((found) => found.name)).toStrictEqual(['linked']);
  });
});

describe('selectSkills', () => {
  const skills: Skill[] = [
    { name: 'a', path: '/a', installed: false },
    { name: 'b', path: '/b', installed: true },
  ];

  it('targets what is not yet in the wanted state and skips what is', () => {
    expect(selectSkills(skills, ['a', 'b'], 'install')).toStrictEqual({ targets: [skills[0]], skipped: [skills[1]] });
    expect(selectSkills(skills, ['a', 'b'], 'uninstall')).toStrictEqual({
      targets: [skills[1]],
      skipped: [skills[0]],
    });
  });

  it('acts on a name given twice only once', () => {
    expect(selectSkills(skills, ['a', 'a'], 'install').targets).toHaveLength(1);
  });

  it('fails on any unknown name, naming every one of them', () => {
    expect(() => selectSkills(skills, ['a', 'x', 'y'], 'install')).toThrow(NotFoundError);
    expect(() => selectSkills(skills, ['a', 'x', 'y'], 'install')).toThrow(/Unknown skills: x, y\./);
  });

  it('refuses a name that would leave the skills directory', () => {
    expect(() => selectSkills(skills, ['../a'], 'uninstall')).toThrow(ConfigError);
  });
});

describe('assertSkillName', () => {
  it.each(['', '.', '..', 'a/b', 'a\\b'])('refuses %j', (name) => {
    expect(() => assertSkillName(name)).toThrow(ConfigError);
  });

  it('accepts an ordinary directory name', () => {
    expect(() => assertSkillName('apex-test-generator')).not.toThrow();
  });
});

describe('groupByCategory', () => {
  it('groups by category in first-seen order, defaulting to General', () => {
    const groups = groupByCategory([
      { name: 'a', path: '/a', installed: false },
      { name: 'b', path: '/b', installed: false, category: 'apex' },
      { name: 'c', path: '/c', installed: false },
    ]);

    expect([...groups.keys()]).toStrictEqual(['General', 'apex']);
    expect(groups.get('General')?.map((member) => member.name)).toStrictEqual(['a', 'c']);
  });
});
