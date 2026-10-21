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

// The public surface of this package. Anything not exported here is internal and can change
// freely; removing or renaming anything that is exported here is a breaking change, and
// test/index.test.ts pins the list so that cannot happen by accident.

export {
  AGENT_EXTENSION,
  agentsDir,
  assertAgentName,
  discoverAgents,
  installAgent,
  selectAgents,
  uninstallAgent,
  type Agent,
  type AgentDiscovery,
  type AgentSelection,
  type RejectedAgent,
  type SelectAgentOptions,
} from './agents.js';
export { CliError, ConfigError, NotFoundError } from './errors.js';
export { readDescription } from './front-matter.js';
export { agentColumns, formatTable, skillColumns, type Column } from './output.js';
export {
  deregisterAgentSource,
  deregisterSkillSource,
  geminiDir,
  readRegistry,
  registerAgentSource,
  registerSkillSource,
  registryFile,
  writeRegistry,
  type GeminiHomeOptions,
  type RegisterResult,
  type Registry,
  type RegistryEntry,
  type RegistryKind,
  type RegistryOptions,
} from './registry.js';
export {
  DEFAULT_CATEGORY,
  SKILL_FILE,
  assertSkillName,
  discoverSkills,
  groupByCategory,
  selectSkills,
  skillsDir,
  type Discovery,
  type Selection,
  type Skill,
  type SkillAction,
} from './skills.js';
export { stripControl, stripControlOneLine } from './text.js';
