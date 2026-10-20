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
import { discoverSkills, registerSkillSource, type RegistryEntry } from '@simplysf/simply-gemini-core';
import { GeminiCommand } from '../../../shared/base-command.js';

export interface RegisterOutput {
  readonly entry: RegistryEntry;
  readonly replaced: RegistryEntry[];
  /** Skills now available from this source; zero usually means the wrong directory. */
  readonly skills: number;
}

export default class GeminiSkillsRegister extends GeminiCommand<typeof GeminiSkillsRegister> {
  public static override readonly summary = 'Register a directory of skills as a skill source.';
  public static override readonly description =
    'A skill source is any directory whose subdirectories hold a SKILL.md, either directly ' +
    '(source/my-skill/SKILL.md) or one level down in a category folder (source/apex/my-skill/SKILL.md). ' +
    'Once registered, its skills appear in `list` and can be installed with `install`.\n\n' +
    'Sources are recorded in ~/.gemini/skills-registry.json, the same file the Salesforce ' +
    '`sf gemini skills` plugin uses, so a source registered with either tool is visible to both. ' +
    'Registering an id or a directory that is already registered replaces the earlier entry.';

  public static override readonly examples = [
    '<%= config.bin %> <%= command.id %> --id my-team --path ./skills',
    '<%= config.bin %> <%= command.id %> --id @my-org/gemini-skills --path ~/src/gemini-skills --description "Shared team skills"',
  ];

  public static override readonly flags = {
    id: Flags.string({
      char: 'i',
      summary: 'Unique id for the source. Used to deregister it, and shown as SOURCE in `list`.',
      required: true,
    }),
    path: Flags.directory({
      char: 'p',
      summary: 'Directory holding the skills. A relative path is resolved against the current directory.',
      required: true,
    }),
    description: Flags.string({
      char: 'd',
      summary: 'Short description of the source.',
    }),
  };

  public async run(): Promise<RegisterOutput> {
    const { entry, replaced } = await registerSkillSource(this.flags.id, this.flags.path, this.flags.description);
    for (const old of replaced) {
      this.logSafe(`Replaced the earlier registration "${old.id}" (${old.path}).`);
    }
    this.logSafe(`Registered skill source "${entry.id}" at ${entry.path}.`);

    const { skills } = await discoverSkills();
    const provided = skills.filter((skill) => skill.source === entry.id).length;
    if (provided === 0) {
      this.warn(
        'No skills were found there. A skill is a directory holding a SKILL.md, directly under the ' +
          'source or one category folder down.',
      );
    } else {
      this.log(`${provided} skill(s) available. Install them with: simply gemini skills install`);
    }
    return { entry, replaced, skills: provided };
  }
}
