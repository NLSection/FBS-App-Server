# FBS-App-Server

Public source mirror of the FBS Next.js server. Powers the Docker image
`ghcr.io/nlsection/fbs-app-server` used for the optional NAS / server-mode
deployment of FBS.

Development happens in the private `FBS-App-Dev` repo and is mirrored here
via `scripts/sync-server.ps1 -Push` from the Dev workspace. Pushes to this
repo trigger `.github/workflows/docker.yml`, which builds a multi-arch
image and publishes it to GitHub Container Registry.

Deployment instructions: see `server/README.md`.
