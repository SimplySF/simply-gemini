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
import { readRegistry } from '@simplysf/simply-gemini-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GeminiAgentsDeregister from '../../../../src/commands/gemini/agents/deregister.js';
import GeminiAgentsList from '../../../../src/commands/gemini/agents/list.js';
import GeminiAgentsRegister from '../../../../src/commands/gemini/agents/register.js';
import { sandbox, type Sandbox } from '../../../helpers.js';

let box: Sandbox;

beforeEach(() => {
  box = sandbox();
});

afterEach(() => {
  box.restore();
});

describe('gemini agents register', () => {
  it('records the source in the subagent registry and reports how many subagents it provides', async () => {
    box.agent('reviewer.md');
    box.agent('apex/apex-doc.md');

    const result = await GeminiAgentsRegister.run(['--id', 'team', '--path', box.agentSource, '-d', 'Team']);

    expect(result.entry).toMatchObject({ id: 'team', path: path.resolve(box.agentSource), description: 'Team' });
    expect(result.agents).toBe(2);
    expect((await readRegistry({ home: box.home, kind: 'agents' })).registrations).toHaveLength(1);
    expect((await readRegistry({ home: box.home })).registrations).toHaveLength(0);
  });

  it('refuses a directory that does not exist', async () => {
    await expect(
      GeminiAgentsRegister.run(['--id', 'team', '--path', path.join(box.agentSource, 'missing')]),
    ).rejects.toMatchObject({ oclif: { exit: 2 } });
  });
});

describe('gemini agents deregister', () => {
  it('removes the source', async () => {
    await box.registerAgents('team');

    await GeminiAgentsDeregister.run(['--id', 'team']);

    expect((await readRegistry({ home: box.home, kind: 'agents' })).registrations).toHaveLength(0);
  });

  it('fails with exit 2 on an id that is not registered', async () => {
    await expect(GeminiAgentsDeregister.run(['--id', 'nope'])).rejects.toMatchObject({ oclif: { exit: 2 } });
  });
});

describe('gemini agents list', () => {
  beforeEach(async () => {
    box.agent('alpha.md');
    box.agent('beta.md');
    box.installAgent('beta');
    box.installAgent('orphan');
    await box.registerAgents('team');
  });

  it('lists available and installed subagents, including ones no source provides', async () => {
    const agents = await GeminiAgentsList.run([]);

    expect(agents.map((agent) => [agent.name, agent.installed, agent.source])).toStrictEqual([
      ['alpha', false, 'team'],
      ['beta', true, 'team'],
      ['orphan', true, undefined],
    ]);
  });

  it('filters to installed, or to not yet installed', async () => {
    expect((await GeminiAgentsList.run(['--installed'])).map((agent) => agent.name)).toStrictEqual(['beta', 'orphan']);
    expect((await GeminiAgentsList.run(['--available'])).map((agent) => agent.name)).toStrictEqual(['alpha']);
  });

  it('warns about a file whose name is unusable, without listing it', async () => {
    fs.writeFileSync(path.join(box.agentSource, 'evil.md'), '---\nname: ../../escape\n---\n');
    const warn = vi.spyOn(GeminiAgentsList.prototype, 'warn');

    try {
      const agents = await GeminiAgentsList.run([]);

      expect(agents.map((agent) => agent.name)).not.toContain('../../escape');
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/"\.\.\/\.\.\/escape" is not a usable subagent name/));
    } finally {
      warn.mockRestore();
    }
  });
});
