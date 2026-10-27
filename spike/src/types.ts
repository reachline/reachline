// The model as the views use it, built by data.ts.

export const SECTIONS = ['locations', 'devices', 'states', 'secrets', 'services', 'data', 'accounts'] as const;
export type Section = (typeof SECTIONS)[number];

// An element of an access set: an id, "?" (unknown), or a list meaning any-of.
export type Elem = string | Elem[];
export type AndSet = Elem[];

export interface Thing {
  section: Section;
  in: string[];
  needs: string[];
  access: AndSet[];
  recovery: AndSet[];
  mirrors: { of: string; by: string } | null;
  note?: string;
  todo?: string;
  critical?: boolean;
  sensitive?: boolean;
}

export interface Why {
  kind: 'start' | 'state' | 'in' | 'access' | 'recovery';
  via?: string | AndSet;
}

export interface Scenario {
  kind: 'lockout' | 'breach';
  note?: string;
  lost?: string[];
  attacker?: string[];
  assume?: string[];
  deny?: string[];
  start: string[];
  gone: string[];
  reach: Record<string, { assumptions: string[]; why: Why }>;
  rows: Record<string, string>;
}

export interface Model {
  things: Record<string, Thing>;
  scenarios: Record<string, Scenario>;
  me: string[];
  states: string[];
}
