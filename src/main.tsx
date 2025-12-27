import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { SkinProvider } from './contexts/SkinContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SkinProvider>
      <App />
    </SkinProvider>
  </StrictMode>,
)
