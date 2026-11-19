ARG DEVFLOW_BASE
FROM ${DEVFLOW_BASE}

# Dev flow's recipe for Fodr: the worker's base image (the platform's node:26-trixie-slim with Claude Code and
# Playwright) plus what Fodr's check and start need, since a worker has no Docker to run compose.yaml. Dev flow builds
# it with no context, so it can neither COPY nor ADD: Fodr's own packages are installed by scripts/devflow/check.sh in
# each card's copy. The services are started by scripts/devflow/services.sh, as the agent user, with the ports and
# identities compose.yaml uses.

# Postgres 18, the major compose.yaml and production use (ADR 0006), from the PostgreSQL project's own apt repository,
# since Debian trixie ships 17. No cluster is made here: each run makes its own (services.sh).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl postgresql-common; \
    /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y; \
    mkdir -p /etc/postgresql-common/createcluster.d; \
    echo 'create_main_cluster = false' > /etc/postgresql-common/createcluster.d/devflow.conf; \
    apt-get install -y --no-install-recommends postgresql-18; \
    rm -rf /var/lib/apt/lists/*

# SeaweedFS and Mailpit, the versions compose.yaml pins, as their release binaries, each checked against the checksum of
# its release archive. Update a version here and in compose.yaml together.
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) weed_sha=4a7d108384d044d95212d1342cdda9533fa55842c1c9b41f606ca3c8a9561124; \
             mailpit_sha=30942c4605c2ca8b9f759b1bb4e3ab6a12bdfdf66e5c94644ec2c75ac41e88e7 ;; \
      arm64) weed_sha=557e92c38c5c7d180748eb8e2b2b45e426f8e5282a4caca8e098a90d09f03a07; \
             mailpit_sha=010a346a8b9d454f6fa22d4fd2dbd5bf5eb7104688412b9c130d0ba33a3579c4 ;; \
      *) echo "no SeaweedFS and Mailpit builds pinned for $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/weed.tgz "https://github.com/seaweedfs/seaweedfs/releases/download/4.48/linux_${arch}.tar.gz"; \
    echo "$weed_sha  /tmp/weed.tgz" | sha256sum -c -; \
    tar -xzf /tmp/weed.tgz -C /usr/local/bin weed; \
    curl -fsSL -o /tmp/mailpit.tgz "https://github.com/axllent/mailpit/releases/download/v1.31.4/mailpit-linux-${arch}.tar.gz"; \
    echo "$mailpit_sha  /tmp/mailpit.tgz" | sha256sum -c -; \
    tar -xzf /tmp/mailpit.tgz -C /usr/local/bin mailpit; \
    rm /tmp/weed.tgz /tmp/mailpit.tgz

# Chromium for the Playwright version apps/web pins, which differs from the base image's: its browsers in /ms-playwright
# are root's and fit only its own version. Fodr's e2e run uses these through scripts/devflow/env.sh, which refuses to run
# when apps/web pins another version than VERSION, so a bump of @playwright/test also bumps this line.
RUN set -eux; \
    PLAYWRIGHT_BROWSERS_PATH=/opt/fodr-playwright npx -y playwright@1.63.0 install --with-deps chromium; \
    echo 1.63.0 > /opt/fodr-playwright/VERSION; \
    chmod -R a+rX /opt/fodr-playwright; \
    rm -rf /var/lib/apt/lists/* /root/.npm
