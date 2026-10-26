import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '../../shared/snapshot'
import { request } from '../net'

export function ChatPanel({
  snap,
  open,
  onClose,
}: {
  snap: Snapshot
  open: boolean
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = list.current
    if (node) node.scrollTop = node.scrollHeight
  }, [snap.chat.length, open])

  async function send() {
    const message = text.trim()
    if (!message) return
    try {
      await request('room:chat', { text: message })
      setText('')
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Message not sent.')
    }
  }

  return (
    <aside className={open ? 'chat-panel open' : 'chat-panel'} data-interactive data-testid="chat-panel">
      <div className="chat-head">
        <h2>Chat</h2>
        <button type="button" className="btn ghost tight drawer-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="chat-log" ref={list} data-testid="chat-log">
        {snap.chat.length === 0 && <p className="muted">No messages yet.</p>}
        {snap.chat.map((message) => (
          <p key={message.id}>
            <strong>{message.name}</strong> {message.text}
          </p>
        ))}
      </div>
      {error && <p className="hint">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <input
          data-testid="chat-input"
          value={text}
          maxLength={200}
          placeholder="Say something"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn" data-testid="chat-send">
          Send
        </button>
      </form>
    </aside>
  )
}
