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

import { CliError } from '@simplysf/simply-gemini-core';

export interface ApplyEachOptions {
  /** Past tense of the action, for messages: "installed", "uninstalled". */
  readonly done: string;
  /** What is being changed, for the failure summary: "skill", "subagent". */
  readonly noun: string;
  /** Logs one line naming an item; the caller strips the third-party text in it. */
  readonly log: (message: string) => void;
  /** An error that would fail identically for every item, so it stops the run rather than repeating. */
  readonly isFatal?: (error: unknown) => boolean;
}

/**
 * Applies a change to each item in turn, carrying on past a failure so one bad item does not strand
 * the rest, then fails with every failure listed. Returns the names changed, in order.
 *
 * Sequential on purpose: every change writes the same directory under `~/.gemini`, and gemini gives
 * no guarantee that two of its invocations running at once would not race.
 */
export async function applyEach<T extends { readonly name: string }>(
  targets: readonly T[],
  apply: (item: T) => Promise<void>,
  { done, noun, log, isFatal = (): boolean => false }: ApplyEachOptions,
): Promise<string[]> {
  const doneTitle = `${done.charAt(0).toUpperCase()}${done.slice(1)}`;
  const changed: string[] = [];
  const failed: Array<{ name: string; message: string }> = [];

  for (const item of targets) {
    try {
      // eslint-disable-next-line no-await-in-loop -- one at a time; see the doc comment above
      await apply(item);
      changed.push(item.name);
      log(`${doneTitle} ${item.name}.`);
    } catch (error) {
      if (isFatal(error)) throw error;
      failed.push({ name: item.name, message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (failed.length > 0) {
    const summary = `${doneTitle} ${changed.length} of ${targets.length} ${noun}(s).`;
    const reasons = failed.map(({ name, message }) => `  ${name}: ${message}`).join('\n');
    throw new CliError(`${summary} These failed:\n${reasons}`, 1);
  }
  return changed;
}
