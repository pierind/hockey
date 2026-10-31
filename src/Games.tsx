import { useState } from 'react'
import { HelpButton } from './Help'
import { LINEUP_SLOTS, gameTitle, setSlot } from './model'
import type { Change } from './model'
import { uid } from './scene'
import { CalendarButton } from './Sessions'
import type { Db, Game, Player } from './types'

const playerName = (p: Player) => `${p.number ?? ''} ${p.name}`.trim()

export function Games({ db, change }: { db: Db; change: Change }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const games = db.games ?? []
  const game = games.find((g) => g.id === openId)
  const upd = (fn: (g: Game) => Game) => change((db) => ({ ...db, games: (db.games ?? []).map((g) => (g.id === openId ? fn(g) : g)) }))

  if (game) return <GameEditor key={game.id} g={game} db={db} upd={upd} onBack={() => setOpenId(null)} />

  const add = () => {
    const g: Game = { id: uid(), opponent: '', lineup: {} }
    change((db) => ({ ...db, games: [...(db.games ?? []), g] }))
    setOpenId(g.id)
  }
  return (
    <section className="screen-only">
      <div className="row">
        <h2>Spiele</h2>
        <HelpButton topic="games" />
        <button className="primary" onClick={add}>Neues Spiel</button>
        <CalendarButton db={db} />
      </div>
      {games.length === 0 ? <p className="empty">Noch keine Spiele erfasst.</p> : (
        <ul className="list card">
          {[...games].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')).map((g) => (
            <li key={g.id} className="row">
              <button className="link" onClick={() => setOpenId(g.id)}>{gameTitle(g)}</button>
              <span>{g.date ?? 'ohne Datum'}{g.start && ` · ${g.start}`} · {Object.keys(g.lineup).length} eingeteilt</span>
              <button className="ghost danger" onClick={() => confirm(`Spiel «${gameTitle(g)}» löschen?`) && change((db) => ({ ...db, games: (db.games ?? []).filter((x) => x.id !== g.id) }))}>Löschen</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function GameEditor({ g, db, upd, onBack }: { g: Game; db: Db; upd: (fn: (g: Game) => Game) => void; onBack: () => void }) {
  const team = db.players ?? []
  const others = (db.games ?? []).filter((x) => x.id !== g.id && Object.keys(x.lineup).length)
  const byId = new Map(team.map((p) => [p.id, p]))
  const unplaced = team.filter((p) => !Object.values(g.lineup).includes(p.id))
  const when = [g.date, g.start].filter(Boolean).join(' · ')

  return (
    <>
      <section className="screen-only">
        <div className="row">
          <button className="ghost" onClick={onBack}>← Alle Spiele</button>
          <span className="spacer" />
          <HelpButton topic="games" />
          <button onClick={() => print()}>Drucken / PDF</button>
        </div>
        <header className="session-head">
          <h2>{gameTitle(g)}</h2>
          <div className="row">
          <label className="field">Gegner <input defaultValue={g.opponent} onBlur={(e) => {
            const opponent = e.target.value.trim()
            if (opponent !== g.opponent) upd((g) => ({ ...g, opponent }))
          }} /></label>
          <label className="field">Ort <select value={g.away ? 'away' : 'home'} onChange={(e) => {
            const away = e.target.value === 'away' || undefined
            upd((g) => ({ ...g, away }))
          }}>
            <option value="home">Heim</option>
            <option value="away">Auswärts</option>
          </select></label>
          <label className="field">Datum <input type="date" value={g.date ?? ''} onChange={(e) => {
            const date = e.target.value || undefined
            upd((g) => ({ ...g, date }))
          }} /></label>
          <label className="field">Start <input type="time" value={g.start ?? ''} onChange={(e) => {
            const start = e.target.value || undefined
            upd((g) => ({ ...g, start }))
          }} /></label>
          </div>
        </header>
        <div className="row">
          <h3>Aufstellung</h3>
          {others.length > 0 && (
            <select aria-label="Aufstellung von einem anderen Spiel übernehmen" value="" onChange={(e) => {
              const src = others.find((x) => x.id === e.target.value)
              if (src && (!Object.keys(g.lineup).length || confirm('Aktuelle Aufstellung ersetzen?'))) upd((g) => ({ ...g, lineup: { ...src.lineup } }))
            }}>
              <option value="">Übernehmen von…</option>
              {others.map((x) => <option key={x.id} value={x.id}>{x.date ?? 'ohne Datum'} · {gameTitle(x)}</option>)}
            </select>
          )}
          {Object.keys(g.lineup).length > 0 && <button className="ghost danger" onClick={() => confirm('Aufstellung leeren?') && upd((g) => ({ ...g, lineup: {} }))}>Leeren</button>}
        </div>
        <div className="roster">
          {LINEUP_SLOTS.map(({ line, slots }) => (
            <fieldset key={line}>
              <legend>{line}</legend>
              {slots.map(([slot, label]) => {
                // Players of the matching position are listed first; anyone can still be placed.
                const pos = slot[0] as Player['position']
                const option = (p: Player) => <option key={p.id} value={p.id}>{playerName(p)}{g.lineup[slot] !== p.id && Object.values(g.lineup).includes(p.id) ? ' (eingeteilt)' : ''}</option>
                return (
                  <label key={slot} className="check">{label}
                    <select aria-label={`${line} ${label}`} value={g.lineup[slot] ?? ''} onChange={(e) => {
                      const player = e.target.value
                      upd((g) => ({ ...g, lineup: setSlot(g.lineup, slot, player) }))
                    }}>
                      <option value="">–</option>
                      <optgroup label={pos === 'G' ? 'Torhüter/innen' : pos === 'D' ? 'Verteidiger/innen' : 'Stürmer/innen'}>{team.filter((p) => p.position === pos).map(option)}</optgroup>
                      <optgroup label="Andere">{team.filter((p) => p.position !== pos).map(option)}</optgroup>
                    </select>
                  </label>
                )
              })}
            </fieldset>
          ))}
        </div>
        {unplaced.length > 0 && <p className="needs">Nicht eingeteilt: {unplaced.map(playerName).join(', ')}</p>}
        <label className="session-notes">Notizen zum Spiel (z. B. Treffpunkt, Taktik, Powerplay)
          <textarea rows={3} defaultValue={g.notes ?? ''} onBlur={(e) => {
            const notes = e.target.value.trim() || undefined
            if (notes !== g.notes) upd((g) => ({ ...g, notes }))
          }} />
        </label>
      </section>
      <div className="print-only">
        <h1>Spiel: {gameTitle(g)}</h1>
        {when && <p>{when}</p>}
        <table className="lineup">
          <tbody>
            {LINEUP_SLOTS.map(({ line, slots }) => (
              <tr key={line}>
                <th scope="row">{line}</th>
                {slots.map(([slot, label]) => {
                  const p = byId.get(g.lineup[slot])
                  return <td key={slot}><small>{label}</small> {p ? playerName(p) : '–'}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {unplaced.length > 0 && <p><strong>Nicht eingeteilt:</strong> {unplaced.map(playerName).join(', ')}</p>}
        {g.notes && <p className="pre">{g.notes}</p>}
      </div>
    </>
  )
}
