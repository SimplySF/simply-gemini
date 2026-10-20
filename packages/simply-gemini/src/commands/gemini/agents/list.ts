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
import { agentColumns, formatTable, type Agent } from '@simplysf/simply-gemini-core';
import { AgentCommand } from '../../../shared/agent-change.js';

export default class GeminiAgentsList extends AgentCommand<typeof GeminiAgentsList> {
  public static override readonly summary = 'List subagents from your registered sources, and what is installed.';
  public static override readonly description =
    'Shows every subagent the registered sources provide, and every subagent installed under ' +
    '~/.gemini/agents — including one copied there some other way, which is listed with no source. ' +
    'When two sources provide a subagent with the same name, the source registered first wins, because ' +
    'Gemini loads a subagent by its name and can hold only one of them.';

  public static override readonly examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --available',
    '<%= config.bin %> <%= command.id %> --installed --json',
  ];

  public static override readonly flags = {
    installed: Flags.boolean({
      summary: 'List only installed subagents.',
      exclusive: ['available'],
      default: false,
    }),
    available: Flags.boolean({
      summary: 'List only subagents that are not yet installed.',
      exclusive: ['installed'],
      default: false,
    }),
  };

  public async run(): Promise<Agent[]> {
    const { agents } = await this.discover();

    const shown = agents.filter(
      (agent) => (!this.flags.installed || agent.installed) && (!this.flags.available || !agent.installed),
    );
    if (shown.length === 0) {
      this.log(
        agents.length === 0
          ? 'No subagents found. Register a directory of them with: simply gemini agents register --id <id> --path <dir>'
          : 'No subagents matched.',
      );
      return shown;
    }

    this.logSafe(formatTable(shown, agentColumns));
    return shown;
  }
}
