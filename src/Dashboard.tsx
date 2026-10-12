import { useState } from 'react'
import { HelpButton } from './Help'
import { categoryMinutes, isoWeek, monthKey, monthLabel, periodStats, selectSessions } from './model'
import type { PeriodStat, StatusFilter } from './model'
import { categoryLabel } from './sihf'
import type { Db } from './types'

type Report = 'sessions' | 'categories'
type By = 'total' | 'week' | 'month'
const KEYS: Record<By, (date: string) => string> = { total: () => 'total', week: isoWeek, month: monthKey }
const periodLabel = (p: string) => (p === 'total' ? 'Gesamt' : p.includes('-W') ? `KW ${Number(p.slice(6))} · ${p.slice(0, 4)}` : monthLabel(p))
const tally = (t: PeriodStat['final']) => (t.count ? `${t.count} · ${t.minutes} Min.` : '–')
const min = (v: number) => Math.round(v)
// Sequential blue ramp (light = few minutes, dark = many); white text from step 500 on.
const BLUES = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']

export function Dashboard({ db }: { db: Db }) {
  const [report, setReport] = useState<Report>('sessions')
  const [by, setBy] = useState<By>('week')
  const [status, setStatus] = useState<StatusFilter>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const sessions = selectSessions(db.sessions, status, from, to)
  const undated = db.sessions.filter((s) => !s.date).length

  return (
    <section>
      <div className="row">
        <h2>Auswertung</h2>
        <HelpButton topic="dashboard" />
      </div>
      <div className="row query" role="group" aria-label="Abfrage">
        <select aria-label="Bericht" value={report} onChange={(e) => setReport(e.target.value as Report)}>
          <option value="sessions">Trainings (Anzahl und Minuten)</option>
          <option value="categories">Minuten pro Erscheinungsform</option>
        </select>
        <div className="row" role="group" aria-label="Gruppierung">
          {([['total', 'Gesamt'], ['week', 'Pro Woche'], ['month', 'Pro Monat']] as const).map(([v, l]) => (
            <button key={v} aria-pressed={by === v} onClick={() => setBy(v)}>{l}</button>
          ))}
        </div>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="">Definitiv und geplant</option>
          <option value="final">Nur definitiv</option>
          <option value="planned">Nur geplant (Entwurf)</option>
        </select>
        <label>Von <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Bis <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {sessions.length === 0 ? <p className="empty">Keine Trainings mit Datum für diese Abfrage.</p>
        : report === 'sessions' ? <SessionsReport rows={periodStats(sessions, KEYS[by])} by={by} />
        : <CategoryReport {...categoryMinutes(sessions, KEYS[by])} />}
      {undated > 0 && <p className="hint">{undated} Training(s) ohne Datum nicht gezählt.</p>}
    </section>
  )
}

function SessionsReport({ rows, by }: { rows: PeriodStat[]; by: By }) {
  const max = Math.max(1, ...rows.map((r) => r.final.minutes + r.planned.minutes))
  return (
    <>
      <div className="row legend-row" aria-hidden>
        <span><i className="swatch final" /> ✓ Definitiv</span>
        <span><i className="swatch draft" /> ✎ Geplant (Entwurf)</span>
      </div>
      <table className="stats">
        <thead>
          <tr><th scope="col">{by === 'week' ? 'Woche' : by === 'month' ? 'Monat' : 'Zeitraum'}</th><th scope="col">✓ Definitiv</th><th scope="col">✎ Geplant</th><th scope="col">Minuten</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.period}>
              <th scope="row">{periodLabel(r.period)}</th>
              <td>{tally(r.final)}</td>
              <td>{tally(r.planned)}</td>
              <td>
                <div className="bar" title={`Definitiv ${r.final.minutes} Min., geplant ${r.planned.minutes} Min.`}>
                  {r.final.minutes > 0 && <span className="final" style={{ width: `${(r.final.minutes / max) * 100}%` }} />}
                  {r.planned.minutes > 0 && <span className="draft" style={{ width: `${(r.planned.minutes / max) * 100}%` }} />}
                  <b>{r.final.minutes + r.planned.minutes}</b>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function CategoryReport({ periods, rows }: ReturnType<typeof categoryMinutes>) {
  const showPeriods = !(periods.length === 1 && periods[0] === 'total')
  const maxCell = Math.max(1, ...rows.flatMap((r) => Object.values(r.byPeriod)))
  const maxTotal = Math.max(1, ...rows.map((r) => r.total))
  const name = (c: string) => (c ? categoryLabel[c] : 'Ohne Erscheinungsform')
  return (
    <>
      <p className="hint legend-row">Minuten; dunkler = mehr. Übungen mit mehreren Erscheinungsformen werden aufgeteilt.</p>
      <div className="scroll-x">
        <table className="stats heat">
          <thead>
            <tr>
              <th scope="col">Erscheinungsform</th>
              {showPeriods && periods.map((p) => <th key={p} scope="col">{periodLabel(p)}</th>)}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category}>
                <th scope="row">{name(r.category)}</th>
                {showPeriods && periods.map((p) => {
                  const v = r.byPeriod[p] ?? 0
                  const step = Math.ceil((v / maxCell) * (BLUES.length - 1))
                  return (
                    <td key={p} className="cell" title={`${name(r.category)}, ${periodLabel(p)}: ${min(v)} Min.`}
                      style={v ? { background: BLUES[step], color: step >= 8 ? '#fff' : '#111' } : undefined}>
                      {v ? min(v) : ''}
                    </td>
                  )
                })}
                <td className="total">
                  <div className="bar" title={`${name(r.category)}: ${min(r.total)} Min.`}>
                    {r.total > 0 && <span className="blue" style={{ width: `${(r.total / maxTotal) * 100}%` }} />}
                    <b>{min(r.total)}</b>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
