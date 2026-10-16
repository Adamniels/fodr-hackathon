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
- Locally MinIO serves the bucket (ADR 0006).
