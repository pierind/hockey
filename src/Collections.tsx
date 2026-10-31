import { useState } from 'react'
import type { ReactNode } from 'react'
import { HelpButton } from './Help'
import { DrillPicker } from './Library'
import { categoryCollections } from './model'
import type { Change } from './model'
import { uid } from './scene'
import type { Collection, Db, Drill } from './types'

// Imported collections hold hundreds of drills; a collection's rows and drill picker are only built while it is open.
function Fold({ summary, initial = false, children }: { summary: string; initial?: boolean; children: () => ReactNode }) {
  const [open, setOpen] = useState(initial)
  return <details className="card" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}><summary>{summary}</summary>{open && children()}</details>
}

export function Collections({ db, change, onEdit }: { db: Db; change: Change; onEdit: (d: Drill) => void }) {
  const [name, setName] = useState('')
  const byId = new Map(db.drills.map((d) => [d.id, d]))
  const upd = (id: string, fn: (c: Collection) => Collection) =>
    change((db) => ({ ...db, collections: db.collections.map((c) => (c.id === id ? fn(c) : c)) }))

  return (
    <section>
      <div className="row"><h2>Sammlungen</h2><HelpButton topic="collections" /></div>
      <h3 className="step">Nach Erscheinungsform</h3>
      <div className="fold-grid">
      {categoryCollections(db).map((c) => (
        <Fold key={c.id} summary={`${c.name} (${c.drillIds.length})`}>
          {() => c.drillIds.length === 0 ? <p className="empty">Noch keine Übungen.</p> : (
            <ul>
              {c.drillIds.map((id) => {
                const d = byId.get(id)!
                return <li key={id}><button className="link" onClick={() => onEdit(d)}>{d.title || 'Ohne Titel'}</button>{d.draft && <span className="badge">Entwurf</span>}</li>
              })}
            </ul>
          )}
        </Fold>
      ))}
      </div>
      <h3 className="step">Eigene Sammlungen</h3>
      <form className="row" onSubmit={(e) => {
        e.preventDefault()
        const n = name.trim() || 'Neue Sammlung'
        change((db) => ({ ...db, collections: [...db.collections, { id: uid(), name: n, drillIds: [] }] }))
        setName('')
      }}>
        <input aria-label="Name der neuen Sammlung" placeholder="z. B. Passen" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary">Sammlung erstellen</button>
      </form>
      {db.collections.length === 0 && <p className="empty">Noch keine Sammlungen.</p>}
      {db.collections.map((c) => (
        <Fold key={c.id} summary={`${c.name} (${c.drillIds.length})`} initial={!c.drillIds.length}>{() => (<>
          <div className="row">
            <input aria-label="Name der Sammlung" defaultValue={c.name} onBlur={(e) => {
              const n = e.target.value.trim()
              if (n && n !== c.name) upd(c.id, (c) => ({ ...c, name: n }))
            }} />
            <input aria-label="Beschreibung der Sammlung" placeholder="Beschreibung (optional)" defaultValue={c.description ?? ''} onBlur={(e) => {
              const v = e.target.value.trim() || undefined
              if (v !== c.description) upd(c.id, (c) => ({ ...c, description: v }))
            }} />
            <button className="ghost danger" onClick={() => confirm(`Sammlung «${c.name}» löschen? Die Übungen bleiben in der Bibliothek.`) &&
              change((db) => ({ ...db, collections: db.collections.filter((x) => x.id !== c.id) }))}>Löschen</button>
          </div>
          {c.drillIds.length === 0 ? <p className="empty">Noch leer.</p> : (
            <ul>
              {c.drillIds.map((id) => {
                const d = byId.get(id)
                return d && (
                  <li key={id}>
                    <button className="link" onClick={() => onEdit(d)}>{d.title || 'Ohne Titel'}</button>{' '}
                    <button className="ghost danger" onClick={() => upd(c.id, (c) => ({ ...c, drillIds: c.drillIds.filter((x) => x !== id) }))}>Entfernen</button>
                  </li>
                )
              })}
            </ul>
          )}
          <DrillPicker drills={db.drills.filter((d) => !c.drillIds.includes(d.id))} label={`Übung zu ${c.name} hinzufügen`} placeholder="Übung hinzufügen…"
            onPick={(d) => upd(c.id, (c) => ({ ...c, drillIds: [...c.drillIds, d.id] }))} />
        </>)}</Fold>
      ))}
    </section>
  )
}
