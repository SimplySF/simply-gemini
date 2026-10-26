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
import { installAgent, registerAgentSource, stripControl, type RegistryEntry } from '@simplysf/simply-gemini-core';
import { AgentCommand } from '../../../shared/agent-change.js';
import { applyEach } from '../../../shared/apply-each.js';
import {
  installDefaultsFlag,
  installSourceDefaults,
  NO_DEFAULTS,
  type DefaultsResult,
} from '../../../shared/source-defaults.js';

export interface RegisterOutput {
  readonly entry: RegistryEntry;
  readonly replaced: RegistryEntry[];
  /** Subagents now available from this source; zero usually means the wrong directory. */
  readonly agents: number;
  readonly defaults: DefaultsResult;
}

export default class GeminiAgentsRegister extends AgentCommand<typeof GeminiAgentsRegister> {
  public static override readonly summary = 'Register a directory of subagents as a subagent source.';
  public static override readonly description =
    'A subagent source is any directory holding subagent definitions: Markdown files other than ' +
    'README.md, either directly (source/code-reviewer.md) or one level down in a category folder ' +
    '(source/apex/apex-doc-writer.md). Once registered, its subagents appear in `list` and can be ' +
    'installed with `install`.\n\n' +
    'Sources are recorded in ~/.gemini/agents-registry.json, the same file the Salesforce ' +
    '`sf gemini agents` commands use, so a source registered with either tool is visible to both. ' +
    'Registering an id or a directory that is already registered replaces the earlier entry.\n\n' +
    'A source can list subagents everyone should have in a gemini-source.json at its root ' +
    '({"defaults": ["subagent-name", ...]}). Those are installed straight after registering; one that ' +
    'is already installed is left as it is, even if its source has changed. Pass ' +
    '--no-install-defaults to skip them.';

  public static override readonly examples = [
    '<%= config.bin %> <%= command.id %> --id my-team --path ./agents',
    '<%= config.bin %> <%= command.id %> --id @my-org/gemini-agents --path ~/src/gemini-agents --description "Shared team subagents"',
    {
      description: 'Register a source without installing the subagents it lists as defaults:',
      command: '<%= config.bin %> <%= command.id %> --id my-team --path ./agents --no-install-defaults',
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
      summary: 'Directory holding the subagents. A relative path is resolved against the current directory.',
      required: true,
    }),
    description: Flags.string({
      char: 'd',
      summary: 'Short description of the source.',
    }),
    ...installDefaultsFlag('subagents'),
  };

  public async run(): Promise<RegisterOutput> {
    const { entry, replaced } = await registerAgentSource(this.flags.id, this.flags.path, this.flags.description);
    for (const old of replaced) {
      this.logSafe(`Replaced the earlier registration "${old.id}" (${old.path}).`);
    }
    this.logSafe(`Registered subagent source "${entry.id}" at ${entry.path}.`);

    const { agents } = await this.discover();
    const provided = agents.filter((agent) => agent.source === entry.id);
    const log = (line: string): void => this.logSafe(line);
    const defaults = this.flags['install-defaults']
      ? await installSourceDefaults(
          entry,
          agents,
          (targets) => applyEach(targets, (agent) => installAgent(agent), { done: 'installed', noun: 'subagent', log }),
          { kind: 'agents', warn: (message) => this.warn(stripControl(message)), log },
        )
      : NO_DEFAULTS;

    if (provided.length === 0) {
      this.warn(
        'No subagents were found there. A subagent is a .md file other than README.md, directly in the ' +
          'source or one category folder down.',
      );
    } else if (defaults.changed.length === 0) {
      this.log(`${provided.length} subagent(s) available. Install them with: simply gemini agents install`);
    } else {
      const remaining = provided.filter((agent) => !agent.installed).length - defaults.changed.length;
      this.log(
        `Installed ${defaults.changed.length} default subagent(s).` +
          (remaining === 0 ? '' : ` ${remaining} more available: simply gemini agents install`),
      );
    }
    return { entry, replaced, agents: provided.length, defaults };
  }
}
