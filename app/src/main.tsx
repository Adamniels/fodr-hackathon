import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TEMA } from './teman'

// Temat är bestämt (granit och halm). Övriga teman finns kvar i teman.css för senare jämförelse.
document.documentElement.dataset.tema = TEMA

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
