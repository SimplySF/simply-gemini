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
import { GeminiCommandError, GeminiNotFoundError, isOnPath, runGemini } from '../../src/shared/gemini-cli.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'simply-gemini-bin-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('isOnPath', () => {
  // How npm installs a CLI on each platform: a .cmd shim on Windows, a bare file elsewhere.
  const shim = process.platform === 'win32' ? 'gemini.cmd' : 'gemini';

  it('finds a command in a PATH directory', () => {
    fs.writeFileSync(path.join(dir, shim), '');

    expect(isOnPath('gemini', { PATH: dir })).toBe(true);
  });

  it('reads PATH whatever its case', () => {
    fs.writeFileSync(path.join(dir, shim), '');

    expect(isOnPath('gemini', { Path: dir })).toBe(true);
  });

  it('does not find a command that is not there', () => {
    expect(isOnPath('gemini', { PATH: dir })).toBe(false);
    expect(isOnPath('gemini', {})).toBe(false);
  });

  it('checks a path to an executable directly', () => {
    expect(isOnPath(process.execPath, {})).toBe(true);
  });
});

/**
 * These run Node itself in place of gemini, so the real spawn path is exercised — argument
 * passing, the answer on stdin, exit codes, and output capture — without gemini being installed.
 */
describe('runGemini', () => {
  const node = process.execPath;

  it('answers the confirmation prompt with y on stdin, then closes it', async () => {
    const out = path.join(dir, 'stdin.txt');
    await runGemini(['-e', `require('fs').writeFileSync(${JSON.stringify(out)}, require('fs').readFileSync(0))`], node);

    expect(fs.readFileSync(out, 'utf8')).toBe('y\n');
  });

  it('passes an argument containing spaces as one argument', async () => {
    const out = path.join(dir, 'argv.json');
    await runGemini(
      ['-e', `require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(1)))`, 'a b & c'],
      node,
    );

    expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toStrictEqual(['a b & c']);
  });

  it("fails with gemini's own error output and its exit code", async () => {
    const failure = runGemini(['-e', "process.stderr.write('Skill not found: x'); process.exit(3)"], node);

    await expect(failure).rejects.toBeInstanceOf(GeminiCommandError);
    await expect(
      runGemini(['-e', "process.stderr.write('Skill not found: x'); process.exit(3)"], node),
    ).rejects.toThrow(/failed with exit code 3: Skill not found: x/);
  });

  it('fails with exit 2 and an install hint when the command is not on PATH', async () => {
    const failure = runGemini(['skills', 'list'], 'gemini-that-does-not-exist-anywhere');

    await expect(failure).rejects.toBeInstanceOf(GeminiNotFoundError);
    await expect(runGemini([], 'gemini-that-does-not-exist-anywhere')).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringMatching(/npm install -g @google\/gemini-cli/) as unknown,
    });
  });
});
