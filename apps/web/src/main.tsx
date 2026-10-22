import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import './i18n'
import { forgetLocalHorses, forgetLocalJournals, forgetMockAccounts } from './demo'
import { router } from './router'

forgetMockAccounts()
forgetLocalHorses()
forgetLocalJournals()

// Server state (ADR 0012). Each query sets its own caching and retries; the horses (horses.ts) and the plan explanation.
const queryClient = new QueryClient()

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index.html always has #root
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
