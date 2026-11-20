// The browser tab's title (#195, WCAG 2.4.2 Page Titled): each page names itself, followed by the brand, and the title
// follows the page when the app moves on without a reload. index.html's title stands until the first page sets one.
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/** Titles the tab with the page's own name (from the i18n catalogue); null leaves the title as it is. */
export function usePageTitle(page: string | null): void {
  const { t } = useTranslation()
  const title = page === null ? null : t('titles.page', { page })
  useEffect(() => {
    if (title !== null) document.title = title
  }, [title])
}
