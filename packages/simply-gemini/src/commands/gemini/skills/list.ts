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

import { Flags } from '@oclif/core';
import { discoverSkills, formatTable, skillColumns, type Skill } from '@simplysf/simply-gemini-core';
import { GeminiCommand } from '../../../shared/base-command.js';

export default class GeminiSkillsList extends GeminiCommand<typeof GeminiSkillsList> {
  public static override readonly summary = 'List skills from your registered sources, and what is installed.';
  public static override readonly description =
    'Shows every skill the registered sources provide, and every skill installed under ' +
    '~/.gemini/skills — including one installed some other way, which is listed with no source. ' +
    'When two sources provide a skill with the same name, the source registered first wins, because ' +
    'Gemini installs a skill under its name and can hold only one of them.';

  public static override readonly examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --available',
    '<%= config.bin %> <%= command.id %> --installed --json',
  ];

  public static override readonly flags = {
    installed: Flags.boolean({
      summary: 'List only installed skills.',
      exclusive: ['available'],
      default: false,
    }),
    available: Flags.boolean({
      summary: 'List only skills that are not yet installed.',
      exclusive: ['installed'],
      default: false,
    }),
  };

  public async run(): Promise<Skill[]> {
    const { skills, missingSources } = await discoverSkills();
    this.warnMissingSources(missingSources);

    const shown = skills.filter(
      (skill) => (!this.flags.installed || skill.installed) && (!this.flags.available || !skill.installed),
    );
    if (shown.length === 0) {
      this.log(
        skills.length === 0
          ? 'No skills found. Register a directory of skills with: simply gemini skills register --id <id> --path <dir>'
          : 'No skills matched.',
      );
      return shown;
    }

    this.logSafe(formatTable(shown, skillColumns));
    return shown;
  }
}
