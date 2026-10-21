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

import { Flags, type Command, type Interfaces } from '@oclif/core';
import {
  CliError,
  discoverAgents,
  selectAgents,
  type Agent,
  type AgentDiscovery,
  type SkillAction,
  stripControl,
} from '@simplysf/simply-gemini-core';
import { GeminiCommand } from './base-command.js';
import { canPrompt, pickNames } from './prompt.js';

/** What `agents install` and `agents uninstall` print under `--json`, the same shape as skills. */
export interface AgentChangeResult {
  /** Subagents changed by this run, in the order they were processed. */
  readonly changed: string[];
  /** Named subagents already in the wanted state, so nothing was done for them. */
  readonly skipped: string[];
}

/** The `--agent` flag, worded once so `install` and `uninstall` cannot drift apart. */
export function agentFlag(verb: string): { agent: Interfaces.OptionFlag<string[] | undefined> } {
  return {
    agent: Flags.string({
      char: 'a',
      summary: `Name of a subagent to ${verb}. Repeat the flag for more than one.`,
      description: 'Without it, you are asked to pick from a list, which needs an interactive terminal.',
      multiple: true,
    }),
  };
}

/** Every `gemini agents` command that reads the sources: discovery plus its warnings. */
export abstract class AgentCommand<T extends typeof Command> extends GeminiCommand<T> {
  /**
   * Discovers subagents and warns about what discovery had to leave out: sources whose directory
   * has gone, and files whose name cannot safely become a file under `~/.gemini/agents`.
   */
  protected async discover(): Promise<AgentDiscovery> {
    const discovery = await discoverAgents();
    this.warnMissingSources(discovery.missingSources, 'agents');
    for (const rejected of discovery.rejected) {
      this.warn(
        stripControl(
          `Skipped ${rejected.path} from source "${rejected.source}": "${rejected.name}" is not a usable ` +
            'subagent name. A name is letters, digits, ".", "_" and "-", starting with a letter or digit.',
        ),
      );
    }
    return discovery;
  }
}

/**
 * `agents install` and `agents uninstall`, the same command run in opposite directions, as for
 * skills. A change here is a file copy or delete rather than a `gemini` process, so there is no
 * error that would fail identically for every subagent and stop the run early.
 */
export abstract class AgentChangeCommand<T extends typeof Command> extends AgentCommand<T> {
  protected abstract readonly action: SkillAction;
  /** Past tense of the action, for messages: "installed", "uninstalled". */
  protected abstract readonly done: string;

  private get doneTitle(): string {
    return `${this.done.charAt(0).toUpperCase()}${this.done.slice(1)}`;
  }

  /** Whether `--force` was given. Only `install` has the flag. */
  private get force(): boolean {
    return (this.flags as { force?: boolean }).force === true;
  }

  public async run(): Promise<AgentChangeResult> {
    const { agents } = await this.discover();

    const named = (this.flags as { agent?: string[] }).agent;
    const { targets, skipped } =
      named === undefined ? await this.choose(agents) : selectAgents(agents, named, this.action, { force: this.force });
    for (const agent of skipped) {
      this.logSafe(
        this.action === 'uninstall'
          ? `${agent.name} is not installed; skipping.`
          : agent.outdated
            ? `${agent.name} is installed, but its source has changed since; skipping. Pass --force to update it.`
            : `${agent.name} is already installed; skipping. Pass --force to reinstall it.`,
      );
    }

    const changed = await this.applyAll(targets);
    return { changed, skipped: skipped.map((agent) => agent.name) };
  }

  private async choose(agents: readonly Agent[]): Promise<{ targets: Agent[]; skipped: Agent[] }> {
    const installing = this.action === 'install';
    const candidates = agents.filter((agent) =>
      installing ? agent.source !== undefined && (this.force || !agent.installed) : agent.installed,
    );
    if (candidates.length === 0) {
      this.log(installing ? this.nothingToInstall(agents) : 'No subagents are installed. Nothing to do.');
      return { targets: [], skipped: [] };
    }

    if (this.jsonEnabled() || !canPrompt()) {
      throw new CliError(
        `Name the subagents to ${this.action} with --agent. There is no interactive terminal to ask in` +
          (this.jsonEnabled() ? ' when --json is set.' : '.'),
        2,
      );
    }

    const picked = await pickNames(`Select subagents to ${this.action}:`, candidates, { markInstalled: this.force });
    if (picked === undefined) {
      this.log('Cancelled. Nothing changed.');
      return { targets: [], skipped: [] };
    }
    if (picked.length === 0) this.log('No subagents selected. Nothing changed.');
    return { targets: candidates.filter((agent) => picked.includes(agent.name)), skipped: [] };
  }

  /** Why `install` with no `--agent` has nothing to offer, and what would change that. */
  // eslint-disable-next-line class-methods-use-this -- message building; it needs no state
  private nothingToInstall(agents: readonly Agent[]): string {
    if (!agents.some((agent) => agent.source !== undefined)) {
      return 'No subagents found. Register a directory of them with: simply gemini agents register --id <id> --path <dir>';
    }
    const outdated = agents.filter((agent) => agent.outdated).length;
    if (outdated === 0)
      return 'Every available subagent is already installed. Pass --force to reinstall. Nothing to do.';
    return (
      `Every available subagent is already installed, but ${outdated} of them ` +
      `${outdated === 1 ? 'has' : 'have'} changed in the source since. ` +
      'See them with `simply gemini agents list --outdated`, and update them with --force.'
    );
  }

  /**
   * Applies the action to each subagent in turn, carrying on past a failure so one unreadable file
   * does not strand the rest, then fails the command if anything failed.
   */
  private async applyAll(targets: readonly Agent[]): Promise<string[]> {
    const changed: string[] = [];
    const failed: Array<{ name: string; message: string }> = [];

    for (const agent of targets) {
      try {
        // eslint-disable-next-line no-await-in-loop -- one at a time, so the output reads in order
        await this.apply(agent);
        changed.push(agent.name);
        this.logSafe(`${this.doneTitle} ${agent.name}.`);
      } catch (error) {
        failed.push({ name: agent.name, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (failed.length > 0) {
      const summary = `${this.doneTitle} ${changed.length} of ${targets.length} subagent(s).`;
      const reasons = failed.map(({ name, message }) => `  ${name}: ${message}`).join('\n');
      throw new CliError(`${summary} These failed:\n${reasons}`, 1);
    }
    return changed;
  }

  /** Installs or removes one subagent. */
  protected abstract apply(agent: Agent): Promise<void>;
}
