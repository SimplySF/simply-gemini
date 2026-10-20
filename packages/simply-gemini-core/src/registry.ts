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

/** One registered source: a directory that holds skills or subagents, under an id the caller chose. */
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

/** Skills and subagents are registered separately, each in a file of its own. */
export type RegistryKind = 'skills' | 'agents';

export interface RegistryOptions extends GeminiHomeOptions {
  /** Which registry to use. Defaults to `skills`. */
  readonly kind?: RegistryKind;
}

const KINDS: Record<RegistryKind, { readonly file: string; readonly noun: string }> = {
  skills: { file: 'skills-registry.json', noun: 'skill' },
  agents: { file: 'agents-registry.json', noun: 'subagent' },
};

export function geminiDir(options: GeminiHomeOptions = {}): string {
  return path.join(options.home ?? os.homedir(), '.gemini');
}

/**
 * The registries live beside Gemini's own state, at the same paths and in the same shape the
 * Salesforce `sf gemini` plugin uses, so a source registered with either tool is visible to both.
 */
export function registryFile(options: RegistryOptions = {}): string {
  return path.join(geminiDir(options), KINDS[options.kind ?? 'skills'].file);
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
 * Reads a registry. A missing file is an empty registry; a file that exists but cannot be
 * understood is an error.
 *
 * The plugin this was ported from read a malformed file as empty, and the next `register` then
 * wrote an empty-plus-one registry over it — silently discarding every other registration. Refusing
 * is the only answer that leaves the file for a person to repair.
 */
export async function readRegistry(options: RegistryOptions = {}): Promise<Registry> {
  const file = registryFile(options);
  const { noun } = KINDS[options.kind ?? 'skills'];
  let content: string;
  try {
    content = await fs.promises.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { registrations: [] };
    throw new ConfigError(`Could not read the ${noun} registry at ${file}: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new ConfigError(
      `The ${noun} registry at ${file} is not valid JSON (${(error as Error).message}). ` +
        'Fix or delete it; nothing was changed.',
    );
  }

  const registrations = (parsed as { registrations?: unknown } | null)?.registrations;
  if (!Array.isArray(registrations) || !registrations.every(isEntry)) {
    throw new ConfigError(
      `The ${noun} registry at ${file} does not have the expected shape ` +
        '({"registrations": [{"id", "path", "registeredAt"}]}). Fix or delete it; nothing was changed.',
    );
  }
  return { registrations };
}

/**
 * Writes a registry through a temporary file and a rename, so an interrupted write leaves the
 * previous registry in place rather than half of a new one.
 */
export async function writeRegistry(registry: Registry, options: RegistryOptions = {}): Promise<void> {
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
 * Registers a directory under `id` in one registry. An id or a directory can each be registered
 * once, so registering either again replaces the earlier entry rather than scanning the same
 * directory twice. The directory must exist now; one that disappears later is reported by discovery
 * rather than failing it.
 */
async function registerSource(
  kind: RegistryKind,
  id: string,
  directory: string,
  description: string | undefined,
  options: GeminiHomeOptions,
): Promise<RegisterResult> {
  if (id.trim() === '') throw new ConfigError('A registration id cannot be empty.');
  const absolute = path.resolve(directory);
  const stat = await fs.promises.stat(absolute).catch(() => undefined);
  if (!stat?.isDirectory()) throw new ConfigError(`${absolute} is not a directory.`);
  const registry = await readRegistry({ ...options, kind });

  const replaced = registry.registrations.filter((entry) => entry.id === id || entry.path === absolute);
  const entry: RegistryEntry = {
    id,
    path: absolute,
    ...(description === undefined ? {} : { description }),
    registeredAt: new Date().toISOString(),
  };

  registry.registrations = [...registry.registrations.filter((existing) => !replaced.includes(existing)), entry];
  await writeRegistry(registry, { ...options, kind });
  return { entry, replaced };
}

/**
 * Removes the registration with this id from one registry and returns it. Naming an id that is not
 * registered is an error rather than a quiet success, because the likeliest cause is a typo, and a
 * typo that reports success leaves the source being scanned.
 */
async function deregisterSource(kind: RegistryKind, id: string, options: GeminiHomeOptions): Promise<RegistryEntry> {
  const registry = await readRegistry({ ...options, kind });
  const removed = registry.registrations.find((entry) => entry.id === id);
  if (removed === undefined) {
    const known = registry.registrations.map((entry) => entry.id);
    throw new NotFoundError(
      `No ${KINDS[kind].noun} source is registered as "${id}". ` +
        (known.length === 0 ? 'Nothing is registered.' : `Registered: ${known.join(', ')}.`),
    );
  }

  registry.registrations = registry.registrations.filter((entry) => entry !== removed);
  await writeRegistry(registry, { ...options, kind });
  return removed;
}

/** Registers a directory of skills under `id`, in `~/.gemini/skills-registry.json`. */
export async function registerSkillSource(
  id: string,
  directory: string,
  description?: string,
  options: GeminiHomeOptions = {},
): Promise<RegisterResult> {
  return registerSource('skills', id, directory, description, options);
}

/** Removes a skill source by id. */
export async function deregisterSkillSource(id: string, options: GeminiHomeOptions = {}): Promise<RegistryEntry> {
  return deregisterSource('skills', id, options);
}

/** Registers a directory of subagents under `id`, in `~/.gemini/agents-registry.json`. */
export async function registerAgentSource(
  id: string,
  directory: string,
  description?: string,
  options: GeminiHomeOptions = {},
): Promise<RegisterResult> {
  return registerSource('agents', id, directory, description, options);
}

/** Removes a subagent source by id. */
export async function deregisterAgentSource(id: string, options: GeminiHomeOptions = {}): Promise<RegistryEntry> {
  return deregisterSource('agents', id, options);
}

/**
 * Splits sources into those whose directory exists and those that are gone, so a caller can scan
 * the first and say why the second's contents vanished.
 */
export async function partitionSources(
  registrations: readonly RegistryEntry[],
): Promise<{ present: RegistryEntry[]; missing: RegistryEntry[] }> {
  const exists = await Promise.all(
    registrations.map(async (entry) => {
      const stat = await fs.promises.stat(entry.path).catch(() => undefined);
      return stat?.isDirectory() === true;
    }),
  );
  return {
    present: registrations.filter((_, index) => exists[index]),
    missing: registrations.filter((_, index) => !exists[index]),
  };
}
