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

import { describe, expect, it } from 'vitest';
import { formatTable, skillColumns } from '../src/output.js';

describe('formatTable', () => {
  it('renders nothing for no rows', () => {
    expect(formatTable([], skillColumns)).toBe('');
  });

  it('aligns columns and shows a missing value as an em dash', () => {
    const table = formatTable([{ name: 'alpha', path: '/a', installed: true, source: 'team' }], skillColumns);

    expect(table.split('\n')).toStrictEqual([
      'NAME   INSTALLED  CATEGORY  SOURCE  DESCRIPTION',
      '─────  ─────────  ────────  ──────  ───────────',
      'alpha  yes        —         team    —',
    ]);
  });

  it('strips control characters and newlines a skill author put in a description', () => {
    const table = formatTable(
      [{ name: 'x', path: '/x', installed: false, description: 'line one\n\u001b[2Kline two' }],
      skillColumns,
    );

    expect(table.split('\n')[2]).toMatch(/line one \[2Kline two$/);
  });
});
