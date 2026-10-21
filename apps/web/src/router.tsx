// Every page has a URL (ADR 0012, #21): reload, back and deep links keep the horse and step. Data mode, with an
// error boundary on every route; state still lives in the browser until the API slices (M2).
import { createBrowserRouter, Navigate } from 'react-router'
import { Root } from './routes/Root'
import { Landing } from './routes/Landing'
import { ResetPassword } from './routes/ResetPassword'
import { WorkspaceGate } from './routes/Workspace'
import { AnalysisRoute, HorsesIndex, JournalRoute, PlanRoute, ProfileRoute } from './routes/steps'
import { RouteError, StepNotFound } from './routes/RouteError'
import { STEP_PATH } from './routes/context'

// A route whose own component fails loses the whole page; a step fails inside the workspace, which stays.
const pageError = <RouteError page />
const stepError = <RouteError />

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: pageError,
    children: [
      { index: true, element: <Landing />, errorElement: pageError },
      { path: 'login', element: <Landing login />, errorElement: pageError },
      { path: 'reset-password', element: <ResetPassword />, errorElement: pageError },
      {
        path: 'horses',
        element: <WorkspaceGate />,
        errorElement: pageError,
        children: [
          { index: true, element: <HorsesIndex />, errorElement: stepError },
          {
            path: ':horseId',
            children: [
              { index: true, element: <Navigate to={STEP_PATH.hast} replace /> },
              { path: STEP_PATH.hast, element: <ProfileRoute />, errorElement: stepError },
              { path: STEP_PATH.analys, element: <AnalysisRoute />, errorElement: stepError },
              { path: STEP_PATH.plan, element: <PlanRoute />, errorElement: stepError },
              { path: STEP_PATH.journal, element: <JournalRoute />, errorElement: stepError },
              { path: '*', element: <StepNotFound /> },
            ],
          },
        ],
      },
    ],
  },
])
