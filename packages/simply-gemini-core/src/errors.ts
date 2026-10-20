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

/**
 * Base class for every error this CLI raises deliberately. Commands surface these through
 * oclif's `this.error(message, { exit })` so users get formatted output rather than a stack
 * trace for expected failure modes.
 */
export class CliError extends Error {
  public readonly exitCode: number;

  public constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

/** Missing, malformed, or self-contradictory configuration — including an unreadable registry. */
export class ConfigError extends CliError {
  public constructor(message: string) {
    super(message, 2);
    this.name = 'ConfigError';
  }
}

/**
 * A request named something that is not there: a skill no registered source provides, a skill
 * that is not installed, or a registration id that does not exist. Exit 2, the same as any other
 * usage error, because the fix is always to change the arguments.
 */
export class NotFoundError extends CliError {
  public constructor(message: string) {
    super(message, 2);
    this.name = 'NotFoundError';
  }
}
