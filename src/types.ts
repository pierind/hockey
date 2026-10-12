// Data model agreed in docs/planning-tool-mvp.md. Coordinates are metres on a 60×30 rink, not pixels.
export type Pt = [x: number, y: number]

// Symbols and line styles follow the SIHF «Eishockeysprache» legend (docs/reference/eishockeysprache-symbole.png).
export const SYMBOL_LABELS = {
  offense: 'Offensivspieler/in',
  defense: 'Defensivspieler/in',
  goalie: 'Torhüter/in',
  coach: 'Coach',
  goal: 'Tor',
  puck: 'Puck',
  pucks: 'Mehrere Pucks',
  cone: 'Pylone/Pneu',
  toblerone: 'Toblerone (Raumtrenner)',
} as const
export const ROUTE_LABELS = {
  forward: 'Schlittschuhlaufen vorwärts ohne Puck',
  forwardPuck: 'Schlittschuhlaufen vorwärts mit Puck',
  brake: 'Bremsen',
  backward: 'Schlittschuhlaufen rückwärts ohne Puck',
  backwardPuck: 'Schlittschuhlaufen rückwärts mit Puck',
  sideways: 'Seitwärts verschieben',
  pass: 'Pass',
  shot: 'Schuss',
} as const
// Skating lines are drawn by hand; pass and shot stay straight drags.
export const SKATING: RouteStyle[] = ['forward', 'forwardPuck', 'brake', 'backward', 'backwardPuck', 'sideways']
// Symbols whose direction matters; they get a rotation handle.
export const ROTATABLE: string[] = ['goal', 'toblerone']
export type SymbolKind = keyof typeof SYMBOL_LABELS
export type RouteStyle = keyof typeof ROUTE_LABELS

export type Item =
  | { id: string; kind: SymbolKind; at: Pt; rot?: number; label?: string }
  | { id: string; kind: 'route'; style: RouteStyle; from: Pt; to: Pt; ctrl?: Pt; via?: Pt[] } // via: hand-drawn points between from and to
  | { id: string; kind: 'free'; pts: Pt[] }
  | { id: string; kind: 'text'; at: Pt; text: string }

export type RinkTemplate = 'full' | 'half' | 'zone'
export type Scene = { rink: RinkTemplate; items: Item[] }

export type Drill = {
  id: string
  title: string
  description: string
  keyPoints: string[]
  categories: string[] // Erscheinungsform ids, e.g. 'EF06'
  primary?: string
  elements: string[] // Schlüsselelement ids, e.g. 'A02'
  minutes?: number
  offIce: boolean
  draft: boolean
  scene: Scene
  updatedAt: string
}
export type Collection = { id: string; name: string; description?: string; drillIds: string[] }
export type SessionEntry = { id: string; drill: Drill; minutes: number; notes: string } // drill is a snapshot
export type Session = { id: string; title: string; date?: string; final?: boolean; entries: SessionEntry[] } // final: definitive, otherwise a draft/plan
export type Db = { version: 1; drills: Drill[]; collections: Collection[]; sessions: Session[] }
