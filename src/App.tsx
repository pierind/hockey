import { useEffect, useRef, useState } from 'react'
import { Collections } from './Collections'
import { Dashboard } from './Dashboard'
import { load, store } from './db'
import { Editor } from './Editor'
import { Help, HelpButton } from './Help'
import { Library } from './Library'
import { emptyDb, mergeDb, migrateDb, migrateDrill, saveVariant, upsertDrill, validateDb } from './model'
import { uid } from './scene'
import type { Change } from './model'
import { Sessions } from './Sessions'
import type { Db, Drill } from './types'

const TABS = [['library', 'Bibliothek'], ['collections', 'Sammlungen'], ['sessions', 'Trainings'], ['dashboard', 'Auswertung'], ['help', 'Hilfe']] as const
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
    setPending(next)
  }

  function applyImport(mode: 'merge' | 'replace') {
    const next = pending!
    importDialog.current?.close()
    if (mode === 'replace') {
      if (!confirm('Alle aktuellen Daten werden ersetzt. Fortfahren?')) return
      if (confirm('Vorher die aktuellen Daten als Backup exportieren?')) exportBackup()
      change(() => next).catch(() => {})
      return
    }
    const r = mergeDb(current.current, next)
    change(() => r.db).then(
      () => setStatus(`Import: ${r.added.drills} Übungen, ${r.added.collections} Sammlungen, ${r.added.sessions} Trainings hinzugefügt; ${r.skipped} bereits vorhanden.`),
      () => {},
    )
  }

  if (!db) return <main><p role="status">{status || 'Lädt…'}</p></main>

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
            Eishockey Trainingsplaner
          </h1>
          <nav className="tabs" aria-label="Bereiche">
            {TABS.map(([t, label]) => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{label}</button>)}
          </nav>
          <div className="app-actions">
            <button onClick={exportBackup}>Backup exportieren</button>
            <button onClick={() => fileInput.current?.click()}>Backup importieren</button>
            <HelpButton topic="data" />
            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) importBackup(f)
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
              <p>Die Datei enthält {pending.drills.length} Übungen, {pending.collections.length} Sammlungen und {pending.sessions.length} Trainings.</p>
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
        {tab === 'dashboard' && <Dashboard db={db} />}
        {tab === 'help' && <Help />}
      </div>
      {tab === 'sessions' && <Sessions db={db} change={change} onEditEntry={(sessionId, e) => setEditing({ drill: { ...structuredClone(e.drill), id: uid() }, variant: { sessionId, entryId: e.id, title: e.drill.title } })} />}
      </main>
      </div>
    </>
  )
}
