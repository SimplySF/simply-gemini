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
import GeminiSkillsInstall from '../../../../src/commands/gemini/skills/install.js';
import { GeminiCommandError, GeminiNotFoundError, linkSkill } from '../../../../src/shared/gemini-cli.js';
import { canPrompt, pickNames } from '../../../../src/shared/prompt.js';
import { sandbox, type Sandbox } from '../../../helpers.js';

// Only the two things that reach outside the process are replaced: running `gemini`, and asking a
// person. Discovery and the registry run for real against a temporary home directory.
vi.mock('../../../../src/shared/gemini-cli.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../src/shared/gemini-cli.js')>()),
  linkSkill: vi.fn(),
  uninstallSkill: vi.fn(),
}));
vi.mock('../../../../src/shared/prompt.js', () => ({ canPrompt: vi.fn(), pickNames: vi.fn() }));

let box: Sandbox;

beforeEach(async () => {
  vi.mocked(linkSkill).mockReset().mockResolvedValue();
  vi.mocked(canPrompt).mockReset().mockReturnValue(false);
  vi.mocked(pickNames).mockReset();
  box = sandbox();
  await box.register();
});

afterEach(() => {
  box.restore();
});

describe('gemini skills install --skill', () => {
  it('links each named skill from its source directory', async () => {
    const alpha = box.skill('alpha');
    const apex = box.skill('apex/apex-gen');

    const result = await GeminiSkillsInstall.run(['--skill', 'alpha', '--skill', 'apex-gen']);

    expect(vi.mocked(linkSkill).mock.calls).toStrictEqual([[alpha], [apex]]);
    expect(result).toStrictEqual({ changed: ['alpha', 'apex-gen'], skipped: [] });
  });

  it('skips a skill that is already installed rather than failing', async () => {
    box.skill('alpha');
    box.skill('beta');
    box.install('beta');

    const result = await GeminiSkillsInstall.run(['-s', 'alpha', '-s', 'beta']);

    expect(linkSkill).toHaveBeenCalledOnce();
    expect(result).toStrictEqual({ changed: ['alpha'], skipped: ['beta'] });
  });

  it('fails with exit 2 on an unknown skill, before installing anything', async () => {
    box.skill('alpha');

    await expect(GeminiSkillsInstall.run(['-s', 'alpha', '-s', 'nope'])).rejects.toMatchObject({
      message: expect.stringMatching(/Unknown skill: nope/) as unknown,
      oclif: { exit: 2 },
    });
    expect(linkSkill).not.toHaveBeenCalled();
  });

  it('carries on past a failed skill, then fails naming it', async () => {
    box.skill('alpha');
    box.skill('beta');
    vi.mocked(linkSkill).mockRejectedValueOnce(new GeminiCommandError('gemini said no'));

    await expect(GeminiSkillsInstall.run(['-s', 'alpha', '-s', 'beta'])).rejects.toMatchObject({
      message: expect.stringMatching(
        /Installed 1 of 2 skill\(s\)\. These failed:\n\s+alpha: gemini said no/,
      ) as unknown,
      oclif: { exit: 1 },
    });
    expect(linkSkill).toHaveBeenCalledTimes(2);
  });

  it('stops at once when gemini is not installed', async () => {
    box.skill('alpha');
    box.skill('beta');
    vi.mocked(linkSkill).mockRejectedValue(new GeminiNotFoundError('gemini'));

    await expect(GeminiSkillsInstall.run(['-s', 'alpha', '-s', 'beta'])).rejects.toMatchObject({
      oclif: { exit: 2 },
    });
    expect(linkSkill).toHaveBeenCalledOnce();
  });
});

describe('gemini skills install, choosing interactively', () => {
  it('offers only the skills that are not installed, and installs what was picked', async () => {
    box.skill('alpha');
    const beta = box.skill('beta');
    box.skill('gamma');
    box.install('alpha');
    vi.mocked(canPrompt).mockReturnValue(true);
    vi.mocked(pickNames).mockResolvedValue(['beta']);

    const result = await GeminiSkillsInstall.run([]);

    const offered = vi.mocked(pickNames).mock.calls[0][1].map((skill) => skill.name);
    expect(offered).toStrictEqual(['beta', 'gamma']);
    expect(vi.mocked(linkSkill).mock.calls).toStrictEqual([[beta]]);
    expect(result).toStrictEqual({ changed: ['beta'], skipped: [] });
  });

  it('changes nothing when the picker is cancelled', async () => {
    box.skill('alpha');
    vi.mocked(canPrompt).mockReturnValue(true);
    vi.mocked(pickNames).mockResolvedValue(undefined);

    const result = await GeminiSkillsInstall.run([]);

    expect(linkSkill).not.toHaveBeenCalled();
    expect(result).toStrictEqual({ changed: [], skipped: [] });
  });

  it('does not prompt when everything is already installed', async () => {
    box.skill('alpha');
    box.install('alpha');
    vi.mocked(canPrompt).mockReturnValue(true);

    await GeminiSkillsInstall.run([]);

    expect(pickNames).not.toHaveBeenCalled();
  });

  it('refuses with exit 2, rather than hanging, when there is no terminal to ask in', async () => {
    box.skill('alpha');

    await expect(GeminiSkillsInstall.run([])).rejects.toMatchObject({
      message: expect.stringMatching(/with --skill/) as unknown,
      oclif: { exit: 2 },
    });
    expect(pickNames).not.toHaveBeenCalled();
  });

  it('never prompts under --json, even at a terminal', async () => {
    box.skill('alpha');
    vi.mocked(canPrompt).mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    try {
      await GeminiSkillsInstall.run(['--json']).catch(() => undefined);

      expect(pickNames).not.toHaveBeenCalled();
      const written = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
      expect(JSON.parse(written.trim().split('\n').at(-1) ?? '')).toMatchObject({
        error: { name: 'CliError', exitCode: 2 },
      });
    } finally {
      stderr.mockRestore();
      exit.mockRestore();
    }
  });
});
