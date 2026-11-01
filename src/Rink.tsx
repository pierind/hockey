import type { ComponentProps } from 'react'
import type { Pt, RinkTemplate } from './types'

// Illustrative international rink in metres, not a certified scale drawing.
// Templates only crop the view, so item coordinates mean the same thing on every template.
const VIEW: Record<RinkTemplate, string> = {
  full: '-1 -1 62 32',
  half: '29 -1 32 32',
  zone: '36.5 -1 24.5 32',
}

// Middle of each template's view, used for keyboard placement.
export const CENTER: Record<RinkTemplate, Pt> = { full: [30, 15], half: [45, 15], zone: [48.75, 15] }

const RED = '#d9534f'
const BLUE = '#3b6fd4'
const dots: [number, number][] = [4 + 6, 60 - 4 - 6].flatMap((x) => [[x, 8], [x, 22]] as [number, number][])
const neutralDots: [number, number][] = [24, 36].flatMap((x) => [[x, 8], [x, 22]] as [number, number][])

// Upright (portrait screens): the same rink coordinates, turned 90° clockwise. View point = (30 - y, x).
export const UPRIGHT = 'matrix(0 1 -1 0 30 0)'
export const fromUpright = ([vx, vy]: Pt): Pt => [vy, 30 - vx]
const uprightView = (t: RinkTemplate) => {
  const [x, y, w, h] = VIEW[t].split(' ').map(Number)
  return `${30 - y - h} ${x} ${h} ${w}`
}

export function Rink({ template, upright, children, style, ...props }: { template: RinkTemplate; upright?: boolean } & ComponentProps<'svg'>) {
  return (
    <svg viewBox={upright ? uprightView(template) : VIEW[template]} role="img" aria-label="Eisfeld" {...props} style={{ width: '100%', height: 'auto', background: '#fff', display: 'block', ...style }}>
      <g transform={upright ? UPRIGHT : undefined}>
      <g fill="none" strokeWidth={0.15}>
        <line x1={30} y1={0} x2={30} y2={30} stroke={RED} strokeWidth={0.3} />
        <line x1={22.5} y1={0} x2={22.5} y2={30} stroke={BLUE} strokeWidth={0.3} />
        <line x1={37.5} y1={0} x2={37.5} y2={30} stroke={BLUE} strokeWidth={0.3} />
        <line x1={4} y1={1.3} x2={4} y2={28.7} stroke={RED} />
        <line x1={56} y1={1.3} x2={56} y2={28.7} stroke={RED} />
        <circle cx={30} cy={15} r={4.5} stroke={BLUE} />
        {dots.map(([x, y]) => <circle key={`c${x}${y}`} cx={x} cy={y} r={4.5} stroke={RED} />)}
        <path d="M4 13.2 A1.8 1.8 0 0 1 4 16.8 Z M56 13.2 A1.8 1.8 0 0 0 56 16.8 Z" stroke={RED} fill="#dbe9f7" />
      </g>
      <g fill={RED}>
        {[...dots, ...neutralDots].map(([x, y]) => <circle key={`d${x}${y}`} cx={x} cy={y} r={0.3} />)}
      </g>
      <rect x={0} y={0} width={60} height={30} rx={8.5} fill="none" stroke="#222" strokeWidth={0.3} />
      {children}
      </g>
    </svg>
  )
}
