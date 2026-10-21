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
 * Reads one top-level scalar field out of a Markdown file's YAML front matter.
 *
 * Only the front matter is searched. The plugin this was ported from matched the first
 * `description:` anywhere in the file, so a skill whose body documented its own front matter could
 * end up described by its example.
 */
export function readFrontMatterField(content: string, key: string): string | undefined {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return undefined;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  const frontMatter = lines.slice(1, end === -1 ? lines.length : end);

  const prefix = `${key}:`;
  const start = frontMatter.findIndex((line) => line.startsWith(prefix));
  if (start === -1) return undefined;
  const value = frontMatter[start].slice(prefix.length).trim();

  // A block scalar (`>` or `|`, optionally with a chomping indicator) continues on the indented
  // lines that follow it. Folding them onto one line is all a listing needs.
  if (/^[>|][+-]?$/.test(value) || value === '') {
    const continuation: string[] = [];
    for (const line of frontMatter.slice(start + 1)) {
      if (!/^\s+\S/.test(line)) break;
      continuation.push(line.trim());
    }
    const folded = continuation.join(' ');
    return folded === '' ? undefined : folded;
  }

  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

/** Reads `description:` out of a `SKILL.md` or subagent file's front matter. */
export function readDescription(content: string): string | undefined {
  return readFrontMatterField(content, 'description');
}
