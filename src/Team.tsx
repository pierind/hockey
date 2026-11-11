import { useEffect, useRef, useState } from 'react'
import { HelpButton } from './Help'
import { attendance, newTeam, removePlayer, removeTeam, teamOnly } from './model'
import type { Change } from './model'
import { uid } from './scene'
import { categories, elementById, elements } from './sihf'
import type { CSSProperties } from 'react'
import type { Db, Player, TeamInfo } from './types'

// db: the active team's view; all: every team, for the team list and the players' other teams.
export function Team({ db, all, team: active, change, onTeam }: { db: Db; all: Db; team: TeamInfo; change: Change; onTeam: (id: string) => void }) {
  const teams = all.teams ?? []
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [dossier, setDossier] = useState<string | null>(null) // player id whose dossier is open
  const [byRate, setByRate] = useState(false) // sort by attendance, lowest first, instead of the team order
  const awk = attendance(db.sessions, from, to)
  const rate = (id: string) => (awk.total ? awk.present(id) / awk.total : 0)
  const team = byRate ? [...(db.players ?? [])].sort((a, b) => rate(a.id) - rate(b.id)) : db.players ?? []
  const upd = (id: string, patch: Partial<Player>) =>
    change((db) => ({ ...db, players: (db.players ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  // In several teams: leaves only this one; otherwise the player is deleted.
  const remove = (p: Player) => (p.teams?.length ?? 0) > 1
    ? confirm(`${p.name} aus ${active.name} entfernen? Bleibt in den anderen Teams.`) && upd(p.id, { teams: p.teams!.filter((t) => t !== active.id) })
    : confirm(`${p.name} aus dem Team entfernen? Die Anwesenheit in bisherigen Trainings und die Einteilung in Spiel-Aufstellungen werden ebenfalls entfernt.`) &&
      change((db) => removePlayer(db, p.id))
  const setTeam = (patch: Partial<TeamInfo>) => change((db) => ({ ...db, teams: (db.teams ?? []).map((t) => (t.id === active.id ? { ...t, ...patch } : t)) }))
  const addTeam = () => {
    const t = newTeam(teams)
    change((db) => ({ ...db, teams: [...(db.teams ?? []), t] })).catch(() => {})
    onTeam(t.id) // at once, so typing the name renames the new team
  }
  const deleteTeam = () => {
    const n = teamOnly(all, active.id)
    if (!confirm(`Team «${active.name}» löschen? Dabei werden ${n.sessions} Trainings, ${n.games} Spiele, ${n.players} Spieler/innen und ${n.plans} Saisonpläne gelöscht, die nur zu diesem Team gehören. Gemeinsame Trainings bleiben bei den anderen Teams.`)) return
    change((db) => removeTeam(db, active.id)).then(() => onTeam(teams.find((t) => t.id !== active.id)!.id), () => {})
  }

  return (
    <section>
      <div className="row team-head">
        <input className="title-input" aria-label="Teamname" key={active.id} defaultValue={active.name} onBlur={(e) => {
          const name = e.target.value.trim()
          if (name && name !== active.name) setTeam({ name })
        }} />
        <input type="color" aria-label="Teamfarbe" value={active.color} onChange={(e) => setTeam({ color: e.target.value })} />
        <button onClick={addTeam}>+ Neues Team</button>
        {teams.length > 1 && <button className="ghost danger" onClick={deleteTeam}>Team löschen</button>}
      </div>
      <div className="row">
        <h2>Spieler/innen</h2>
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
            <tr><th scope="col">Nr.</th><th scope="col">Name</th><th scope="col">Position</th><th scope="col">Gruppe</th>{teams.length > 1 && <th scope="col">Teams</th>}<th scope="col">Anwesend</th><th scope="col"><span className="sr-only">Aktionen</span></th></tr>
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
                {teams.length > 1 && (
                  <td className="player-teams">
                    {teams.map((t) => (
                      <label key={t.id} className="check">
                        <input type="checkbox" aria-label={`${p.name} in ${t.name}`} checked={!!p.teams?.includes(t.id)} disabled={t.id === active.id}
                          onChange={(e) => upd(p.id, { teams: e.target.checked ? [...(p.teams ?? []), t.id] : (p.teams ?? []).filter((x) => x !== t.id) })} />
                        <span className="team-chip" style={{ '--team': t.color } as CSSProperties}>{t.name}</span>
                      </label>
                    ))}
                  </td>
                )}
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
