# URL-Parameter Login Feature

## Übersicht
MetaWave unterstützt jetzt den automatischen Login über URL-Parameter, sodass Benutzer direkt auf den Player zugreifen können, ohne jedes Mal manuell ihren WaveToken eingeben zu müssen.

## Funktionsweise

### Backend
Ein neuer Endpunkt wurde zur Authentifizierungs-API hinzugefügt:

```
GET /auth/login?wavetoken=...
```

Dieser Endpunkt:
- Akzeptiert den WaveToken als URL Query-Parameter
- Validiert ihn gegen den aktuellen Monatstoken in der Datenbank
- Gibt bei erfolgreicher Authentifizierung ein JWT-Token zurück
- Funktioniert genauso wie der Standard-`POST /auth/login` Endpunkt
- Der bestehende `POST /auth/login` Endpunkt funktioniert weiterhin mit Request-Body

### Frontend
Der Login-Screen der App (`index.tsx`) prüft nun beim Laden auf URL-Parameter:
- Sucht nach `?wavetoken=` oder `?token=` Query-Parametern
- Authentifiziert den Benutzer automatisch, wenn ein gültiger Token gefunden wird
- Leitet direkt zum Player weiter bei erfolgreicher Authentifizierung
- Fällt zurück auf den normalen Login-Flow, wenn die Authentifizierung fehlschlägt

## Verwendungsbeispiele

### Web-App
Benutzer können jetzt direkt auf den Player zugreifen mit URLs wie:

```
https://metawave.timofej.ch/?wavetoken=MW202601-RADIO
```

oder

```
https://metawave.timofej.ch/?token=MW202601-RADIO
```

### Mobile App Deep Links
Für Mobile Apps mit konfiguriertem Deep Linking:

```
metawave:///?wavetoken=MW202601-RADIO
```

### API-Verwendung
Direkter API-Aufruf zum Erhalt eines JWT-Tokens:

```bash
curl "https://api.metawave.timofej.ch/auth/login?wavetoken=MW202601-RADIO"
```

Antwort:
```json
{
  "status": 200,
  "message": "Sucessfully Logged In",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## Anwendungsfälle

### 1. Shortcuts erstellen
Benutzer können Lesezeichen/Shortcuts mit eingebettetem WaveToken erstellen:
- Desktop: Browser-Lesezeichen
- Mobile: Home-Screen Shortcut
- Interne Tools: Dashboard-Links

### 2. Einbettung in interne Tools
Unternehmen können Direct-Access-Links einbetten in:
- Interne Wikis
- Team-Dashboards
- Benachrichtigungssysteme
- Kalender-Events

### 3. Reibung reduzieren
Perfekt für:
- Häufig genutzte Geräte (z.B. Büro-Radio)
- Kiosk-Modus Displays
- Geteilte Geräte in Gemeinschaftsräumen
- Schnellzugriff über Benachrichtigungen

## Sicherheitsüberlegungen

⚠️ **Wichtige Sicherheitshinweise:**

1. **URL-Sichtbarkeit**: WaveTokens in URLs sind sichtbar in:
   - Browser-Verlauf
   - Server-Logs
   - Proxy-Logs
   - Geteilten Links

2. **Anwendungsfälle**: URL-basierter Login sollte nur verwendet werden für:
   - Vertrauenswürdige Umgebungen
   - Persönliche Geräte
   - Interne Netzwerke
   - Temporären Zugriff

3. **Best Practices**:
   - Teile keine URLs mit eingebetteten Tokens in öffentlichen Bereichen
   - Nutze kurzlebige Sessions (aktuelle Implementierung: 30 Minuten)
   - Rotiere WaveTokens monatlich (bereits implementiert)
   - Lösche Browser-Verlauf auf geteilten Geräten

4. **Alternative für sensible Umgebungen**:
   - Für höhere Sicherheitsanforderungen nutze den Standard-Login-Flow
   - Benutzer geben den WaveToken jedes Mal manuell ein
   - Tokens werden nicht in URLs exponiert

## Implementierungsdetails

### Backend-Änderungen
- **Datei**: `app/metawave_server/radio/middleware/AuthLogic.js`
  - `login()` Funktion modifiziert, um wavetoken sowohl von `req.body` (POST) als auch `req.query` (GET) zu akzeptieren
  
- **Datei**: `app/metawave_server/radio/middleware/AuthRouter.js`
  - `GET /auth/login` Route neben der bestehenden POST-Route hinzugefügt

- **Datei**: `app/metawave_server/radio/swagger/openapi.yaml`
  - API-Dokumentation für neuen Endpunkt hinzugefügt

### Frontend-Änderungen
- **Datei**: `app/metawave_app/app/index.tsx`
  - `useLocalSearchParams()` hinzugefügt zum Lesen von URL-Parametern
  - `handleUrlLogin()` Funktion für URL-basierte Authentifizierung hinzugefügt
  - Initialisierungsablauf modifiziert, um zuerst URL-Parameter zu prüfen

## Testing

### Backend-Endpunkt testen
```bash
# Ersetze MW202601-RADIO mit deinem aktuellen Monatstoken
curl "http://localhost:8000/auth/login?wavetoken=MW202601-RADIO"
```

### Frontend testen
1. App starten
2. Navigiere zu: `http://localhost:19006/?wavetoken=MW202601-RADIO`
3. App sollte automatisch einloggen und zum Player weiterleiten

## Fehlerbehebung

### URL-Login funktioniert nicht
1. **WaveToken prüfen**: Stelle sicher, dass du den aktuellen Monatstoken verwendest
2. **URL-Encoding prüfen**: Sonderzeichen in Tokens sollten URL-kodiert sein
3. **Netzwerk prüfen**: Stelle sicher, dass die App den Backend-Server erreichen kann
4. **Konsole prüfen**: Suche nach Fehlermeldungen in der Browser/App-Konsole

### Token läuft sofort ab
- Standard-Token-Ablaufzeit ist 30 Minuten
- Setze `AUTH_TOKEN_EXPIRY` Umgebungsvariable, um dies zu ändern
- Beispiel: `AUTH_TOKEN_EXPIRY=3600` für 1 Stunde

### Login-Screen wird weiterhin angezeigt
- URL-Parameter wird möglicherweise nicht korrekt gelesen
- Prüfe, dass du `?wavetoken=` oder `?token=` verwendest
- Verifiziere, dass der Parameter-Name kleingeschrieben ist

## Zukünftige Erweiterungen

Mögliche Verbesserungen für dieses Feature:

1. **Gerät merken**: Option für längere Session auf vertrauenswürdigen Geräten
2. **Einmal-Tokens**: Generierung von Einweg-Tokens zum Teilen
3. **QR-Codes**: QR-Code-Generierung mit eingebetteten Login-URLs
4. **Direkte Player-Links**: Unterstützung für `/player?wavetoken=...` um Login-Screen komplett zu überspringen
5. **Token-Widerruf**: Möglichkeit, spezifische Tokens/Sessions zu invalidieren
