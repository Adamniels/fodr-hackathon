// The error boundary of every route (router.tsx): an unknown address shows a not-found page, anything else that
// fails to render a generic error with a way back, instead of a blank page, and is reported (#43).
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { reportError } from '../error-reporting'

/**
 * `page` for a route whose boundary replaces the whole page; nested boundaries render inside the workspace, which
 * already has the page's main landmark and level 1 heading.
 */
export function RouteError({ page = false }: { page?: boolean }) {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  // A page that failed to render is a bug to know about (#43); an address that does not exist is not.
  useEffect(() => {
    if (!notFound) reportError(error)
  }, [error, notFound])
  return <ErrorContent page={page} notFound={notFound} />
}

/** A page that does not exist for this visitor (the admin pages for anyone else, #36): the not-found page. */
export function PageNotFound() {
  return <ErrorContent page notFound />
}

/** An address under a horse that is no step: the not-found text inside the workspace, which stays. */
export function StepNotFound() {
  return <ErrorContent page={false} notFound />
}

function ErrorContent({ page, notFound }: { page: boolean; notFound: boolean }) {
  const { t } = useTranslation()
  const Heading = page ? 'h1' : 'h2'
  const content = (
    <div className="kort" role="alert">
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
    </div>
  )
  return page ? <main>{content}</main> : content
}
