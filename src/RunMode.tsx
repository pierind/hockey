import { useEffect, useRef, useState } from 'react'
import { Board } from './Board'
import { Picture } from './Library'
import { drillText, runSteps } from './model'
import type { Session } from './types'

const mmss = (sec: number) => `${sec < 0 ? '+' : ''}${Math.floor(Math.abs(sec) / 60)}:${String(Math.abs(sec) % 60).padStart(2, '0')}`

// Rink mode: runs a training step by step on the iPad, full screen, with a countdown per step.
export function RunMode({ s, onClose }: { s: Session; onClose: () => void }) {
  const steps = runSteps(s)
  const [i, setI] = useState(0)
  const [left, setLeft] = useState(Math.round((steps[0]?.minutes ?? 0) * 60)) // seconds; negative = overtime
  const [running, setRunning] = useState(true)
  const [board, setBoard] = useState(false)
  const swipe = useRef<number | null>(null)
  const step = steps[i]
  const next = steps[i + 1]

  const go = (to: number) => {
    if (to < 0 || to >= steps.length) return
    setI(to)
    setLeft(Math.round(steps[to].minutes * 60))
    setBoard(false)
  }
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setLeft((x) => x - 1), 1000)
    return () => clearInterval(t)
  }, [running])
  // Keep the iPad screen on and hide the browser bars where allowed; both are best effort.
  useEffect(() => {
    let lock: WakeLockSentinel | undefined
    navigator.wakeLock?.request('screen').then((l) => (lock = l), () => {})
    document.documentElement.requestFullscreen?.().catch(() => {})
    return () => {
      lock?.release().catch(() => {})
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(i + 1)
      if (e.key === 'ArrowLeft') go(i - 1)
      if (e.key === 'Escape' && !document.fullscreenElement) onClose()
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  })

  return (
    <div className="run" role="dialog" aria-label={`Training läuft: ${s.title}`}>
      <div className="run-bar">
        <button className="ghost" onClick={onClose}>✕ Beenden</button>
        <span className="run-pos">{steps.length ? `${i + 1} / ${steps.length}` : '0 / 0'}</span>
        <span className="spacer" />
        <span className={left < 0 ? 'run-timer over' : 'run-timer'} role="timer" aria-label="Verbleibende Zeit">{mmss(left)}</span>
        <button onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Weiter laufen'}</button>
        <span className="spacer" />
        <button aria-pressed={board} onClick={() => setBoard(!board)}>Taktiktafel</button>
        <button aria-label="Vorherige Übung" disabled={i === 0} onClick={() => go(i - 1)}>◀</button>
        <button className="primary" aria-label="Nächste Übung" disabled={i >= steps.length - 1} onClick={() => go(i + 1)}>▶</button>
      </div>
      {board ? <div className="run-board"><Board /></div> : !step ? <p className="empty">Dieses Training hat noch keine Übungen.</p> : (
        <div className="run-body" onPointerDown={(e) => (swipe.current = e.clientX)} onPointerUp={(e) => {
          const dx = swipe.current === null ? 0 : e.clientX - swipe.current
          swipe.current = null
          if (Math.abs(dx) > 80) go(dx < 0 ? i + 1 : i - 1)
        }}>
          {step.rotation > 0 && <p className="run-rotation">Posten-Block · Rotation {step.rotation} von {step.entries.length}</p>}
          <div className={step.entries.length > 1 ? 'run-drills posten' : 'run-drills'}>
            {step.entries.map((e, k) => (
              <article key={e.id} className="run-drill">
                <Picture drill={e.drill} />
                <div>
                  <h2>{step.entries.length > 1 && `Posten ${k + 1}: `}{e.drill.title || 'Ohne Titel'}</h2>
                  {e.drill.keyPoints.some((p) => p.trim()) && <ul>{e.drill.keyPoints.filter((p) => p.trim()).map((p, n) => <li key={n}>{p}</li>)}</ul>}
                  {e.notes && <p className="run-note">{e.notes}</p>}
                  {drillText(e.drill.description) && <details><summary>Ablauf</summary><p className="pre">{drillText(e.drill.description)}</p></details>}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {next && !board && (
        <p className="run-next">Danach: {next.entries === step.entries ? `Wechsel, Rotation ${next.rotation} von ${next.entries.length}`
          : next.entries.map((e) => e.drill.title || 'Ohne Titel').join(' · ')} ({Math.round(next.minutes)} Min.)</p>
      )}
    </div>
  )
}
