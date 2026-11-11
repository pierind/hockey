import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Board } from './Board'
import { Collections } from './Collections'
import { Dashboard } from './Dashboard'
import { download, load, store } from './db'
import { Editor } from './Editor'
import { Games } from './Games'
import { Help, HelpButton } from './Help'
import { Library } from './Library'
import { claimNew, emptyDb, mergeDb, migrateDb, migrateDrill, migrateDrills, saveVariant, teamView, upsertDrill, validateDb } from './model'
import { uid } from './scene'
import type { Change } from './model'
import { Season } from './Season'
import { Sessions } from './Sessions'
import { Team } from './Team'
import type { Db, Drill } from './types'

const TABS = [['library', 'Bibliothek'], ['collections', 'Sammlungen'], ['sessions', 'Trainings'], ['games', 'Spiele'], ['season', 'Saisonplan'], ['team', 'Team'], ['board', 'Taktiktafel'], ['dashboard', 'Auswertung'], ['help', 'Hilfe']] as const
type Tab = (typeof TABS)[number][0]

export function App() {
  const [db, setDb] = useState<Db | null>(null)
  const [tab, setTab] = useState<Tab>('library')
  // variant: editing a training entry; saving creates a new library drill and points that entry at it
  const [editing, setEditing] = useState<{ drill: Drill; variant?: { sessionId: string; entryId: string; title: string } } | null>(null)
  const [status, setStatus] = useState('')
  const current = useRef(emptyDb()) // latest state, including writes still in flight
  const persisted = useRef(emptyDb()) // last state the browser confirmed as stored
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Db | null>(null) // validated backup waiting for «Hinzufügen» or «Ersetzen»
  const importDialog = useRef<HTMLDialogElement>(null)
  // Active team: a per-device convenience, so it lives in localStorage (may be unavailable, e.g. private mode).
  const [teamId, setTeamId] = useState(() => { try { return localStorage.getItem('hockey-team') ?? '' } catch { return '' } })
  const pickTeam = (id: string) => {
    setTeamId(id)
    try { localStorage.setItem('hockey-team', id) } catch { /* not remembered */ }
  }
  useEffect(() => {
    if (pending) importDialog.current?.showModal()
  }, [pending])

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {})
    Promise.all([load<Db>('db'), load<Drill>('draft')]).then(([stored, draft]) => {
      current.current = persisted.current = stored ? migrateDb(stored) : emptyDb()
      setDb(current.current)
      if (draft) {
        setEditing({ drill: migrateDrill(draft) })
        setStatus('Ungespeicherter Entwurf wiederhergestellt.')
      }
    }, (e: Error) => setStatus(`Lokaler Speicher nicht verfügbar: ${e.message}`))
  }, [])

  // The whole database is one record, so every write (and every import) is atomic.
  // shortcut: whole-db writes; split into per-record stores if saving gets slow with many drills.
  const change: Change = (fn) => {
    const next = fn(current.current)
    current.current = next
    setDb(next)
    setStatus('Speichert…')
    const write = queue.current.then(() => store('db', next))
    queue.current = write.then(
      () => {
        persisted.current = next
        if (current.current === next) setStatus('Gespeichert.')
      },
      (e: Error) => {
        current.current = persisted.current
        setDb(persisted.current)
        setStatus(`Speichern fehlgeschlagen, letzte Änderung verworfen: ${e.message}`)
      },
    )
    return write
  }

  function exportBackup() {
    download(`eishockey-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(current.current, null, 2))
  }

  // Several files (e.g. all drill sources) are joined into one import; validating the joined data rejects ids that appear twice.
  async function importBackup(files: File[]) {
    let next: Db
    try {
      const dbs = await Promise.all(files.map(async (f) => {
        try { return validateDb(JSON.parse(await f.text())) } catch (e) { throw new Error(`${f.name}: ${(e as Error).message}`) }
      }))
      const join = <T,>(pick: (d: Db) => T[] | undefined) => (dbs.some(pick) ? dbs.flatMap((d) => pick(d) ?? []) : undefined)
      const all = dbs.length === 1 ? dbs[0] : validateDb(JSON.parse(JSON.stringify({ version: 1, drills: join((d) => d.drills), collections: join((d) => d.collections),
        sessions: join((d) => d.sessions), players: join((d) => d.players), plans: join((d) => d.plans), games: join((d) => d.games) })))
      next = migrateDrills(all) // same as the stored drills, or merging copies every unchanged one
    } catch (e) {
      setStatus(`Import abgelehnt, nichts geändert: ${(e as Error).message}`)
      return
    }
    setPending(next)
  }

  function applyImport(mode: 'merge' | 'replace') {
    const next = pending!
    importDialog.current?.close()
    if (mode === 'replace') {
      if (!confirm('Alle aktuellen Daten werden ersetzt. Fortfahren?')) return
      if (confirm('Vorher die aktuellen Daten als Backup exportieren?')) exportBackup()
      change(() => migrateDb(next)).catch(() => {})
      return
    }
    const r = mergeDb(current.current, next)
    const teams = current.current.teams ?? []
    // Imported records without a team (older backups) go to the active team.
    change((d) => claimNew(d, r.db, (teams.find((t) => t.id === teamId) ?? teams[0]).id)).then(
      () => setStatus(`Import: ${r.added.drills} Übungen, ${r.added.collections} Sammlungen, ${r.added.sessions} Trainings, ${r.added.games} Spiele hinzugefügt; ${r.skipped} bereits vorhanden.`),
      () => {},
    )
  }

  if (!db) return <main><p role="status">{status || 'Lädt…'}</p></main>

  const teams = db.teams ?? []
  const team = teams.find((t) => t.id === teamId) ?? teams[0]
  const view = teamView(db, team.id)
  // Pages see the active team; what they create is assigned to it.
  const teamChange: Change = (fn) => change((d) => claimNew(d, fn(d), team.id))
  const variant = editing?.variant
  return (
    <>
      {editing && (
        <Editor key={editing.drill.id} initial={editing.drill}
          saved={variant ? editing.drill : db.drills.find((d) => d.id === editing.drill.id)}
          variantOf={variant?.title}
          onSave={(d) => change((db) => (variant ? saveVariant(db, variant.sessionId, variant.entryId, d) : upsertDrill(db, d)))}
          onClose={() => setEditing(null)} />
      )}
      <div hidden={!!editing}>
      <header className="app-bar screen-only">
        <div className="app-bar-inner">
          <h1 className="brand">
            <svg viewBox="0 0 24 24" width={30} height={30} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8}>
              <rect x={1.5} y={5} width={21} height={14} rx={5} /><path d="M12 5v14" /><circle cx={12} cy={12} r={2.6} />
            </svg>
            HockeyCoach
          </h1>
          <nav className="tabs" aria-label="Bereiche">
            {TABS.map(([t, label]) => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{label}</button>)}
          </nav>
          <div className="app-actions">
            <label className="team-switch" style={{ '--team': team.color } as CSSProperties}>
              <span className="sr-only">Aktives Team</span>
              <select value={team.id} onChange={(e) => pickTeam(e.target.value)}>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <button className="icon-btn" aria-label="Backup exportieren" title="Backup exportieren" onClick={exportBackup}>
              <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M7 10l5 5 5-5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></svg>
            </button>
            <button className="icon-btn" aria-label="Backup importieren" title="Backup importieren" onClick={() => fileInput.current?.click()}>
              <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M7 9l5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" /></svg>
            </button>
            <HelpButton topic="data" />
            <input ref={fileInput} type="file" accept="application/json,.json" multiple hidden onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length) importBackup(files)
            }} />
          </div>
        </div>
      </header>
      <main>
        <p role="status" className="status screen-only">{status}</p>
        <dialog ref={importDialog} className="help-dialog" onClose={() => setPending(null)}>
          {pending && (
            <>
              <h3>Backup importieren</h3>
              <p>Der Import enthält {pending.drills.length} Übungen, {pending.collections.length} Sammlungen, {pending.sessions.length} Trainings und {(pending.games ?? []).length} Spiele.</p>
              <div className="row">
                <button className="primary" onClick={() => applyImport('merge')}>Hinzufügen</button>
                <button onClick={() => applyImport('replace')}>Alles ersetzen</button>
                <button onClick={() => importDialog.current?.close()}>Abbrechen</button>
                <HelpButton topic="data" />
              </div>
            </>
          )}
        </dialog>
      <div className="screen-only">
        {tab === 'library' && <Library db={db} change={change} onEdit={(drill) => setEditing({ drill })} />}
        {tab === 'collections' && <Collections db={db} change={change} onEdit={(drill) => setEditing({ drill })} />}
        {tab === 'dashboard' && <Dashboard db={view} />}
        {tab === 'season' && <Season db={view} change={teamChange} />}
        {tab === 'team' && <Team db={view} all={db} team={team} change={teamChange} onTeam={pickTeam} />}
        {tab === 'board' && <Board />}
        {tab === 'help' && <Help />}
      </div>
      {tab === 'games' && <Games db={view} change={teamChange} />}
      {tab === 'sessions' && <Sessions db={view} players={db.players ?? []} team={team.id} change={teamChange} onEditEntry={(sessionId, e) => setEditing({ drill: { ...structuredClone(e.drill), id: uid() }, variant: { sessionId, entryId: e.id, title: e.drill.title } })} />}
      </main>
      </div>
    </>
  )
}
