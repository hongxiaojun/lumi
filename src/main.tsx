import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-serif-sc/chinese-simplified-400.css'
import '@fontsource/noto-serif-sc/latin-400.css'
import { lockDocumentScale } from './lib/lockScale'
import './index.css'
import './reader.css'
import App from './App.tsx'

lockDocumentScale(document)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
