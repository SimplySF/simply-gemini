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
import { agentsDir } from '@simplysf/simply-gemini-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GeminiAgentsInstall from '../../../../src/commands/gemini/agents/install.js';
import { canPrompt, pickNames } from '../../../../src/shared/prompt.js';
import { sandbox, type Sandbox } from '../../../helpers.js';

// Only asking a person is replaced. Installing is a file copy, so it runs for real against a
// temporary home directory, and the tests read what landed there.
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

function installed(): string[] {
  return fs.existsSync(agentsDir({ home: box.home })) ? fs.readdirSync(agentsDir({ home: box.home })).sort() : [];
}

function installedContent(name: string): string {
  return fs.readFileSync(path.join(agentsDir({ home: box.home }), `${name}.md`), 'utf8');
}

describe('gemini agents install --agent', () => {
  it('copies each named subagent into ~/.gemini/agents', async () => {
    const reviewer = box.agent('reviewer.md');
    box.agent('apex/apex-doc.md');

    const result = await GeminiAgentsInstall.run(['--agent', 'reviewer', '-a', 'apex-doc']);

    expect(result).toStrictEqual({ changed: ['reviewer', 'apex-doc'], skipped: [] });
    expect(installed()).toStrictEqual(['apex-doc.md', 'reviewer.md']);
    expect(installedContent('reviewer')).toBe(fs.readFileSync(reviewer, 'utf8'));
  });

  it('skips an installed subagent, and replaces it with --force', async () => {
    box.agent('reviewer.md');
    box.installAgent('reviewer', 'old\n');

    expect(await GeminiAgentsInstall.run(['-a', 'reviewer'])).toStrictEqual({ changed: [], skipped: ['reviewer'] });
    expect(installedContent('reviewer')).toBe('old\n');

    expect(await GeminiAgentsInstall.run(['-a', 'reviewer', '--force'])).toStrictEqual({
      changed: ['reviewer'],
      skipped: [],
    });
    expect(installedContent('reviewer')).not.toBe('old\n');
  });

  it('says when a skipped subagent is outdated, and only then', async () => {
    box.agent('stale.md');
    box.agent('current.md');
    box.installAgent('stale', 'old\n');
    await GeminiAgentsInstall.run(['-a', 'current']);
    const log = vi.spyOn(GeminiAgentsInstall.prototype, 'log');

    try {
      await GeminiAgentsInstall.run(['-a', 'stale', '-a', 'current']);

      const lines = log.mock.calls.map(([line]) => String(line));
      expect(lines).toContain(
        'stale is installed, but its source has changed since; skipping. Pass --force to update it.',
      );
      expect(lines).toContain('current is already installed; skipping. Pass --force to reinstall it.');
    } finally {
      log.mockRestore();
    }
  });

  it('fails with exit 2 on an unknown subagent, before installing anything', async () => {
    box.agent('reviewer.md');

    await expect(GeminiAgentsInstall.run(['-a', 'reviewer', '-a', 'nope'])).rejects.toMatchObject({
      message: expect.stringMatching(/Unknown subagent: nope/) as unknown,
      oclif: { exit: 2 },
    });
    expect(installed()).toStrictEqual([]);
  });

  it('fails with exit 2 on a name that is not a file name', async () => {
    await expect(GeminiAgentsInstall.run(['-a', '../escape'])).rejects.toMatchObject({ oclif: { exit: 2 } });
  });

  it('carries on past a subagent that cannot be copied, then fails naming it', async () => {
    const broken = box.agent('broken.md');
    box.agent('fine.md');
    const copy = fs.promises.copyFile.bind(fs.promises);
    const spy = vi.spyOn(fs.promises, 'copyFile').mockImplementation(async (from, to, mode) => {
      if (from === broken) throw new Error('disk on fire');
      return copy(from, to, mode);
    });

    try {
      await expect(GeminiAgentsInstall.run(['-a', 'broken', '-a', 'fine'])).rejects.toMatchObject({
        message: expect.stringMatching(
          /Installed 1 of 2 subagent\(s\)\. These failed:\n\s+broken: disk on fire/,
        ) as unknown,
        oclif: { exit: 1 },
      });
      expect(installed()).toStrictEqual(['fine.md']);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('gemini agents install, choosing interactively', () => {
  it('offers only subagents that are not installed, and installs what was picked', async () => {
    box.agent('alpha.md');
    box.agent('beta.md');
    box.agent('gamma.md');
    box.installAgent('alpha');
    vi.mocked(canPrompt).mockReturnValue(true);
    vi.mocked(pickNames).mockResolvedValue(['beta']);

    const result = await GeminiAgentsInstall.run([]);

    expect(vi.mocked(pickNames).mock.calls[0][1].map((agent) => agent.name)).toStrictEqual(['beta', 'gamma']);
    expect(result).toStrictEqual({ changed: ['beta'], skipped: [] });
  });

  it('offers installed subagents too with --force, marked as installed', async () => {
    box.agent('alpha.md');
    box.agent('beta.md');
    box.installAgent('alpha');
    box.installAgent('hand-made');
    vi.mocked(canPrompt).mockReturnValue(true);
    vi.mocked(pickNames).mockResolvedValue([]);

    await GeminiAgentsInstall.run(['--force']);

    const [, offered, options] = vi.mocked(pickNames).mock.calls[0];
    // hand-made has no source, so there is nothing to reinstall it from.
    expect(offered.map((agent) => agent.name)).toStrictEqual(['alpha', 'beta']);
    expect(options).toStrictEqual({ markInstalled: true });
  });

  it('changes nothing when the picker is cancelled', async () => {
    box.agent('alpha.md');
    vi.mocked(canPrompt).mockReturnValue(true);
    vi.mocked(pickNames).mockResolvedValue(undefined);

    expect(await GeminiAgentsInstall.run([])).toStrictEqual({ changed: [], skipped: [] });
    expect(installed()).toStrictEqual([]);
  });

  it('does not prompt when everything is already installed', async () => {
    box.agent('alpha.md');
    box.installAgent('alpha');
    vi.mocked(canPrompt).mockReturnValue(true);

    await GeminiAgentsInstall.run([]);

    expect(pickNames).not.toHaveBeenCalled();
  });

  it('points at outdated subagents when nothing is left to install', async () => {
    box.agent('alpha.md');
    box.installAgent('alpha', 'old\n');
    vi.mocked(canPrompt).mockReturnValue(true);
    const log = vi.spyOn(GeminiAgentsInstall.prototype, 'log');

    try {
      await GeminiAgentsInstall.run([]);

      expect(log).toHaveBeenCalledWith(expect.stringMatching(/but 1 of them has changed in the source since/));
      expect(pickNames).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('refuses with exit 2, rather than hanging, when there is no terminal to ask in', async () => {
    box.agent('alpha.md');

    await expect(GeminiAgentsInstall.run([])).rejects.toMatchObject({
      message: expect.stringMatching(/with --agent/) as unknown,
      oclif: { exit: 2 },
    });
    expect(pickNames).not.toHaveBeenCalled();
  });
});
