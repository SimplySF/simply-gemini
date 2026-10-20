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

import process from 'node:process';
import { groupMultiselect, isCancel } from '@clack/prompts';
import { groupByCategory, stripControlOneLine, type Skill } from '@simplysf/simply-gemini-core';

/** How much of a description the picker shows as a hint beside the focused skill. */
const HINT_LIMIT = 80;

/**
 * Whether there is a person to ask. Both ends must be a terminal: a prompt drawn onto a pipe
 * corrupts whatever is reading it, and a prompt reading from one waits forever.
 */
export function canPrompt(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function hint(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  const text = stripControlOneLine(description);
  return text.length > HINT_LIMIT ? `${text.slice(0, HINT_LIMIT - 1)}…` : text;
}

/**
 * Asks which of `skills` to act on, grouped by category. Returns the chosen names, or `undefined`
 * if the person cancelled — which is different from choosing nothing, and reported differently.
 */
export async function pickSkills(message: string, skills: readonly Skill[]): Promise<string[] | undefined> {
  const options: Record<string, Array<{ value: string; label: string; hint?: string }>> = {};
  for (const [category, members] of groupByCategory(skills)) {
    options[stripControlOneLine(category)] = members.map((skill) => {
      const shown = hint(skill.description);
      return { value: skill.name, label: stripControlOneLine(skill.name), ...(shown ? { hint: shown } : {}) };
    });
  }

  const picked = await groupMultiselect({ message, options, required: false });
  return isCancel(picked) ? undefined : picked;
}
