import { useState } from 'react'
import { HelpButton } from './Help'
import { addDays, coveredElements, fillDates, newPlan, sessionsInWeek } from './model'
import type { Change } from './model'
import { StatusBadge } from './Sessions'
import { uid } from './scene'
import { categories, elements, goalLabel, offIceGoals, personalityGoals } from './sihf'
import type { Element } from './sihf'
import type { Db, PlanWeek, SeasonPlan, Session } from './types'

const date = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric', year: '2-digit', timeZone: 'UTC' })

function Chips({ ids, covered, onRemove }: { ids: string[]; covered?: Set<string>; onRemove?: (id: string) => void }) {
  return (
    <>
      {ids.map((id, i) => (
        <span key={`${id}${i}`} className={covered?.has(id) ? 'chip goal done' : 'chip goal'} title={goalLabel[id]}>
          {covered && (covered.has(id) ? '✓ ' : '○ ')}{id} {goalLabel[id]}
          {onRemove && <button className="chip-x" aria-label={`${id} entfernen`} onClick={() => onRemove(id)}>×</button>}
        </span>
      ))}
    </>
  )
}

// Schlüsselelemente grouped by Erscheinungsform, or a flat goal list (off-ice / Persönlichkeit).
function Pick({ label, list, onPick }: { label: string; list?: Element[]; onPick: (id: string) => void }) {
  return (
    <select aria-label={label} value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">+ {label}…</option>
      {list
        ? list.map((g) => <option key={g.id} value={g.id}>{g.id} {g.label}</option>)
        : categories.map((c) => (
          <optgroup key={c.id} label={c.label}>
            {elements.filter((e) => e.category === c.id).map((e) => <option key={e.id} value={e.id}>{e.id} {e.label}</option>)}
          </optgroup>
        ))}
    </select>
  )
}

export function Season({ db, change }: { db: Db; change: Change }) {
  const plans = db.plans ?? []
  const [planId, setPlanId] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set()) // weeks are only rendered in full while open
  const plan = plans.find((p) => p.id === planId) ?? plans[0]
  const setPlans = (fn: (plans: SeasonPlan[]) => SeasonPlan[]) => change((db) => ({ ...db, plans: fn(db.plans ?? []) }))
  const updPlan = (fn: (p: SeasonPlan) => SeasonPlan) => setPlans((ps) => ps.map((p) => (p.id === plan.id ? fn(p) : p)))
  const updWeek = (id: string, fn: (w: PlanWeek) => PlanWeek) => updPlan((p) => ({ ...p, weeks: p.weeks.map((w) => (w.id === id ? fn(w) : w)) }))
  const create = (full: boolean) => {
    const y = new Date().getFullYear()
    const p = newPlan(full ? 'SIHF U12 (Beispiel)' : `Saison ${y}/${String(y + 1).slice(2)}`, full)
    setPlans((ps) => [...ps, p])
    setPlanId(p.id)
  }
  const newSession = (w: PlanWeek, n: number) => {
    const goals = w.trainings[n] ?? []
    const s: Session = {
      id: uid(), title: `${w.phase} W${w.week} · Training ${n + 1}`, date: w.monday, entries: [],
      notes: goals.length ? `Ziele: ${goals.map((g) => `${g} ${goalLabel[g]}`).join('; ')}` : undefined,
    }
    change((db) => ({ ...db, sessions: [...db.sessions, s] }))
  }

  return (
    <section>
      <div className="row">
        <h2>Saisonplan</h2>
        <HelpButton topic="season" />
        {plans.length > 0 && (
          <select aria-label="Plan" value={plan.id} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <button className="primary" onClick={() => create(false)}>Neuer Plan</button>
        <button onClick={() => create(true)}>SIHF-Beispiel übernehmen</button>
      </div>
      {!plan ? <p className="empty">Noch kein Saisonplan.</p> : (
        <>
          <div className="row">
            <label>Name <input key={plan.id} defaultValue={plan.name} onBlur={(e) => {
              const name = e.target.value.trim()
              if (name && name !== plan.name) updPlan((p) => ({ ...p, name }))
            }} /></label>
            <button onClick={() => confirm(`Plan «${plan.name}» löschen?`) && setPlans((ps) => ps.filter((p) => p.id !== plan.id))}>Plan löschen</button>
          </div>
          {plan.weeks.map((w, i) => {
            const planned = [...new Set(w.trainings.flat())]
            const actual = w.monday ? sessionsInWeek(db.sessions, w.monday) : []
            const covered = coveredElements(actual)
            const isOpen = open.has(w.id)
            return (
              <div key={w.id}>
                {w.phase !== plan.weeks[i - 1]?.phase && <h3 className="phase">{w.phase}</h3>}
                <details className="card week" open={isOpen} onToggle={(e) => {
                  const now = (e.target as HTMLDetailsElement).open
                  if (now !== isOpen) setOpen((o) => { const n = new Set(o); if (now) n.add(w.id); else n.delete(w.id); return n })
                }}>
                  <summary>
                    <b>W{w.week}</b> · {w.month ?? ''}{w.monday && ` · ab ${date(w.monday)}`}{w.special && <span className="badge">{w.special}</span>}
                    {' · '}{w.trainings.length} Trainings geplant
                    {w.monday && <span className="hint"> · Ist: {actual.length} Trainings, {planned.filter((g) => covered.has(g)).length}/{planned.length} Ziele</span>}
                  </summary>
                  {isOpen && (
                    <div className="week-body">
                      <div className="row">
                        <label>Wochenbeginn <input type="date" value={w.monday ?? ''} onChange={(e) => {
                          const monday = e.target.value || undefined
                          updWeek(w.id, (w) => ({ ...w, monday }))
                        }} /></label>
                        <button disabled={!w.monday} onClick={() => updPlan((p) => ({ ...p, weeks: fillDates(p.weeks, w.id) }))}>Folgende Wochen datieren</button>
                        <label>Monat <input className="short" defaultValue={w.month ?? ''} onBlur={(e) => updWeek(w.id, (w) => ({ ...w, month: e.target.value.trim() || undefined }))} /></label>
                        <label>Spezial <input defaultValue={w.special ?? ''} placeholder="z. B. Elterninfo" onBlur={(e) => updWeek(w.id, (w) => ({ ...w, special: e.target.value.trim() || undefined }))} /></label>
                      </div>
                      <h4>Geplante Trainings</h4>
                      <ol className="slots">
                        {w.trainings.map((t, n) => (
                          <li key={n} className="row">
                            <b className="slot-no">T{n + 1}</b>
                            <Chips ids={t} covered={w.monday ? covered : undefined}
                              onRemove={(id) => updWeek(w.id, (w) => ({ ...w, trainings: w.trainings.map((x, j) => (j === n ? x.filter((g) => g !== id) : x)) }))} />
                            <Pick label={`Schlüsselelement Training ${n + 1}`} onPick={(id) => updWeek(w.id, (w) => ({ ...w, trainings: w.trainings.map((x, j) => (j === n ? [...x, id] : x)) }))} />
                            {w.monday && <button onClick={() => newSession(w, n)}>Training anlegen</button>}
                            <button aria-label={`Training ${n + 1} aus dem Plan entfernen`} className="ghost danger" onClick={() => updWeek(w.id, (w) => ({ ...w, trainings: w.trainings.filter((_, j) => j !== n) }))}>Entfernen</button>
                          </li>
                        ))}
                      </ol>
                      <button onClick={() => updWeek(w.id, (w) => ({ ...w, trainings: [...w.trainings, []] }))}>+ Training</button>
                      <div className="goal-rows">
                        <div className="row"><h4>Begleitendes Off-Ice-Ziel</h4>
                          <Chips ids={w.offIce} onRemove={(id) => updWeek(w.id, (w) => ({ ...w, offIce: w.offIce.filter((g) => g !== id) }))} />
                          <Pick label="Off-Ice-Ziel" list={offIceGoals} onPick={(id) => updWeek(w.id, (w) => ({ ...w, offIce: [...w.offIce, id] }))} />
                        </div>
                        <div className="row"><h4>Persönlichkeit</h4>
                          <Chips ids={w.personality} onRemove={(id) => updWeek(w.id, (w) => ({ ...w, personality: w.personality.filter((g) => g !== id) }))} />
                          <Pick label="Persönlichkeitsziel" list={personalityGoals} onPick={(id) => updWeek(w.id, (w) => ({ ...w, personality: [...w.personality, id] }))} />
                        </div>
                      </div>
                      <div className="row">
                        <label className="grow">Notizen <textarea rows={2} defaultValue={w.notes ?? ''} onBlur={(e) => updWeek(w.id, (w) => ({ ...w, notes: e.target.value.trim() || undefined }))} /></label>
                        <label>Pause danach <input defaultValue={w.breakAfter ?? ''} placeholder="z. B. Sommerpause" onBlur={(e) => updWeek(w.id, (w) => ({ ...w, breakAfter: e.target.value.trim() || undefined }))} /></label>
                      </div>
                      <h4>Ist{w.monday && ` (${date(w.monday)}–${date(addDays(w.monday, 6))})`}</h4>
                      {!w.monday ? <p className="empty">Wochenbeginn setzen, um die Trainings dieser Woche zu sehen.</p>
                        : actual.length === 0 ? <p className="empty">Keine Trainings in dieser Woche.</p>
                        : <ul className="list">{actual.map((s) => <li key={s.id} className="row"><StatusBadge s={s} /> {s.title} <span className="hint">{s.date}</span></li>)}</ul>}
                    </div>
                  )}
                </details>
                {w.breakAfter && <p className="pause">{w.breakAfter}</p>}
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
