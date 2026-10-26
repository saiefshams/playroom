import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '../../shared/snapshot'
import { formatClock } from '../../shared/text'
import { play } from '../sound'

export function ClockBar({ snap }: { snap: Snapshot }) {
  const clock = snap.clock
  const [display, setDisplay] = useState<[string, string]>(['0:00', '0:00'])
  const lastSecond = useRef<number | null>(null)

  useEffect(() => {
    if (!clock) return
    const tick = () => {
      const offset = snap.serverNow - Date.now()
      const now = Date.now() + offset
      const values: [number, number] = [
        clock.running && clock.activeSeat === 0 ? clock.remaining[0] - (now - clock.turnStartedAt) : clock.remaining[0],
        clock.running && clock.activeSeat === 1 ? clock.remaining[1] - (now - clock.turnStartedAt) : clock.remaining[1],
      ]
      setDisplay([formatClock(values[0]), formatClock(values[1])])
      if (clock.running && clock.activeSeat === snap.you.seatIndex && clock.activeSeat != null) {
        const left = values[clock.activeSeat]
        const second = Math.ceil(left / 1000)
        if (left > 0 && left < 10_000 && lastSecond.current !== second) {
          lastSecond.current = second
          play('tick')
        }
      }
    }
    tick()
    const id = window.setInterval(tick, 200)
    return () => window.clearInterval(id)
  }, [clock, snap.serverNow, snap.you.seatIndex])

  if (!clock) return null
  return (
    <div className="clocks" data-testid="clocks">
      {[0, 1].map((index) => {
        const seat = snap.seats.find((item) => item.index === index)
        const active = clock.running && clock.activeSeat === index
        const low = display[index].startsWith('0:0') && display[index] !== '0:00'
        return (
          <div key={index} className={active ? 'clock active' : 'clock'} data-low={low ? 'yes' : 'no'}>
            <span>{seat?.name ?? (index === 0 ? 'White' : 'Black')}</span>
            <strong>{display[index]}</strong>
          </div>
        )
      })}
    </div>
  )
}
