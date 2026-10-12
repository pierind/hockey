import { useState } from 'react'
import { HelpButton } from './Help'
import { categoryCollections } from './model'
import type { Change } from './model'
import { uid } from './scene'
import type { Collection, Db, Drill } from './types'

export function Collections({ db, change, onEdit }: { db: Db; change: Change; onEdit: (d: Drill) => void }) {
  const [name, setName] = useState('')
  const upd = (id: string, fn: (c: Collection) => Collection) =>
    change((db) => ({ ...db, collections: db.collections.map((c) => (c.id === id ? fn(c) : c)) }))

  return (
    <section>
      <div className="row"><h2>Sammlungen</h2><HelpButton topic="collections" /></div>
      <h3>Nach Erscheinungsform</h3>
      {categoryCollections(db).map((c) => (
        <details key={c.id} className="card">
          <summary>{c.name} ({c.drillIds.length})</summary>
          {c.drillIds.length === 0 ? <p className="empty">Noch keine Übungen.</p> : (
            <ul>
              {c.drillIds.map((id) => {
                const d = db.drills.find((d) => d.id === id)!
                return <li key={id}><button className="link" onClick={() => onEdit(d)}>{d.title || 'Ohne Titel'}</button>{d.draft && <span className="badge">Entwurf</span>}</li>
              })}
            </ul>
          )}
        </details>
      ))}
      <h3>Eigene Sammlungen</h3>
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
        <div key={c.id} className="card">
          <div className="row">
            <input aria-label="Name der Sammlung" defaultValue={c.name} onBlur={(e) => {
              const n = e.target.value.trim()
              if (n && n !== c.name) upd(c.id, (c) => ({ ...c, name: n }))
            }} />
            <input aria-label="Beschreibung der Sammlung" placeholder="Beschreibung (optional)" defaultValue={c.description ?? ''} onBlur={(e) => {
              const v = e.target.value.trim() || undefined
              if (v !== c.description) upd(c.id, (c) => ({ ...c, description: v }))
            }} />
            <button onClick={() => confirm(`Sammlung «${c.name}» löschen? Die Übungen bleiben in der Bibliothek.`) &&
              change((db) => ({ ...db, collections: db.collections.filter((x) => x.id !== c.id) }))}>Löschen</button>
          </div>
          {c.drillIds.length === 0 ? <p className="empty">Noch leer.</p> : (
            <ul>
              {c.drillIds.map((id) => {
                const d = db.drills.find((d) => d.id === id)
                return d && (
                  <li key={id}>
                    <button className="link" onClick={() => onEdit(d)}>{d.title || 'Ohne Titel'}</button>{' '}
                    <button onClick={() => upd(c.id, (c) => ({ ...c, drillIds: c.drillIds.filter((x) => x !== id) }))}>Entfernen</button>
                  </li>
                )
              })}
            </ul>
          )}
          <select aria-label={`Übung zu ${c.name} hinzufügen`} value="" onChange={(e) => {
            const id = e.target.value
            upd(c.id, (c) => ({ ...c, drillIds: [...c.drillIds, id] }))
          }}>
            <option value="">Übung hinzufügen…</option>
            {db.drills.filter((d) => !c.drillIds.includes(d.id)).map((d) => <option key={d.id} value={d.id}>{d.title || 'Ohne Titel'}</option>)}
          </select>
        </div>
      ))}
    </section>
  )
}
