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
import { installAgent, type Agent, type SkillAction } from '@simplysf/simply-gemini-core';
import { AgentChangeCommand, agentFlag } from '../../../shared/agent-change.js';

export default class GeminiAgentsInstall extends AgentChangeCommand<typeof GeminiAgentsInstall> {
  public static override readonly summary = 'Install subagents from your registered subagent sources.';
  public static override readonly description =
    'Copies each subagent file to ~/.gemini/agents/<name>.md, where the Gemini CLI loads it from. ' +
    "The name is the `name:` field of the file's front matter, or the file name without `.md`.\n\n" +
    'It is a copy, not a link, so changing the source does not change the installed subagent; run ' +
    'install again with --force to pick up a change. With no --agent, lists every subagent not yet ' +
    'installed, grouped by category, and asks which to install. Naming one that is already installed ' +
    'is reported and skipped unless --force is given. Naming one no registered source provides fails ' +
    'before anything is installed.';

  public static override readonly examples = [
    {
      description: 'Pick from a list of every subagent not yet installed:',
      command: '<%= config.bin %> <%= command.id %>',
    },
    {
      description: 'Install two subagents without being asked:',
      command: '<%= config.bin %> <%= command.id %> --agent code-reviewer --agent test-writer',
    },
    {
      description: 'Reinstall a subagent after its source changed:',
      command: '<%= config.bin %> <%= command.id %> --agent code-reviewer --force',
    },
  ];

  public static override readonly flags = {
    ...agentFlag('install'),
    force: Flags.boolean({
      char: 'f',
      summary: 'Replace subagents that are already installed.',
      description: 'With no --agent, the list then offers installed subagents too.',
      default: false,
    }),
  };

  protected readonly action: SkillAction = 'install';
  protected readonly done = 'installed';

  // eslint-disable-next-line class-methods-use-this -- the subclass hook; it needs no state
  protected async apply(agent: Agent): Promise<void> {
    await installAgent(agent);
  }
}
