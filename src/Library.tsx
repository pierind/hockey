import { useState } from 'react'
import { Thumb } from './Diagram'
import { deleteDrill, duplicateDrill, filterDrills, newDrill } from './model'
import type { Change } from './model'
import { HelpButton } from './Help'
import { categories, categoryLabel, elements } from './sihf'
import type { Db, Drill } from './types'

// Off-ice drills without a diagram get a placeholder instead of an empty rink.
const Picture = ({ drill }: { drill: Drill }) =>
  drill.offIce && !drill.scene.items.length ? <div className="office-thumb" aria-hidden>Off-Ice</div> : <Thumb scene={drill.scene} aria-label={`Diagramm: ${drill.title}`} />

export function DrillSummary({ drill }: { drill: Drill }) {
  return (
    <div className="summary">
      <Picture drill={drill} />
      <div>
        <Chips drill={drill} />
        {drill.description && <p className="pre">{drill.description}</p>}
        {drill.keyPoints.length > 0 && <ul>{drill.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>}
      </div>
    </div>
  )
}

export function Chips({ drill }: { drill: Drill }) {
  return (
    <div>
      {drill.categories.map((c) => <span key={c} className={c === drill.primary ? 'chip primary' : 'chip'}>{categoryLabel[c]}</span>)}
      {drill.offIce && <span className="chip">Off-Ice</span>}
    </div>
  )
}

// Erscheinungsform, then a Schlüsselelement narrowed to it; ids are shown because labels repeat across categories.
export function CategoryFilter({ category, element, onChange }: { category: string; element: string; onChange: (category: string, element: string) => void }) {
  return (
    <>
      <select aria-label="Erscheinungsform" value={category} onChange={(e) => onChange(e.target.value, '')}>
        <option value="">Alle Erscheinungsformen</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select aria-label="Schlüsselelement" value={element} onChange={(e) => onChange(category, e.target.value)}>
        <option value="">Alle Schlüsselelemente</option>
        {elements.filter((e) => !category || e.category === category).map((e) => <option key={e.id} value={e.id}>{e.id} {e.label}</option>)}
      </select>
    </>
  )
}

export function Library({ db, change, onEdit }: { db: Db; change: Change; onEdit: (d: Drill) => void }) {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [element, setElement] = useState('')
  const [place, setPlace] = useState<'' | 'on' | 'off'>('')
  const list = filterDrills(db.drills, q, category, element, place)

  function del(d: Drill) {
    const cols = db.collections.filter((c) => c.drillIds.includes(d.id)).map((c) => c.name)
    const msg = [`Übung «${d.title || 'Ohne Titel'}» löschen?`, cols.length ? `Sie wird aus diesen Sammlungen entfernt: ${cols.join(', ')}.` : '', 'Bereits geplante Trainings behalten ihre Kopie.']
    if (confirm(msg.filter(Boolean).join('\n'))) change((db) => deleteDrill(db, d.id))
  }

  return (
    <section>
      <div className="row">
        <h2>Bibliothek</h2>
        <HelpButton topic="library" />
        <button className="primary" onClick={() => onEdit(newDrill())}>Neue Übung</button>
      </div>
      <div className="row">
        <input type="search" aria-label="Suchen in Titel, Beschreibung und Coaching-Punkten" placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
        <CategoryFilter category={category} element={element} onChange={(c, e) => { setCategory(c); setElement(e) }} />
        <select aria-label="Ort" value={place} onChange={(e) => setPlace(e.target.value as '' | 'on' | 'off')}>
          <option value="">Auf dem Eis und Off-Ice</option>
          <option value="on">Auf dem Eis</option>
          <option value="off">Off-Ice</option>
        </select>
      </div>
      {db.drills.length === 0 ? (
        <p className="empty">Noch keine Übungen. Erstelle die erste mit «Neue Übung».</p>
      ) : list.length === 0 ? (
        <p className="empty">Keine Übung passt zu Suche und Filter.</p>
      ) : (
        <ul className="cards">
          {list.map((d) => (
            <li key={d.id} className="card">
              <button className="thumb" onClick={() => onEdit(d)} aria-label={`${d.title || 'Ohne Titel'} öffnen`}>
                <Picture drill={d} />
              </button>
              <h3>{d.title || 'Ohne Titel'} {d.draft && <span className="badge">Entwurf</span>}</h3>
              <Chips drill={d} />
              <div className="row">
                <button onClick={() => onEdit(d)}>Öffnen</button>
                <button onClick={() => change((db) => ({ ...db, drills: [...db.drills, duplicateDrill(d)] }))}>Duplizieren</button>
                <button onClick={() => del(d)}>Löschen</button>
                {db.collections.some((c) => !c.drillIds.includes(d.id)) && (
                  <select aria-label="Zu Sammlung hinzufügen" value=""
                    onChange={(e) => {
                      const id = e.target.value
                      change((db) => ({ ...db, collections: db.collections.map((c) => (c.id === id ? { ...c, drillIds: [...c.drillIds, d.id] } : c)) }))
                    }}>
                    <option value="">Zu Sammlung…</option>
                    {db.collections.filter((c) => !c.drillIds.includes(d.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
