import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPushWorker, supportsPush } from './services/pushNotifications'

if (supportsPush()) registerPushWorker().catch(() => { /* Profile controls show registration errors when enabled. */ })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
