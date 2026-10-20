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
import { CliError, discoverSkills, selectSkills, type Skill, type SkillAction } from '@simplysf/simply-gemini-core';
import { GeminiCommand } from './base-command.js';
import { GeminiNotFoundError } from './gemini-cli.js';
import { canPrompt, pickNames } from './prompt.js';

/** What `install` and `uninstall` print under `--json`. */
export interface SkillChangeResult {
  /** Skills changed by this run, in the order they were processed. */
  readonly changed: string[];
  /** Named skills already in the wanted state, so nothing was done for them. */
  readonly skipped: string[];
}

/** The `--skill` flag, worded once so `install` and `uninstall` cannot drift apart. */
export function skillFlag(verb: string): { skill: Interfaces.OptionFlag<string[] | undefined> } {
  return {
    skill: Flags.string({
      char: 's',
      summary: `Name of a skill to ${verb}. Repeat the flag for more than one.`,
      description: 'Without it, you are asked to pick from a list, which needs an interactive terminal.',
      multiple: true,
    }),
  };
}

/**
 * `install` and `uninstall` are the same command run in opposite directions: find the skills that
 * are not yet in the wanted state, choose some — by flag or by picker — and run one `gemini`
 * command per skill. Subclasses supply the direction and the command.
 */
export abstract class SkillChangeCommand<T extends typeof Command> extends GeminiCommand<T> {
  protected abstract readonly action: SkillAction;
  /** Past tense of the action, for messages: "installed", "uninstalled". */
  protected abstract readonly done: string;

  private get doneTitle(): string {
    return `${this.done.charAt(0).toUpperCase()}${this.done.slice(1)}`;
  }

  public async run(): Promise<SkillChangeResult> {
    const { skills, missingSources } = await discoverSkills();
    this.warnMissingSources(missingSources);

    const named = (this.flags as { skill?: string[] }).skill;
    const { targets, skipped } =
      named === undefined ? await this.choose(skills) : selectSkills(skills, named, this.action);
    for (const skill of skipped) this.logSafe(`${skill.name} is already ${this.done}; skipping.`);

    const changed = await this.applyAll(targets);
    return { changed, skipped: skipped.map((skill) => skill.name) };
  }

  private async choose(skills: readonly Skill[]): Promise<{ targets: Skill[]; skipped: Skill[] }> {
    const wanted = this.action === 'install';
    const candidates = skills.filter((skill) => skill.installed !== wanted);
    if (candidates.length === 0) {
      this.log(
        wanted
          ? 'Every available skill is already installed. Nothing to do.'
          : 'No skills are installed. Nothing to do.',
      );
      return { targets: [], skipped: [] };
    }

    if (this.jsonEnabled() || !canPrompt()) {
      throw new CliError(
        `Name the skills to ${this.action} with --skill. There is no interactive terminal to ask in` +
          (this.jsonEnabled() ? ' when --json is set.' : '.'),
        2,
      );
    }

    const picked = await pickNames(`Select skills to ${this.action}:`, candidates);
    if (picked === undefined) {
      this.log('Cancelled. Nothing changed.');
      return { targets: [], skipped: [] };
    }
    if (picked.length === 0) this.log('No skills selected. Nothing changed.');
    return { targets: candidates.filter((skill) => picked.includes(skill.name)), skipped: [] };
  }

  /**
   * Applies the action to each skill in turn, carrying on past a failure so one bad skill does not
   * strand the rest, then fails the command if anything failed.
   *
   * Sequential on purpose: every invocation writes to the same `~/.gemini/skills` directory, and
   * gemini gives no guarantee that two of them running at once would not race.
   *
   * A missing `gemini` is the exception: it would fail identically for every skill, so it stops
   * the run at once rather than producing one copy of the same error per skill.
   */
  private async applyAll(targets: readonly Skill[]): Promise<string[]> {
    const changed: string[] = [];
    const failed: Array<{ name: string; message: string }> = [];

    for (const skill of targets) {
      try {
        // eslint-disable-next-line no-await-in-loop -- one at a time; see the doc comment above
        await this.apply(skill);
        changed.push(skill.name);
        this.logSafe(`${this.doneTitle} ${skill.name}.`);
      } catch (error) {
        if (error instanceof GeminiNotFoundError) throw error;
        failed.push({ name: skill.name, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (failed.length > 0) {
      const summary = `${this.doneTitle} ${changed.length} of ${targets.length} skill(s).`;
      const reasons = failed.map(({ name, message }) => `  ${name}: ${message}`).join('\n');
      throw new CliError(`${summary} These failed:\n${reasons}`, 1);
    }
    return changed;
  }

  /** Runs the gemini command for one skill. */
  protected abstract apply(skill: Skill): Promise<void>;
}
