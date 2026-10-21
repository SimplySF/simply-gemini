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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GeminiSkillsUninstall from '../../../../src/commands/gemini/skills/uninstall.js';
import { uninstallSkill } from '../../../../src/shared/gemini-cli.js';
import { canPrompt, pickNames } from '../../../../src/shared/prompt.js';
import { sandbox, type Sandbox } from '../../../helpers.js';

vi.mock('../../../../src/shared/gemini-cli.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/shared/gemini-cli.js')>()),
  linkSkill: vi.fn(),
  uninstallSkill: vi.fn(),
}));
vi.mock('../../../../src/shared/prompt.js', () => ({ canPrompt: vi.fn(), pickNames: vi.fn() }));

let box: Sandbox;

beforeEach(async () => {
  vi.mocked(uninstallSkill).mockReset().mockResolvedValue();
  vi.mocked(canPrompt).mockReset().mockReturnValue(false);
  vi.mocked(pickNames).mockReset();
  box = sandbox();
  await box.register();
});

afterEach(() => {
  box.restore();
});

describe('gemini skills uninstall', () => {
  it('uninstalls a named skill by name', async () => {
    box.skill('alpha');
    box.install('alpha');

    const result = await GeminiSkillsUninstall.run(['--skill', 'alpha']);

    expect(vi.mocked(uninstallSkill).mock.calls).toStrictEqual([['alpha']]);
    expect(result).toStrictEqual({ changed: ['alpha'], skipped: [] });
  });

  it('reaches a skill that no registered source provides', async () => {
    box.install('installed-elsewhere');

    await GeminiSkillsUninstall.run(['-s', 'installed-elsewhere']);

    expect(vi.mocked(uninstallSkill).mock.calls).toStrictEqual([['installed-elsewhere']]);
  });

  it('skips an available skill that is not installed', async () => {
    box.skill('alpha');

    const result = await GeminiSkillsUninstall.run(['-s', 'alpha']);

    expect(uninstallSkill).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ changed: [], skipped: ['alpha'] });
  });

  it('fails with exit 2 on a name that is neither installed nor available', async () => {
    await expect(GeminiSkillsUninstall.run(['-s', 'ghost'])).rejects.toMatchObject({
      message: expect.stringMatching(/It is not installed/) as unknown,
      oclif: { exit: 2 },
    });
  });

  it('refuses a name that is a path', async () => {
    await expect(GeminiSkillsUninstall.run(['-s', '../../etc'])).rejects.toMatchObject({ oclif: { exit: 2 } });
    expect(uninstallSkill).not.toHaveBeenCalled();
  });

  it('offers only installed skills in the picker', async () => {
    box.skill('alpha');
    box.skill('beta');
    box.install('beta');
    vi.mocked(canPrompt).mockReturnValue(true);
    vi.mocked(pickNames).mockResolvedValue(['beta']);

    await GeminiSkillsUninstall.run([]);

    expect(vi.mocked(pickNames).mock.calls[0][1].map((skill) => skill.name)).toStrictEqual(['beta']);
    expect(vi.mocked(uninstallSkill).mock.calls).toStrictEqual([['beta']]);
  });
});
