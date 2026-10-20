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

type Kind = 'directory' | 'file';

/**
 * Names of the entries in `dir` of one kind, following symbolic links, sorted by name. A missing or
 * unreadable directory has no entries.
 */
async function entries(dir: string, kind: Kind): Promise<string[]> {
  const found = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  const checked = await Promise.all(
    found.map(async (entry) => {
      if (kind === 'directory' ? entry.isDirectory() : entry.isFile()) return entry.name;
      if (!entry.isSymbolicLink()) return undefined;
      const stat = await fs.promises.stat(path.join(dir, entry.name)).catch(() => undefined);
      return (kind === 'directory' ? stat?.isDirectory() : stat?.isFile()) ? entry.name : undefined;
    }),
  );
  return checked.filter((name): name is string => name !== undefined).sort();
}

/** Subdirectories of `dir`, following symbolic links, sorted by name. */
export async function subdirectories(dir: string): Promise<string[]> {
  return entries(dir, 'directory');
}

/** Regular files in `dir`, following symbolic links, sorted by name. */
export async function files(dir: string): Promise<string[]> {
  return entries(dir, 'file');
}
