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
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError, NotFoundError } from '../src/errors.js';
import {
  deregisterAgentSource,
  deregisterSkillSource,
  readRegistry,
  registerAgentSource,
  registerSkillSource,
  registryFile,
  writeRegistry,
} from '../src/registry.js';

let home: string;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'simply-gemini-registry-'));
});

afterEach(() => {
  fs.rmSync(home, { recursive: true, force: true });
});

/** Creates a directory under the temporary home and returns its path. */
function dir(name: string): string {
  const created = path.join(home, name);
  fs.mkdirSync(created, { recursive: true });
  return created;
}

function writeRaw(content: string): void {
  fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
  fs.writeFileSync(registryFile({ home }), content);
}

describe('readRegistry', () => {
  it('reads a missing file as an empty registry', async () => {
    expect(await readRegistry({ home })).toStrictEqual({ registrations: [] });
  });

  it('keeps the file at ~/.gemini/skills-registry.json, where the sf plugin keeps it', () => {
    expect(registryFile({ home })).toBe(path.join(home, '.gemini', 'skills-registry.json'));
  });

  it('refuses malformed JSON rather than treating it as empty, and leaves the file alone', async () => {
    writeRaw('{ not json');

    await expect(readRegistry({ home })).rejects.toBeInstanceOf(ConfigError);
    await expect(registerSkillSource('x', home, undefined, { home })).rejects.toThrow(/not valid JSON/);
    expect(fs.readFileSync(registryFile({ home }), 'utf8')).toBe('{ not json');
  });

  it('refuses a file of the wrong shape', async () => {
    writeRaw(JSON.stringify({ registrations: [{ id: 'a' }] }));

    await expect(readRegistry({ home })).rejects.toThrow(/expected shape/);
  });
});

describe('registerSkillSource', () => {
  it('records an absolute path, the description, and when it was registered', async () => {
    const { entry, replaced } = await registerSkillSource('team', home, 'Team skills', { home });

    expect(entry).toMatchObject({ id: 'team', path: path.resolve(home), description: 'Team skills' });
    expect(Number.isNaN(Date.parse(entry.registeredAt))).toBe(false);
    expect(replaced).toStrictEqual([]);
    expect((await readRegistry({ home })).registrations).toStrictEqual([entry]);
  });

  it('resolves a relative path against the current directory', async () => {
    const absolute = dir('some/dir');
    const { entry } = await registerSkillSource('rel', path.relative(process.cwd(), absolute), undefined, { home });

    expect(entry.path).toBe(absolute);
    expect(entry).not.toHaveProperty('description');
  });

  it('refuses a directory that does not exist, and writes nothing', async () => {
    await expect(registerSkillSource('team', path.join(home, 'missing'), undefined, { home })).rejects.toThrow(
      /is not a directory/,
    );
    expect(fs.existsSync(registryFile({ home }))).toBe(false);
  });

  it('replaces an earlier registration with the same id', async () => {
    await registerSkillSource('team', dir('old'), undefined, { home });
    const { entry, replaced } = await registerSkillSource('team', dir('new'), undefined, { home });

    expect(replaced.map((old) => old.path)).toStrictEqual([path.join(home, 'old')]);
    expect((await readRegistry({ home })).registrations).toStrictEqual([entry]);
  });

  it('replaces an earlier registration of the same directory under another id', async () => {
    await registerSkillSource('first', home, undefined, { home });
    await registerSkillSource('other', dir('elsewhere'), undefined, { home });
    await registerSkillSource('second', home, undefined, { home });

    const ids = (await readRegistry({ home })).registrations.map((entry) => entry.id);
    expect(ids).toStrictEqual(['other', 'second']);
  });

  it('refuses an empty id', async () => {
    await expect(registerSkillSource(' ', home, undefined, { home })).rejects.toBeInstanceOf(ConfigError);
  });
});

describe('deregisterSkillSource', () => {
  it('removes the registration and returns it', async () => {
    await registerSkillSource('a', dir('a'), undefined, { home });
    await registerSkillSource('b', dir('b'), undefined, { home });

    const removed = await deregisterSkillSource('a', { home });

    expect(removed.id).toBe('a');
    expect((await readRegistry({ home })).registrations.map((entry) => entry.id)).toStrictEqual(['b']);
  });

  it('fails on an id that is not registered, naming the ones that are', async () => {
    await registerSkillSource('team', home, undefined, { home });

    const failure = deregisterSkillSource('taem', { home });

    await expect(failure).rejects.toBeInstanceOf(NotFoundError);
    await expect(deregisterSkillSource('taem', { home })).rejects.toThrow(/Registered: team\./);
  });
});

describe('writeRegistry', () => {
  it('leaves no temporary file behind', async () => {
    await writeRegistry({ registrations: [] }, { home });

    expect(fs.readdirSync(path.join(home, '.gemini'))).toStrictEqual(['skills-registry.json']);
  });
});

describe('the subagent registry', () => {
  it('keeps the file at ~/.gemini/agents-registry.json, where the sf plugin keeps it', () => {
    expect(registryFile({ home, kind: 'agents' })).toBe(path.join(home, '.gemini', 'agents-registry.json'));
  });

  it('is separate from the skill registry', async () => {
    const { entry } = await registerAgentSource('agents', dir('agents'), 'Team subagents', { home });
    await registerSkillSource('skills', dir('skills'), undefined, { home });

    expect((await readRegistry({ home, kind: 'agents' })).registrations).toStrictEqual([entry]);
    expect((await readRegistry({ home })).registrations.map((skill) => skill.id)).toStrictEqual(['skills']);
  });

  it('deregisters by id, and names the subagent registry when the id is unknown', async () => {
    await registerAgentSource('team', dir('agents'), undefined, { home });

    await expect(deregisterAgentSource('nope', { home })).rejects.toThrow(/No subagent source is registered as "nope"/);
    expect((await deregisterAgentSource('team', { home })).id).toBe('team');
    expect((await readRegistry({ home, kind: 'agents' })).registrations).toStrictEqual([]);
  });

  it('refuses a malformed file the same way, naming the subagent registry', async () => {
    fs.mkdirSync(path.join(home, '.gemini'), { recursive: true });
    fs.writeFileSync(registryFile({ home, kind: 'agents' }), 'null');

    await expect(readRegistry({ home, kind: 'agents' })).rejects.toThrow(/subagent registry .* expected shape/);
  });
});
