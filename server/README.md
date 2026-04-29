# FBS Server (Synology / Docker)

Headless deployment of the FBS Next.js app with the SQLite database on a NAS volume.
The Tauri client can run in **Lokaal** mode (own SQLite on the PC, default) or **Externe NAS** mode (no local DB, the client points at this server).

The image is built and published automatically by the `FBS-App-Server` repo's GitHub Actions on every push, multi-arch (`linux/amd64` + `linux/arm64`):

- `ghcr.io/nlsection/fbs-app-server:latest`
- `ghcr.io/nlsection/fbs-app-server:vX.Y.Z` (tagged releases)

## Deploy on Synology DSM (Container Manager, DSM 7.2)

1. **Maak de projectstructuur op de NAS**:
   ```
   /volume2/Docker/FBS/
   └── data/        (← komt fbs.db in te leven, moet schrijfbaar zijn voor UID 1001)
   ```
   Via File Station: maak de mappen aan. Daarna via Control Panel → Shared Folder → `Docker` → Edit → Permissions: zorg dat de container-user (UID 1001) read+write heeft op `data/`. Simpelste alternatief: tijdelijk "Read+Write voor Everyone" op `data/`, of via SSH:
   ```sh
   sudo chown -R 1001:1001 /volume2/Docker/FBS/data
   ```

2. **Plaats `docker-compose.yml`** in `/volume2/Docker/FBS/`. Inhoud staat naast deze README in de repo; copy-paste of upload via File Station.

3. **Container Manager → Project → Create**:
   - Project name: `fbs`
   - Path: `/volume2/Docker/FBS`
   - Source: "Use existing docker-compose.yml" (Container Manager pakt het automatisch op)
   - Klik "Build" → de NAS pullt de image van GHCR (~50 MB) en start de container

4. **Verifieer**:
   - Browse to `http://<nas-ip>:3210/api/health` — verwacht: `{"ok":true,"app":"fbs","schemaVersion":80}`
   - Browse to `http://<nas-ip>:3210/` — FBS UI laadt; eerste boot maakt `fbs.db` aan en draait migraties tot `SCHEMA_VERSION`.

## Updaten

Bij elke push naar de Server-repo bouwt GHA een nieuwe image. Op de NAS:

- Container Manager → Project `fbs` → Action → "Reset/Build" (pulls nieuwste image dankzij `pull_policy: always` in compose)
- Of via Schedule Task voor automatische updates: command `docker compose -f /volume2/Docker/FBS/docker-compose.yml pull && docker compose -f /volume2/Docker/FBS/docker-compose.yml up -d`

Bind-mounted `fbs.db` blijft staan, migraties draaien on-boot.

## Belangrijke nota's bij deze fase (1)

- **Geen authenticatie** — port 3210 niet extern openen. LAN-only tot fase 2 (password-gate) klaar is.
- **Backups** — `fbs.db` is één SQLite-bestand in `data/`. De ingebouwde backup-feature van FBS werkt identiek; voor offsite ook gewoon de hele `data/` map periodiek snapshotten/synchroniseren.
- **Logs** — Container Manager → Container `fbs-server` → Log toont stdout/stderr. Bij issues de healthcheck is verbose.

## Tauri-client koppelen

In de Tauri-app: Instellingen → **Database-locatie** → "Externe NAS" → URL `http://<nas-ip>:3210` → "Test verbinding" (verwacht "Verbonden — FBS-server, schema vN") → "Opslaan & herstart". Daarna opent de app de NAS-UI ipv de lokale.
