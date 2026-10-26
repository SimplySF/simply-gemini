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

import { Flags, type Interfaces } from '@oclif/core';
import {
  CliError,
  MANIFEST_FILE,
  readSourceManifest,
  resolveDefaults,
  type RegistryEntry,
  type RegistryKind,
} from '@simplysf/simply-gemini-core';

/** What `register` prints under `--json` about the source's defaults. */
export interface DefaultsResult {
  /** Defaults installed by this run, in the order the manifest lists them. */
  readonly changed: string[];
  /** Defaults that were already installed. */
  readonly skipped: string[];
  /** Defaults the source does not provide, or that another source provides instead. */
  readonly unavailable: string[];
}

export const NO_DEFAULTS: DefaultsResult = { changed: [], skipped: [], unavailable: [] };

/** The `--[no-]install-defaults` flag, worded once so the two `register` commands cannot drift. */
export function installDefaultsFlag(noun: string): {
  'install-defaults': Interfaces.BooleanFlag<boolean>;
} {
  return {
    'install-defaults': Flags.boolean({
      summary: `Install the ${noun} the source lists as defaults.`,
      description:
        `A source lists its defaults in ${MANIFEST_FILE} at its root. Pass --no-install-defaults to ` +
        'register the source without installing anything.',
      default: true,
      allowNo: true,
    }),
  };
}

export interface InstallDefaultsOptions {
  readonly kind: RegistryKind;
  /** Both receive text quoting the source; the caller prints it through its own stripping. */
  readonly warn: (message: string) => void;
  readonly log: (message: string) => void;
}

/**
 * Installs the defaults a just-registered source lists in its manifest. A manifest that cannot be
 * read, or a name the source does not provide, is warned about and never fails the command: the
 * registration is valid, and refusing it would leave the rest of the source unusable.
 *
 * An install failure does fail it, with a note that the source is registered regardless, so
 * running `register` again finishes the job.
 */
export async function installSourceDefaults<
  T extends { readonly name: string; readonly installed: boolean; readonly source?: string },
>(
  entry: RegistryEntry,
  items: readonly T[],
  install: (targets: T[]) => Promise<string[]>,
  { kind, warn, log }: InstallDefaultsOptions,
): Promise<DefaultsResult> {
  const manifest = await readSourceManifest(entry.path);
  if (manifest.problem !== undefined) {
    warn(`${manifest.problem} No defaults were installed.`);
    return NO_DEFAULTS;
  }

  const noun = kind === 'skills' ? 'skill' : 'subagent';
  const { targets, skipped, unavailable } = resolveDefaults(items, entry.id, manifest.defaults);
  for (const { name, providedBy } of unavailable) {
    warn(
      providedBy === undefined
        ? `Default ${noun} "${name}" was not installed: source "${entry.id}" does not provide it.`
        : `Default ${noun} "${name}" was not installed: source "${providedBy}", registered earlier, ` +
            'provides that name instead.',
    );
  }
  for (const item of skipped) log(`${item.name} is already installed; skipping.`);

  let changed: string[];
  try {
    changed = await install(targets);
  } catch (error) {
    if (error instanceof CliError) {
      // Kept as the same error, so its class name and exit code still reach a --json reader.
      error.message =
        `${error.message}\nThe source "${entry.id}" is registered all the same. ` +
        `Run \`simply gemini ${kind} register\` again to retry its defaults.`;
    }
    throw error;
  }
  return {
    changed,
    skipped: skipped.map((item) => item.name),
    unavailable: unavailable.map(({ name }) => name),
  };
}
