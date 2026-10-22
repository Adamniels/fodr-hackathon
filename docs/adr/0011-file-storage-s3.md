# 0011. File storage through the S3 API

Status: Accepted. Date: 2026-10-16.

## Context

CF4 requires the original report (PDF or photo, a few MB) to be stored with the analysis, and CF8 requires users to export and delete their files. The file must also be sent to the Anthropic API for extraction.

## Decision

- Files are stored in a **private bucket** through the **S3 API** (AWS SDK v3 client with the endpoint from config), so any S3 compatible store works (ADR 0005).
- **Uploads go through the API**: the API checks media type and size, stores the file, and passes the same bytes to the extraction call. Object keys are random and contain no personal data.
- **Downloads** use short lived presigned URLs issued after an authorization check (ADR 0010).
- Deleting an analysis, horse or account deletes the objects too.

## Alternatives

- **Direct presigned uploads from the browser.** Saves the API from handling the bytes, but the server would have to download the file again for extraction, and validation becomes harder. Worth it only for much larger files.
- **Files in Postgres (bytea).** Simple, but bloats the database and its backups.

## Consequences

- The API needs a body size limit that fits the documented upload limit (set in the M2 slice).
- Locally SeaweedFS serves the bucket (ADR 0006; MinIO until 2026-10-21, when its images could no longer be pulled, #18).

## Notes

- 2026-10-22 (#26): the limits are 20 MB for a PDF and 5 MB for a photo (PNG, JPEG, WebP), the most the AI accepts for an image (owner). They are checked in the browser before upload and again in the API, which reads the type from the file's own bytes. The upload's body limit is the largest file plus the multipart framing; the analysis routes' JSON bodies keep the 64 KB of the other routes. A multipart request is one a form on another page can send without a preflight, so an upload must come from the app's own origin (`Origin`), on top of the SameSite cookie. With `S3_CREATE_BUCKET` the API creates a missing bucket at start, for the local and test stores; production provisions its own. Downloading the original (presigned URLs) is not built yet; export (#40) is its first user. SeaweedFS gives each bucket volumes of its own, so compose.yaml raises its volume limit to hold the dev, integration and e2e buckets.
