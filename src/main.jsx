import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import { bridge } from './lib/bridge.js'

if (bridge.isNative || bridge.isElectron) {
  document.documentElement.classList.add('native')
}

function showError (err) {
  const root = document.getElementById('root')
  const pre = document.createElement('pre')
  pre.style.cssText = 'font:12px ui-monospace,monospace;padding:20px;white-space:pre-wrap;color:#b00020'
  pre.textContent = 'Falha ao iniciar:\n' + (err && err.stack ? err.stack : String(err))
  if (root) root.appendChild(pre)
}

window.addEventListener('error', (e) => showError(e.error || e.message))
window.addEventListener('unhandledrejection', (e) => showError(e.reason))

class Boundary extends React.Component {
  constructor (props) { super(props); this.state = { err: null } }
  static getDerivedStateFromError (err) { return { err } }
  componentDidCatch (err) { console.error(err) }
  render () {
    if (this.state.err) return <pre style={{ font: '12px ui-monospace,monospace', padding: 20, whiteSpace: 'pre-wrap', color: '#b00020' }}>Erro de render:\n{this.state.err && this.state.err.name}: {this.state.err && this.state.err.message}\n\n{String((this.state.err && this.state.err.stack) || '')}</pre>
    return this.props.children
  }
}

try {
  createRoot(document.getElementById('root')).render(
    <Boundary>
      <App />
    </Boundary>
  )
} catch (err) {
  showError(err)
}
