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

import type { Skill, SkillAction } from '@simplysf/simply-gemini-core';
import { uninstallSkill } from '../../../shared/gemini-cli.js';
import { SkillChangeCommand, skillFlag } from '../../../shared/skill-change.js';

export default class GeminiSkillsUninstall extends SkillChangeCommand<typeof GeminiSkillsUninstall> {
  public static override readonly summary = 'Uninstall Gemini skills.';
  public static override readonly description =
    'Runs `gemini skills uninstall` for each skill. The Gemini CLI must be on your PATH.\n\n' +
    'Any skill under ~/.gemini/skills can be uninstalled, including one no registered source ' +
    'provides. With no --skill, lists every installed skill and asks which to remove. Naming a skill ' +
    'a registered source provides but that is not installed is reported and skipped; naming one that ' +
    'is neither installed nor available fails before anything is removed.';

  public static override readonly examples = [
    {
      description: 'Pick from a list of every installed skill:',
      command: '<%= config.bin %> <%= command.id %>',
    },
    {
      description: 'Uninstall one skill without being asked:',
      command: '<%= config.bin %> <%= command.id %> --skill apex-test-generator',
    },
  ];

  public static override readonly flags = {
    ...skillFlag('uninstall'),
  };

  protected readonly action: SkillAction = 'uninstall';
  protected readonly done = 'uninstalled';

  // eslint-disable-next-line class-methods-use-this -- the subclass hook; it needs no state
  protected async apply(skill: Skill): Promise<void> {
    await uninstallSkill(skill.name);
  }
}
