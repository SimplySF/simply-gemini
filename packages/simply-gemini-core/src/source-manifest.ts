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

import fs from 'node:fs';
import path from 'node:path';

/** The file at a source's root that describes the source itself, rather than one skill or subagent. */
export const MANIFEST_FILE = 'gemini-source.json';

export interface SourceManifest {
  /** Names the source's author wants installed for everyone who registers it, deduplicated. */
  readonly defaults: string[];
  /**
   * Why the manifest could not be used, when it exists but is malformed. The source is still
   * usable, so this is something to warn about rather than an error.
   */
  readonly problem?: string;
}

/**
 * Reads `<source>/gemini-source.json`. A missing file is a source with no defaults; one that is not
 * JSON, or whose `defaults` is not an array of strings, is reported as a problem and also has no
 * defaults. Keys other than `defaults` are ignored, so the file can grow without breaking this.
 */
export async function readSourceManifest(sourceDir: string): Promise<SourceManifest> {
  const file = path.join(sourceDir, MANIFEST_FILE);
  let content: string;
  try {
    content = await fs.promises.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { defaults: [] };
    return { defaults: [], problem: `Could not read ${file}: ${(error as Error).message}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return { defaults: [], problem: `${file} is not valid JSON (${(error as Error).message}).` };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { defaults: [], problem: `${file} is not a JSON object.` };
  }
  const defaults = (parsed as { defaults?: unknown }).defaults;
  if (defaults === undefined) return { defaults: [] };
  if (!Array.isArray(defaults) || !defaults.every((name) => typeof name === 'string')) {
    return { defaults: [], problem: `"defaults" in ${file} is not an array of names.` };
  }
  return { defaults: [...new Set(defaults)] };
}

/** A default that will not be installed, because discovery did not find it in its source. */
export interface UnavailableDefault {
  readonly name: string;
  /** The earlier-registered source that provides this name instead, if one does. */
  readonly providedBy?: string;
}

export interface DefaultsResolution<T> {
  /** Defaults to install, in the order the manifest lists them. */
  readonly targets: T[];
  /** Defaults already installed, so there is nothing to do for them. */
  readonly skipped: T[];
  readonly unavailable: UnavailableDefault[];
}

/**
 * Matches a source's default names against what discovery found, for skills or subagents alike.
 *
 * Only what discovery attributes to `sourceId` counts. A name that another source wins — Gemini
 * installs by name, and the source registered first does — is unavailable rather than installed,
 * because installing it would install a different source's skill under the name this one asked for.
 * An installed default is skipped, never replaced: an outdated subagent stays as it is.
 */
export function resolveDefaults<
  T extends { readonly name: string; readonly installed: boolean; readonly source?: string },
>(items: readonly T[], sourceId: string, defaults: readonly string[]): DefaultsResolution<T> {
  const byName = new Map(items.map((item) => [item.name, item]));
  const targets: T[] = [];
  const skipped: T[] = [];
  const unavailable: UnavailableDefault[] = [];

  for (const name of new Set(defaults)) {
    const item = byName.get(name);
    if (item?.source !== sourceId) {
      unavailable.push(item?.source === undefined ? { name } : { name, providedBy: item.source });
    } else if (item.installed) {
      skipped.push(item);
    } else {
      targets.push(item);
    }
  }
  return { targets, skipped, unavailable };
}
