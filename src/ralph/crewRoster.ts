import * as fs from 'fs/promises';

/** Planning-layer roles for crew members defined in .ralph/crew.json. */
export type CrewMemberRole = 'planner' | 'implementer' | 'reviewer';

const CREW_MEMBER_ROLES: readonly CrewMemberRole[] = ['planner', 'implementer', 'reviewer'];

export interface CrewMember {
  id: string;
  role: CrewMemberRole;
  goal?: string;
  backstory?: string;
}

export interface CrewRosterParseResult {
  /** Parsed crew members, or null when the file does not exist. */
  members: CrewMember[] | null;
  /** Non-fatal schema warnings. Non-empty when the file exists but is malformed. */
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateCrewMember(item: unknown, index: number): { member: CrewMember | null; warning: string | null } {
  if (!isRecord(item)) {
    return { member: null, warning: `crew.json entry[${index}] is not an object; skipping.` };
  }

  const { id, role, goal, backstory } = item as Record<string, unknown>;

  if (typeof id !== 'string' || !id.trim()) {
    return { member: null, warning: `crew.json entry[${index}] missing required string field "id"; skipping.` };
  }

  if (!CREW_MEMBER_ROLES.includes(role as CrewMemberRole)) {
    return {
      member: null,
      warning: `crew.json entry[${index}] ("${id}") has invalid role "${String(role)}"; expected one of ${CREW_MEMBER_ROLES.join(', ')}; skipping.`
    };
  }

  const member: CrewMember = { id: id.trim(), role: role as CrewMemberRole };

  if (typeof goal === 'string' && goal.trim()) {
    member.goal = goal.trim();
  }
  if (typeof backstory === 'string' && backstory.trim()) {
    member.backstory = backstory.trim();
  }

  return { member, warning: null };
}

/**
 * Reads and validates .ralph/crew.json.
 *
 * Returns `members: null` when the file does not exist (caller should fall back
 * to agentCount-based synthesis). Returns `members: []` with warnings when the
 * file exists but every entry is invalid. Never throws.
 */
export async function parseCrewRoster(crewJsonPath: string): Promise<CrewRosterParseResult> {
  let raw: string;
  try {
    raw = await fs.readFile(crewJsonPath, 'utf8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { members: null, warnings: [] };
    }
    return {
      members: [],
      warnings: [`crew.json could not be read (${(err as Error).message}); falling back to agentCount.`]
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      members: [],
      warnings: ['crew.json is not valid JSON; falling back to agentCount.']
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      members: [],
      warnings: ['crew.json must be a JSON array of crew member objects; falling back to agentCount.']
    };
  }

  const warnings: string[] = [];
  const members: CrewMember[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const { member, warning } = validateCrewMember(parsed[i], i);
    if (warning) {
      warnings.push(warning);
    }
    if (member) {
      members.push(member);
    }
  }

  return { members, warnings };
}
