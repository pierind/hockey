import { useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { download } from './db'
import { HelpButton } from './Help'
import { CategoryFilter, DrillFinder, DrillSummary, Picture } from './Library'
import { addEntries, blockMinutes, CHANGE_MINUTES, categoryCollections, clock, drillSections, duplicateSession, filterSessions, fromTemplate, groupPlayers, monthKey, monthLabel, moveIndex, needs, postenZones, timeline, ZONES, toIcs, totalMinutes } from './model'
import type { Change } from './model'
import { Rink } from './Rink'
import { RunMode } from './RunMode'
import { uid } from './scene'
import type { Db, Drill, Player, Session, SessionEntry, TeamInfo } from './types'

export const StatusBadge = ({ s }: { s: Session }) =>
  s.template ? <span className="status-badge template">▤ Vorlage</span>
    : s.final ? <span className="status-badge final">✓ Definitiv</span> : <span className="status-badge draft">✎ Entwurf</span>

// Exports dated trainings and games together; shown on both tabs.
export const CalendarButton = ({ db }: { db: Db }) =>
  db.sessions.some((s) => s.date && !s.template) || (db.games ?? []).some((g) => g.date)
    ? <button onClick={() => download('eishockey-kalender.ics', 'text/calendar', toIcs(db.sessions, db.games ?? []))}>Kalender (.ics)</button>
    : null

// Coloured team names of a training; only worth showing once there is more than one team.
export const TeamChips = ({ ids, teams }: { ids?: string[]; teams?: TeamInfo[] }) =>
  (teams?.length ?? 0) > 1 ? <span className="team-chips">{teams!.filter((t) => ids?.includes(t.id)).map((t) => <span key={t.id} className="team-chip" style={{ '--team': t.color } as CSSProperties}>{t.name}</span>)}</span> : null

export function Sessions({ db, players, team, change, onEditEntry }: { db: Db; players: Player[]; team: string; change: Change; onEditEntry: (sessionId: string, entry: SessionEntry) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [element, setElement] = useState('')
  const session = db.sessions.find((s) => s.id === openId)
  const upd = (id: string, fn: (s: Session) => Session) =>
    change((db) => ({ ...db, sessions: db.sessions.map((s) => (s.id === id ? fn(s) : s)) }))

  if (session) return <SessionEditor key={session.id} s={session} db={db} players={players} team={team} upd={(fn) => upd(session.id, fn)} onBack={() => setOpenId(null)} onEdit={(e) => onEditEntry(session.id, e)} />

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
                  <TeamChips ids={s.teams} teams={db.teams} />
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

function SessionEditor({ s, db, players, team: active, upd, onBack, onEdit }: { s: Session; db: Db; players: Player[]; team: string; upd: (fn: (s: Session) => Session) => void; onBack: () => void; onEdit: (e: SessionEntry) => void }) {
  const [invalid, setInvalid] = useState<string[]>([]) // entries whose typed duration was rejected
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [run, setRun] = useState(false) // rink mode open
  const [finder, setFinder] = useState<{ replace?: string; category?: string } | null>(null) // open drill finder: add, or replace that entry
  const setEntry = (id: string, patch: Partial<SessionEntry>) => upd((s) => ({ ...s, entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
  const move = (from: number, to: number) => upd((s) => ({ ...s, entries: moveIndex(s.entries, from, to) }))
  const total = totalMinutes(s)
  const plan = timeline(s)
  const span = (from: number, to: number) => `${clock(s.start!, from)}–${clock(s.start!, to)}`
  const n = needs(s)
  const team = players.filter((p) => s.teams?.some((t) => p.teams?.includes(t))) // a joint training lists the players of all its teams
  const teams = db.teams ?? []
  const needLine = [n.players && `${n.players} Spieler/innen`, n.goalies && `${n.goalies} Torhüter/innen`, n.material.length && `Material: ${n.material.join(', ')}`]
    .filter(Boolean).join(' · ')

  return (
    <>
      <section className="screen-only session">
        <div className="row">
          <button className="ghost" onClick={onBack}>← Alle Trainings</button>
          <span className="spacer" />
          <HelpButton topic="sessions" />
          <button className="icon-btn" aria-label="Drucken / PDF" title="Drucken / PDF" onClick={() => {
            // The browser proposes the page title as the PDF file name.
            const app = document.title
            document.title = s.title || app
            addEventListener('afterprint', () => { document.title = app }, { once: true })
            print()
          }}>
            <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M12 11v6M9 14l3 3 3-3" />
            </svg>
          </button>
          <button className="primary icon-btn" aria-label="Training starten" title="Training starten" disabled={!s.entries.length} onClick={() => setRun(true)}>
            <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
          </button>
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
          {!s.template && teams.length > 1 && (
            <div className="row team-pick" role="group" aria-label="Teams des Trainings">
              <span className="hint">Für</span>
              {teams.map((t) => (
                <label key={t.id} className="check" title={t.id === active ? 'Aktives Team: im Team-Wechsel oben ein anderes wählen' : undefined}>
                  <input type="checkbox" checked={!!s.teams?.includes(t.id)} disabled={t.id === active} onChange={(e) => {
                    const on = e.target.checked
                    upd((s) => ({ ...s, teams: on ? [...(s.teams ?? []), t.id] : (s.teams ?? []).filter((x) => x !== t.id) }))
                  }} /> <span className="team-chip" style={{ '--team': t.color } as CSSProperties}>{t.name}</span>
                </label>
              ))}
            </div>
          )}
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
                    {entries.length > 1 && (
                      <select aria-label={`Zone Posten ${entries.indexOf(e) + 1}`} value={e.zone ?? ''} onChange={(ev) => setEntry(e.id, { zone: ev.target.value || undefined })}>
                        <option value="">Zone: automatisch ({postenZones(entries.map((x) => (x === e ? { ...x, zone: undefined } : x)))[entries.indexOf(e)].label})</option>
                        {ZONES.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
                      </select>
                    )}
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
                <PostenMap entries={entries} />
                <ol className="entries posten">{cards}</ol>
              </li>
            )
          })}
        </ol>
      </section>
      {run && <RunMode s={s} onClose={() => setRun(false)} />}
      {finder && (
        <DrillFinder drills={db.drills} category={finder.category} inSession={s.entries.map((e) => e.drill.id)}
          {...(finder.replace
            ? { title: 'Übung ersetzen', pickLabel: 'Einsetzen', onPick: (d: Drill) => setEntry(finder.replace!, { drill: structuredClone(d) }) }
            : { title: 'Übungen hinzufügen', pickLabel: 'Hinzufügen', keepOpen: true, onPick: (d: Drill) => upd((s) => addEntries(s, [d])) })}
          onClose={() => setFinder(null)} />
      )}
      <div className="print-only sheet">
        <header className="sheet-head">
          {teams.length > 1 && <p className="sheet-teams">{teams.filter((t) => s.teams?.includes(t.id)).map((t) => t.name).join(' · ')}</p>}
          <h1>{s.title}</h1>
          <p>{[s.date && new Date(`${s.date}T00:00`).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), s.start && span(0, total), `Total ${total} Min.`].filter(Boolean).join(' · ')}
            {plan.length > 1 && <small> (inkl. {plan.length - 1} × {CHANGE_MINUTES} Min. Wechsel zwischen den Blöcken)</small>}</p>
          {needLine && <p>Benötigt: {needLine}</p>}
          {s.notes && <p className="pre">{s.notes}</p>}
        </header>
        {plan.map(({ entries, from, to }, k) => entries.length === 1
          ? <SheetDrill key={entries[0].id} e={entries[0]} label={`${k + 1}. ${entries[0].drill.title}`} time={s.start && span(from, to)} />
          : (
            <section key={entries[0].id} className="sheet-block">
              <h2 className="sheet-title">
                {s.start && <span className="sheet-time">{span(from, to)}</span>}
                <span>{k + 1}. Posten-Block · {entries.length} Posten</span>
                <span className="sheet-min">{blockMinutes(entries)} Min.</span>
              </h2>
              <PostenMap entries={entries} />
              {/* rows of two, each kept on one page: page breaks inside a grid split the cards in half */}
              {entries.filter((_, j) => j % 2 === 0).map((_, r) => (
                <div key={r} className="sheet-posten">
                  {entries.slice(2 * r, 2 * r + 2).map((e, j) => <SheetDrill key={e.id} e={e} label={`Posten ${2 * r + j + 1}: ${e.drill.title}`} />)}
                </div>
              ))}
            </section>
          ))}
      </div>
    </>
  )
}

// One drill on the training sheet for the assistant coaches: diagram and the labelled sections, no tags or author.
function SheetDrill({ e, label, time }: { e: SessionEntry; label: string; time?: string | false }) {
  const d = e.drill
  const { text, notes } = drillSections(d.description)
  const allNotes = [e.notes.trim(), ...notes].filter(Boolean)
  const points = d.keyPoints.filter((k) => k.trim())
  const need = [d.players && `${d.players} Spieler/innen`, d.goalies && `${d.goalies} Torhüter/innen`, d.material && `Material: ${d.material}`].filter(Boolean).join(' · ')
  return (
    <article className="sheet-drill">
      <h3 className="sheet-title">
        {time && <span className="sheet-time">{time}</span>}
        <span>{label}</span>
        <span className="sheet-min">{e.minutes} Min.</span>
      </h3>
      <div className="sheet-body">
        <Picture drill={d} />
        <div>
          {need && <p className="sheet-need">{need}</p>}
          {text && <><h4>Beschreibung</h4><p className="pre">{text}</p></>}
          {points.length > 0 && <><h4>Coaching-Punkte</h4><ul>{points.map((k, i) => <li key={i}>{k}</li>)}</ul></>}
          {allNotes.length > 0 && <><h4>Notizen</h4>{allNotes.map((n, i) => <p key={i} className="pre">{n}</p>)}</>}
        </div>
      </div>
    </article>
  )
}

// Where each Posten of a block takes place; Posten sharing a zone are listed together.
function PostenMap({ entries }: { entries: SessionEntry[] }) {
  const clip = useId()
  const zones = postenZones(entries)
  const groups = [...new Set(zones)].map((z) => ({ z, nums: zones.flatMap((x, i) => (x === z ? [i] : [])) }))
  const short = (t: string, w: number) => (t.length > w / 0.75 ? `${t.slice(0, Math.floor(w / 0.75) - 1)}…` : t)
  return (
    <div className="posten-map">
      <Rink template="full" aria-label="Posten auf dem Eis">
        <clipPath id={clip}><rect width={60} height={30} rx={8.5} /></clipPath>
        <g clipPath={`url(#${clip})`}>
          {groups.map(({ z, nums }) => {
            const [x, y, w, h] = z.rect
            const cx = x + w / 2
            return (
              <g key={z.id}>
                <rect x={x + 0.3} y={y + 0.3} width={w - 0.6} height={h - 0.6} rx={1.2} fill="rgb(12 116 180 / 0.1)" stroke="#0c74b4" strokeWidth={0.2} strokeDasharray="0.8 0.5" />
                <text x={cx} y={y + h / 2 - nums.length * 0.95 + 1} textAnchor="middle" fill="#0a2342" fontWeight={700}>
                  <tspan x={cx} fontSize={3}>{nums.map((n) => n + 1).join(' · ')}</tspan>
                  {nums.map((n) => <tspan key={n} x={cx} dy={1.9} fontSize={1.3} fontWeight={600}>{short(entries[n].drill.title, w)}</tspan>)}
                </text>
              </g>
            )
          })}
        </g>
      </Rink>
    </div>
  )
}
