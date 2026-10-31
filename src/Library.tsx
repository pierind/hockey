import { useEffect, useRef, useState } from 'react'
import { Thumb } from './Diagram'
import { deleteDrill, duplicateDrill, filterDrills, newDrill, rankDrills } from './model'
import type { Change } from './model'
import { HelpButton } from './Help'
import { categories, categoryLabel, elements } from './sihf'
import { AGE_CLASSES } from './types'
import type { Db, Drill } from './types'

// Until a diagram is drawn: the imported original image, or a placeholder for off-ice drills, instead of an empty rink.
// shortcut: https images load from the source site, so they need a connection; inline them as data: URLs if offline matters.
const Picture = ({ drill }: { drill: Drill }) =>
  drill.scene.items.length ? <Thumb scene={drill.scene} aria-label={`Diagramm: ${drill.title}`} />
    : drill.image ? <img className="drill-image" src={drill.image} alt={`Original-Diagramm: ${drill.title}`} loading="lazy" referrerPolicy="no-referrer" />
    : drill.offIce ? <div className="office-thumb" aria-hidden>Off-Ice</div> : <Thumb scene={drill.scene} aria-label={`Diagramm: ${drill.title}`} />

export function DrillSummary({ drill }: { drill: Drill }) {
  return (
    <div className="summary">
      <Picture drill={drill} />
      <div>
        <Chips drill={drill} />
        {(drill.players || drill.goalies || drill.material) && (
          <p className="needs">{[drill.players && `${drill.players} Spieler/innen`, drill.goalies && `${drill.goalies} Torhüter/innen`, drill.material && `Material: ${drill.material}`].filter(Boolean).join(' · ')}</p>
        )}
        {drill.description && <p className="pre">{drill.description}</p>}
        {drill.keyPoints.length > 0 && <ul>{drill.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>}
        {(drill.author || drill.source) && (
          <p className="hint">
            {drill.author && `Autor/in: ${drill.author}`}{drill.author && drill.source && ' · '}
            {drill.source && <a href={drill.source} target="_blank" rel="noreferrer">Quelle: {new URL(drill.source).hostname}</a>}
          </p>
        )}
      </div>
    </div>
  )
}

// Search field instead of a dropdown: with thousands of imported drills a <select> is unusable. Title matches come first.
export function DrillPicker({ drills, label, placeholder = 'Übung suchen…', onPick }: { drills: Drill[]; label: string; placeholder?: string; onPick: (d: Drill) => void }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const hits = needle ? filterDrills(drills, q, '', '', '').sort((a, b) => Number(!a.title.toLowerCase().includes(needle)) - Number(!b.title.toLowerCase().includes(needle))).slice(0, 12) : []
  const pick = (d: Drill) => { onPick(d); setQ('') }
  return (
    <div className="picker">
      <input type="search" aria-label={label} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) pick(hits[0]); if (e.key === 'Escape') setQ('') }} />
      {needle && (
        <ul className="picker-list">
          {hits.length ? hits.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => pick(d)}>
                {d.title || 'Ohne Titel'}{d.draft ? ' (Entwurf)' : ''}{' '}
                <small>{[d.minutes && `${d.minutes} Min.`, d.source && new URL(d.source).hostname.replace(/^www\./, '')].filter(Boolean).join(' · ')}</small>
              </button>
            </li>
          )) : <li className="hint">Keine Übung gefunden.</li>}
        </ul>
      )}
    </div>
  )
}

// Finds drills by training goal instead of by name: Erscheinungsform, then optionally a Schlüsselelement, narrowed by age,
// place or a keyword. keepOpen: stays open after a pick so several drills can be added in one go.
const SUGGESTIONS = 12
export function DrillFinder({ drills, title, category: initial = '', inSession = [], pickLabel, keepOpen = false, onPick, onClose }: {
  drills: Drill[]; title: string; category?: string; inSession?: string[]; pickLabel: string; keepOpen?: boolean; onPick: (d: Drill) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => ref.current?.showModal(), [])
  const [category, setCategory] = useState(initial)
  const [element, setElement] = useState('')
  const [age, setAge] = useState('')
  const [place, setPlace] = useState<'' | 'on' | 'off'>('')
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(SUGGESTIONS)
  const [added, setAdded] = useState(0)
  const filter = (fn: () => void) => { fn(); setShown(SUGGESTIONS) }
  const list = rankDrills(filterDrills(drills, q, category, element, place, age), category)
  return (
    <dialog ref={ref} className="finder" aria-label={title} onClose={onClose}>
      <div className="finder-head">
        <h2>{title}</h2>
        {added > 0 && <span className="pill">{added} hinzugefügt</span>}
        <button className={keepOpen ? 'primary' : ''} onClick={() => ref.current?.close()}>{keepOpen ? 'Fertig' : 'Abbrechen'}</button>
      </div>
      <p className="step">Was soll trainiert werden?</p>
      <div className="tiles" role="group" aria-label="Erscheinungsform">
        {categories.map((c) => (
          <button key={c.id} aria-pressed={category === c.id} onClick={() => filter(() => { setCategory(category === c.id ? '' : c.id); setElement('') })}>
            <small>{c.id}</small> {c.label}
          </button>
        ))}
      </div>
      {category && (
        <>
          <p className="step">Schlüsselelement <span className="hint">optional</span></p>
          <div className="choices" role="group" aria-label="Schlüsselelement">
            {elements.filter((e) => e.category === category).map((e) => (
              <button key={e.id} title={e.goal} aria-pressed={element === e.id} onClick={() => filter(() => setElement(element === e.id ? '' : e.id))}><small>{e.id}</small> {e.label}</button>
            ))}
          </div>
        </>
      )}
      <div className="row finder-filters">
        <input type="search" aria-label="Vorschläge nach Stichwort filtern" placeholder="Stichwort…" value={q} onChange={(e) => filter(() => setQ(e.target.value))} />
        <select aria-label="Altersklasse" value={age} onChange={(e) => filter(() => setAge(e.target.value))}>
          <option value="">Alle Altersklassen</option>
          {AGE_CLASSES.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select aria-label="Ort" value={place} onChange={(e) => filter(() => setPlace(e.target.value as '' | 'on' | 'off'))}>
          <option value="">Eis und Off-Ice</option>
          <option value="on">Auf dem Eis</option>
          <option value="off">Off-Ice</option>
        </select>
        <span className="hint">{list.length} Übungen</span>
      </div>
      {list.length ? (
        <ul className="finder-grid">
          {list.slice(0, shown).map((d) => (
            <li key={d.id} className="finder-card">
              <Picture drill={d} />
              <h3>{d.title || 'Ohne Titel'} {inSession.includes(d.id) && <span className="badge">im Training</span>}</h3>
              {/* only the ages: the Erscheinungsform was just chosen, and all of them make the card tall */}
              <div>{d.ages?.map((a) => <span key={a} className="chip">{a}</span>)}</div>
              <small className="hint">{[d.minutes && `${d.minutes} Min.`, d.author].filter(Boolean).join(' · ')}</small>
              <button aria-label={`${pickLabel}: ${d.title || 'Ohne Titel'}`} onClick={() => {
                onPick(d)
                if (keepOpen) setAdded((n) => n + 1)
                else ref.current?.close()
              }}>{pickLabel}</button>
            </li>
          ))}
        </ul>
      ) : <p className="empty">Keine Übung passt. Filter lockern oder ein anderes Ziel wählen.</p>}
      {list.length > shown && <button className="more" onClick={() => setShown((n) => n + SUGGESTIONS)}>Mehr Vorschläge ({list.length - shown})</button>}
    </dialog>
  )
}

export function Chips({ drill }: { drill: Drill }) {
  return (
    <div>
      {drill.categories.map((c) => <span key={c} className={c === drill.primary ? 'chip primary' : 'chip'}>{categoryLabel[c]}</span>)}
      {drill.offIce && <span className="chip">Off-Ice</span>}
      {drill.ages?.map((a) => <span key={a} className="chip">{a}</span>)}
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

// Cards shown at once: thousands of imported drills with diagrams and collection pickers would take seconds to render.
const PAGE = 60

export function Library({ db, change, onEdit }: { db: Db; change: Change; onEdit: (d: Drill) => void }) {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [element, setElement] = useState('')
  const [place, setPlace] = useState<'' | 'on' | 'off'>('')
  const [age, setAge] = useState('')
  const [shown, setShown] = useState(PAGE)
  const list = filterDrills(db.drills, q, category, element, place, age)
  // A new search or filter starts again at the first page.
  const filter = (fn: () => void) => { fn(); setShown(PAGE) }

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
      <div className="row filters">
        <input type="search" aria-label="Suchen in Titel, Beschreibung, Coaching-Punkten und Autor/in" placeholder="Suchen…" value={q} onChange={(e) => filter(() => setQ(e.target.value))} />
        <CategoryFilter category={category} element={element} onChange={(c, e) => filter(() => { setCategory(c); setElement(e) })} />
        <select aria-label="Ort" value={place} onChange={(e) => filter(() => setPlace(e.target.value as '' | 'on' | 'off'))}>
          <option value="">Auf dem Eis und Off-Ice</option>
          <option value="on">Auf dem Eis</option>
          <option value="off">Off-Ice</option>
        </select>
        <select aria-label="Altersklasse" value={age} onChange={(e) => filter(() => setAge(e.target.value))}>
          <option value="">Alle Altersklassen</option>
          {AGE_CLASSES.map((a) => <option key={a}>{a}</option>)}
        </select>
      </div>
      {db.drills.length === 0 ? (
        <p className="empty">Noch keine Übungen. Erstelle die erste mit «Neue Übung».</p>
      ) : list.length === 0 ? (
        <p className="empty">Keine Übung passt zu Suche und Filter.</p>
      ) : (
        <>
        <ul className="cards">
          {list.slice(0, shown).map((d) => (
            <li key={d.id} className="card">
              <button className="thumb" onClick={() => onEdit(d)} aria-label={`${d.title || 'Ohne Titel'} öffnen`}>
                <Picture drill={d} />
              </button>
              <h3>{d.title || 'Ohne Titel'} {d.draft && <span className="badge">Entwurf</span>}</h3>
              <Chips drill={d} />
              <div className="row">
                <button className="ghost" onClick={() => onEdit(d)}>Öffnen</button>
                <button className="ghost" onClick={() => change((db) => ({ ...db, drills: [...db.drills, duplicateDrill(d)] }))}>Duplizieren</button>
                <button className="ghost danger" onClick={() => del(d)}>Löschen</button>
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
        {list.length > shown && (
          <div className="row">
            <span className="hint">{shown} von {list.length} Übungen</span>
            <button onClick={() => setShown((n) => n + PAGE)}>Mehr anzeigen</button>
            <button onClick={() => setShown(list.length)}>Alle anzeigen</button>
          </div>
        )}
        </>
      )}
    </section>
  )
}
