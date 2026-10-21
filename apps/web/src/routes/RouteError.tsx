// The error boundary of every route (router.tsx): an unknown address shows a not-found page, anything else that
// fails to render a generic error with a way back, instead of a blank page.
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

/**
 * `page` for the root route, whose boundary replaces the whole page (an unknown address); nested boundaries render
 * inside the workspace, which already has the page's main landmark and level 1 heading.
 */
export function RouteError({ page = false }: { page?: boolean }) {
  const { t } = useTranslation()
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const Container = page ? 'main' : 'div'
  const Heading = page ? 'h1' : 'h2'
  return (
    <Container className="kort" role="alert">
      <Heading>{t(notFound ? 'errors.notFoundTitle' : 'errors.pageTitle')}</Heading>
      <p>{t(notFound ? 'errors.notFoundText' : 'errors.pageText')}</p>
      <p>
        {!notFound && (
          <button className="knapp" onClick={() => window.location.reload()}>
            {t('errors.reload')}
          </button>
        )}{' '}
        <Link to="/">{t('errors.toLanding')}</Link>
      </p>
    </Container>
  )
}
