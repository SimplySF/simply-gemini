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
import process from 'node:process';
import { CliError, stripControlOneLine } from '@simplysf/simply-gemini-core';
import { execa, ExecaError } from 'execa';

/** The Gemini CLI's executable, as `npm install -g @google/gemini-cli` puts it on PATH. */
export const GEMINI_BIN = 'gemini';

/**
 * How long one `gemini` invocation may take. Linking or removing a skill is a filesystem
 * operation; anything still running after this is waiting on a prompt it will never get answered.
 */
export const GEMINI_TIMEOUT_MS = 120_000;

/** How much of gemini's own output an error message quotes. Enough for its message, not its banner. */
const DETAIL_LIMIT = 500;

/** The Gemini CLI is not on PATH. Exit 2: the fix is to the environment, not to the request. */
export class GeminiNotFoundError extends CliError {
  public constructor(bin: string) {
    super(
      `Could not run "${bin}": the Gemini CLI was not found on your PATH. ` +
        'Install it with `npm install -g @google/gemini-cli`, then try again.',
      2,
    );
    this.name = 'GeminiNotFoundError';
  }
}

/** The Gemini CLI ran and refused, or did not finish. */
export class GeminiCommandError extends CliError {
  public constructor(message: string) {
    super(message, 1);
    this.name = 'GeminiCommandError';
  }
}

/** The parts of an execa failure worth quoting. Structural, because `ExecaError`'s generic is `any`. */
interface Failure {
  readonly stderr?: unknown;
  readonly stdout?: unknown;
  readonly shortMessage: string;
}

function detail(error: Failure): string {
  const output = [error.stderr, error.stdout].find((text) => typeof text === 'string' && text.trim() !== '');
  const text = stripControlOneLine(typeof output === 'string' ? output : error.shortMessage);
  return text.length > DETAIL_LIMIT ? `…${text.slice(-DETAIL_LIMIT)}` : text;
}

/** Reads PATH whatever its case: Windows spells it `Path`, and a copied env loses the case-folding. */
function pathVariable(env: NodeJS.ProcessEnv): string {
  return Object.entries(env).find(([key]) => key.toUpperCase() === 'PATH')?.[1] ?? '';
}

/**
 * Whether `bin` names a file that a shell would run: a path to one, or a name found on PATH —
 * with any of PATHEXT's extensions on Windows, where `gemini` is really `gemini.cmd`.
 *
 * Checked before spawning because a missing command does not fail the same way everywhere. On
 * POSIX the spawn reports ENOENT; on Windows execa runs the shim through cmd.exe, which exits 1
 * with "'gemini' is not recognized…" — indistinguishable from gemini itself failing.
 */
export function isOnPath(bin: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const extensions =
    process.platform === 'win32' ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] : [''];
  const isFile = (candidate: string): boolean => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  };

  const directories = /[/\\]/.test(bin) ? [''] : pathVariable(env).split(path.delimiter).filter(Boolean);
  return directories.some((directory) => extensions.some((extension) => isFile(path.join(directory, bin + extension))));
}

/**
 * Runs `gemini <args>`, answering its confirmation prompt.
 *
 * `gemini skills link` and `gemini skills uninstall` both ask before they act. This answers `y`
 * once on stdin and then closes it, so a second, unexpected prompt reads end-of-file and fails
 * rather than hanging; the timeout covers anything that waits anyway.
 *
 * execa rather than `node:child_process`, because on Windows `gemini` is an npm `.cmd` shim, and
 * Node refuses to spawn one without a shell — which would then reinterpret a skill path containing
 * spaces or shell metacharacters.
 */
export async function runGemini(args: readonly string[], bin: string = GEMINI_BIN): Promise<void> {
  if (!isOnPath(bin)) throw new GeminiNotFoundError(bin);
  try {
    await execa(bin, args, { input: 'y\n', timeout: GEMINI_TIMEOUT_MS });
  } catch (error) {
    if (!(error instanceof ExecaError)) throw error;
    if (error.code === 'ENOENT') throw new GeminiNotFoundError(bin);

    const command = stripControlOneLine([bin, ...args].join(' '));
    const how = error.timedOut
      ? `did not finish within ${GEMINI_TIMEOUT_MS / 1000}s`
      : `failed${error.exitCode === undefined ? '' : ` with exit code ${error.exitCode}`}`;
    throw new GeminiCommandError(`\`${command}\` ${how}: ${detail(error)}`);
  }
}

/** Installs a skill by linking Gemini's user skills directory to it. */
export async function linkSkill(skillPath: string): Promise<void> {
  await runGemini(['skills', 'link', skillPath]);
}

/** Removes an installed skill by name. */
export async function uninstallSkill(name: string): Promise<void> {
  await runGemini(['skills', 'uninstall', name]);
}
