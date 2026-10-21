import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import './i18n'
import { forgetMockAccounts } from './demo'
import { router } from './router'

forgetMockAccounts()

// Server state (ADR 0012). Each query sets its own caching and retries; today only the plan explanation is one.
const queryClient = new QueryClient()

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index.html always has #root
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
