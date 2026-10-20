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

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigError, NotFoundError } from './errors.js';

/** One registered skill source: a directory that holds skills, under an id the caller chose. */
export interface RegistryEntry {
  readonly id: string;
  readonly path: string;
  readonly description?: string;
  readonly registeredAt: string;
}

export interface Registry {
  registrations: RegistryEntry[];
}

/**
 * Where the Gemini CLI keeps its user-level state. `home` is injectable so a test, or a caller
 * managing someone else's profile, never has to touch the real one.
 */
export interface GeminiHomeOptions {
  readonly home?: string;
}

export function geminiDir(options: GeminiHomeOptions = {}): string {
  return path.join(options.home ?? os.homedir(), '.gemini');
}

/**
 * The registry lives beside Gemini's own state, at the same path and in the same shape the
 * Salesforce `sf gemini skills` plugin uses, so a source registered with either tool is visible
 * to both.
 */
export function registryFile(options: GeminiHomeOptions = {}): string {
  return path.join(geminiDir(options), 'skills-registry.json');
}

function isEntry(value: unknown): value is RegistryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.path === 'string' &&
    typeof entry.registeredAt === 'string' &&
    (entry.description === undefined || typeof entry.description === 'string')
  );
}

/**
 * Reads the registry. A missing file is an empty registry; a file that exists but cannot be
 * understood is an error.
 *
 * The plugin this was ported from read a malformed file as empty, and the next `register` then
 * wrote an empty-plus-one registry over it — silently discarding every other registration. Refusing
 * is the only answer that leaves the file for a person to repair.
 */
export async function readRegistry(options: GeminiHomeOptions = {}): Promise<Registry> {
  const file = registryFile(options);
  let content: string;
  try {
    content = await fs.promises.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { registrations: [] };
    throw new ConfigError(`Could not read the skill registry at ${file}: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new ConfigError(
      `The skill registry at ${file} is not valid JSON (${(error as Error).message}). ` +
        'Fix or delete it; nothing was changed.',
    );
  }

  const registrations = (parsed as { registrations?: unknown }).registrations;
  if (!Array.isArray(registrations) || !registrations.every(isEntry)) {
    throw new ConfigError(
      `The skill registry at ${file} does not have the expected shape ` +
        '({"registrations": [{"id", "path", "registeredAt"}]}). Fix or delete it; nothing was changed.',
    );
  }
  return { registrations };
}

/**
 * Writes the registry through a temporary file and a rename, so an interrupted write leaves the
 * previous registry in place rather than half of a new one.
 */
export async function writeRegistry(registry: Registry, options: GeminiHomeOptions = {}): Promise<void> {
  const file = registryFile(options);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.promises.writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  await fs.promises.rename(temporary, file);
}

export interface RegisterResult {
  readonly entry: RegistryEntry;
  /** Earlier registrations dropped because they had the same id or the same directory. */
  readonly replaced: RegistryEntry[];
}

/**
 * Registers a directory of skills under `id`. An id or a directory can each be registered once,
 * so registering either again replaces the earlier entry rather than scanning the same skills
 * twice. The directory must exist now; one that disappears later is reported by discovery rather
 * than failing it.
 */
export async function registerSkillSource(
  id: string,
  directory: string,
  description?: string,
  options: GeminiHomeOptions = {},
): Promise<RegisterResult> {
  if (id.trim() === '') throw new ConfigError('A registration id cannot be empty.');
  const absolute = path.resolve(directory);
  const stat = await fs.promises.stat(absolute).catch(() => undefined);
  if (!stat?.isDirectory()) throw new ConfigError(`${absolute} is not a directory.`);
  const registry = await readRegistry(options);

  const replaced = registry.registrations.filter((entry) => entry.id === id || entry.path === absolute);
  const entry: RegistryEntry = {
    id,
    path: absolute,
    ...(description === undefined ? {} : { description }),
    registeredAt: new Date().toISOString(),
  };

  registry.registrations = [...registry.registrations.filter((existing) => !replaced.includes(existing)), entry];
  await writeRegistry(registry, options);
  return { entry, replaced };
}

/**
 * Removes the registration with this id and returns it. Naming an id that is not registered is an
 * error rather than a quiet success, because the likeliest cause is a typo, and a typo that
 * reports success leaves the source being scanned.
 */
export async function deregisterSkillSource(id: string, options: GeminiHomeOptions = {}): Promise<RegistryEntry> {
  const registry = await readRegistry(options);
  const removed = registry.registrations.find((entry) => entry.id === id);
  if (removed === undefined) {
    const known = registry.registrations.map((entry) => entry.id);
    throw new NotFoundError(
      `No skill source is registered as "${id}". ` +
        (known.length === 0 ? 'Nothing is registered.' : `Registered: ${known.join(', ')}.`),
    );
  }

  registry.registrations = registry.registrations.filter((entry) => entry !== removed);
  await writeRegistry(registry, options);
  return removed;
}
