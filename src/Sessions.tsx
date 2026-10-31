import { useState } from 'react'
import { download } from './db'
import { HelpButton } from './Help'
import { CategoryFilter, DrillFinder, DrillSummary } from './Library'
import { addEntries, blockMinutes, categoryCollections, clock, duplicateSession, filterSessions, fromTemplate, groupPlayers, monthKey, monthLabel, moveIndex, needs, timeline, toIcs, totalMinutes } from './model'
import type { Change } from './model'
import { uid } from './scene'
import type { Db, Drill, Session, SessionEntry } from './types'

export const StatusBadge = ({ s }: { s: Session }) =>
  s.template ? <span className="status-badge template">▤ Vorlage</span>
    : s.final ? <span className="status-badge final">✓ Definitiv</span> : <span className="status-badge draft">✎ Entwurf</span>

// Exports dated trainings and games together; shown on both tabs.
export const CalendarButton = ({ db }: { db: Db }) =>
  db.sessions.some((s) => s.date && !s.template) || (db.games ?? []).some((g) => g.date)
    ? <button onClick={() => download('eishockey-kalender.ics', 'text/calendar', toIcs(db.sessions, db.games ?? []))}>Kalender (.ics)</button>
    : null

export function Sessions({ db, change, onEditEntry }: { db: Db; change: Change; onEditEntry: (sessionId: string, entry: SessionEntry) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [element, setElement] = useState('')
  const session = db.sessions.find((s) => s.id === openId)
  const upd = (id: string, fn: (s: Session) => Session) =>
    change((db) => ({ ...db, sessions: db.sessions.map((s) => (s.id === id ? fn(s) : s)) }))

  if (session) return <SessionEditor key={session.id} s={session} db={db} upd={(fn) => upd(session.id, fn)} onBack={() => setOpenId(null)} onEdit={(e) => onEditEntry(session.id, e)} />

  // Templates first, then month folders in date order, undated last; past months start folded unless searching.
  const searching = !!(q.trim() || category || element)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const folderOf = (s: Session) => (s.template ? 'template' : s.date ? monthKey(s.date) : '')
  const order = (s: Session) => (s.template ? '0000' : s.date ?? '9999')
  const folders = new Map<string, Session[]>()
  for (const s of filterSessions(db.sessions, q, category, element).sort((a, b) => order(a).localeCompare(order(b))))
    folders.set(folderOf(s), [...(folders.get(folderOf(s)) ?? []), s])
  const open = (s: Session) => {
    change((db) => ({ ...db, sessions: [...db.sessions, s] }))
    setOpenId(s.id)
  }
  const earlier = db.sessions.filter((s) => !s.template).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))

  return (
    <section>
      <div className="row">
        <h2>Trainings</h2>
        <HelpButton topic="sessions" />
        <button className="primary" onClick={() => open({ id: uid(), title: 'Neues Training', entries: [] })}>Neues Training</button>
        {db.sessions.length > 0 && (
          <select aria-label="Neues Training aus Vorlage oder früherem Training" value="" onChange={(e) => {
            const src = db.sessions.find((s) => s.id === e.target.value)
            if (src) open(fromTemplate(src))
          }}>
            <option value="">Neues Training aus…</option>
            <optgroup label="Vorlagen">
              {db.sessions.filter((s) => s.template).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </optgroup>
            <optgroup label="Frühere Trainings">
              {earlier.map((s) => <option key={s.id} value={s.id}>{s.date ?? 'ohne Datum'} · {s.title}</option>)}
            </optgroup>
          </select>
        )}
        <CalendarButton db={db} />
      </div>
      <div className="row filters">
        <input type="search" aria-label="Trainings durchsuchen" placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        <CategoryFilter category={category} element={element} onChange={(c, e) => { setCategory(c); setElement(e) }} />
      </div>
      {db.sessions.length === 0 ? <p className="empty">Noch keine Trainings geplant.</p> : folders.size === 0 ? <p className="empty">Kein Training passt zu Suche und Filter.</p> : (
        [...folders].map(([month, list]) => (
          <details key={month || 'none'} className="card" open={searching || !month || month === 'template' || month >= thisMonth}>
            <summary>{month === 'template' ? 'Vorlagen' : month ? monthLabel(month) : 'Ohne Datum'} ({list.length})</summary>
            <ul className="list">
              {list.map((s) => (
                <li key={s.id} className="row">
                  <StatusBadge s={s} />
                  <button className="link" onClick={() => setOpenId(s.id)}>{s.title}</button>
                  <span>{s.date ?? 'ohne Datum'} · {s.entries.length} Übungen · {totalMinutes(s)} Min.</span>
                  <button className="ghost" onClick={() => change((db) => ({ ...db, sessions: [...db.sessions, duplicateSession(s)] }))}>Duplizieren</button>
                  <button className="ghost danger" onClick={() => confirm(`Training «${s.title}» löschen?`) && change((db) => ({ ...db, sessions: db.sessions.filter((x) => x.id !== s.id) }))}>Löschen</button>
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
    </section>
  )
}

function SessionEditor({ s, db, upd, onBack, onEdit }: { s: Session; db: Db; upd: (fn: (s: Session) => Session) => void; onBack: () => void; onEdit: (e: SessionEntry) => void }) {
  const [invalid, setInvalid] = useState<string[]>([]) // entries whose typed duration was rejected
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [finder, setFinder] = useState<{ replace?: string; category?: string } | null>(null) // open drill finder: add, or replace that entry
  const setEntry = (id: string, patch: Partial<SessionEntry>) => upd((s) => ({ ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  const move = (from: number, to: number) => upd((s) => ({ ...s, entries: moveIndex(s.entries, from, to) }))
  const total = totalMinutes(s)
  const plan = timeline(s)
  const span = (from: number, to: number) => `${clock(s.start!, from)}–${clock(s.start!, to)}`
  const n = needs(s)
  const team = db.players ?? []
  const needLine = [n.players && `${n.players} Spieler/innen`, n.goalies && `${n.goalies} Torhüter/innen`, n.material.length && `Material: ${n.material.join(', ')}`]
    .filter(Boolean).join(' · ')

  return (
    <>
      <section className="screen-only session">
        <div className="row">
          <button className="ghost" onClick={onBack}>← Alle Trainings</button>
          <span className="spacer" />
          <HelpButton topic="sessions" />
          <button onClick={() => print()}>Drucken / PDF</button>
        </div>
        <header className="session-head">
          <input className="title-input" aria-label="Titel" defaultValue={s.title} onBlur={(e) => {
            const t = e.target.value.trim()
            if (t && t !== s.title) upd((s) => ({ ...s, title: t }))
          }} />
          <div className="row">
            <label className="field">Datum <input type="date" value={s.date ?? ''} onChange={(e) => {
              const date = e.target.value || undefined
              upd((s) => ({ ...s, date }))
            }} /></label>
            <label className="field">Start <input type="time" value={s.start ?? ''} onChange={(e) => {
              const start = e.target.value || undefined
              upd((s) => ({ ...s, start }))
            }} /></label>
            <span className="pill">Total: {total} Min.{s.start && ` · ${span(0, total)}`}</span>
            <span className="spacer" />
            <StatusBadge s={s} />
            {!s.template && <button onClick={() => upd((s) => ({ ...s, final: s.final ? undefined : true }))}>{s.final ? 'Zurück auf Entwurf' : 'Als definitiv markieren'}</button>}
            <label className="check">
              <input type="checkbox" checked={!!s.template} onChange={(e) => {
                const template = e.target.checked || undefined
                upd((s) => ({ ...s, template, final: undefined }))
              }} /> Vorlage
            </label>
          </div>
          {needLine && <p className="needs">Benötigt: {needLine}</p>}
        </header>
        <div className="row add-bar">
          <button className="primary" onClick={() => setFinder({})}>+ Übungen hinzufügen</button>
          <select aria-label="Alle Übungen einer Sammlung hinzufügen" value="" onChange={(e) => {
            const c = [...categoryCollections(db), ...db.collections].find((c) => c.id === e.target.value)
            const drills = c?.drillIds.map((id) => db.drills.find((d) => d.id === id)).filter((d): d is Drill => !!d) ?? []
            if (drills.length) upd((s) => addEntries(s, drills))
          }}>
            <option value="">Ganze Sammlung hinzufügen…</option>
            <optgroup label="Nach Erscheinungsform">
              {categoryCollections(db).filter((c) => c.drillIds.length).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.drillIds.length})</option>)}
            </optgroup>
            <optgroup label="Eigene Sammlungen">
              {db.collections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.drillIds.length})</option>)}
            </optgroup>
          </select>
        </div>
        <details className="card attendance">
          <summary>Anwesenheit (AWK){s.attendance ? `: ${s.attendance.length} von ${team.length}` : ' · nicht erfasst'}</summary>
          {!s.attendance ? (
            <button onClick={() => upd((s) => ({ ...s, attendance: team.map((p) => p.id) }))}>Anwesenheit erfassen (alle anwesend)</button>
          ) : (
            <div className="roster">
              {groupPlayers(team).map(([group, list]) => (
                <fieldset key={group}>
                  <legend>{group} ({list.filter((p) => s.attendance!.includes(p.id)).length}/{list.length})</legend>
                  {list.map((p) => (
                    <label key={p.id} className="check">
                      <input type="checkbox" checked={s.attendance!.includes(p.id)} onChange={(e) => {
                        const on = e.target.checked
                        upd((s) => ({ ...s, attendance: on ? [...(s.attendance ?? []), p.id] : (s.attendance ?? []).filter((x) => x !== p.id) }))
                      }} /> {p.number} {p.name} ({p.position})
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          )}
        </details>
        <label className="session-notes">Notizen zum Training (z. B. Schwerpunkte, Key-Points Coach)
          <textarea rows={3} defaultValue={s.notes ?? ''} onBlur={(e) => {
            const notes = e.target.value.trim() || undefined
            if (notes !== s.notes) upd((s) => ({ ...s, notes }))
          }} />
        </label>
        {s.entries.length === 0 && (
          <div className="empty-state">
            <p>Noch keine Übungen. Wähle, was trainiert werden soll, und lass dir passende Übungen vorschlagen.</p>
            <button className="primary" onClick={() => setFinder({})}>+ Übungen hinzufügen</button>
          </div>
        )}
        <ol className="entries">
          {plan.map(({ entries, from, to }, k) => {
            const cards = entries.map((e) => {
              const i = s.entries.indexOf(e)
              return (
                <li key={e.id} className="card entry" onDragOver={(ev) => ev.preventDefault()} onDrop={() => {
                  if (dragFrom !== null && dragFrom !== i) move(dragFrom, i)
                  setDragFrom(null)
                }}>
                  <div className="row">
                    <span className="handle" draggable onDragStart={() => setDragFrom(i)} title="Ziehen zum Verschieben" aria-hidden>⠿</span>
                    <span className="entry-num">{entries.length > 1 ? `P${entries.indexOf(e) + 1}` : k + 1}</span>
                    {entries.length === 1 && s.start && <span className="time">{span(from, to)}</span>}
                    <h3>{e.drill.title || 'Ohne Titel'}</h3>
                    <span className="spacer" />
                    <label className="minutes">Dauer (Min.) <input type="number" size={3} min={0} defaultValue={e.minutes} aria-invalid={invalid.includes(e.id)} onChange={(ev) => {
                      const n = ev.target.valueAsNumber
                      const ok = Number.isFinite(n) && n >= 0
                      setInvalid((v) => (ok ? v.filter((x) => x !== e.id) : [...v.filter((x) => x !== e.id), e.id]))
                      if (ok) setEntry(e.id, { minutes: n })
                    }} /></label>
                    {invalid.includes(e.id) && <span className="problems">Ungültige Dauer, nicht übernommen.</span>}
                    {i > 0 && (
                      <label className="check">
                        <input type="checkbox" checked={!!e.parallel} onChange={(ev) => setEntry(e.id, { parallel: ev.target.checked || undefined })} /> Parallel (Posten)
                      </label>
                    )}
                  </div>
                  <div className="row entry-actions">
                    <button className="ghost" aria-label="Nach oben" title="Nach oben" disabled={!i} onClick={() => move(i, i - 1)}>↑</button>
                    <button className="ghost" aria-label="Nach unten" title="Nach unten" disabled={i === s.entries.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                    <button className="ghost" onClick={() => onEdit(e)}>Bearbeiten</button>
                    <button className="ghost" onClick={() => setFinder({ replace: e.id, category: e.drill.primary ?? e.drill.categories[0] })}>Ersetzen</button>
                    <button className="ghost danger" onClick={() => upd((s) => ({ ...s, entries: s.entries.filter((x) => x.id !== e.id) }))}>Entfernen</button>
                  </div>
                  <DrillSummary drill={e.drill} />
                  <label>Notizen für dieses Training <textarea rows={2} defaultValue={e.notes} onBlur={(ev) => {
                    const notes = ev.target.value
                    if (notes !== e.notes) setEntry(e.id, { notes })
                  }} /></label>
                </li>
              )
            })
            if (entries.length === 1) return cards
            return (
              <li key={entries[0].id} className="block">
                <div className="row block-head">
                  {s.start && <span className="time">{span(from, to)}</span>}
                  <h3>{k + 1}. Posten-Block · {entries.length} Posten</h3>
                  <strong>{blockMinutes(entries)} Min.</strong>
                </div>
                <ol className="entries posten">{cards}</ol>
              </li>
            )
          })}
        </ol>
      </section>
      {finder && (
        <DrillFinder drills={db.drills} category={finder.category} inSession={s.entries.map((e) => e.drill.id)}
          {...(finder.replace
            ? { title: 'Übung ersetzen', pickLabel: 'Einsetzen', onPick: (d: Drill) => setEntry(finder.replace!, { drill: structuredClone(d) }) }
            : { title: 'Übungen hinzufügen', pickLabel: 'Hinzufügen', keepOpen: true, onPick: (d: Drill) => upd((s) => addEntries(s, [d])) })}
          onClose={() => setFinder(null)} />
      )}
      <div className="print-only">
        <h1>{s.title}</h1>
        <p>{[s.date, s.start && span(0, total), `Total ${total} Min.`].filter(Boolean).join(' · ')}</p>
        {needLine && <p>{needLine}</p>}
        {team.length > 0 && (
          <div className="posten-grid">
            {groupPlayers(team.filter((p) => !s.attendance || s.attendance.includes(p.id))).map(([group, list]) => (
              <p key={group}><strong>{group}:</strong> {list.map((p) => `${p.number ?? ''} ${p.name} (${p.position})`.trim()).join(', ')}</p>
            ))}
          </div>
        )}
        {s.notes && <p className="pre">{s.notes}</p>}
        {plan.map(({ entries, from, to }, k) => (
          <section key={entries[0].id} className="print-block">
            <h2>{s.start && `${span(from, to)} · `}{k + 1}. {entries.length > 1
              ? `Posten-Block · ${entries.length} Posten · ${blockMinutes(entries)} Min.`
              : `${entries[0].drill.title} · ${entries[0].minutes} Min.`}</h2>
            <div className={entries.length > 1 ? 'posten-grid' : undefined}>
              {entries.map((e, j) => (
                <article key={e.id}>
                  {entries.length > 1 && <h3>Posten {j + 1}: {e.drill.title} · {e.minutes} Min.</h3>}
                  <DrillSummary drill={e.drill} />
                  {e.notes && <p className="pre"><strong>Notizen:</strong> {e.notes}</p>}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
