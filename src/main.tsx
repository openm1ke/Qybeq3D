import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { platform } from './platform'

// Development only: `?lab` shows the renderer reference sheet.
const RenderLab = import.meta.env.DEV && new URLSearchParams(location.search).has('lab')
  ? lazy(() => import('./dev/RenderLab').then((module) => ({ default: module.RenderLab })))
  : null

// The platform starts first (on Yandex Games and VK: SDK language and
// storage); the game renders either way.
void platform.init().catch(() => undefined).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {RenderLab ? <Suspense><RenderLab /></Suspense> : <App />}
    </StrictMode>,
  )
})
