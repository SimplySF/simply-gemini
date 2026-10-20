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

import path from 'node:path';
import { readRegistry } from '@simplysf/simply-gemini-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import GeminiSkillsDeregister from '../../../../src/commands/gemini/skills/deregister.js';
import GeminiSkillsList from '../../../../src/commands/gemini/skills/list.js';
import GeminiSkillsRegister from '../../../../src/commands/gemini/skills/register.js';
import { sandbox, type Sandbox } from '../../../helpers.js';

let box: Sandbox;

beforeEach(() => {
  box = sandbox();
});

afterEach(() => {
  box.restore();
});

describe('gemini skills register', () => {
  it('records the source and reports how many skills it provides', async () => {
    box.skill('alpha');
    box.skill('apex/apex-gen');

    const result = await GeminiSkillsRegister.run([
      '--id',
      'team',
      '--path',
      box.source,
      '--description',
      'Team skills',
    ]);

    expect(result.entry).toMatchObject({ id: 'team', path: path.resolve(box.source), description: 'Team skills' });
    expect(result.skills).toBe(2);
    expect((await readRegistry({ home: box.home })).registrations).toHaveLength(1);
  });

  it('refuses a directory that does not exist', async () => {
    await expect(
      GeminiSkillsRegister.run(['--id', 'team', '--path', path.join(box.source, 'missing')]),
    ).rejects.toMatchObject({ oclif: { exit: 2 } });
    expect((await readRegistry({ home: box.home })).registrations).toHaveLength(0);
  });
});

describe('gemini skills deregister', () => {
  it('removes the source', async () => {
    await box.register('team');

    await GeminiSkillsDeregister.run(['--id', 'team']);

    expect((await readRegistry({ home: box.home })).registrations).toHaveLength(0);
  });

  it('fails with exit 2 on an id that is not registered', async () => {
    await expect(GeminiSkillsDeregister.run(['--id', 'nope'])).rejects.toMatchObject({ oclif: { exit: 2 } });
  });
});

describe('gemini skills list', () => {
  beforeEach(async () => {
    box.skill('alpha');
    box.skill('beta');
    box.install('beta');
    box.install('orphan');
    await box.register('team');
  });

  it('lists available and installed skills, including ones no source provides', async () => {
    const skills = await GeminiSkillsList.run([]);

    expect(skills.map((skill) => [skill.name, skill.installed, skill.source])).toStrictEqual([
      ['alpha', false, 'team'],
      ['beta', true, 'team'],
      ['orphan', true, undefined],
    ]);
  });

  it('filters to installed skills', async () => {
    const skills = await GeminiSkillsList.run(['--installed']);

    expect(skills.map((skill) => skill.name)).toStrictEqual(['beta', 'orphan']);
  });

  it('filters to skills not yet installed', async () => {
    const skills = await GeminiSkillsList.run(['--available']);

    expect(skills.map((skill) => skill.name)).toStrictEqual(['alpha']);
  });

  it('refuses both filters at once', async () => {
    await expect(GeminiSkillsList.run(['--installed', '--available'])).rejects.toMatchObject({ oclif: { exit: 2 } });
  });
});
