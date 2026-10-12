import { useState } from 'react'
import { Legend } from './Diagram'
import { HelpButton } from './Help'
import { CategoryFilter, DrillSummary } from './Library'
import { addEntries, categoryCollections, duplicateSession, filterSessions, monthKey, monthLabel, moveIndex, totalMinutes } from './model'
import type { Change } from './model'
import { uid } from './scene'
import type { Db, Drill, Session, SessionEntry } from './types'

export const StatusBadge = ({ final }: { final?: boolean }) =>
  final ? <span className="status-badge final">✓ Definitiv</span> : <span className="status-badge draft">✎ Entwurf</span>

export function Sessions({ db, change }: { db: Db; change: Change }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [element, setElement] = useState('')
  const session = db.sessions.find((s) => s.id === openId)
  const upd = (id: string, fn: (s: Session) => Session) =>
    change((db) => ({ ...db, sessions: db.sessions.map((s) => (s.id === id ? fn(s) : s)) }))

  if (session) return <SessionEditor key={session.id} s={session} db={db} upd={(fn) => upd(session.id, fn)} onBack={() => setOpenId(null)} />

  // Month folders in date order, undated last; past months start folded unless a search is active.
  const searching = !!(q.trim() || category || element)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const folders = new Map<string, Session[]>()
  for (const s of filterSessions(db.sessions, q, category, element).sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')))
    folders.set(s.date ? monthKey(s.date) : '', [...(folders.get(s.date ? monthKey(s.date) : '') ?? []), s])

  return (
    <section>
      <div className="row">
        <h2>Trainings</h2>
        <HelpButton topic="sessions" />
        <button className="primary" onClick={() => {
          const s: Session = { id: uid(), title: 'Neues Training', entries: [] }
          change((db) => ({ ...db, sessions: [...db.sessions, s] }))
          setOpenId(s.id)
        }}>Neues Training</button>
      </div>
      <div className="row">
        <input type="search" aria-label="Trainings durchsuchen" placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        <CategoryFilter category={category} element={element} onChange={(c, e) => { setCategory(c); setElement(e) }} />
      </div>
      {db.sessions.length === 0 ? <p className="empty">Noch keine Trainings geplant.</p> : folders.size === 0 ? <p className="empty">Kein Training passt zu Suche und Filter.</p> : (
        [...folders].map(([month, list]) => (
          <details key={month || 'none'} className="card" open={searching || !month || month >= thisMonth}>
            <summary>{month ? monthLabel(month) : 'Ohne Datum'} ({list.length})</summary>
            <ul className="list">
              {list.map((s) => (
                <li key={s.id} className="row">
                  <StatusBadge final={s.final} />
                  <button className="link" onClick={() => setOpenId(s.id)}>{s.title}</button>
                  <span>{s.date ?? 'ohne Datum'} · {s.entries.length} Übungen · {totalMinutes(s)} Min.</span>
                  <button onClick={() => change((db) => ({ ...db, sessions: [...db.sessions, duplicateSession(s)] }))}>Duplizieren</button>
                  <button onClick={() => confirm(`Training «${s.title}» löschen?`) && change((db) => ({ ...db, sessions: db.sessions.filter((x) => x.id !== s.id) }))}>Löschen</button>
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
    </section>
  )
}

function SessionEditor({ s, db, upd, onBack }: { s: Session; db: Db; upd: (fn: (s: Session) => Session) => void; onBack: () => void }) {
  const [invalid, setInvalid] = useState<string[]>([]) // entries whose typed duration was rejected
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const setEntry = (id: string, patch: Partial<SessionEntry>) => upd((s) => ({ ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  const move = (from: number, to: number) => upd((s) => ({ ...s, entries: moveIndex(s.entries, from, to) }))
  const total = totalMinutes(s)

  return (
    <>
      <section className="screen-only">
        <div className="row">
          <button onClick={onBack}>← Alle Trainings</button>
          <HelpButton topic="sessions" />
          <StatusBadge final={s.final} />
          <button onClick={() => upd((s) => ({ ...s, final: s.final ? undefined : true }))}>{s.final ? 'Zurück auf Entwurf' : 'Als definitiv markieren'}</button>
        </div>
        <div className="row">
          <label>Titel <input defaultValue={s.title} onBlur={(e) => {
            const t = e.target.value.trim()
            if (t && t !== s.title) upd((s) => ({ ...s, title: t }))
          }} /></label>
          <label>Datum <input type="date" value={s.date ?? ''} onChange={(e) => {
            const date = e.target.value || undefined
            upd((s) => ({ ...s, date }))
          }} /></label>
          <strong>Total: {total} Min.</strong>
          <button onClick={() => print()}>Drucken / PDF</button>
        </div>
        <div className="row">
          <select aria-label="Übung aus der Bibliothek hinzufügen" value="" onChange={(e) => {
            const d = db.drills.find((d) => d.id === e.target.value)
            if (d) upd((s) => addEntries(s, [d]))
          }}>
            <option value="">Übung hinzufügen…</option>
            {db.drills.map((d) => <option key={d.id} value={d.id}>{d.title || 'Ohne Titel'}{d.draft ? ' (Entwurf)' : ''}</option>)}
          </select>
          <select aria-label="Alle Übungen einer Sammlung hinzufügen" value="" onChange={(e) => {
            const c = [...categoryCollections(db), ...db.collections].find((c) => c.id === e.target.value)
            const drills = c?.drillIds.map((id) => db.drills.find((d) => d.id === id)).filter((d): d is Drill => !!d) ?? []
            if (drills.length) upd((s) => addEntries(s, drills))
          }}>
            <option value="">Sammlung hinzufügen…</option>
            <optgroup label="Nach Erscheinungsform">
              {categoryCollections(db).filter((c) => c.drillIds.length).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.drillIds.length})</option>)}
            </optgroup>
            <optgroup label="Eigene Sammlungen">
              {db.collections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.drillIds.length})</option>)}
            </optgroup>
          </select>
        </div>
        {s.entries.length === 0 && <p className="empty">Noch keine Übungen in diesem Training.</p>}
        <ol className="entries">
          {s.entries.map((e, i) => (
            <li key={e.id} className="card entry" onDragOver={(ev) => ev.preventDefault()} onDrop={() => {
              if (dragFrom !== null && dragFrom !== i) move(dragFrom, i)
              setDragFrom(null)
            }}>
              <div className="row">
                <span className="handle" draggable onDragStart={() => setDragFrom(i)} title="Ziehen zum Verschieben" aria-hidden>⠿</span>
                <h3>{i + 1}. {e.drill.title || 'Ohne Titel'}</h3>
                <label>Dauer (Min.) <input type="number" min={0} defaultValue={e.minutes} aria-invalid={invalid.includes(e.id)} onChange={(ev) => {
                  const n = ev.target.valueAsNumber
                  const ok = Number.isFinite(n) && n >= 0
                  setInvalid((v) => (ok ? v.filter((x) => x !== e.id) : [...v.filter((x) => x !== e.id), e.id]))
                  if (ok) setEntry(e.id, { minutes: n })
                }} /></label>
                {invalid.includes(e.id) && <span className="problems">Ungültige Dauer, nicht übernommen.</span>}
                <button disabled={!i} onClick={() => move(i, i - 1)}>Nach oben</button>
                <button disabled={i === s.entries.length - 1} onClick={() => move(i, i + 1)}>Nach unten</button>
                <button onClick={() => upd((s) => ({ ...s, entries: s.entries.filter((x) => x.id !== e.id) }))}>Entfernen</button>
              </div>
              <DrillSummary drill={e.drill} />
              <label>Notizen für dieses Training <textarea rows={2} defaultValue={e.notes} onBlur={(ev) => {
                const notes = ev.target.value
                if (notes !== e.notes) setEntry(e.id, { notes })
              }} /></label>
            </li>
          ))}
        </ol>
      </section>
      <div className="print-only">
        <h1>{s.title}</h1>
        <p>{s.date ?? ''} · Total {total} Min.</p>
        {s.entries.map((e, i) => (
          <article key={e.id}>
            <h2>{i + 1}. {e.drill.title} · {e.minutes} Min.</h2>
            <DrillSummary drill={e.drill} />
            {e.notes && <p className="pre"><strong>Notizen:</strong> {e.notes}</p>}
          </article>
        ))}
        <Legend />
      </div>
    </>
  )
}
