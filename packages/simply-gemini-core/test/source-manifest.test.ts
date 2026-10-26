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
import { agentsDir, discoverAgents } from '../src/agents.js';
import { registerAgentSource, registerSkillSource } from '../src/registry.js';
import { discoverSkills, skillsDir } from '../src/skills.js';
import { MANIFEST_FILE, readSourceManifest, resolveDefaults } from '../src/source-manifest.js';

let root: string;
let home: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'simply-gemini-manifest-'));
  home = path.join(root, 'home');
  fs.mkdirSync(home);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function source(name: string, manifest?: string): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  if (manifest !== undefined) fs.writeFileSync(path.join(dir, MANIFEST_FILE), manifest);
  return dir;
}

function skill(dir: string, relative: string): void {
  fs.mkdirSync(path.join(dir, relative), { recursive: true });
  fs.writeFileSync(path.join(dir, relative, 'SKILL.md'), '---\ndescription: a skill\n---\n');
}

describe('readSourceManifest', () => {
  it('reads a source without a manifest as having no defaults, and no problem', async () => {
    expect(await readSourceManifest(source('plain'))).toStrictEqual({ defaults: [] });
  });

  it('reads the defaults, once each', async () => {
    const dir = source('team', JSON.stringify({ defaults: ['alpha', 'beta', 'alpha'] }));

    expect(await readSourceManifest(dir)).toStrictEqual({ defaults: ['alpha', 'beta'] });
  });

  it('ignores keys it does not know, and a missing defaults key', async () => {
    const dir = source('team', JSON.stringify({ version: 2, owner: 'someone' }));

    expect(await readSourceManifest(dir)).toStrictEqual({ defaults: [] });
  });

  it.each([
    ['not JSON', '{ defaults: ', /not valid JSON/],
    ['not an object', '["alpha"]', /not a JSON object/],
    ['defaults not an array', '{"defaults": "alpha"}', /not an array of names/],
    ['defaults holding a non-string', '{"defaults": ["alpha", 3]}', /not an array of names/],
  ])('reports a manifest that is %s as a problem, with no defaults', async (_, content, problem) => {
    const manifest = await readSourceManifest(source('team', content));

    expect(manifest.defaults).toStrictEqual([]);
    expect(manifest.problem).toMatch(problem);
  });
});

describe('resolveDefaults', () => {
  it('installs what is missing, skips what is installed, and names what the source lacks', async () => {
    const team = source('team');
    skill(team, 'alpha');
    skill(team, 'apex/beta');
    await registerSkillSource('team', team, undefined, { home });
    fs.mkdirSync(path.join(skillsDir({ home }), 'beta'), { recursive: true });
    const { skills } = await discoverSkills({ home });

    const resolved = resolveDefaults(skills, 'team', ['beta', 'alpha', 'typo']);

    expect(resolved.targets.map((found) => found.name)).toStrictEqual(['alpha']);
    expect(resolved.skipped.map((found) => found.name)).toStrictEqual(['beta']);
    expect(resolved.unavailable).toStrictEqual([{ name: 'typo' }]);
  });

  it('does not install a name an earlier-registered source wins', async () => {
    const first = source('first');
    const second = source('second');
    skill(first, 'shared');
    skill(second, 'shared');
    await registerSkillSource('first', first, undefined, { home });
    await registerSkillSource('second', second, undefined, { home });
    const { skills } = await discoverSkills({ home });

    const resolved = resolveDefaults(skills, 'second', ['shared']);

    expect(resolved.targets).toStrictEqual([]);
    expect(resolved.unavailable).toStrictEqual([{ name: 'shared', providedBy: 'first' }]);
  });

  it('treats an installed name no source provides as unavailable, not installed', async () => {
    await registerSkillSource('team', source('team'), undefined, { home });
    fs.mkdirSync(path.join(skillsDir({ home }), 'orphan'), { recursive: true });
    const { skills } = await discoverSkills({ home });

    expect(resolveDefaults(skills, 'team', ['orphan']).unavailable).toStrictEqual([{ name: 'orphan' }]);
  });

  it('skips an outdated subagent rather than replacing it', async () => {
    const team = source('team');
    fs.writeFileSync(path.join(team, 'reviewer.md'), 'new\n');
    fs.writeFileSync(path.join(team, 'writer.md'), 'writer\n');
    await registerAgentSource('team', team, undefined, { home });
    fs.mkdirSync(agentsDir({ home }), { recursive: true });
    fs.writeFileSync(path.join(agentsDir({ home }), 'reviewer.md'), 'old\n');
    const { agents } = await discoverAgents({ home });

    const resolved = resolveDefaults(agents, 'team', ['reviewer', 'writer', '../escape']);

    expect(resolved.targets.map((found) => found.name)).toStrictEqual(['writer']);
    expect(resolved.skipped.map((found) => [found.name, found.outdated])).toStrictEqual([['reviewer', true]]);
    expect(resolved.unavailable).toStrictEqual([{ name: '../escape' }]);
  });
});
