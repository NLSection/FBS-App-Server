# FBS Server (Synology / Docker)

Headless deployment of the FBS Next.js app, with the SQLite database on a NAS volume.
The Tauri client stays usable in two modes: **Lokaal** (own SQLite on the PC, current behaviour) or **Externe NAS** (no local DB, the client points at this server).

## Build the image

On a development machine with Docker installed:

```powershell
.\scripts\build-server.ps1
```

This produces `dist\fbs-server-<version>.tar.gz` next to the repo. Move that file to the NAS (Synology File Station, SCP, etc.).

## Deploy on Synology DSM

Tested on DSM 7.2 with Container Manager.

1. **Create the project folder**, e.g. `/volume2/Docker/FBS/`, and a `data/` subfolder inside it (`/volume2/Docker/FBS/data/`). The DB lives at `<project>/data/fbs.db`. Set ownership of `data/` to UID 1001 (the in-container `fbs` user) — easiest via SSH:
   ```sh
   sudo mkdir -p /volume2/Docker/FBS/data
   sudo chown -R 1001:1001 /volume2/Docker/FBS/data
   ```
2. **Import the image**: Container Manager → Image → Add → Add from file → select `fbs-server-<version>.tar.gz`.
3. **Deploy via compose**:
   - Container Manager → Project → Create
   - Path: `/volume2/Docker/FBS/`
   - Source: paste the contents of `docker-compose.yml`
   - Build / Start
4. **Verify**: browse to `http://<nas-ip>:3210` from any device on the LAN. First boot creates `fbs.db` and runs all migrations up to the bundled `SCHEMA_VERSION`.
5. **Health**: `http://<nas-ip>:3210/api/health` returns `{ ok: true, schemaVersion: <n> }`.

## Update the image

Same flow: build a fresh `.tar.gz`, replace the image in Container Manager, restart the project. The bind-mounted `fbs.db` is preserved across container rebuilds — migrations run on boot.

## Notes for this phase

- **No authentication yet.** Keep the LAN port closed to the outside world; do not port-forward 3210 yet. Phase 2 adds password-based auth before any external exposure.
- **Schema-version mismatch** between client and server is a hard failure. If you upgrade the Tauri client to a newer release, also rebuild and redeploy this image (and vice versa).
- **Backups**: `fbs.db` is a single SQLite file in the bind-mounted folder; the existing in-app backup feature works against it identically. Snapshot the host folder for offsite copies.
