import { HelpButton } from './Help'
import { removePlayer } from './model'
import type { Change } from './model'
import { uid } from './scene'
import type { Db, Player } from './types'

export function Team({ db, change }: { db: Db; change: Change }) {
  const team = db.players ?? []
  const recorded = db.sessions.filter((s) => s.attendance && !s.template)
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
        <span className="hint">{team.length} Spieler/innen · Anwesenheit aus {recorded.length} erfassten Trainings</span>
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
                <td>{recorded.length ? `${recorded.filter((s) => s.attendance!.includes(p.id)).length} / ${recorded.length}` : '–'}</td>
                <td><button onClick={() => remove(p)}>Entfernen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <datalist id="groups">{[...new Set(team.map((p) => p.group).filter(Boolean))].map((g) => <option key={g} value={g} />)}</datalist>
    </section>
  )
}
