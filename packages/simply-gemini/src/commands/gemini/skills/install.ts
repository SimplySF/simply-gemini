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
import { linkSkill } from '../../../shared/gemini-cli.js';
import { SkillChangeCommand, skillFlag } from '../../../shared/skill-change.js';

export default class GeminiSkillsInstall extends SkillChangeCommand<typeof GeminiSkillsInstall> {
  public static override readonly summary = 'Install skills from your registered skill sources.';
  public static override readonly description =
    'Runs `gemini skills link` for each skill, so Gemini reads it from its source directory rather ' +
    'than from a copy: a `git pull` in the source updates the installed skill. The Gemini CLI must be ' +
    'on your PATH.\n\n' +
    'With no --skill, lists every skill that is not yet installed, grouped by category, and asks which ' +
    'to install. Naming a skill that is already installed is not an error; it is reported and skipped. ' +
    'Naming one no registered source provides fails before anything is installed.';

  public static override readonly examples = [
    {
      description: 'Pick from a list of every skill not yet installed:',
      command: '<%= config.bin %> <%= command.id %>',
    },
    {
      description: 'Install two skills without being asked:',
      command: '<%= config.bin %> <%= command.id %> --skill apex-test-generator --skill lwc-reviewer',
    },
  ];

  public static override readonly flags = {
    ...skillFlag('install'),
  };

  protected readonly action: SkillAction = 'install';
  protected readonly done = 'installed';

  // eslint-disable-next-line class-methods-use-this -- the subclass hook; it needs no state
  protected async apply(skill: Skill): Promise<void> {
    await linkSkill(skill.path);
  }
}
