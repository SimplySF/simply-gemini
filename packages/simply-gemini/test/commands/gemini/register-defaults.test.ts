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
import { agentsDir, MANIFEST_FILE, readRegistry, registerSkillSource } from '@simplysf/simply-gemini-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GeminiAgentsRegister from '../../../src/commands/gemini/agents/register.js';
import GeminiSkillsRegister from '../../../src/commands/gemini/skills/register.js';
import { GeminiCommandError, GeminiNotFoundError, isOnPath, linkSkill } from '../../../src/shared/gemini-cli.js';
import { sandbox, type Sandbox } from '../../helpers.js';

// Only running `gemini`, and looking for it, are replaced. Subagents are copied for real into the
// temporary home.
vi.mock('../../../src/shared/gemini-cli.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/shared/gemini-cli.js')>()),
  isOnPath: vi.fn(),
  linkSkill: vi.fn(),
}));

let box: Sandbox;

beforeEach(() => {
  vi.mocked(isOnPath).mockReset().mockReturnValue(true);
  vi.mocked(linkSkill).mockReset().mockResolvedValue();
  box = sandbox();
});

afterEach(() => {
  box.restore();
  vi.restoreAllMocks();
});

function manifest(dir: string, content: unknown): void {
  fs.writeFileSync(path.join(dir, MANIFEST_FILE), typeof content === 'string' ? content : JSON.stringify(content));
}

describe('gemini skills register, with defaults', () => {
  it('installs the defaults the source lists, and only those', async () => {
    const alpha = box.skill('alpha');
    box.skill('apex/beta');
    box.skill('gamma');
    manifest(box.source, { defaults: ['alpha'] });

    const result = await GeminiSkillsRegister.run(['--id', 'team', '--path', box.source]);

    expect(vi.mocked(linkSkill).mock.calls).toStrictEqual([[alpha]]);
    expect(result.defaults).toStrictEqual({ changed: ['alpha'], skipped: [], unavailable: [] });
  });

  it('skips an installed default and names one the source lacks, without failing', async () => {
    box.skill('alpha');
    box.skill('beta');
    box.install('beta');
    manifest(box.source, { defaults: ['beta', 'alpha', 'typo'] });

    const result = await GeminiSkillsRegister.run(['--id', 'team', '--path', box.source]);

    expect(linkSkill).toHaveBeenCalledOnce();
    expect(result.defaults).toStrictEqual({ changed: ['alpha'], skipped: ['beta'], unavailable: ['typo'] });
  });

  it('does not install a default that an earlier-registered source provides instead', async () => {
    const other = path.join(box.home, '..', 'other');
    fs.mkdirSync(path.join(other, 'shared'), { recursive: true });
    fs.writeFileSync(path.join(other, 'shared', 'SKILL.md'), '');
    await registerSkillSource('first', other, undefined, { home: box.home });
    box.skill('shared');
    manifest(box.source, { defaults: ['shared'] });

    const result = await GeminiSkillsRegister.run(['--id', 'team', '--path', box.source]);

    expect(linkSkill).not.toHaveBeenCalled();
    expect(result.defaults.unavailable).toStrictEqual(['shared']);
  });

  it('installs nothing with --no-install-defaults', async () => {
    box.skill('alpha');
    manifest(box.source, { defaults: ['alpha'] });

    const result = await GeminiSkillsRegister.run(['--id', 'team', '--path', box.source, '--no-install-defaults']);

    expect(linkSkill).not.toHaveBeenCalled();
    expect(result.defaults).toStrictEqual({ changed: [], skipped: [], unavailable: [] });
  });

  it('registers the source, with a warning, when its manifest is malformed', async () => {
    box.skill('alpha');
    manifest(box.source, '{ not json');

    const result = await GeminiSkillsRegister.run(['--id', 'team', '--path', box.source]);

    expect(linkSkill).not.toHaveBeenCalled();
    expect(result.defaults.changed).toStrictEqual([]);
    expect((await readRegistry({ home: box.home })).registrations).toHaveLength(1);
  });

  it('registers the source, with a warning naming the defaults, when gemini is not on PATH', async () => {
    box.skill('alpha');
    box.skill('beta');
    manifest(box.source, { defaults: ['alpha', 'beta'] });
    vi.mocked(isOnPath).mockReturnValue(false);
    const warn = vi.spyOn(GeminiSkillsRegister.prototype, 'warn');

    const result = await GeminiSkillsRegister.run(['--id', 'team', '--path', box.source]);

    expect(linkSkill).not.toHaveBeenCalled();
    expect(result.defaults.changed).toStrictEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/not found on your PATH[\s\S]*alpha, beta[\s\S]*install --skill alpha --skill beta/),
    );
    expect((await readRegistry({ home: box.home })).registrations).toHaveLength(1);
  });

  it('does not look for gemini when there is no default to install', async () => {
    box.skill('alpha');
    box.install('alpha');
    manifest(box.source, { defaults: ['alpha'] });
    vi.mocked(isOnPath).mockReturnValue(false);

    const result = await GeminiSkillsRegister.run(['--id', 'team', '--path', box.source]);

    expect(isOnPath).not.toHaveBeenCalled();
    expect(result.defaults.skipped).toStrictEqual(['alpha']);
  });

  it('keeps the registration and exits 2 when gemini vanishes mid-run, naming the full register command', async () => {
    box.skill('alpha');
    box.skill('beta');
    manifest(box.source, { defaults: ['alpha', 'beta'] });
    vi.mocked(linkSkill).mockRejectedValue(new GeminiNotFoundError('gemini'));

    await expect(
      GeminiSkillsRegister.run(['--id', 'team', '--path', box.source, '--description', 'Team skills']),
    ).rejects.toMatchObject({
      message: expect.stringMatching(
        /not found on your PATH[\s\S]*"team" is registered all the same\. Run `simply gemini skills register --id team --path \S+ --description "Team skills"` again/,
      ) as unknown,
      oclif: { exit: 2 },
    });
    expect(linkSkill).toHaveBeenCalledOnce();
    expect((await readRegistry({ home: box.home })).registrations).toHaveLength(1);
  });

  it('reads a manifest that starts with a BOM', async () => {
    box.skill('alpha');
    manifest(box.source, String.fromCharCode(0xfeff) + `${JSON.stringify({ defaults: ['alpha'] })}`);

    const result = await GeminiSkillsRegister.run(['--id', 'team', '--path', box.source]);

    expect(result.defaults.changed).toStrictEqual(['alpha']);
  });

  it('attempts every default past a failure, then exits 1', async () => {
    box.skill('alpha');
    box.skill('beta');
    manifest(box.source, { defaults: ['alpha', 'beta'] });
    vi.mocked(linkSkill).mockRejectedValueOnce(new GeminiCommandError('refused'));

    await expect(GeminiSkillsRegister.run(['--id', 'team', '--path', box.source])).rejects.toMatchObject({
      message: expect.stringMatching(/Installed 1 of 2 skill\(s\)[\s\S]*alpha: refused/) as unknown,
      oclif: { exit: 1 },
    });
    expect(linkSkill).toHaveBeenCalledTimes(2);
  });
});

describe('gemini agents register, with defaults', () => {
  it('copies the defaults into place, and leaves an outdated one alone', async () => {
    box.agent('reviewer.md');
    box.agent('apex/writer.md');
    box.agent('extra.md');
    const installed = box.installAgent('reviewer', 'an older copy\n');
    manifest(box.agentSource, { defaults: ['writer', 'reviewer', '../escape'] });

    const result = await GeminiAgentsRegister.run(['--id', 'team', '--path', box.agentSource]);

    expect(result.defaults).toStrictEqual({ changed: ['writer'], skipped: ['reviewer'], unavailable: ['../escape'] });
    expect(fs.existsSync(path.join(agentsDir({ home: box.home }), 'writer.md'))).toBe(true);
    expect(fs.existsSync(path.join(agentsDir({ home: box.home }), 'extra.md'))).toBe(false);
    expect(fs.readFileSync(installed, 'utf8')).toBe('an older copy\n');
  });

  it('says how to update an outdated default', async () => {
    box.agent('reviewer.md');
    box.installAgent('reviewer', 'an older copy\n');
    manifest(box.agentSource, { defaults: ['reviewer'] });
    const log = vi.spyOn(GeminiAgentsRegister.prototype, 'log');

    await GeminiAgentsRegister.run(['--id', 'team', '--path', box.agentSource]);

    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/reviewer is installed, but its source has changed[\s\S]*install --agent reviewer --force/),
    );
  });

  it('warns once, not twice, about a default whose file name is unusable', async () => {
    box.agent('My Agent.md');
    manifest(box.agentSource, { defaults: ['My Agent'] });
    const warn = vi.spyOn(GeminiAgentsRegister.prototype, 'warn');

    const result = await GeminiAgentsRegister.run(['--id', 'team', '--path', box.agentSource]);

    expect(result.defaults.unavailable).toStrictEqual(['My Agent']);
    const messages = warn.mock.calls.map(([message]) => String(message));
    expect(messages.filter((message) => message.includes('not a usable subagent name'))).toHaveLength(1);
    expect(messages.some((message) => message.includes('does not provide it'))).toBe(false);
  });

  it('installs nothing with --no-install-defaults', async () => {
    box.agent('reviewer.md');
    manifest(box.agentSource, { defaults: ['reviewer'] });

    const result = await GeminiAgentsRegister.run(['--id', 'team', '--path', box.agentSource, '--no-install-defaults']);

    expect(result.defaults.changed).toStrictEqual([]);
    expect(fs.existsSync(path.join(agentsDir({ home: box.home }), 'reviewer.md'))).toBe(false);
  });
});
