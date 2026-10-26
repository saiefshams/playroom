import { Component, useEffect, useState, type ReactNode } from 'react'
import { Lobby } from './ui/Lobby'
import { Room } from './ui/Room'

function roomCode(path: string): string | null {
  const match = path.match(/^\/room\/([A-Za-z0-9]{6})\/?$/)
  return match ? match[1].toUpperCase() : null
}

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="lobby">
          <p className="banner" role="alert">This table hit a snag. Reload the page to open it again.</p>
        </main>
      )
    }
    return this.props.children
  }
}

export function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function navigate(to: string) {
    window.history.pushState({}, '', to)
    setPath(to)
  }

  const code = roomCode(path)
  return <Boundary>{code ? <Room code={code} navigate={navigate} /> : <Lobby navigate={navigate} />}</Boundary>
}
