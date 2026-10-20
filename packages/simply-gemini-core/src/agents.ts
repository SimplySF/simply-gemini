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
import path from 'node:path';
import { files, subdirectories } from './entries.js';
import { ConfigError, NotFoundError } from './errors.js';
import { readDescription, readFrontMatterField } from './front-matter.js';
import { geminiDir, partitionSources, readRegistry, type GeminiHomeOptions, type RegistryEntry } from './registry.js';
import type { SkillAction } from './skills.js';

/** The extension Gemini loads subagent definitions from. */
export const AGENT_EXTENSION = '.md';

export interface Agent {
  /** From the `name:` front-matter field, or the file name without `.md`. Gemini's id for it. */
  readonly name: string;
  /** The file it is installed from, or the installed file if no source provides it. */
  readonly path: string;
  readonly description?: string;
  readonly installed: boolean;
  /** The folder it sits in when its source groups subagents one level deep. */
  readonly category?: string;
  /** The id of the registered source that provides it; absent for one installed some other way. */
  readonly source?: string;
}

/** A source file that was not listed because its name cannot safely become a file name. */
export interface RejectedAgent {
  readonly name: string;
  readonly path: string;
  readonly source: string;
}

export interface AgentDiscovery {
  readonly agents: Agent[];
  /** Registered sources whose directory no longer exists. */
  readonly missingSources: RegistryEntry[];
  readonly rejected: RejectedAgent[];
}

/** The directory Gemini loads user-level subagents from, one `<name>.md` per subagent. */
export function agentsDir(options: GeminiHomeOptions = {}): string {
  return path.join(geminiDir(options), 'agents');
}

const AGENT_NAME = /^[A-Za-z0-9][\w.-]*$/;

/**
 * Whether a name can become `~/.gemini/agents/<name>.md` without leaving that directory or
 * meaning something else to a shell or a file system. The name comes from a front-matter field
 * someone else wrote, so `name: ../../.bashrc` has to fail here rather than at the copy.
 */
export function isAgentName(name: string): boolean {
  return AGENT_NAME.test(name);
}

export function assertAgentName(name: string): void {
  if (!isAgentName(name)) {
    throw new ConfigError(
      `"${name}" is not a subagent name. A subagent name is letters, digits, ".", "_" and "-", ` +
        'starting with a letter or digit.',
    );
  }
}

function agentFile(name: string, options: GeminiHomeOptions): string {
  return path.join(agentsDir(options), `${name}${AGENT_EXTENSION}`);
}

function isAgentFileName(file: string): boolean {
  const lower = file.toLowerCase();
  return lower.endsWith(AGENT_EXTENSION) && lower !== 'readme.md';
}

function baseName(file: string): string {
  return file.slice(0, -AGENT_EXTENSION.length);
}

interface Found {
  readonly name: string;
  readonly path: string;
  readonly description?: string;
  readonly category?: string;
}

async function readAgentFile(file: string, category?: string): Promise<Found | undefined> {
  const content = await fs.promises.readFile(file, 'utf8').catch(() => undefined);
  if (content === undefined) return undefined;
  const description = readDescription(content);
  return {
    name: readFrontMatterField(content, 'name') ?? baseName(path.basename(file)),
    path: file,
    ...(description === undefined ? {} : { description }),
    ...(category === undefined ? {} : { category }),
  };
}

async function readFolder(dir: string, category?: string): Promise<Found[]> {
  const names = (await files(dir)).filter(isAgentFileName);
  const read = await Promise.all(names.map((name) => readAgentFile(path.join(dir, name), category)));
  return read.filter((found): found is Found => found !== undefined);
}

/**
 * Finds the subagents in one source: the `.md` files directly in it, then those one category folder
 * down. A `README.md` is documentation, not a subagent. Deeper nesting is not searched.
 */
async function scanSource(root: string): Promise<Found[]> {
  const categories = await subdirectories(root);
  const nested = await Promise.all(categories.map((category) => readFolder(path.join(root, category), category)));
  return [...(await readFolder(root)), ...nested.flat()];
}

/**
 * Lists every subagent the registered sources provide, plus any `.md` already in
 * `~/.gemini/agents` that no source provides — so `uninstall` can still reach one whose source was
 * deregistered or which was copied in by hand.
 *
 * Gemini loads a subagent by name, so a name can be installed only once. When two sources provide
 * a name, the one registered first wins; within a source, the file found first does.
 */
export async function discoverAgents(options: GeminiHomeOptions = {}): Promise<AgentDiscovery> {
  const { registrations } = await readRegistry({ ...options, kind: 'agents' });
  const { present: sources, missing: missingSources } = await partitionSources(registrations);

  const installedNames = new Set(
    (await files(agentsDir(options))).filter(isAgentFileName).map(baseName).filter(isAgentName),
  );
  const scanned = await Promise.all(sources.map((entry) => scanSource(entry.path)));

  const agents: Agent[] = [];
  const rejected: RejectedAgent[] = [];
  const seen = new Set<string>();
  for (const [index, found] of scanned.entries()) {
    const source = sources[index].id;
    for (const agent of found) {
      if (!isAgentName(agent.name)) {
        rejected.push({ name: agent.name, path: agent.path, source });
        continue;
      }
      if (seen.has(agent.name)) continue;
      seen.add(agent.name);
      agents.push({ ...agent, installed: installedNames.has(agent.name), source });
    }
  }

  const orphans = [...installedNames].filter((name) => !seen.has(name));
  const orphanAgents = await Promise.all(
    orphans.map(async (name): Promise<Agent> => {
      const file = agentFile(name, options);
      const found = await readAgentFile(file);
      return {
        name,
        path: file,
        ...(found?.description === undefined ? {} : { description: found.description }),
        installed: true,
      };
    }),
  );

  return { agents: [...agents, ...orphanAgents], missingSources, rejected };
}

export interface AgentSelection {
  /** The subagents to act on, in the order they were named. */
  readonly targets: Agent[];
  /** Named subagents already in the wanted state, so there is nothing to do for them. */
  readonly skipped: Agent[];
}

export interface SelectAgentOptions {
  /** Install over a subagent that is already installed, rather than skipping it. */
  readonly force?: boolean;
}

/**
 * Resolves subagent names given on the command line into what to act on, with the same rules as
 * skills: every name is checked before anything changes, and a name already in the wanted state is
 * skipped rather than failed. `force` turns an installed subagent from skipped into a target, which
 * needs a source to copy from.
 */
export function selectAgents(
  agents: readonly Agent[],
  names: readonly string[],
  action: SkillAction,
  { force = false }: SelectAgentOptions = {},
): AgentSelection {
  const byName = new Map(agents.map((agent) => [agent.name, agent]));
  const unique = [...new Set(names)];
  for (const name of unique) assertAgentName(name);

  const unknown = unique.filter((name) => !byName.has(name));
  if (unknown.length > 0) {
    const where =
      action === 'install'
        ? 'No registered subagent source provides it. Run `simply gemini agents list` to see what is available.'
        : 'It is not installed. Run `simply gemini agents list --installed` to see what is.';
    throw new NotFoundError(`Unknown subagent${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. ${where}`);
  }

  const named = unique.map((name) => byName.get(name)!);
  if (action === 'uninstall') {
    return { targets: named.filter((agent) => agent.installed), skipped: named.filter((agent) => !agent.installed) };
  }

  if (force) {
    const sourceless = named.filter((agent) => agent.source === undefined);
    if (sourceless.length > 0) {
      throw new NotFoundError(
        `No registered subagent source provides ${sourceless.map((agent) => agent.name).join(', ')}, ` +
          'so there is nothing to reinstall from.',
      );
    }
    return { targets: named, skipped: [] };
  }
  return { targets: named.filter((agent) => !agent.installed), skipped: named.filter((agent) => agent.installed) };
}

/**
 * Copies a subagent to `~/.gemini/agents/<name>.md`, replacing any file already there.
 *
 * The copy goes to a temporary file beside the target and is renamed over it, so an interrupted
 * install never leaves half a definition for Gemini to load, and a target that is a symbolic link
 * is replaced rather than written through to wherever it points.
 */
export async function installAgent(agent: Agent, options: GeminiHomeOptions = {}): Promise<void> {
  assertAgentName(agent.name);
  if (agent.source === undefined) {
    throw new NotFoundError(`No registered subagent source provides ${agent.name}.`);
  }
  const target = agentFile(agent.name, options);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.promises.copyFile(agent.path, temporary);
    await fs.promises.rename(temporary, target);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true });
    throw error;
  }
}

/** Removes `~/.gemini/agents/<name>.md`. Removing one that is already gone is not an error. */
export async function uninstallAgent(name: string, options: GeminiHomeOptions = {}): Promise<void> {
  assertAgentName(name);
  await fs.promises.rm(agentFile(name, options), { force: true });
}
