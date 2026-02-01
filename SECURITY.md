# Security Policy / Sicherheitsrichtlinie

## Supported versions / Unterstützte Versionen

| Version | Supported |
| ------- | --------- |
| v3      | ✅ (teilweise — nur kritische Fixes) |
| v2      | ❌ |
| v1      | ❌ |

## Reporting (Kurz)

- Kontakt / Contact: `security@metawave.timofej.ch` oder GitHub Security Advisory
- Eingangsbestätigung / Acknowledgement: innerhalb von 72 Stunden
- Updates: ca. einmal pro Woche bis zur Behebung
- Bitte vertraulich melden; keine vollständigen PoCs in öffentlichen Issues

## Reporter-Checklist (kurz)

- Betroffene Version / Commit-Hash
- Kurze Beschreibung + Impact
- Minimale Reproduktionsschritte
- Proof-of-Concept (falls nötig, verschlüsselt senden)

## Kurz-Platform-Hinweise (Repo-Paths)

| Komponente | Empfehlung (Kurz) | Nützliche Angaben für Reporter |
| --------- | ----------------- | ------------------------------ |
| `app/metawave_app` (Expo: Android/iOS/Web) | Keine Secrets in App; SecureStore/Keychain; Keystore nie ins Repo | App-Version, Expo-SDK, Build-Typ, Repro-Schritte |
| `app/metawave_server/downloader` (yt-dlp) | Cookies/API-Credentials nie committen; Docker-Secrets; Logs maskieren | `yt-dlp`-Version, Cookie-Datei, Container-Config, Commands |
| `app/metawave_server/radio` (Node.js) | Env-Secrets nicht im Repo; sichere Websocket/Auth-Config | `package.json` Version, Server-Logs, Repro-Schritte |
| Infrastruktur / Docker | Secrets via `docker secrets`/Secret-Manager; Volumes/Backups schützen | `docker-compose`/env, Logs, Ressourcennutzung |

## Verschlüsselung sensibler Anhänge

Wenn nötig, senden Sie sensible Anhänge verschlüsselt (PGP) oder fragen Sie nach einem sicheren Kanal.

---
Kontakt: `security@metawave.timofej.ch`.
