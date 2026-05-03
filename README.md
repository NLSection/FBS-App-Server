# FBS-App-Server

**FBS-Server** is de zelf-gehoste tegenhanger van de FBS desktop-app. Het draait in Docker (bijvoorbeeld op een NAS) en host dezelfde Next.js-app + SQLite-database. Eén of meerdere FBS desktop-clients kunnen er via de **Externe NAS**-modus mee verbinden, zodat je financieel beheer multi-device beschikbaar is zonder broncode-aanpassingen of cloud-services.

> **Werking in het kort**: één database in `/data/fbs.db` op de NAS. De Tauri-client toont de UI maar fetcht alle data van de server. Bij wijzigingen blijft de NAS de single source of truth — laptop, tablet, andere PC zien meteen dezelfde data.

---

## Inhoud

- [Wanneer gebruik je dit?](#wanneer-gebruik-je-dit)
- [Snelstart op een Synology NAS (DSM 7.2+)](#snelstart-op-een-synology-nas-dsm-72)
- [Snelstart elders (Linux + Docker)](#snelstart-elders-linux--docker)
- [Tauri-client koppelen](#tauri-client-koppelen)
- [Updaten](#updaten)
- [Backups](#backups)
- [Versie-compatibiliteit](#versie-compatibiliteit)
- [Beperkingen + roadmap](#beperkingen--roadmap)
- [Troubleshooting](#troubleshooting)
- [Repo-structuur (mirror van Dev)](#repo-structuur-mirror-van-dev)

---

## Wanneer gebruik je dit?

| Wil je…                                              | Lokaal-modus | Externe NAS-modus |
|------------------------------------------------------|:---:|:---:|
| FBS op één PC, geen netwerk nodig                    | ✅  | —    |
| Eén database, meerdere apparaten (laptop + tablet…)  | —   | ✅   |
| Backups blijven lokaal naast de DB                   | ✅  | ✅¹  |
| Werkt offline                                        | ✅  | ❌²  |
| Geen NAS / Docker setup                              | ✅  | ❌   |

¹ De server schrijft `fbs.db` naar de bind-mounted `data/`-map; backups daar zichtbaar in File Station op de NAS.
² Vereist netwerkverbinding met de NAS-server. Bij verlies hangt de client.

---

## Snelstart op een Synology NAS (DSM 7.2+)

1. **Maak de projectstructuur op de NAS** via File Station:
   ```
   /volume2/Docker/FBS/
   └── data/        (komt fbs.db in te leven, moet writable zijn voor UID 1001)
   ```

   Geef de container-user (UID 1001) read+write op `data/`. Snelste weg: Control Panel → Shared Folder → `Docker` → Edit → Permissions → tijdelijk "Read+Write voor Everyone" op `data/`. Of via SSH:
   ```sh
   sudo chown -R 1001:1001 /volume2/Docker/FBS/data
   ```

2. **Plaats `docker-compose.yml`** in `/volume2/Docker/FBS/`. Het bestand staat in deze repo (root) — direct downloaden:
   ```
   https://raw.githubusercontent.com/NLSection/FBS-App-Server/main/docker-compose.yml
   ```

   De compose draait twee containers:
   - `fbs-server` — de Next.js app + SQLite (host-mode netwerk op poort `3210`)
   - `fbs-watchtower` — sidecar voor zero-touch image-updates (alleen bereikbaar via 127.0.0.1:8181)

3. **Container Manager → Project → Create**:
   - Project name: `fbs`
   - Path: `/volume2/Docker/FBS`
   - Source: "Use existing docker-compose.yml" (Container Manager pakt het automatisch op)
   - Klik **Build**. DSM pulled de images van GHCR (~50 MB) en start beide containers.

4. **Verifieer dat 'ie draait**:
   - Browse naar `http://<nas-ip>:3210/api/health` — verwacht JSON `{"ok":true,"app":"fbs","schemaVersion":<N>}`.
   - Browse naar `http://<nas-ip>:3210/` — FBS UI laadt; eerste boot maakt `fbs.db` aan in `data/` en draait migraties.

5. **Optioneel — beperken tot LAN**: `docker-compose.yml` mapt FBS direct op `0.0.0.0:3210`. Beperk in DSM Control Panel → Security of via firewall-rules tot het lokale subnet. **Niet** routeren naar internet — er is nog geen authenticatie (zie [Beperkingen](#beperkingen--roadmap)).

---

## Snelstart elders (Linux + Docker)

```sh
mkdir -p /opt/fbs/data
cd /opt/fbs
curl -O https://raw.githubusercontent.com/NLSection/FBS-App-Server/main/docker-compose.yml
docker compose up -d
curl http://127.0.0.1:3210/api/health
```

---

## Tauri-client koppelen

In de FBS desktop-app:

1. Instellingen → **Database-locatie**
2. Selecteer **Externe NAS**
3. URL: `http://<nas-ip>:3210` (bijvoorbeeld `http://192.168.1.50:3210`)
4. Klik **Test verbinding** — verwacht "Verbonden — FBS-server, schema vN"
5. **Opslaan & herstart** — de app start opnieuw en pointt voortaan op de NAS

Je kunt later weer terug naar **Lokaal** via dezelfde sectie. De lokale `fbs.db` op je PC staat los van de server-DB; switchen verandert alleen welke database de app raadpleegt.

> ⚠️ De instelling is **per apparaat**, niet per gebruiker. Op elk apparaat moet je dit opnieuw doen.

---

## Updaten

### Auto-update via Watchtower (default)

`docker-compose.yml` bundelt **Watchtower** als sidecar. Watchtower polt **niet** automatisch (zou batterij/CPU vreten op een NAS); in plaats daarvan stuurt de FBS-app een trigger via een interne API-call wanneer je in de updater-banner op **"Server bijwerken"** klikt. Watchtower pulled het nieuwe image van GHCR en herstart de container — typisch < 30 seconden, daarna verbindt de client weer.

### Handmatig updaten

```sh
docker compose -f /volume2/Docker/FBS/docker-compose.yml pull
docker compose -f /volume2/Docker/FBS/docker-compose.yml up -d
```

Of in DSM Container Manager: Project `fbs` → Action → "Reset/Build" (gebruikt `pull_policy: always`).

De bind-mounted `fbs.db` blijft staan; migraties draaien on-boot van de nieuwe container.

### Specifieke versie pinnen

`docker-compose.yml` gebruikt `image: ghcr.io/nlsection/fbs-app-server:latest` — pin op een tag voor reproduceerbaarheid:

```yaml
image: ghcr.io/nlsection/fbs-app-server:v0.5.10
```

Beschikbare tags: zie [Releases](https://github.com/NLSection/FBS-App-Server/releases).

---

## Backups

`fbs.db` is **één SQLite-bestand** in de `data/`-map. Backups werken via twee parallel-paden:

1. **Ingebouwde FBS-backup** — werkt vanuit de Tauri-client zoals altijd (Instellingen → Backup). Schrijft naar de server's `data/backups/` en/of een externe locatie als die geconfigureerd is.
2. **NAS-snapshot** — neem `data/` op in je bestaande NAS-backup-strategie (Hyper Backup, rsync, externe USB, cloud-sync). Eén bestand = simpel terug te zetten.

Restore werkt identiek aan lokaal-modus: backup-bestand selecteren in Instellingen → Backup → Importeer.

---

## Versie-compatibiliteit

**Belangrijk**: client en server **moeten** dezelfde major.minor.patch versie draaien. Mismatch = restore-fouten of stille schema-corruption.

- Tauri-client check on-start de `schemaVersion` van de server (zie `/api/health`). Bij mismatch toont de client een waarschuwing.
- Bij upgraden eerst client + server beide naar dezelfde versie brengen, dan pas verbinden.
- De Watchtower-knop in de banner houdt server automatisch in sync zodra je een nieuwe app-versie installeert.

> Iedere FBS-App release ([Test](https://github.com/NLSection/FBS-App-Test/releases) / [Main](https://github.com/NLSection/FBS-App-Main/releases)) heeft een matchende [FBS-Server release](https://github.com/NLSection/FBS-App-Server/releases) met dezelfde versie-tag. Het Docker-image wordt automatisch gepublisht naar `ghcr.io/nlsection/fbs-app-server:vX.Y.Z` + `:latest`.

---

## Beperkingen + roadmap

**Fase 1 (huidig)**:
- Geen authenticatie. Server draait open op LAN-poort `3210` — niet routeren naar internet.
- Geen TLS — connectie is plain HTTP. Op een vertrouwd LAN voldoende.
- One-writer-at-a-time. SQLite WAL-mode laat parallel-readers toe maar één schrijver tegelijk; in praktijk voor één-persoonsgebruik geen probleem, multi-user is niet de scope.

**Fase 2 (gepland)**:
- Optionele password-gate (`FBS_AUTH_PASSWORD` env var) voor LAN met meerdere gebruikers.
- Reverse-proxy guide (Nginx Proxy Manager / Traefik) voor TLS + remote-access.

**Niet gepland**:
- Multi-tenancy (één DB per user). Buiten scope — gebruik dan separate Docker-projecten met aparte volumes.

---

## Troubleshooting

| Symptoom | Oplossing |
|----------|-----------|
| Container start niet, log toont permission denied op `/data/fbs.db` | UID 1001 heeft geen schrijfrecht op de bind-mount. Zie [Snelstart stap 1](#snelstart-op-een-synology-nas-dsm-72). |
| `/api/health` geeft 502/connection refused | Container niet gestart — check Container Manager → fbs-server → Log. Vaak een poort-conflict (3210 al in gebruik). |
| Tauri "Test verbinding" → "Schema mismatch" | Client en server op andere versie. Update de oudste van de twee. |
| "Server bijwerken"-knop in client doet niks | Watchtower-container niet bereikbaar — check `docker ps` of `fbs-watchtower` draait + `WATCHTOWER_HTTP_API_TOKEN` matcht in beide. |
| Container restart-loop | Bind-mount-pad bestaat niet of is read-only. Controleer DSM Shared Folder permissions. |

Logs bekijken:
```sh
docker compose -f /volume2/Docker/FBS/docker-compose.yml logs -f fbs-server
docker compose -f /volume2/Docker/FBS/docker-compose.yml logs -f fbs-watchtower
```

---

## Repo-structuur (mirror van Dev)

Deze repo is een **publieke mirror** van de relevante delen van het private `FBS-App-Dev`. Pushes komen van `scripts/sync-server.ps1 -Push` in de Dev-workspace; **niet handmatig op deze repo committen** (commits worden bij de volgende sync overschreven).

Wel hier, niet in Dev:
- `docker-compose.yml` (root) — distributie-compose voor eindgebruikers
- `Dockerfile` (in `server/`) — build-recipe voor de image

Niet hier (zit alleen in Dev):
- `src-tauri/` — Tauri/Rust shell, irrelevant voor server
- `scripts/` (Tauri build scripts), `SESSION.md`, `CLAUDE.md`, `ROADMAP.html`

CI/CD: `.github/workflows/docker.yml` bouwt multi-arch images (linux/amd64 + linux/arm64) en pusht ze naar GHCR. Triggers:
- Push naar `main` → tag `:dev` (handmatig testen, geen rollout)
- Tag `vX.Y.Z` push → tags `:latest` + `:vX.Y.Z` (productie-rollout, wat Watchtower pakt)

---

## Licentie

Zie [LICENSE](./LICENSE).
