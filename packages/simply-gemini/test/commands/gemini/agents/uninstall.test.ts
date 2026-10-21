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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GeminiAgentsUninstall from '../../../../src/commands/gemini/agents/uninstall.js';
import { canPrompt, pickNames } from '../../../../src/shared/prompt.js';
import { sandbox, type Sandbox } from '../../../helpers.js';

vi.mock('../../../../src/shared/prompt.js', () => ({ canPrompt: vi.fn(), pickNames: vi.fn() }));

let box: Sandbox;

beforeEach(async () => {
  vi.mocked(canPrompt).mockReset().mockReturnValue(false);
  vi.mocked(pickNames).mockReset();
  box = sandbox();
  await box.registerAgents();
});

afterEach(() => {
  box.restore();
});

describe('gemini agents uninstall --agent', () => {
  it('deletes installed subagents, including one no source provides', async () => {
    box.agent('reviewer.md');
    const fromSource = box.installAgent('reviewer');
    const handMade = box.installAgent('hand-made');

    const result = await GeminiAgentsUninstall.run(['-a', 'reviewer', '-a', 'hand-made']);

    expect(result).toStrictEqual({ changed: ['reviewer', 'hand-made'], skipped: [] });
    expect(fs.existsSync(fromSource)).toBe(false);
    expect(fs.existsSync(handMade)).toBe(false);
  });

  it('skips a subagent a source provides that is not installed', async () => {
    box.agent('reviewer.md');

    expect(await GeminiAgentsUninstall.run(['-a', 'reviewer'])).toStrictEqual({ changed: [], skipped: ['reviewer'] });
  });

  it('fails with exit 2 on a subagent that is neither installed nor available', async () => {
    const installed = box.installAgent('keep');

    await expect(GeminiAgentsUninstall.run(['-a', 'keep', '-a', 'nope'])).rejects.toMatchObject({
      oclif: { exit: 2 },
    });
    expect(fs.existsSync(installed)).toBe(true);
  });

  it('never deletes the source file', async () => {
    const source = box.agent('reviewer.md');
    box.installAgent('reviewer');

    await GeminiAgentsUninstall.run(['-a', 'reviewer']);

    expect(fs.existsSync(source)).toBe(true);
  });
});

describe('gemini agents uninstall, choosing interactively', () => {
  it('offers only installed subagents', async () => {
    box.agent('alpha.md');
    box.agent('beta.md');
    box.installAgent('beta');
    vi.mocked(canPrompt).mockReturnValue(true);
    vi.mocked(pickNames).mockResolvedValue(['beta']);

    const result = await GeminiAgentsUninstall.run([]);

    expect(vi.mocked(pickNames).mock.calls[0][1].map((agent) => agent.name)).toStrictEqual(['beta']);
    expect(result).toStrictEqual({ changed: ['beta'], skipped: [] });
  });

  it('says so, and does not prompt, when nothing is installed', async () => {
    box.agent('alpha.md');
    vi.mocked(canPrompt).mockReturnValue(true);

    expect(await GeminiAgentsUninstall.run([])).toStrictEqual({ changed: [], skipped: [] });
    expect(pickNames).not.toHaveBeenCalled();
  });
});
