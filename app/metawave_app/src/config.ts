// Zentrale Basis-URL für alle API-Aufrufe des Clients.
//
// WICHTIG: Standard ist der Wert unten in DEFAULT_API_BASE.
// Du kannst ihn direkt hier anpassen (z.B. auf deine Debian-/Docker-URL),
// oder per ENV-Variable EXPO_PUBLIC_API_BASE überschreiben.

// Passe diesen Wert an, wenn du keine ENV-Variable verwenden willst.
// Für Production: öffentliche API-Domain
const DEFAULT_API_BASE = "http://localhost:8000";

const rawBase = (() => {
	// 1) Expo / React-Native: öffentliche ENV-Variable (optional)
	if (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_BASE) {
		return process.env.EXPO_PUBLIC_API_BASE as string;
	}

	// 2) Fallback: der Wert aus dieser Config-Datei
	return DEFAULT_API_BASE;
})();

// Ohne abschließenden Slash halten, damit `${API_BASE}/pfad` stabil ist.
export const API_BASE = rawBase.replace(/\/+$/, "");

// Abgeleitete Basis-URL für WebSockets (ws/wss) auf derselben API-Domain
export const WS_BASE = API_BASE.replace(/^http/, "ws");

// Beispiele:
// - Nur Config-Datei nutzen: DEFAULT_API_BASE = "https://radio.meine-domain.tld";
// - Mit ENV: EXPO_PUBLIC_API_BASE="http://10.0.2.2:8000" für Android-Emulator.
