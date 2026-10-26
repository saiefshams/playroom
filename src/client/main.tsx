import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { unlock } from './sound'
import './styles.css'

window.addEventListener('pointerdown', () => unlock(), { once: true })

const root = document.getElementById('root')
if (root) createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
