import { useState } from 'react'
import { GAMES } from '../../shared/catalog'
import { RIBBON_COLORS } from '../../shared/ribbon'
import { CLOCK_CHOICES, cleanName, extractCode, type ClockId } from '../../shared/text'
import type { Difficulty, GameId } from '../../shared/types'
import type { Snapshot } from '../../shared/snapshot'
import { request, session } from '../net'
import { loadColor, loadName, saveColor, saveName, saveNotice, saveSeat } from '../storage'
import { ColorPicker } from './ColorPicker'

export function Lobby({ navigate }: { navigate: (to: string) => void }) {
  const [name, setName] = useState(loadName)
  const [color, setColor] = useState(loadColor() ?? RIBBON_COLORS[0])
  const [clock, setClock] = useState<ClockId>('untimed')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function openRoom(gameId: GameId, vsCpu: boolean) {
    const cleaned = cleanName(name)
    if (!cleaned) {
      setError('Add your name.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await request<{ token: string; snapshot: Snapshot }>('room:create', {
        gameId,
        name: cleaned,
        color,
        vsCpu,
        difficulty,
        clock: gameId === 'chess' ? clock : 'untimed',
      })
      saveName(cleaned)
      saveColor(color)
      saveSeat(data.snapshot.code, data.token)
      session.code = data.snapshot.code
      session.token = data.token
      navigate(`/room/${data.snapshot.code}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open a room.')
    } finally {
      setBusy(false)
    }
  }

  async function enter(kind: 'join' | 'watch') {
    const cleaned = cleanName(name)
    const roomCode = extractCode(code)
    if (!cleaned) {
      setError('Add your name.')
      return
    }
    if (!roomCode) {
      setError('Enter a 6-character code, or paste a room link.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await request<{ token: string; snapshot: Snapshot; notice?: string | null }>(
        kind === 'join' ? 'room:join' : 'room:watch',
        { code: roomCode, name: cleaned, color },
      )
      saveName(cleaned)
      saveColor(color)
      saveSeat(data.snapshot.code, data.token)
      if (data.notice) saveNotice(data.notice)
      session.code = data.snapshot.code
      session.token = data.token
      navigate(`/room/${data.snapshot.code}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not open that room.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="lobby" data-testid="app-ready">
      <header className="top">
        <p className="mark">Playroom</p>
        <h1>Open a table. Pass the link.</h1>
        <p className="lede">Chess and Connect 4 seat two. Ribbon Rally holds a whole floor. Anyone with the code can watch the moves.</p>
      </header>

      <label className="name-field">
        Your name
        <input
          data-testid="player-name"
          value={name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {error && (
        <p className="banner" role="alert">
          {error}
        </p>
      )}

      <section className="cards">
        {GAMES.map((game) => (
          <article key={game.id} className="card">
            <p className="eyebrow">{game.players}</p>
            <h2>{game.name}</h2>
            <p className="blurb">{game.blurb}</p>
            {game.clocks && (
              <div className="segmented" role="radiogroup" aria-label="Time control">
                {CLOCK_CHOICES.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={clock === choice.id ? 'on' : ''}
                    data-testid={`clock-${choice.id.replace('+', '-')}`}
                    onClick={() => setClock(choice.id)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            )}
            {game.id === 'ribbon' && <ColorPicker value={color} onChange={setColor} testPrefix="create-color" />}
            {game.cpu && (
              <div className="segmented" role="radiogroup" aria-label={`${game.name} CPU`}>
                {(['easy', 'medium'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={difficulty === level ? 'on' : ''}
                    data-testid={`diff-${game.id}-${level}`}
                    onClick={() => setDifficulty(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            )}
            <div className="actions">
              <button type="button" className="btn" data-testid={`create-${game.id}`} disabled={busy} onClick={() => void openRoom(game.id, false)}>
                {game.id === 'ribbon' ? 'Open the floor' : 'Create room'}
              </button>
              {game.cpu && (
                <button type="button" className="btn ghost" data-testid={`cpu-${game.id}`} disabled={busy} onClick={() => void openRoom(game.id, true)}>
                  Play the CPU
                </button>
              )}
            </div>
          </article>
        ))}
      </section>

      <section className="join-panel">
        <h2>Have a code?</h2>
        <label>
          Room code
          <input
            data-testid="join-code"
            value={code}
            placeholder="AB12CD or a room link"
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
        <p className="hint">Car color, if the room is Ribbon Rally.</p>
        <ColorPicker value={color} onChange={setColor} testPrefix="join-color" />
        <div className="actions">
          <button type="button" className="btn" data-testid="join-room" disabled={busy} onClick={() => void enter('join')}>
            Join
          </button>
          <button type="button" className="btn ghost" data-testid="watch-room" disabled={busy} onClick={() => void enter('watch')}>
            Watch
          </button>
        </div>
      </section>
    </main>
  )
}
