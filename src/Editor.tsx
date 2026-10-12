import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { remove, store } from './db'
import { Items, Legend, RouteIcon, SymbolIcon } from './Diagram'
import type { HandleKey } from './Diagram'
import { badNumber, drillProblems, moveIndex } from './model'
import { HelpButton } from './Help'
import { CENTER, Rink } from './Rink'
import { addItem, commit, dist, initHistory, moveItem, redo, removeItem, straighten, uid, undo, updateItem } from './scene'
import { categories, categoryLabel, elementById, elements } from './sihf'
import { ROTATABLE, ROUTE_LABELS, SKATING, SYMBOL_LABELS } from './types'
import type { Drill, Item, Pt, RinkTemplate, RouteStyle, Scene, SymbolKind } from './types'

type Tool = 'select' | SymbolKind | RouteStyle | 'free' | 'text'
const isSymbol = (t: string): t is SymbolKind => t in SYMBOL_LABELS
const isRoute = (t: string): t is RouteStyle => t in ROUTE_LABELS

const TOOLS: [Tool, string, ReactNode][] = [
  ['select', 'Auswählen / verschieben', null],
  ...(Object.keys(SYMBOL_LABELS) as SymbolKind[]).map((k): [Tool, string, ReactNode] => [k, SYMBOL_LABELS[k], <SymbolIcon kind={k} />]),
  ...(Object.keys(ROUTE_LABELS) as RouteStyle[]).map((k): [Tool, string, ReactNode] => [k, ROUTE_LABELS[k], <RouteIcon style={k} />]),
  ['free', 'Freihand', null],
  ['text', 'Text', null],
]
const TEMPLATES: [RinkTemplate, string][] = [['full', 'Ganzes Feld'], ['half', 'Halbes Feld'], ['zone', 'Drittel']]
const clamp = (v: number, max: number) => Math.round(Math.min(max, Math.max(0, v)) * 100) / 100

export function Editor({ initial, saved, variantOf, onSave, onClose }: {
  initial: Drill
  saved?: Drill // the stored version, if any; used to tell whether there are unsaved changes
  variantOf?: string // title of the training drill this edit becomes a variant of
  onSave: (d: Drill) => Promise<void>
  onClose: () => void
}) {
  const [meta, setMeta] = useState(initial)
  const [hist, setHist] = useState(() => initHistory(initial.scene))
  const [live, setLive] = useState<Scene | null>(null) // scene during an unfinished gesture
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [savedJson, setSavedJson] = useState(saved ? JSON.stringify(saved) : '')
  const [status, setStatus] = useState('')
  const [problems, setProblems] = useState<string[]>([])
  const svg = useRef<SVGSVGElement>(null)
  // move: scene for the current pointer position (null = nothing to keep); finish: optional follow-up step on release.
  const gesture = useRef<{ move: (p: Pt) => Scene | null; finish?: (s: Scene) => Scene } | null>(null)

  const drill: Drill = { ...meta, scene: hist.present }
  const json = JSON.stringify(drill)
  const dirty = json !== savedJson
  const scene = live ?? hist.present
  const selItem = scene.items.find((it) => it.id === sel)

  // Keep unsaved work in a local draft slot so a reload or crash does not lose it.
  useEffect(() => {
    ;(dirty ? store('draft', drill) : remove('draft')).catch((e: Error) => setStatus(`Entwurf nicht lokal gesichert: ${e.message}`))
  }, [json]) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (s: Scene) => setHist((h) => commit(h, s))
  const set = (patch: Partial<Drill>) => setMeta((m) => ({ ...m, ...patch }))

  function toRink(e: { clientX: number; clientY: number }): Pt {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse())
    return [clamp(p.x, 60), clamp(p.y, 30)]
  }
  function begin(e: PointerEvent, move: (p: Pt) => Scene | null, finish?: (s: Scene) => Scene) {
    svg.current!.setPointerCapture(e.pointerId)
    gesture.current = { move, finish }
  }
  function cancel() {
    gesture.current = null
    setLive(null)
  }
  function place(kind: SymbolKind | 'text', at: Pt) {
    // A goal in the right half starts facing the centre.
    const item: Item = kind === 'text' ? { id: uid(), kind, at, text: 'Text' } : { id: uid(), kind, at, rot: kind === 'goal' && at[0] > 30 ? 180 : undefined }
    apply(addItem(hist.present, item))
    setSel(item.id)
    if (kind === 'text') setTool('select') // so the text field below can be edited right away
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    svg.current!.focus({ preventScroll: true })
    const p = toRink(e)
    const base = hist.present
    const id = uid()
    if (tool === 'select') setSel(null)
    else if (tool === 'toblerone') {
      // Fixed 6 m bar: a click drops it lying flat; dragging from one end aims it (15° steps).
      const bar = (at: Pt, rot = 0): Item => ({ id, kind: 'toblerone', at, rot })
      begin(e, (q) => {
        if (dist(p, q) < 0.3) return addItem(base, bar(p))
        const rot = Math.round((Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI / 15) * 15
        const a = (rot * Math.PI) / 180
        return addItem(base, bar([p[0] + 3 * Math.cos(a), p[1] + 3 * Math.sin(a)], rot))
      })
      setLive(addItem(base, bar(p)))
      setSel(id)
    } else if (isSymbol(tool) || tool === 'text') place(tool, p)
    else if (isRoute(tool) && SKATING.includes(tool)) {
      const line: Pt[] = [p]
      begin(
        e,
        (q) => {
          if (dist(q, line[line.length - 1]) > 0.35) line.push(q) // sparse points + smoothing hide hand jitter
          const via = line.slice(1, line[line.length - 1] === q ? -1 : undefined)
          return dist(p, q) < 0.3 && line.length < 4 ? null : addItem(base, { id, kind: 'route', style: tool, from: p, to: q, via: via.length ? via : undefined })
        },
        (s) => {
          const drawn = s.items.find((it) => it.id === id)!
          const straight = straighten(drawn)
          return straight === drawn ? s : updateItem(s, id, () => straight)
        },
      )
    } else if (tool === 'free') {
      const line: Pt[] = [p]
      begin(e, (q) => {
        if (dist(q, line[line.length - 1]) > 0.15) line.push(q) // thins the stroke as it is drawn
        return line.length > 1 ? addItem(base, { id, kind: 'free', pts: [...line] }) : null
      })
    } else {
      const style = tool // pass or shot: a straight drag
      begin(e, (q) => (dist(p, q) < 0.3 ? null : addItem(base, { id, kind: 'route', style, from: p, to: q })))
    }
  }
  function onItemDown(id: string, e: PointerEvent) {
    e.stopPropagation()
    svg.current!.focus({ preventScroll: true })
    setSel(id)
    const start = toRink(e)
    const base = hist.present
    begin(e, (q) => updateItem(base, id, (it) => moveItem(it, [q[0] - start[0], q[1] - start[1]])))
  }
  function onHandleDown(id: string, key: HandleKey, e: PointerEvent) {
    e.stopPropagation()
    const base = hist.present
    if (key === 'rot') {
      // Point the symbol at the pointer, in 15° steps.
      const angle = (it: Item, q: Pt) => ('at' in it ? Math.round((Math.atan2(q[1] - it.at[1], q[0] - it.at[0]) * 180) / Math.PI / 15) * 15 : 0)
      begin(e, (q) => updateItem(base, id, (it) => ({ ...it, rot: angle(it, q) }) as Item))
    } else begin(e, (q) => updateItem(base, id, (it) => ({ ...it, [key]: q }) as Item))
  }
  function onPointerUp() {
    const g = gesture.current
    if (g && live) {
      // Two undo steps when straightened, so Cmd/Ctrl+Z brings back the hand-drawn line.
      const done = g.finish?.(live) ?? live
      setHist((h) => commit(commit(h, live), done))
    }
    cancel()
  }

  const edit = (patch: Record<string, unknown>) => sel && apply(updateItem(hist.present, sel, (it) => ({ ...it, ...patch }) as Item))
  function duplicateSel() {
    if (!selItem) return
    const copy = { ...moveItem(selItem, [1, 1]), id: uid() }
    apply(addItem(hist.present, copy))
    setSel(copy.id)
  }
  function deleteSel() {
    if (!sel) return
    apply(removeItem(hist.present, sel))
    setSel(null)
  }

  function onKeyDown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
    if (e.key === 'Escape') {
      if (gesture.current) cancel()
      else setSel(null), setTool('select')
    } else if (mod && (key === 'z' || key === 'y')) {
      e.preventDefault()
      setHist(key === 'y' || e.shiftKey ? redo : undo)
    } else if (e.key === 'Enter' && (isSymbol(tool) || tool === 'text')) {
      place(tool, CENTER[hist.present.rink])
    } else if (sel && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault()
      deleteSel()
    } else if (sel && mod && key === 'd') {
      e.preventDefault()
      duplicateSel()
    } else if (sel && e.key.startsWith('Arrow')) {
      e.preventDefault()
      const s = e.shiftKey ? 2 : 0.5
      const d: Pt = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key] as Pt
      apply(updateItem(hist.present, sel, (it) => moveItem(it, d)))
    }
  }

  async function save(asDraft: boolean) {
    const missing = drillProblems(drill)
    setProblems(missing)
    if ([drill.minutes, drill.players, drill.goalies].some(badNumber) || (!asDraft && missing.length)) return
    // A variant keeps the original's name only if renamed; otherwise it is marked so the library can tell them apart.
    const title = variantOf && drill.title === variantOf ? `${drill.title} (Variante)` : drill.title
    const next: Drill = { ...drill, title, keyPoints: drill.keyPoints.filter((k) => k.trim()), draft: asDraft, updatedAt: new Date().toISOString() }
    setStatus('Speichert…')
    try {
      await onSave(next)
      setMeta(next)
      setSavedJson(JSON.stringify(next))
      setProblems([])
      setStatus('')
    } catch (e) {
      setStatus(`Speichern fehlgeschlagen: ${(e as Error).message}`)
    }
  }
  function close() {
    if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return
    remove('draft').catch(() => {})
    onClose()
  }

  return (
    <main>
      <div className="row toolbar">
        <button onClick={close}>← Zurück</button>
        <h1>{meta.title || 'Neue Übung'}</h1>
        {variantOf && <span className="chip">Variante von «{variantOf}»</span>}
        <HelpButton topic="editor" />
        <button className="primary" onClick={() => save(false)}>Speichern</button>
        <button onClick={() => setHist(undo)} disabled={!hist.past.length}>Rückgängig</button>
        <button onClick={() => setHist(redo)} disabled={!hist.future.length}>Wiederholen</button>
        <span role="status" className="status">
          {status || (dirty ? 'Nicht gespeichert' : meta.draft ? 'Als Entwurf gespeichert' : 'Gespeichert')}
        </span>
      </div>
      {problems.length > 0 && (
        <div className="problems row" role="alert">
          Für eine fertige Übung fehlt: {problems.join(', ')}.
          <button onClick={() => save(true)}>Als Entwurf speichern</button>
        </div>
      )}
      <div className="editor">
        <div className="palette" role="toolbar" aria-label="Werkzeuge">
          {TOOLS.map(([t, label, icon]) => (
            <button key={t} aria-pressed={tool === t} onClick={() => setTool(t)} title={label}
              draggable={isSymbol(t)} onDragStart={(e) => e.dataTransfer.setData('text/plain', t)}>
              {icon}<span>{label}</span>
            </button>
          ))}
        </div>
        <div className="stage">
          <div className="row">
            <select aria-label="Feldvorlage" value={scene.rink} onChange={(e) => apply({ ...hist.present, rink: e.target.value as RinkTemplate })}>
              {TEMPLATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button aria-label="Verkleinern" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom === 1}>−</button>
            <span>{zoom * 100}%</span>
            <button aria-label="Vergrössern" onClick={() => setZoom((z) => Math.min(3, z + 0.5))}>+</button>
            <button onClick={() => setZoom(1)}>Einpassen</button>
          </div>
          <div className="canvas">
            <Rink ref={svg} template={scene.rink} role="application" tabIndex={0}
              aria-label="Zeichenfläche. Pfeiltasten verschieben (Shift: weiter), Entf löscht, Enter platziert das gewählte Symbol in der Mitte, Escape bricht ab."
              style={{ width: `${zoom * 100}%`, touchAction: 'none' }}
              onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={cancel} onKeyDown={onKeyDown}
              onPointerMove={(e) => gesture.current && setLive(gesture.current.move(toRink(e)))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const kind = e.dataTransfer.getData('text/plain')
                if (isSymbol(kind)) place(kind, toRink(e))
              }}>
              <Items scene={scene} selected={sel} onItemDown={tool === 'select' ? onItemDown : undefined} onHandleDown={tool === 'select' ? onHandleDown : undefined} />
            </Rink>
          </div>
          {selItem && (
            <div className="row selection" key={JSON.stringify(selItem)}>
              <strong>Auswahl:</strong>
              {isSymbol(selItem.kind) && 'at' in selItem && (
                <>
                  <label>Beschriftung <input size={6} defaultValue={'label' in selItem ? selItem.label : ''} onBlur={(e) => edit({ label: e.target.value || undefined })} /></label>
                  {ROTATABLE.includes(selItem.kind) && [-15, 15, 90].map((d) => (
                    <button key={d} onClick={() => edit({ rot: ((('rot' in selItem && selItem.rot) || 0) + d) % 360 })}>{d < 0 ? '⟲' : '⟳'} {Math.abs(d)}°</button>
                  ))}
                </>
              )}
              {selItem.kind === 'text' && (
                <label>Text <input defaultValue={selItem.text} onBlur={(e) => edit({ text: e.target.value })} /></label>
              )}
              {selItem.kind === 'route' && (
                <>
                  <select aria-label="Linienart" value={selItem.style} onChange={(e) => edit({ style: e.target.value })}>
                    {(Object.keys(ROUTE_LABELS) as RouteStyle[]).map((k) => <option key={k} value={k}>{ROUTE_LABELS[k]}</option>)}
                  </select>
                  {(selItem.ctrl || selItem.via) && <button onClick={() => edit({ ctrl: undefined, via: undefined })}>Gerade machen</button>}
                </>
              )}
              <button onClick={duplicateSel}>Duplizieren</button>
              <button onClick={deleteSel}>Löschen</button>
            </div>
          )}
          <Legend />
        </div>
        <DrillForm d={meta} set={set} />
      </div>
    </main>
  )
}

function DrillForm({ d, set }: { d: Drill; set: (patch: Partial<Drill>) => void }) {
  const kp = d.keyPoints
  function toggleCategory(id: string, on: boolean) {
    const cats = on ? categories.map((c) => c.id).filter((c) => c === id || d.categories.includes(c)) : d.categories.filter((c) => c !== id)
    set({
      categories: cats,
      primary: d.primary && cats.includes(d.primary) ? d.primary : undefined,
      elements: d.elements.filter((e) => cats.includes(elementById[e].category)),
    })
  }
  return (
    <form className="details" onSubmit={(e) => e.preventDefault()}>
      <label>Titel <input value={d.title} onChange={(e) => set({ title: e.target.value })} /></label>
      <label>Beschreibung (Aufbau und Ablauf) <textarea rows={5} value={d.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <fieldset>
        <legend>Coaching-Punkte</legend>
        <ol>
          {kp.map((k, i) => (
            <li key={i} className="row">
              <input aria-label={`Coaching-Punkt ${i + 1}`} value={k} onChange={(e) => set({ keyPoints: kp.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" aria-label="Nach oben" disabled={!i} onClick={() => set({ keyPoints: moveIndex(kp, i, i - 1) })}>↑</button>
              <button type="button" aria-label="Nach unten" disabled={i === kp.length - 1} onClick={() => set({ keyPoints: moveIndex(kp, i, i + 1) })}>↓</button>
              <button type="button" aria-label="Entfernen" onClick={() => set({ keyPoints: kp.filter((_, j) => j !== i) })}>✕</button>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => set({ keyPoints: [...kp, ''] })}>+ Punkt</button>
      </fieldset>
      <fieldset>
        <legend>Erscheinungsformen (SIHF U12)</legend>
        {categories.map((c) => (
          <label key={c.id} className="check">
            <input type="checkbox" checked={d.categories.includes(c.id)} onChange={(e) => toggleCategory(c.id, e.target.checked)} /> {c.label}
          </label>
        ))}
        {d.categories.length > 1 && (
          <label>Hauptfokus
            <select value={d.primary ?? ''} onChange={(e) => set({ primary: e.target.value || undefined })}>
              <option value="">—</option>
              {d.categories.map((c) => <option key={c} value={c}>{categoryLabel[c]}</option>)}
            </select>
          </label>
        )}
      </fieldset>
      {d.categories.length > 0 && (
        <fieldset>
          <legend>Schlüsselelemente / Trainingsziele</legend>
          {d.categories.map((c) => (
            <div key={c}>
              <h4>{categoryLabel[c]}</h4>
              {elements.filter((e) => e.category === c).map((e) => (
                <label key={e.id} className="check" title={e.goal}>
                  <input type="checkbox" checked={d.elements.includes(e.id)}
                    onChange={(ev) => set({ elements: ev.target.checked ? [...d.elements, e.id] : d.elements.filter((x) => x !== e.id) })} />{' '}
                  {e.id} {e.label}
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      )}
      <label>Dauer-Vorschlag (Min.)
        <input type="number" min={0} defaultValue={d.minutes ?? ''} aria-invalid={badNumber(d.minutes)}
          onChange={(e) => set({ minutes: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </label>
      {badNumber(d.minutes) && <p className="problems">Dauer muss 0 oder mehr Minuten sein.</p>}
      <div className="row">
        <label>Spieler/innen
          <input type="number" min={0} size={4} defaultValue={d.players ?? ''} aria-invalid={badNumber(d.players)}
            onChange={(e) => set({ players: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </label>
        <label>Torhüter/innen
          <input type="number" min={0} size={4} defaultValue={d.goalies ?? ''} aria-invalid={badNumber(d.goalies)}
            onChange={(e) => set({ goalies: e.target.value === '' ? undefined : Number(e.target.value) })} />
        </label>
      </div>
      {(badNumber(d.players) || badNumber(d.goalies)) && <p className="problems">Anzahl muss 0 oder mehr sein.</p>}
      <label>Material <input value={d.material ?? ''} placeholder="z. B. 20 Pucks, 6 Pylonen" onChange={(e) => set({ material: e.target.value || undefined })} /></label>
      <label className="check"><input type="checkbox" checked={d.offIce} onChange={(e) => set({ offIce: e.target.checked })} /> Off-Ice-Übung</label>
    </form>
  )
}
