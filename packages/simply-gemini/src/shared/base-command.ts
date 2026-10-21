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

import process from 'node:process';
import { Command, type Interfaces } from '@oclif/core';
import { CliError, stripControl, type RegistryEntry, type RegistryKind } from '@simplysf/simply-gemini-core';

export type GeminiFlags<T extends typeof Command> = Interfaces.InferredFlags<T['flags']>;
export type CommandArgs<T extends typeof Command> = Interfaces.InferredArgs<T['args']>;

/** Names the failure for a machine reader: our own errors keep their class name. */
function errorName(error: unknown, oclifExit: number | undefined): string {
  if (error instanceof CliError) return error.name;
  return oclifExit === undefined ? 'Error' : 'UsageError';
}

/**
 * Everything every command shares: `--json` (oclif prints whatever `run()` returns, verbatim),
 * and turning failures into stable exit codes without letting anything reach stdout.
 */
export abstract class GeminiCommand<T extends typeof Command> extends Command {
  public static override enableJsonFlag = true;

  protected args!: CommandArgs<T>;
  protected flags!: GeminiFlags<T>;

  public override async init(): Promise<void> {
    await super.init();
    const { args, flags } = await this.parse({
      flags: this.ctor.flags,
      baseFlags: this.ctor.baseFlags,
      enableJsonFlag: this.ctor.enableJsonFlag,
      args: this.ctor.args,
      strict: this.ctor.strict,
    });
    this.args = args as CommandArgs<T>;
    this.flags = flags as GeminiFlags<T>;
  }

  /**
   * Turns any failure into one compact, machine-readable line on stderr plus a stable exit
   * code, and never lets a failure reach stdout.
   *
   * oclif's default `--json` error path serializes its whole parse context to stdout, which a
   * caller capturing stdout would then read as a result. Exit codes stay identical with and
   * without `--json`: 2 for configuration or usage, 1 for everything else.
   */
  protected override async catch(error: Interfaces.CommandError): Promise<unknown> {
    // oclif attaches its own exit code to usage errors; reuse it so --json and plain runs agree.
    const oclifExit = (error as { oclif?: { exit?: number } }).oclif?.exit;
    const exitCode = error instanceof CliError ? error.exitCode : (oclifExit ?? 1);
    // Error text can quote a skill name or gemini's own output, both of which are third-party.
    const message = stripControl(error.message);

    if (this.jsonEnabled()) {
      // Written straight to the stream: oclif silences this.log/logToStderr under --json.
      process.stderr.write(`${JSON.stringify({ error: { name: errorName(error, oclifExit), message, exitCode } })}\n`);
      this.exit(exitCode);
    }

    if (error instanceof CliError) {
      this.error(message, { exit: exitCode, code: error.name });
    }
    const sanitised = new Error(message);
    Object.assign(sanitised, { oclif: { exit: exitCode } });
    return super.catch(sanitised);
  }

  /**
   * Logs a line that contains third-party text. Skill names come from directory names and
   * descriptions from `SKILL.md` files, both written by whoever published the skill source, so
   * control characters are stripped before anything reaches the terminal.
   */
  protected logSafe(message: string): void {
    this.log(stripControl(message));
  }

  /**
   * Says which registered sources were skipped because their directory is gone. Without this a
   * moved or deleted checkout makes its skills or subagents silently disappear from every listing.
   */
  protected warnMissingSources(missing: readonly RegistryEntry[], kind: RegistryKind = 'skills'): void {
    const noun = kind === 'skills' ? 'Skill' : 'Subagent';
    for (const entry of missing) {
      this.warn(
        stripControl(
          `${noun} source "${entry.id}" is registered at ${entry.path}, which no longer exists. ` +
            `Re-register it, or remove it with: simply gemini ${kind} deregister --id ${entry.id}`,
        ),
      );
    }
  }
}
