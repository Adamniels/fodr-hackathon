// The build-time variables the web app reads (only VITE_ ones reach the browser, ADR 0015). Each is public by design.
interface ImportMetaEnv {
  /** The web app's Sentry project in the EU region (#43); unset, no error report leaves the browser. */
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
  /** The commit the app is built from (the image's GIT_SHA), the release its reports belong to. */
  readonly VITE_APP_VERSION?: string
}
