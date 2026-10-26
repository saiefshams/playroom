import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { GAMES } from '../../shared/catalog'
import type { ChessState } from '../../shared/chessRules'
import type { Connect4State } from '../../shared/connect4'
import type { Snapshot } from '../../shared/snapshot'
import type { Promotion } from '../../shared/types'
import { onClosed, onReplaced, onSnapshot, request, session } from '../net'
import { play, setMuted, useMute } from '../sound'
import { clearSeat, loadName, loadNotice, loadSeat, saveName, saveSeat } from '../storage'
import { useCpu } from '../games/useCpu'
import { ChatPanel } from './ChatPanel'
import { ClockBar } from './ClockBar'
import { ColorPicker } from './ColorPicker'
import { RIBBON_COLORS } from '../../shared/ribbon'
import { cleanName } from '../../shared/text'

const Connect4View = lazy(() => import('../games/Connect4View').then((mod) => ({ default: mod.Connect4View })))
const ChessView = lazy(() => import('../games/ChessView').then((mod) => ({ default: mod.ChessView })))
const RibbonView = lazy(() => import('../games/RibbonView').then((mod) => ({ default: mod.RibbonView })))

function moveCount(snap: Snapshot): number {
  if (snap.gameId === 'connect4') return (snap.state as Connect4State).history.length
  if (snap.gameId === 'chess') return (snap.state as ChessState).history.length
  return 0
}

function MoveLog({ snap }: { snap: Snapshot }) {
  if (snap.gameId === 'ribbon') return null
  const lines: string[] = []
  if (snap.gameId === 'connect4') {
    ;(snap.state as Connect4State).history.forEach((move, index) => {
      const who = snap.seats.find((seat) => seat.index === move.seat)?.name ?? 'Player'
      lines.push(`${index + 1}. ${who} · column ${move.column + 1}`)
    })
  } else {
    const history = (snap.state as ChessState).history
    for (let index = 0; index < history.length; index += 2) {
      const black = history[index + 1]?.san
      lines.push(`${index / 2 + 1}. ${history[index]?.san ?? ''}${black ? `  ${black}` : ''}`)
    }
  }
  return (
    <ol className="move-log" data-testid="move-log">
      {lines.length === 0 ? <li className="muted">No moves yet.</li> : lines.map((line, index) => <li key={index}>{line}</li>)}
    </ol>
  )
}

export function Room({ code, navigate }: { code: string; navigate: (to: string) => void }) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [phase, setPhase] = useState<'booting' | 'gate' | 'live'>('booting')
  const [banner, setBanner] = useState(loadNotice)
  const [name, setName] = useState(loadName)
  const [color, setColor] = useState(RIBBON_COLORS[0])
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [copied, setCopied] = useState(false)
  const [armResign, setArmResign] = useState(false)
  const muted = useMute()
  const lock = useRef(false)
  const previous = useRef<Snapshot | null>(null)
  useCpu(phase === 'live' ? snap : null)

  useEffect(() => {
    document.title = `Playroom · ${code}`
    return () => {
      document.title = 'Playroom'
    }
  }, [code])

  useEffect(() => {
    let cancel = false
    session.code = code
    const token = loadSeat(code)
    session.token = token
    if (!token) {
      setPhase('gate')
      return
    }
    setPhase('booting')
    request<{ snapshot: Snapshot }>('room:reconnect', { code, token })
      .then((data) => {
        if (cancel) return
        setSnap(data.snapshot)
        setPhase('live')
      })
      .catch((error: Error) => {
        if (cancel) return
        clearSeat(code)
        session.token = null
        setBanner(error.message)
        setPhase('gate')
      })
    return () => {
      cancel = true
    }
  }, [code])

  useEffect(() => onSnapshot((next) => {
    if (next.code !== code) return
    setSnap((current) => (!current || next.version >= current.version ? next : current))
    setPhase('live')
  }), [code])

  useEffect(() => onClosed(() => {
    clearSeat(code)
    session.token = null
    navigate('/')
  }), [code, navigate])

  useEffect(() => onReplaced(() => {
    clearSeat(code)
    session.token = null
    setSnap(null)
    setBanner('You are no longer in this seat.')
    setPhase('gate')
  }), [code])

  useEffect(() => {
    if (!snap) return
    const prior = previous.current
    previous.current = snap
    if (!prior || prior.code !== snap.code) return
    if (snap.result && !prior.result) play('win')
    else if (moveCount(snap) > moveCount(prior)) play('move')
    else if (snap.chat.length > prior.chat.length) {
      const last = snap.chat[snap.chat.length - 1]
      if (last && last.name !== snap.you.name) play('chat')
      if (!chatOpen) setUnread((count) => count + (snap.chat.length - prior.chat.length))
    }
  }, [snap, chatOpen])

  useEffect(() => {
    if (snap?.gameId === 'ribbon') document.body.classList.add('lock-scroll')
    return () => document.body.classList.remove('lock-scroll')
  }, [snap?.gameId])

  async function enter(kind: 'join' | 'watch') {
    const cleaned = cleanName(name)
    if (!cleaned) {
      setBanner('Add your name.')
      return
    }
    try {
      const data = await request<{ token: string; snapshot: Snapshot; notice?: string | null }>(
        kind === 'join' ? 'room:join' : 'room:watch',
        { code, name: cleaned, color },
      )
      saveName(cleaned)
      saveSeat(code, data.token)
      session.token = data.token
      if (data.notice) setBanner(data.notice)
      setSnap(data.snapshot)
      setPhase('live')
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'Could not enter this room.')
    }
  }

  async function act(payload: unknown) {
    if (lock.current) return
    lock.current = true
    try {
      await request('room:action', payload)
      setBanner('')
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'That move did not land.')
    } finally {
      lock.current = false
    }
  }

  async function leave() {
    try {
      await request('room:leave', {})
    } catch {
      // Leave the page either way.
    }
    clearSeat(code)
    session.token = null
    session.code = null
    navigate('/')
  }

  async function copyLink() {
    const link = `${window.location.origin}/room/${code}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setBanner(link)
    }
  }

  const game = GAMES.find((item) => item.id === snap?.gameId)
  const openSeat =
    !!snap &&
    snap.you.role === 'spectator' &&
    !snap.cpu &&
    (snap.gameId === 'ribbon' ? snap.seats.length < 8 : snap.status !== 'playing' && snap.seats.length < 2)

  const chrome = (
    <header className="room-bar" data-interactive>
      <button type="button" className="btn ghost tight" data-testid="leave-room" onClick={() => void leave()}>
        Leave
      </button>
      <div className="code-pill">
        <span data-testid="room-code">{code}</span>
        <button type="button" className="btn tight" data-testid="copy-code" onClick={() => void copyLink()}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <button type="button" className="btn ghost tight" data-testid="mute" aria-pressed={muted} onClick={() => setMuted(!muted)}>
        {muted ? 'Sound off' : 'Sound on'}
      </button>
      <button type="button" className="btn ghost tight chat-toggle" data-testid="chat-toggle" onClick={() => { setChatOpen(true); setUnread(0) }}>
        Chat{unread > 0 ? ` ${unread}` : ''}
      </button>
    </header>
  )

  if (phase === 'booting') {
    return (
      <main className="lobby">
        <p className="lede">Opening room {code}…</p>
      </main>
    )
  }

  if (phase === 'gate' || !snap) {
    return (
      <main className="lobby">
        <header className="top">
          <p className="mark">Playroom</p>
          <h1>Room {code}</h1>
          <p className="lede">Join a free seat, or watch the moves already on the table.</p>
        </header>
        {banner && <p className="banner" role="alert">{banner}</p>}
        <label className="name-field">
          Your name
          <input data-testid="player-name" value={name} maxLength={16} onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="hint">Car color, if this room is Ribbon Rally.</p>
        <ColorPicker value={color} onChange={setColor} testPrefix="gate-color" />
        <div className="actions">
          <button type="button" className="btn" data-testid="join-room" onClick={() => void enter('join')}>Join</button>
          <button type="button" className="btn ghost" data-testid="watch-room" onClick={() => void enter('watch')}>Watch</button>
        </div>
      </main>
    )
  }

  const stage = (
    <div className="stage">
      {chrome}
      <p className="status" data-testid="status-line" aria-live="polite">{snap.statusLine}</p>
      {banner && <p className="banner" role="status" data-testid="watch-banner">{banner}</p>}
      {snap.you.role === 'spectator' && !banner && (
        <p className="banner" data-testid="watch-banner">Watching. You can see every move, and you cannot play.</p>
      )}
      <ClockBar snap={snap} />
      <div className="roster">
        {snap.seats.map((seat) => (
          <span key={seat.index} className="person">
            <i style={{ background: seat.color ?? (snap.gameId === 'connect4' ? (seat.index === 0 ? '#ff4d4d' : '#ffd23f') : seat.index === 0 ? '#f4f1e8' : '#2a2420') }} />
            {seat.name}
            {snap.gameId === 'chess' && <em>{seat.index === 0 ? 'White' : 'Black'}</em>}
            {seat.isYou && <em>You</em>}
            {seat.isCpu && <em>{snap.cpu?.difficulty}</em>}
            {!seat.connected && !seat.left && <em>Reconnecting</em>}
            {seat.left && <em>Left</em>}
          </span>
        ))}
        <span className="muted">{snap.spectatorCount} watching</span>
      </div>
      {snap.gameId !== 'ribbon' && (
        <Suspense fallback={<p className="lede">Loading {game?.name ?? 'the table'}…</p>}>
          {snap.gameId === 'connect4' && <Connect4View snap={snap} onMove={(column) => void act({ type: 'connect4:drop', column })} />}
          {snap.gameId === 'chess' && (
            <ChessView snap={snap} onMove={(from, to, promotion?: Promotion) => void act({ type: 'chess:move', from, to, promotion })} />
          )}
        </Suspense>
      )}
      <div className="room-tools" data-interactive>
        <MoveLog snap={snap} />
        {openSeat && (
          <button type="button" className="btn" data-testid="take-seat" onClick={() => void request('room:sit', {}).catch((error: Error) => setBanner(error.message))}>
            Take a seat
          </button>
        )}
        {snap.status === 'finished' && snap.you.role === 'player' && (
          <button
            type="button"
            className="btn"
            data-testid="rematch"
            disabled={snap.rematchSeats.includes(snap.you.seatIndex ?? -1)}
            onClick={() => void request('room:rematch', {}).catch((error: Error) => setBanner(error.message))}
          >
            {snap.rematchSeats.includes(snap.you.seatIndex ?? -1) ? 'Waiting for the other seat' : 'Rematch'}
          </button>
        )}
        {snap.status === 'playing' && snap.you.role === 'player' && snap.gameId !== 'ribbon' && (
          <button
            type="button"
            className="btn ghost"
            data-testid="resign"
            onClick={() => {
              if (!armResign) {
                setArmResign(true)
                return
              }
              void act({ type: 'resign' })
            }}
          >
            {armResign ? 'Confirm resign' : 'Resign'}
          </button>
        )}
      </div>
      </div>
  )

  return (
    <main className={snap.gameId === 'ribbon' ? 'ribbon-page' : 'room'}>
      {snap.gameId === 'ribbon' && (
        <Suspense fallback={null}>
          <RibbonView snap={snap} />
        </Suspense>
      )}
      {stage}
      <ChatPanel snap={snap} open={chatOpen} onClose={() => { setChatOpen(false); setUnread(0) }} />
    </main>
  )
}
