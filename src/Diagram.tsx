import type { ComponentProps, PointerEvent } from 'react'
import { Rink } from './Rink'
import { dist, mid } from './scene'
import { ROTATABLE, ROUTE_LABELS, SYMBOL_LABELS } from './types'
import type { Item, Pt, RouteStyle, Scene, SymbolKind } from './types'

// All sizes are metres in rink coordinates. Black only: the legend must not depend on colour.
const INK = '#111'
const SELECT = '#1a73e8'
const r2 = (v: number) => Math.round(v * 100) / 100
const pts = (ps: Pt[]) => ps.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')
type Route = { from: Pt; to: Pt; ctrl?: Pt; via?: Pt[] }
// Centre line of a route: the hand-drawn points (smoothed) or the quadratic curve, every ~5 cm.
function routeLine({ from, to, ctrl = mid(from, to), via }: Route): Pt[] {
  if (via) return densify(chaikin(chaikin(soften([from, ...via, to]))))
  const n = Math.max(2, Math.ceil((dist(from, ctrl) + dist(ctrl, to)) / 0.05))
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n
    const v = 1 - u
    return [v * v * from[0] + 2 * v * u * ctrl[0] + u * u * to[0], v * v * from[1] + 2 * v * u * ctrl[1] + u * u * to[1]] as Pt
  })
}
const routePath = (r: Route) => (r.via ? `M${[r.from, ...r.via, r.to].join(' L')}` : `M${r.from} Q${r.ctrl ?? mid(r.from, r.to)} ${r.to}`)

const soften = (ps: Pt[]) =>
  ps.map((p, i): Pt => (i && i < ps.length - 1 ? [(ps[i - 1][0] + 2 * p[0] + ps[i + 1][0]) / 4, (ps[i - 1][1] + 2 * p[1] + ps[i + 1][1]) / 4] : p))
function chaikin(ps: Pt[]): Pt[] {
  if (ps.length < 3) return ps
  const out: Pt[] = [ps[0]]
  for (let i = 0; i < ps.length - 1; i++) {
    const [a, b] = [ps[i], ps[i + 1]]
    out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]])
  }
  out.push(ps[ps.length - 1])
  return out
}
function densify(ps: Pt[]): Pt[] {
  return ps.flatMap((b, i) => {
    if (!i) return [b]
    const a = ps[i - 1]
    const n = Math.ceil(dist(a, b) / 0.05)
    return Array.from({ length: n }, (_, k) => [a[0] + ((b[0] - a[0]) * (k + 1)) / n, a[1] + ((b[1] - a[1]) * (k + 1)) / n] as Pt)
  })
}

// Points along a line with running length s and unit tangent d (taken over ~30 cm so hand jitter does not tilt it).
type Sample = { p: Pt; s: number; d: Pt }
function sample(line: Pt[]): Sample[] {
  let s = 0
  return line.map((p, i) => {
    if (i) s += dist(line[i - 1], p)
    const a = line[Math.max(0, i - 6)]
    const b = line[Math.min(line.length - 1, i + 6)]
    const l = dist(a, b) || 1
    return { p, s, d: [(b[0] - a[0]) / l, (b[1] - a[1]) / l] }
  })
}
// Point `back` metres behind and `side` metres beside a sample.
const at = ({ p, d }: Sample, back: number, side = 0): Pt => [p[0] - d[0] * back - d[1] * side, p[1] - d[1] * back + d[0] * side]
const wave = (x: Sample) => at(x, 0, 0.22 * Math.sin((2 * Math.PI * x.s) / 0.7))
function every(ss: Sample[], start: number, step: number) {
  const out: Sample[] = []
  for (let next = start, i = 0; i < ss.length; i++) if (ss[i].s >= next) out.push(ss[i]), (next += step)
  return out
}
function runs(ss: Sample[], keep: (x: Sample) => boolean) {
  const out: Sample[][] = []
  ss.forEach((x, i) => keep(x) && (i && keep(ss[i - 1]) ? out[out.length - 1].push(x) : out.push([x])))
  return out
}

function routeMarks(style: RouteStyle, ss: Sample[]) {
  // End markers point along the last metre, so a final wobble does not tilt them.
  const last = ss[ss.length - 1]
  const ref = ss.find((x) => x.s >= last.s - 1) ?? ss[0]
  const len = dist(ref.p, last.p)
  const end: Sample = len ? { ...last, d: [(last.p[0] - ref.p[0]) / len, (last.p[1] - ref.p[1]) / len] } : last
  const body = ss.filter((x) => x.s <= end.s - (style === 'shot' ? 1.1 : style === 'brake' ? 0.45 : 0.75))
  const line = (ps: Pt[]) => <polyline points={pts(ps)} />
  const center = line(body.map((x) => x.p))
  const arrow = <polygon points={pts([end.p, at(end, 0.75, 0.35), at(end, 0.75, -0.35)])} fill={INK} stroke="none" />
  const broken = runs(body, (x) => x.s % 1.05 < 0.75).map((r, i) => <polyline key={i} points={pts(r.map(wave))} />)
  switch (style) {
    case 'forward':
      return <>{center}{arrow}</>
    case 'forwardPuck':
      return <>{line(body.map(wave))}{arrow}</>
    case 'brake':
      return <>{center}{[0, 0.25].map((b) => <line key={b} x1={at(end, b, 0.4)[0]} y1={at(end, b, 0.4)[1]} x2={at(end, b, -0.4)[0]} y2={at(end, b, -0.4)[1]} />)}</>
    case 'backward':
      return <>{broken}{arrow}</>
    case 'backwardPuck':
      return <>{broken}{every(body, 0.9, 1.05).map((x, i) => <circle key={i} cx={x.p[0]} cy={x.p[1]} r={0.08} fill={INK} stroke="none" />)}{arrow}</>
    case 'sideways':
      return <>{center}{every(body, 0.15, 0.25).map((x, i) => <polyline key={i} points={pts([at(x, 0, 0.2), at(x, 0, -0.2)])} strokeWidth={0.07} />)}{arrow}</>
    case 'pass':
      return <><polyline points={pts(body.map((x) => x.p))} strokeDasharray="0 0.35" strokeWidth={0.18} />{arrow}</>
    case 'shot':
      return <>{line(body.map(wave))}{[0, 0.35, 0.7].map((b) => <polyline key={b} points={pts([at(end, b + 0.45, 0.35), at(end, b), at(end, b + 0.45, -0.35)])} strokeWidth={0.16} />)}</>
  }
}

export function RouteMarks({ style, ...route }: { style: RouteStyle } & Route) {
  return (
    <g fill="none" stroke={INK} strokeWidth={0.12} strokeLinecap="round" strokeLinejoin="round">
      {routeMarks(style, sample(routeLine(route)))}
    </g>
  )
}

const letter = { fontSize: 1, fontWeight: 700, textAnchor: 'middle', dominantBaseline: 'central', fontFamily: 'system-ui, sans-serif' } as const

// Drawn around the origin; the caller translates and rotates.
export function SymbolShape({ kind }: { kind: SymbolKind }) {
  switch (kind) {
    case 'offense':
      return <circle r={0.7} fill="#fff" stroke={INK} strokeWidth={0.15} />
    case 'defense':
      return <polygon points="0,-0.8 0.75,0.5 -0.75,0.5" fill="#fff" stroke={INK} strokeWidth={0.15} strokeLinejoin="round" />
    case 'goalie':
      return <><circle r={0.75} fill={INK} /><text {...letter} fill="#fff">G</text></>
    case 'coach':
      return <><circle r={0.75} fill="#fff" stroke={INK} strokeWidth={0.15} /><text {...letter} fill={INK}>C</text></>
    case 'goal':
      return (
        <>
          <path d="M0.4,-0.92 H-0.25 Q-0.75,-0.92 -0.75,-0.4 V0.4 Q-0.75,0.92 -0.25,0.92 H0.4 Z" fill="url(#net)" />
          <path d="M0.4,-0.92 H-0.25 Q-0.75,-0.92 -0.75,-0.4 V0.4 Q-0.75,0.92 -0.25,0.92 H0.4" fill="none" stroke={INK} strokeWidth={0.18} />
        </>
      )
    case 'puck':
      return <circle r={0.25} fill={INK} />
    case 'pucks':
      return <g fill={INK}>{[[0, -0.45], [-0.4, 0], [0.4, -0.1], [-0.1, 0.4], [0.4, 0.4]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={0.15} />)}</g>
    case 'cone':
      return <path d="M-0.45,-0.45 L0.45,0.45 M0.45,-0.45 L-0.45,0.45" stroke={INK} strokeWidth={0.22} />
    case 'toblerone': // 6 m long (20% of the 30 m width), 0.6 m wide (twice a blue line); seen from above with its ridge
      return <><rect x={-3} y={-0.3} width={6} height={0.6} fill="#999" stroke={INK} strokeWidth={0.08} /><line x1={-3} y1={0} x2={3} y2={0} stroke={INK} strokeWidth={0.1} /></>
  }
}

const NetDefs = () => (
  <defs>
    <pattern id="net" width={0.2} height={0.2} patternUnits="userSpaceOnUse">
      <path d="M0,0 H0.2 M0,0 V0.2" stroke={INK} strokeWidth={0.04} />
    </pattern>
  </defs>
)

const hitStroke = { fill: 'none', stroke: 'transparent', strokeWidth: 1, pointerEvents: 'stroke' } as const

function ItemView({ item, onPointerDown }: { item: Item; onPointerDown?: (e: PointerEvent) => void }) {
  const g = onPointerDown ? { onPointerDown, style: { cursor: 'move' } } : {}
  switch (item.kind) {
    case 'route':
      return <g {...g}><RouteMarks style={item.style} from={item.from} to={item.to} ctrl={item.ctrl} via={item.via} />{onPointerDown && <path d={routePath(item)} {...hitStroke} />}</g>
    case 'free':
      return <g {...g}><polyline points={pts(item.pts)} fill="none" stroke={INK} strokeWidth={0.12} strokeLinecap="round" strokeLinejoin="round" />{onPointerDown && <polyline points={pts(item.pts)} {...hitStroke} />}</g>
    case 'text':
      return <text {...g} x={item.at[0]} y={item.at[1]} fontSize={1.1} fill={INK} fontFamily="system-ui, sans-serif" dominantBaseline="central">{item.text}</text>
    default:
      return (
        <g {...g}>
          <g transform={`translate(${item.at[0]} ${item.at[1]}) rotate(${item.rot ?? 0})`}>
            {onPointerDown && (item.kind === 'toblerone' ? <rect x={-3.1} y={-0.6} width={6.2} height={1.2} fill="transparent" /> : <circle r={1} fill="transparent" />)}
            <SymbolShape kind={item.kind} />
          </g>
          {item.label && <text x={item.at[0] + 0.85} y={item.at[1] - 0.8} fontSize={0.9} fill={INK} fontFamily="system-ui, sans-serif">{item.label}</text>}
        </g>
      )
  }
}

function Highlight({ item }: { item: Item }) {
  const glow = { fill: 'none', stroke: SELECT, strokeWidth: 0.5, opacity: 0.35, pointerEvents: 'none' } as const
  switch (item.kind) {
    case 'route':
      return <path d={routePath(item)} {...glow} />
    case 'free':
      return <polyline points={pts(item.pts)} {...glow} />
    default: {
      const ring = { fill: 'none', stroke: SELECT, strokeWidth: 0.15, strokeDasharray: '0.3 0.2', pointerEvents: 'none' } as const
      return item.kind === 'toblerone'
        ? <rect x={-3.4} y={-0.7} width={6.8} height={1.4} transform={`translate(${item.at[0]} ${item.at[1]}) rotate(${item.rot ?? 0})`} {...ring} />
        : <circle cx={item.at[0]} cy={item.at[1]} r={1.3} {...ring} />
    }
  }
}

export type HandleKey = 'from' | 'to' | 'ctrl' | 'rot'

export function Items({ scene, selected, onItemDown, onHandleDown }: {
  scene: Scene
  selected?: string | null
  onItemDown?: (id: string, e: PointerEvent) => void
  onHandleDown?: (id: string, key: HandleKey, e: PointerEvent) => void
}) {
  const sel = scene.items.find((it) => it.id === selected)
  const handles: [HandleKey, Pt][] = sel?.kind === 'route' ? [['from', sel.from], ['to', sel.to]] : []
  if (sel?.kind === 'route' && !sel.via) handles.push(['ctrl', sel.ctrl ?? mid(sel.from, sel.to)])
  if (sel && 'at' in sel && sel.kind !== 'text' && ROTATABLE.includes(sel.kind)) {
    // Rotation handle sits in front of the symbol (the open side of a goal) at its current angle.
    const a = ((sel.rot ?? 0) * Math.PI) / 180
    const r = sel.kind === 'toblerone' ? 3.8 : 1.7
    handles.push(['rot', [sel.at[0] + r * Math.cos(a), sel.at[1] + r * Math.sin(a)]])
  }
  return (
    <g>
      <NetDefs />
      {sel && <Highlight item={sel} />}
      {scene.items.map((it) => <ItemView key={it.id} item={it} onPointerDown={onItemDown && ((e) => onItemDown(it.id, e))} />)}
      {sel && onHandleDown && handles.map(([key, [x, y]]) => (
        <circle key={key} cx={x} cy={y} r={0.45} stroke={SELECT} strokeWidth={0.12} strokeDasharray={key === 'ctrl' ? '0.2 0.12' : undefined} fill={key === 'rot' ? SELECT : '#fff'}
          style={{ cursor: 'grab' }} onPointerDown={(e) => onHandleDown(sel.id, key, e)} />
      ))}
    </g>
  )
}

export const SymbolIcon = ({ kind }: { kind: SymbolKind }) =>
  kind === 'toblerone' ? (
    <svg viewBox="-3.2 -0.7 6.4 1.4" width={72} height={16} aria-hidden><SymbolShape kind={kind} /></svg>
  ) : (
    <svg viewBox="-1.1 -1.1 2.2 2.2" width={22} height={22} aria-hidden><NetDefs /><SymbolShape kind={kind} /></svg>
  )
export const RouteIcon = ({ style }: { style: RouteStyle }) => (
  <svg viewBox="-0.2 -0.6 4.6 1.2" width={72} height={19} aria-hidden><RouteMarks style={style} from={[0, 0]} to={[4.2, 0]} /></svg>
)

export function Legend() {
  return (
    <div className="legend" role="list" aria-label="Legende">
      {(Object.keys(SYMBOL_LABELS) as SymbolKind[]).map((k) => <span role="listitem" key={k}><SymbolIcon kind={k} />{SYMBOL_LABELS[k]}</span>)}
      {(Object.keys(ROUTE_LABELS) as RouteStyle[]).map((k) => <span role="listitem" key={k}><RouteIcon style={k} />{ROUTE_LABELS[k]}</span>)}
    </div>
  )
}

export const Thumb = ({ scene, ...props }: { scene: Scene } & ComponentProps<'svg'>) => (
  <Rink template={scene.rink} aria-label="Diagramm" {...props}><Items scene={scene} /></Rink>
)
