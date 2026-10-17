import { render } from 'preact'
import { App } from './app'
import './styles.css'

render(<App />, document.getElementById('app')!)

// Ask the browser not to clear favorites and history when it frees up space
navigator.storage?.persist?.().catch(() => {})

// Offline support and installability; skipped in development so edits show immediately
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {})
}
