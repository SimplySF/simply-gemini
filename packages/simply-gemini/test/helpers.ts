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
import { registerSkillSource, skillsDir } from '@simplysf/simply-gemini-core';

/**
 * A throwaway home directory with a registered skill source in it. Commands read the home
 * directory through `os.homedir()`, which honours USERPROFILE on Windows and HOME elsewhere, so
 * both are pointed here and put back afterwards.
 */
export interface Sandbox {
  readonly home: string;
  readonly source: string;
  /** Creates `<source>/<relative>/SKILL.md` and returns the skill directory. */
  skill(relative: string): string;
  /** Marks a skill installed the way Gemini does: a directory under ~/.gemini/skills. */
  install(name: string): void;
  register(id?: string): Promise<void>;
  restore(): void;
}

export function sandbox(): Sandbox {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'simply-gemini-cli-'));
  const home = path.join(root, 'home');
  const source = path.join(root, 'source');
  fs.mkdirSync(home);
  fs.mkdirSync(source);

  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  return {
    home,
    source,
    skill(relative: string): string {
      const dir = path.join(source, relative);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\ndescription: ${path.basename(dir)} skill\n---\n`);
      return dir;
    },
    install(name: string): void {
      fs.mkdirSync(path.join(skillsDir({ home }), name), { recursive: true });
    },
    async register(id = 'team'): Promise<void> {
      await registerSkillSource(id, source, undefined, { home });
    },
    restore(): void {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
