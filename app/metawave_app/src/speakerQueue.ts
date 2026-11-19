export interface SpeakerSchedule {
  enabled: boolean;
  next_broadcast: string | null;
  next_broadcast_state: string | null;
}

export interface SpeakerQueueNotice {
  title: string;
  detail: string;
  warning: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseSpeakerSchedule(value: unknown): SpeakerSchedule {
  if (!isRecord(value) || typeof value.enabled !== "boolean" ||
      !(typeof value.next_broadcast === "string" || value.next_broadcast === null) ||
      !(typeof value.next_broadcast_state === "string" || value.next_broadcast_state === null)) {
    throw new Error("Ungültiger Speaker-Status");
  }
  return {
    enabled: value.enabled,
    next_broadcast: value.next_broadcast,
    next_broadcast_state: value.next_broadcast_state,
  };
}

export function speakerQueueNotice(
  status: SpeakerSchedule | null,
  unavailable: boolean,
  isSpeaker: boolean,
  isPaused: boolean,
): SpeakerQueueNotice | null {
  if (isSpeaker) {
    return { title: isPaused ? "Speaker · Pausiert" : "Speaker · Jetzt auf Sendung",
      detail: "Nachrichten und Moderation", warning: false };
  }
  if (unavailable) {
    return { title: "Speaker · Status nicht erreichbar", detail: "Die Sendezeit ist derzeit nicht verfügbar.", warning: true };
  }
  if (!status || !status.enabled) return null;
  const target = status.next_broadcast ? Date.parse(status.next_broadcast) : NaN;
  if (!Number.isFinite(target)) {
    return { title: "Speaker · Sendezeit nicht verfügbar", detail: "Bitte die Speaker-Einstellungen prüfen.", warning: true };
  }
  const date = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(target));
  if (status.next_broadcast_state && ["failed", "missed", "skipped"].includes(status.next_broadcast_state)) {
    return { title: "Speaker · Sendung fällt aus", detail: `Geplant: ${date} Uhr (CH)`, warning: true };
  }
  if (status.next_broadcast_state === "uncertain") {
    return { title: "Speaker · Ausspielung unbestätigt", detail: `Geplant: ${date} Uhr (CH)`, warning: true };
  }
  return {
    title: `Speaker · ${date} Uhr (CH)`,
    detail: isPaused ? "Entfällt, falls das Radio pausiert bleibt." : "Geplant · nur bei laufendem Radio",
    warning: false,
  };
}
