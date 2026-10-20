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

import { uninstallAgent, type Agent, type SkillAction } from '@simplysf/simply-gemini-core';
import { AgentChangeCommand, agentFlag } from '../../../shared/agent-change.js';

export default class GeminiAgentsUninstall extends AgentChangeCommand<typeof GeminiAgentsUninstall> {
  public static override readonly summary = 'Uninstall Gemini subagents.';
  public static override readonly description =
    'Deletes ~/.gemini/agents/<name>.md for each subagent.\n\n' +
    'Any subagent there can be uninstalled, including one no registered source provides. With no ' +
    '--agent, lists every installed subagent and asks which to remove. Naming one a registered source ' +
    'provides but that is not installed is reported and skipped; naming one that is neither installed ' +
    'nor available fails before anything is removed.';

  public static override readonly examples = [
    {
      description: 'Pick from a list of every installed subagent:',
      command: '<%= config.bin %> <%= command.id %>',
    },
    {
      description: 'Uninstall one subagent without being asked:',
      command: '<%= config.bin %> <%= command.id %> --agent code-reviewer',
    },
  ];

  public static override readonly flags = {
    ...agentFlag('uninstall'),
  };

  protected readonly action: SkillAction = 'uninstall';
  protected readonly done = 'uninstalled';

  // eslint-disable-next-line class-methods-use-this -- the subclass hook; it needs no state
  protected async apply(agent: Agent): Promise<void> {
    await uninstallAgent(agent.name);
  }
}
