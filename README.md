# FBS-Server

**Dezelfde FBS-administratie op meer dan één apparaat.**

FBS-Server is een synchronisatiedienst voor [FBS](https://fbs.section-labs.nl). Gebruik je FBS op
bijvoorbeeld je pc en je laptop, dan houdt FBS-Server een gedeelde administratie op allebei
gelijk. Elk apparaat werkt op een eigen kopie; FBS-Server bewaart de wijzigingen en geeft ze door.
Je werkt zelf gewoon in FBS: de server heeft geen eigen scherm.

FBS-Server draait in je eigen thuisnetwerk, op een apparaat dat altijd aan staat, zoals een NAS.
Er gaat niets naar een dienst van iemand anders.

---

## Wat je nodig hebt

- Een NAS of server in je thuisnetwerk met Docker. Op de meeste NAS-en installeer je Docker via
  het pakketcentrum van de NAS.
- Een Intel- of AMD-processor, of 64-bits ARM (zoals een Raspberry Pi 4 of 5).
- FBS op je apparaten.

---

## Installeren

1. Maak op de NAS of server een map voor FBS-Server.
2. Zet daarin het bestand [docker-compose.yml](docker-compose.yml) uit deze repository. Hetzelfde
   bestand vind je ook in FBS, bij Instellingen, tabblad Systeem, onder FBS-Server inrichten.
3. Start het bestand in Docker als project, of met de opdracht `docker compose up -d` in die map.
4. Zet poort 8099 open in de firewall van dat apparaat, alleen voor je thuisnetwerk.
5. Zet in FBS bij Instellingen, tabblad Systeem, FBS-Server gebruiken aan, en klik bij Verbinding
   met de server op Zoeken op het netwerk.

Daarna deel je een administratie bij Instellingen, tabblad Database, onder Gedeeld via FBS-Server.

---

## Bijwerken

Dat doet FBS voor je. Heeft FBS een nieuwere versie van FBS-Server bij zich, dan krijg je een
melding, en werk je de server bij met één knop bij Verbinding met de server. Het pakket zelf hoef
je niet te vernieuwen.

---

## Beheerderscode en koppelcodes

Bij elke start zet FBS-Server een beheerderscode in het logboek van de container. Die heb je nodig
voor Server beheren in FBS. Je leest het logboek in de Docker-beheerder van je NAS, of met
`docker logs FBS-Server`.

In hetzelfde logboek staat per gedeelde administratie een koppelcode voor een nieuw apparaat, 24
uur geldig. Die heb je alleen nodig als je geen werkend apparaat en geen herstelcode meer hebt.

---

## Je gegevens

FBS-Server bewaart de gedeelde administraties in de map `gegevens` naast het bestand
docker-compose.yml, onversleuteld. Zet de map daarom op een plek waar alleen jij bij kunt, en
versleutel je backups ervan.

Met een backup van die map haal je je gedeelde administraties terug, ook als je al je apparaten
kwijt bent: start FBS-Server opnieuw met die map en sluit een nieuw apparaat aan met je
herstelcode, of met een koppelcode uit het logboek.

Meer over hoe FBS met je gegevens omgaat: [privacyverklaring](https://fbs.section-labs.nl/privacy.html).

---

## Over deze repository

Hier staan de uitgebrachte versies van FBS-Server en het bestand om hem te installeren. De
broncode is niet openbaar.

---

Section Labs
