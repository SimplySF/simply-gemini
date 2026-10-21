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
import {
  agentsDir,
  assertAgentName,
  discoverAgents,
  installAgent,
  isAgentName,
  selectAgents,
  uninstallAgent,
  type Agent,
} from '../src/agents.js';
import { ConfigError, NotFoundError } from '../src/errors.js';
import { registerAgentSource } from '../src/registry.js';

let root: string;
let home: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'simply-gemini-agents-'));
  home = path.join(root, 'home');
  fs.mkdirSync(home);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Writes `<root>/<relative>` with the given front matter, and returns its path. */
function agent(relative: string, frontMatter: Record<string, string> = {}, body = 'You review code.\n'): string {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fields = Object.entries(frontMatter).map(([key, value]) => `${key}: ${value}\n`);
  fs.writeFileSync(file, fields.length === 0 ? body : `---\n${fields.join('')}---\n${body}`);
  return file;
}

function install(name: string, content = 'installed\n'): string {
  const file = path.join(agentsDir({ home }), `${name}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function names(agents: readonly Agent[]): string[] {
  return agents.map((found) => found.name);
}

describe('isAgentName', () => {
  it('accepts single file names', () => {
    for (const name of ['reviewer', 'code-reviewer', 'apex_doc', 'v1.2', 'A1']) expect(isAgentName(name)).toBe(true);
  });

  it('refuses anything that could leave ~/.gemini/agents or hide', () => {
    for (const name of ['', '.', '..', '../x', 'a/b', String.raw`a\b`, '.hidden', '-flag', 'has space']) {
      expect(isAgentName(name)).toBe(false);
    }
    expect(() => assertAgentName('../x')).toThrow(ConfigError);
  });
});

describe('discoverAgents', () => {
  it('finds nothing when nothing is registered', async () => {
    expect(await discoverAgents({ home })).toStrictEqual({ agents: [], missingSources: [], rejected: [] });
  });

  it('finds flat and categorized files, and skips READMEs and other files', async () => {
    const flat = agent('src/reviewer.md', { name: 'reviewer', description: 'Reviews code.' });
    const nested = agent('src/apex/apex-doc.md', { description: 'Writes ApexDoc.' });
    agent('src/README.md');
    agent('src/apex/readme.MD');
    agent('src/notes.txt');
    agent('src/apex/deeper/too-deep.md');
    await registerAgentSource('team', path.join(root, 'src'), undefined, { home });

    const { agents } = await discoverAgents({ home });

    expect(agents).toStrictEqual([
      { name: 'reviewer', path: flat, description: 'Reviews code.', installed: false, outdated: false, source: 'team' },
      {
        name: 'apex-doc',
        path: nested,
        description: 'Writes ApexDoc.',
        category: 'apex',
        installed: false,
        outdated: false,
        source: 'team',
      },
    ]);
  });

  it('names a subagent from its front matter, falling back to the file name', async () => {
    agent('src/file-name.md', { name: 'front-matter-name' });
    agent('src/no-front-matter.md');
    await registerAgentSource('team', path.join(root, 'src'), undefined, { home });

    expect(names((await discoverAgents({ home })).agents)).toStrictEqual(['front-matter-name', 'no-front-matter']);
  });

  it('reads a multi-line description, and ignores a name: line in the body', async () => {
    agent('src/a.md', { description: '>\n  First line\n  second line' }, 'name: not-this\n');
    await registerAgentSource('team', path.join(root, 'src'), undefined, { home });

    const [found] = (await discoverAgents({ home })).agents;

    expect(found).toMatchObject({ name: 'a', description: 'First line second line' });
  });

  it('rejects a name that would escape ~/.gemini/agents, and reports it', async () => {
    const bad = agent('src/evil.md', { name: '../../.bashrc' });
    agent('src/good.md');
    await registerAgentSource('team', path.join(root, 'src'), undefined, { home });

    const { agents, rejected } = await discoverAgents({ home });

    expect(names(agents)).toStrictEqual(['good']);
    expect(rejected).toStrictEqual([{ name: '../../.bashrc', path: bad, source: 'team' }]);
  });

  it('marks installed subagents, and lists installed ones no source provides', async () => {
    agent('src/a.md');
    agent('src/b.md');
    install('b');
    const orphan = install('hand-made', '---\ndescription: Copied in by hand.\n---\n');
    await registerAgentSource('team', path.join(root, 'src'), undefined, { home });

    const { agents } = await discoverAgents({ home });

    expect(agents.map((found) => [found.name, found.installed, found.source])).toStrictEqual([
      ['a', false, 'team'],
      ['b', true, 'team'],
      ['hand-made', true, undefined],
    ]);
    expect(agents[2]).toMatchObject({ path: orphan, description: 'Copied in by hand.' });
  });

  it('marks an installed subagent outdated when its source file has changed since', async () => {
    agent('src/same.md');
    const changed = agent('src/changed.md');
    agent('src/absent.md');
    await registerAgentSource('team', path.join(root, 'src'), undefined, { home });
    for (const found of (await discoverAgents({ home })).agents) {
      // eslint-disable-next-line no-await-in-loop -- two small copies; order does not matter
      if (found.name !== 'absent') await installAgent(found, { home });
    }
    install('hand-made');
    fs.appendFileSync(changed, 'A new instruction.\n');

    const { agents } = await discoverAgents({ home });

    expect(agents.map((found) => [found.name, found.installed, found.outdated])).toStrictEqual([
      ['absent', false, false],
      ['changed', true, true],
      ['same', true, false],
      ['hand-made', true, false],
    ]);
  });

  it('lets the first registered source win a name, and the first file within a source', async () => {
    const first = agent('one/reviewer.md');
    agent('one/apex/reviewer.md');
    agent('two/reviewer.md');
    await registerAgentSource('one', path.join(root, 'one'), undefined, { home });
    await registerAgentSource('two', path.join(root, 'two'), undefined, { home });

    const { agents } = await discoverAgents({ home });

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ path: first, source: 'one' });
  });

  it('reports a source whose directory has gone', async () => {
    const dir = path.join(root, 'gone');
    fs.mkdirSync(dir);
    await registerAgentSource('gone', dir, undefined, { home });
    fs.rmSync(dir, { recursive: true });

    const { agents, missingSources } = await discoverAgents({ home });

    expect(agents).toStrictEqual([]);
    expect(missingSources.map((entry) => entry.id)).toStrictEqual(['gone']);
  });
});

describe('selectAgents', () => {
  const available: Agent = { name: 'a', path: '/s/a.md', installed: false, outdated: false, source: 'team' };
  const installed: Agent = { name: 'b', path: '/s/b.md', installed: true, outdated: false, source: 'team' };
  const orphan: Agent = { name: 'c', path: '/h/c.md', installed: true, outdated: false };
  const all = [available, installed, orphan];

  it('installs what is not installed and skips what is', () => {
    expect(selectAgents(all, ['a', 'b', 'a'], 'install')).toStrictEqual({ targets: [available], skipped: [installed] });
  });

  it('reinstalls an installed subagent with force', () => {
    expect(selectAgents(all, ['a', 'b'], 'install', { force: true })).toStrictEqual({
      targets: [available, installed],
      skipped: [],
    });
  });

  it('refuses to force-install a subagent no source provides', () => {
    expect(() => selectAgents(all, ['c'], 'install', { force: true })).toThrow(/nothing to reinstall from/);
  });

  it('uninstalls what is installed, including one no source provides, and skips the rest', () => {
    expect(selectAgents(all, ['b', 'c', 'a'], 'uninstall')).toStrictEqual({
      targets: [installed, orphan],
      skipped: [available],
    });
  });

  it('fails on an unknown or unsafe name before selecting anything', () => {
    expect(() => selectAgents(all, ['a', 'nope'], 'install')).toThrow(NotFoundError);
    expect(() => selectAgents(all, ['../a'], 'uninstall')).toThrow(ConfigError);
  });
});

describe('installAgent and uninstallAgent', () => {
  it('copies the file to ~/.gemini/agents/<name>.md, named from its front matter', async () => {
    const file = agent('src/file-name.md', { name: 'reviewer' });
    await registerAgentSource('team', path.join(root, 'src'), undefined, { home });
    const [found] = (await discoverAgents({ home })).agents;

    await installAgent(found, { home });

    const target = path.join(agentsDir({ home }), 'reviewer.md');
    expect(fs.readFileSync(target, 'utf8')).toBe(fs.readFileSync(file, 'utf8'));
    expect(fs.readdirSync(agentsDir({ home }))).toStrictEqual(['reviewer.md']);
  });

  it('replaces an installed file', async () => {
    const file = agent('src/reviewer.md', {}, 'new version\n');
    install('reviewer', 'old version\n');

    await installAgent({ name: 'reviewer', path: file, installed: true, outdated: false, source: 'team' }, { home });

    expect(fs.readFileSync(path.join(agentsDir({ home }), 'reviewer.md'), 'utf8')).toBe('new version\n');
  });

  it('replaces a symbolic link rather than writing through it', async (context) => {
    const file = agent('src/reviewer.md', {}, 'new version\n');
    const elsewhere = path.join(root, 'elsewhere.md');
    fs.writeFileSync(elsewhere, 'do not touch\n');
    const target = path.join(agentsDir({ home }), 'reviewer.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      fs.symlinkSync(elsewhere, target, 'file');
    } catch {
      context.skip(); // Windows without Developer Mode cannot create one
    }

    await installAgent({ name: 'reviewer', path: file, installed: true, outdated: false, source: 'team' }, { home });

    expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('new version\n');
    expect(fs.readFileSync(elsewhere, 'utf8')).toBe('do not touch\n');
  });

  it('refuses a subagent with no source or an unsafe name', async () => {
    await expect(
      installAgent({ name: 'c', path: '/h/c.md', installed: true, outdated: false }, { home }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      installAgent(
        { name: '../x', path: agent('src/x.md'), installed: false, outdated: false, source: 'team' },
        { home },
      ),
    ).rejects.toThrow(ConfigError);
  });

  it('removes the installed file, and treats one already gone as done', async () => {
    const file = install('reviewer');

    await uninstallAgent('reviewer', { home });
    await uninstallAgent('reviewer', { home });

    expect(fs.existsSync(file)).toBe(false);
  });
});
