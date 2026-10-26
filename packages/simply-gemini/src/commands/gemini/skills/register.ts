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
import {
  discoverSkills,
  readSourceManifest,
  registerSkillSource,
  stripControl,
  type RegistryEntry,
  type Skill,
} from '@simplysf/simply-gemini-core';
import { GeminiCommand } from '../../../shared/base-command.js';
import { GEMINI_BIN, isOnPath, linkSkill } from '../../../shared/gemini-cli.js';
import { applySkills } from '../../../shared/skill-change.js';
import {
  closingHint,
  installDefaultsFlag,
  installSourceDefaults,
  NO_DEFAULTS,
  type DefaultsResult,
} from '../../../shared/source-defaults.js';

export interface RegisterOutput {
  readonly entry: RegistryEntry;
  readonly replaced: RegistryEntry[];
  /** Skills now available from this source; zero usually means the wrong directory. */
  readonly skills: number;
  readonly defaults: DefaultsResult;
}

export default class GeminiSkillsRegister extends GeminiCommand<typeof GeminiSkillsRegister> {
  public static override readonly summary = 'Register a directory of skills as a skill source.';
  public static override readonly description =
    'A skill source is any directory whose subdirectories hold a SKILL.md, either directly ' +
    '(source/my-skill/SKILL.md) or one level down in a category folder (source/apex/my-skill/SKILL.md). ' +
    'Once registered, its skills appear in `list` and can be installed with `install`.\n\n' +
    'Sources are recorded in ~/.gemini/skills-registry.json, the same file the Salesforce ' +
    '`sf gemini skills` plugin uses, so a source registered with either tool is visible to both. ' +
    'Registering an id or a directory that is already registered replaces the earlier entry.\n\n' +
    'A source can list skills everyone should have in a gemini-source.json at its root ' +
    '({"defaults": ["skill-name", ...]}). Those are installed straight after registering, which needs ' +
    'the Gemini CLI on your PATH; without it they are left uninstalled with a warning. Pass ' +
    '--no-install-defaults to skip them.';

  public static override readonly examples = [
    '<%= config.bin %> <%= command.id %> --id my-team --path ./skills',
    '<%= config.bin %> <%= command.id %> --id @my-org/gemini-skills --path ~/src/gemini-skills --description "Shared team skills"',
    {
      description: 'Register a source without installing the skills it lists as defaults:',
      command: '<%= config.bin %> <%= command.id %> --id my-team --path ./skills --no-install-defaults',
    },
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
    ...installDefaultsFlag('skills'),
  };

  public async run(): Promise<RegisterOutput> {
    const { entry, replaced } = await registerSkillSource(this.flags.id, this.flags.path, this.flags.description);
    for (const old of replaced) {
      this.logSafe(`Replaced the earlier registration "${old.id}" (${old.path}).`);
    }
    this.logSafe(`Registered skill source "${entry.id}" at ${entry.path}.`);

    const [{ skills, missingSources }, manifest] = await Promise.all([
      discoverSkills(),
      this.flags['install-defaults'] ? readSourceManifest(entry.path) : undefined,
    ]);
    this.warnMissingSources(missingSources);
    const provided = skills.filter((skill) => skill.source === entry.id);
    const log = (line: string): void => this.logSafe(line);
    const defaults =
      manifest === undefined
        ? NO_DEFAULTS
        : await installSourceDefaults(entry, manifest, skills, (targets) => this.installDefaults(targets), {
            kind: 'skills',
            warn: (message) => this.warn(stripControl(message)),
            log,
          });

    if (provided.length === 0) {
      this.warn(
        'No skills were found there. A skill is a directory holding a SKILL.md, directly under the ' +
          'source or one category folder down.',
      );
    } else {
      this.log(closingHint('skills', provided, defaults));
    }
    return { entry, replaced, skills: provided.length, defaults };
  }

  /**
   * Links the defaults through `gemini`. Without `gemini` on PATH they are left for later with a
   * warning rather than failing: until this flag existed `register` never needed gemini, and a
   * script running it on a machine without the Gemini CLI should not start failing because the
   * source's author added a manifest.
   */
  private async installDefaults(targets: Skill[]): Promise<string[]> {
    if (targets.length > 0 && !isOnPath(GEMINI_BIN)) {
      const names = targets.map((skill) => skill.name);
      this.warn(
        stripControl(
          `The Gemini CLI was not found on your PATH, so ${names.length} default skill(s) were not installed: ` +
            `${names.join(', ')}. Install it with \`npm install -g @google/gemini-cli\`, then run: ` +
            `simply gemini skills install ${names.map((name) => `--skill ${name}`).join(' ')}`,
        ),
      );
      return [];
    }
    return applySkills(
      targets,
      (skill) => linkSkill(skill.path),
      'installed',
      (line) => this.logSafe(line),
    );
  }
}
