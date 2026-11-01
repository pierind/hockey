import { memo, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { load, store } from './db'
import { HelpButton } from './Help'
import { Rink } from './Rink'
import { commit, dist, initHistory, redo, undo } from './scene'
import type { Pt, RinkTemplate } from './types'

// Coaches board: freehand only, kept apart from drills (not in the library or backups).
type Stroke = { pts: Pt[]; color: string }
type BoardState = { rink: RinkTemplate; strokes: Stroke[] }
const COLORS: [string, string][] = [['#111', 'Schwarz'], ['#d03b3b', 'Rot'], ['#2a78d6', 'Blau']]
const TEMPLATES: [RinkTemplate, string][] = [['full', 'Ganzes Feld'], ['half', 'Halbes Feld'], ['zone', 'Drittel']]
const ERASE_RADIUS = 0.8 // metres around the pointer

// Removes every stroke that passes within the eraser radius of p; returns the same state when nothing is hit.
export function eraseAt(b: BoardState, p: Pt): BoardState {
  const strokes = b.strokes.filter((s) => !s.pts.some((q) => dist(q, p) < ERASE_RADIUS))
  return strokes.length === b.strokes.length ? b : { ...b, strokes }
}

// A single tap is drawn as a dot (zero-length line with round caps).
const StrokeLine = memo(({ s }: { s: Stroke }) => (
  <polyline points={(s.pts.length === 1 ? [s.pts[0], s.pts[0]] : s.pts).map((p) => p.join(',')).join(' ')}
    fill="none" stroke={s.color} strokeWidth={0.22} strokeLinecap="round" strokeLinejoin="round" />
))

export function Board() {
  const [hist, setHist] = useState(() => initHistory<BoardState>({ rink: 'full', strokes: [] }))
  const [preview, setPreview] = useState<BoardState | null>(null) // state during an unfinished stroke or erase
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [color, setColor] = useState(COLORS[0][0])
  const [loaded, setLoaded] = useState(false)
  const [full, setFull] = useState(false) // board covers the whole screen, app bar hidden
  const svg = useRef<SVGSVGElement>(null)
  const gesture = useRef<{ pointerId: number; stroke?: Stroke } | null>(null)
  const penUsed = useRef(false) // palm rejection: after the first Apple Pencil touch, fingers no longer draw
  const board = preview ?? hist.present

  // Keep the board across reloads; it is a scratch pad, so a failed write is not reported.
  useEffect(() => {
    load<BoardState>('board').then((b) => b && setHist(initHistory(b)), () => {}).finally(() => setLoaded(true))
  }, [])
  useEffect(() => {
    if (loaded) store('board', hist.present).catch(() => {})
  }, [hist.present, loaded])

  function toRink(e: { clientX: number; clientY: number }): Pt {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (e.pointerType === 'pen') penUsed.current = true
    if ((e.pointerType === 'touch' && penUsed.current) || gesture.current || e.button > 0) return
    svg.current!.setPointerCapture(e.pointerId)
    const p = toRink(e)
    if (tool === 'eraser') {
      gesture.current = { pointerId: e.pointerId }
      setPreview(eraseAt(hist.present, p))
    } else {
      const stroke = { pts: [p], color }
      gesture.current = { pointerId: e.pointerId, stroke }
      setPreview({ ...hist.present, strokes: [...hist.present.strokes, stroke] })
    }
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointerId) return
    // The Pencil reports more samples than events; coalesced events keep fast strokes smooth.
    const samples = e.nativeEvent.getCoalescedEvents?.() ?? []
    const points = (samples.length ? samples : [e.nativeEvent]).map(toRink)
    if (!g.stroke) return setPreview((b) => points.reduce(eraseAt, b ?? hist.present))
    const pts = g.stroke.pts
    for (const p of points) if (dist(p, pts[pts.length - 1]) > 0.08) pts.push(p)
    const stroke = { ...g.stroke, pts: [...pts] }
    setPreview((b) => (b ? { ...b, strokes: [...b.strokes.slice(0, -1), stroke] } : b))
  }
  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    if (gesture.current?.pointerId !== e.pointerId) return
    if (preview && preview !== hist.present) setHist((h) => commit(h, preview))
    gesture.current = null
    setPreview(null)
  }
  function onPointerCancel(e: PointerEvent<SVGSVGElement>) {
    if (gesture.current?.pointerId !== e.pointerId) return
    gesture.current = null
    setPreview(null)
  }

  function toggleFull() {
    setFull(!full)
    // Also hides the browser bars where allowed (desktop, iPad Safari 16.4+); the CSS overlay works without it.
    if (!full) document.documentElement.requestFullscreen?.().catch(() => {})
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }

  return (
    <section className={full ? 'board full' : 'board'}>
      <div className="row board-tools" role="toolbar" aria-label="Taktiktafel">
        {!full && <><h2>Taktiktafel</h2><HelpButton topic="board" /></>}
        <div className="row" role="group" aria-label="Stift">
          {COLORS.map(([c, name]) => (
            <button key={c} aria-label={`Stift ${name}`} aria-pressed={tool === 'pen' && color === c} onClick={() => { setTool('pen'); setColor(c) }}>
              <i className="pen-dot" style={{ background: c }} />
            </button>
          ))}
          <button aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}>Radierer</button>
        </div>
        <button onClick={() => setHist(undo)} disabled={!hist.past.length}>Rückgängig</button>
        <button onClick={() => setHist(redo)} disabled={!hist.future.length}>Wiederholen</button>
        <button onClick={() => setHist((h) => commit(h, { ...h.present, strokes: [] }))} disabled={!board.strokes.length}>Alles löschen</button>
        <select aria-label="Feldvorlage" value={board.rink} onChange={(e) => setHist((h) => commit(h, { ...h.present, rink: e.target.value as RinkTemplate }))}>
          {TEMPLATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="spacer" />
        <button className={full ? 'primary' : ''} onClick={toggleFull}>{full ? 'Vollbild beenden' : 'Vollbild'}</button>
      </div>
      <div className="board-canvas">
        <Rink ref={svg} template={board.rink} style={full ? { height: '100%' } : undefined} role="application" aria-label="Taktiktafel: mit Finger, Stift oder Maus zeichnen"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
          {board.strokes.map((s, i) => <StrokeLine key={i} s={s} />)}
        </Rink>
      </div>
    </section>
  )
}
