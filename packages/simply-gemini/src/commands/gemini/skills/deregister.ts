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
import { deregisterSkillSource, type RegistryEntry } from '@simplysf/simply-gemini-core';
import { GeminiCommand } from '../../../shared/base-command.js';

export default class GeminiSkillsDeregister extends GeminiCommand<typeof GeminiSkillsDeregister> {
  public static override readonly summary = 'Stop scanning a registered skill source.';
  public static override readonly description =
    'Removes the source from ~/.gemini/skills-registry.json. Its skills stop appearing as available ' +
    'to install. Skills already installed from it stay installed — uninstall them first if you want ' +
    'them gone, because a linked skill keeps reading from the source directory. Naming an id that is ' +
    'not registered is an error.';

  public static override readonly examples = ['<%= config.bin %> <%= command.id %> --id my-team'];

  public static override readonly flags = {
    id: Flags.string({
      char: 'i',
      summary: 'Id the source was registered under.',
      required: true,
    }),
  };

  public async run(): Promise<RegistryEntry> {
    const removed = await deregisterSkillSource(this.flags.id);
    this.logSafe(`Deregistered skill source "${removed.id}" (${removed.path}).`);
    return removed;
  }
}
