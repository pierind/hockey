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
// Altersklassen a drill suits; U18+ covers juniors and adults.
export const AGE_CLASSES = ['U10', 'U12', 'U14', 'U16', 'U18+']
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
  categories: string[] // Erscheinungsform ids, e.g. 'EF05'
  primary?: string
  elements: string[] // Schlüsselelement ids, e.g. 'A02'
  ages?: string[] // see AGE_CLASSES; unset = not classified
  minutes?: number
  players?: number // Spieler/innen needed
  goalies?: number // Torhüter/innen needed
  material?: string
  offIce: boolean
  draft: boolean
  scene: Scene
  source?: string // https link to where an imported drill comes from
  author?: string // the coach for own drills, the federation or site for imported ones
  image?: string // original diagram of an imported drill: https or data:image URL, shown until a scene is drawn
  updatedAt: string
}
export type Collection = { id: string; name: string; description?: string; drillIds: string[] }
// drill is a snapshot. parallel: same Posten-Block as the previous entry (groups rotate through every Posten).
export type SessionEntry = { id: string; drill: Drill; minutes: number; notes: string; parallel?: boolean }
export type Session = { id: string; title: string; date?: string; start?: string /* 'HH:MM' */; final?: boolean; template?: boolean; notes?: string; attendance?: string[] /* present player ids; unset = not recorded */; entries: SessionEntry[] } // final: definitive, otherwise a draft/plan
// lineup: slot id (see LINEUP_SLOTS) -> player id.
export type Game = { id: string; opponent: string; away?: boolean; date?: string; start?: string /* 'HH:MM' */; notes?: string; lineup: Record<string, string> }
export type Player = { id: string; name: string; number?: number; position: 'F' | 'D' | 'G'; group?: string }
// Season plan: one row per phase week, like the SIHF Jahresablauf. trainings: target Schlüsselelemente per planned training.
export type PlanWeek = {
  id: string
  phase: string
  week: number
  month?: string
  monday?: string // first day of the week, 'YYYY-MM-DD'; links the week to real trainings
  special?: string
  trainings: string[][]
  offIce: string[]
  personality: string[]
  notes?: string
  breakAfter?: string // e.g. 'Sommerpause'
}
export type SeasonPlan = { id: string; name: string; weeks: PlanWeek[] }
// players/plans/games are optional so backups from before they existed stay valid.
export type Db = { version: 1; drills: Drill[]; collections: Collection[]; sessions: Session[]; players?: Player[]; plans?: SeasonPlan[]; games?: Game[] }
