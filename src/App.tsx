import { useEffect, useRef, useState } from 'react'
import { Collections } from './Collections'
import { Dashboard } from './Dashboard'
import { load, store } from './db'
import { Editor } from './Editor'
import { Help, HelpButton } from './Help'
import { Library } from './Library'
import { emptyDb, migrateDb, migrateDrill, upsertDrill, validateDb } from './model'
import type { Change } from './model'
import { Sessions } from './Sessions'
import type { Db, Drill } from './types'

const TABS = [['library', 'Bibliothek'], ['collections', 'Sammlungen'], ['sessions', 'Trainings'], ['dashboard', 'Auswertung'], ['help', 'Hilfe']] as const
type Tab = (typeof TABS)[number][0]

export function App() {
  const [db, setDb] = useState<Db | null>(null)
  const [tab, setTab] = useState<Tab>('library')
  const [editing, setEditing] = useState<Drill | null>(null)
  const [status, setStatus] = useState('')
  const current = useRef(emptyDb()) // latest state, including writes still in flight
  const persisted = useRef(emptyDb()) // last state the browser confirmed as stored
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {})
    Promise.all([load<Db>('db'), load<Drill>('draft')]).then(([stored, draft]) => {
      current.current = persisted.current = stored ? migrateDb(stored) : emptyDb()
      setDb(current.current)
      if (draft) {
        setEditing(migrateDrill(draft))
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
    const blob = new Blob([JSON.stringify(current.current, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `eishockey-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  async function importBackup(file: File) {
    let next: Db
    try {
      next = validateDb(JSON.parse(await file.text()))
    } catch (e) {
      setStatus(`Import abgelehnt, nichts geändert: ${(e as Error).message}`)
      return
    }
    const summary = `${next.drills.length} Übungen, ${next.collections.length} Sammlungen, ${next.sessions.length} Trainings`
    if (!confirm(`Das Backup enthält ${summary}.\nEs ersetzt ALLE aktuellen Daten. Fortfahren?`)) return
    if (confirm('Vorher die aktuellen Daten als Backup exportieren?')) exportBackup()
    change(() => next).catch(() => {})
  }

  if (!db) return <main><p role="status">{status || 'Lädt…'}</p></main>

  if (editing)
    return (
      <Editor key={editing.id} initial={editing} saved={db.drills.find((d) => d.id === editing.id)}
        onSave={(d) => change((db) => upsertDrill(db, d))} onClose={() => setEditing(null)} />
    )

  return (
    <main>
      <header className="screen-only">
        <div className="row">
          <h1>Eishockey Trainingsplaner</h1>
          <nav className="row" aria-label="Bereiche">
            {TABS.map(([t, label]) => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{label}</button>)}
          </nav>
          <span className="spacer" />
          <button onClick={exportBackup}>Backup exportieren</button>
          <HelpButton topic="data" />
          <button onClick={() => fileInput.current?.click()}>Backup importieren</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) importBackup(f)
          }} />
        </div>
        <p role="status" className="status">{status}</p>
      </header>
      <div className="screen-only">
        {tab === 'library' && <Library db={db} change={change} onEdit={setEditing} />}
        {tab === 'collections' && <Collections db={db} change={change} onEdit={setEditing} />}
        {tab === 'dashboard' && <Dashboard db={db} />}
        {tab === 'help' && <Help />}
      </div>
      {tab === 'sessions' && <Sessions db={db} change={change} />}
    </main>
  )
}
