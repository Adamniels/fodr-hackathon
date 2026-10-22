import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import './i18n'
import { onUncaughtError, startErrorReporting } from './error-reporting'
import { forgetLocalData } from './legacy-storage'
import { router } from './router'

// First, so an error while starting is reported too (#43).
const reporting = startErrorReporting()
forgetLocalData()

// Server state (ADR 0012). Each query sets its own caching and retries; the horses (horses.ts) and the plan explanation.
const queryClient = new QueryClient()

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index.html always has #root
createRoot(document.getElementById('root')!, reporting ? { onUncaughtError } : {}).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
