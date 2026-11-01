import { useEffect, useRef, useState } from 'react'
import { HelpButton } from './Help'
import { attendance, removePlayer } from './model'
import type { Change } from './model'
import { uid } from './scene'
import { categories, elementById, elements } from './sihf'
import type { Db, Player } from './types'

export function Team({ db, change }: { db: Db; change: Change }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [dossier, setDossier] = useState<string | null>(null) // player id whose dossier is open
  const [byRate, setByRate] = useState(false) // sort by attendance, lowest first, instead of the team order
  const awk = attendance(db.sessions, from, to)
  const rate = (id: string) => (awk.total ? awk.present(id) / awk.total : 0)
  const team = byRate ? [...(db.players ?? [])].sort((a, b) => rate(a.id) - rate(b.id)) : db.players ?? []
  const upd = (id: string, patch: Partial<Player>) =>
    change((db) => ({ ...db, players: (db.players ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  const remove = (p: Player) =>
    confirm(`${p.name} aus dem Team entfernen? Die Anwesenheit in bisherigen Trainings und die Einteilung in Spiel-Aufstellungen werden ebenfalls entfernt.`) &&
    change((db) => removePlayer(db, p.id))

  return (
    <section>
      <div className="row">
        <h2>Team</h2>
        <HelpButton topic="team" />
        <button className="primary" onClick={() => change((db) => ({ ...db, players: [...(db.players ?? []), { id: uid(), name: 'Neue/r Spieler/in', position: 'F' }] }))}>
          Spieler/in hinzufügen
        </button>
        <span className="hint">{team.length} Spieler/innen</span>
      </div>
      <div className="row filters">
        <strong>Anwesenheit</strong>
        <label className="field">Von <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="field">Bis <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={byRate} onChange={(e) => setByRate(e.target.checked)} /> Nach Anwesenheit sortieren</label>
        <span className="hint">aus {awk.total} Trainings mit erfasster Anwesenheit{from || to ? ' im Zeitraum' : ''}</span>
      </div>
      {team.length === 0 ? <p className="empty">Noch keine Spieler/innen.</p> : (
        <table className="stats team">
          <thead>
            <tr><th scope="col">Nr.</th><th scope="col">Name</th><th scope="col">Position</th><th scope="col">Gruppe</th><th scope="col">Anwesend</th><th scope="col"><span className="sr-only">Aktionen</span></th></tr>
          </thead>
          <tbody>
            {team.map((p) => (
              <tr key={p.id}>
                <td><input type="number" min={0} className="num" aria-label={`Nummer ${p.name}`} defaultValue={p.number ?? ''}
                  onBlur={(e) => upd(p.id, { number: e.target.value === '' ? undefined : Number(e.target.value) })} /></td>
                <td><input aria-label={`Name ${p.name}`} defaultValue={p.name} onBlur={(e) => {
                  const name = e.target.value.trim()
                  if (name && name !== p.name) upd(p.id, { name })
                }} /></td>
                <td>
                  <select aria-label={`Position ${p.name}`} value={p.position} onChange={(e) => upd(p.id, { position: e.target.value as Player['position'] })}>
                    <option value="F">Stürmer/in (F)</option>
                    <option value="D">Verteidiger/in (D)</option>
                    <option value="G">Torhüter/in (G)</option>
                  </select>
                </td>
                <td><input aria-label={`Gruppe ${p.name}`} list="groups" defaultValue={p.group ?? ''} onBlur={(e) => upd(p.id, { group: e.target.value.trim() || undefined })} /></td>
                <td>{awk.total ? `${awk.present(p.id)} / ${awk.total} · ${Math.round(rate(p.id) * 100)} %` : '–'}</td>
                <td>
                  <button className="ghost" onClick={() => setDossier(p.id)}>Dossier{p.goals?.length || p.notes?.length ? ` (${(p.goals?.length ?? 0) + (p.notes?.length ?? 0)})` : ''}</button>
                  <button className="ghost danger" onClick={() => remove(p)}>Entfernen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {team.filter((p) => p.id === dossier).map((p) => <Dossier key={p.id} p={p} upd={(patch) => upd(p.id, patch)} onClose={() => setDossier(null)} />)}
      <datalist id="groups">{[...new Set(team.map((p) => p.group).filter(Boolean))].map((g) => <option key={g} value={g} />)}</datalist>
    </section>
  )
}

// Player dossier: development goals as Schlüsselelemente and dated notes, newest first.
function Dossier({ p, upd, onClose }: { p: Player; upd: (patch: Partial<Player>) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => ref.current?.showModal(), [])
  const [date, setDate] = useState(() => new Date().toLocaleDateString('sv')) // local YYYY-MM-DD
  const [text, setText] = useState('')
  const goals = p.goals ?? []
  const notes = p.notes ?? []
  return (
    <dialog ref={ref} className="finder" aria-label={`Dossier ${p.name}`} onClose={onClose}>
      <div className="finder-head">
        <h2>{p.number} {p.name}</h2>
        <button className="primary" onClick={() => ref.current?.close()}>Fertig</button>
      </div>
      <p className="step">Entwicklungsziele</p>
      <div className="choices">
        {goals.map((g) => (
          <button key={g} aria-label={`Ziel ${g} ${elementById[g].label} entfernen`} onClick={() => upd({ goals: goals.filter((x) => x !== g) })}>
            <small>{g}</small> {elementById[g].label} ✕
          </button>
        ))}
        <select aria-label="Entwicklungsziel hinzufügen" value="" onChange={(e) => e.target.value && upd({ goals: [...goals, e.target.value] })}>
          <option value="">+ Ziel (Schlüsselelement)…</option>
          {categories.filter((c) => elements.some((e) => e.category === c.id)).map((c) => (
            <optgroup key={c.id} label={c.label}>
              {elements.filter((e) => e.category === c.id && !goals.includes(e.id)).map((e) => <option key={e.id} value={e.id}>{e.id} {e.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <p className="step">Notizen</p>
      <form className="row" onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) upd({ notes: [...notes, { date, text: text.trim() }] })
        setText('')
      }}>
        <input type="date" aria-label="Datum der Notiz" value={date} onChange={(e) => setDate(e.target.value)} />
        <textarea aria-label="Neue Notiz" rows={2} placeholder="Beobachtung, Fortschritt, Gespräch…" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} />
        <button className="primary">Notiz hinzufügen</button>
      </form>
      {notes.length === 0 ? <p className="hint">Noch keine Notizen.</p> : (
        <ul className="list card">
          {notes.map((n, i) => ({ n, i })).sort((a, b) => b.n.date.localeCompare(a.n.date)).map(({ n, i }) => (
            <li key={i} className="row">
              <strong>{n.date}</strong>
              <div className="pre" style={{ flex: 1 }}>{n.text}</div>
              <button className="ghost danger" onClick={() => upd({ notes: notes.filter((_, j) => j !== i) })}>Entfernen</button>
            </li>
          ))}
        </ul>
      )}
    </dialog>
  )
}
