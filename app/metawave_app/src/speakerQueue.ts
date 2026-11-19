export interface NewsSourceItem {
  title: string;
  summary: string;
  source: string;
  url: string | null;
}

export interface SpeakerSchedule {
  enabled: boolean;
  next_broadcast: string | null;
  next_broadcast_state: string | null;
  next_broadcast_script?: string | null;
  next_broadcast_items?: NewsSourceItem[] | null;
  last_broadcast?: { target: string; script: string; items?: NewsSourceItem[] | null } | null;
}

export interface SpeakerQueueNotice {
  title: string;
  detail: string;
  warning: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNewsItems(value: unknown): value is NewsSourceItem[] {
  return Array.isArray(value) && value.every(item => isRecord(item) &&
    typeof item.title === "string" && typeof item.summary === "string" &&
    typeof item.source === "string" && (typeof item.url === "string" || item.url === null));
}

function isBroadcast(value: unknown): value is { target: string; script: string; items?: NewsSourceItem[] | null } {
  return isRecord(value) && typeof value.target === "string" && Number.isFinite(Date.parse(value.target)) &&
    typeof value.script === "string" && (value.items == null || isNewsItems(value.items));
}

export function safeNewsUrl(value: string | null): string | null {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function parseSpeakerSchedule(value: unknown): SpeakerSchedule {
  if (!isRecord(value) || typeof value.enabled !== "boolean" ||
      !(typeof value.next_broadcast === "string" || value.next_broadcast === null) ||
      !(typeof value.next_broadcast_state === "string" || value.next_broadcast_state === null) ||
      !(typeof value.next_broadcast_script === "string" || value.next_broadcast_script === null || value.next_broadcast_script === undefined) ||
      !(value.next_broadcast_items == null || isNewsItems(value.next_broadcast_items)) ||
      !(value.last_broadcast == null || isBroadcast(value.last_broadcast))) {
    throw new Error("Ungültiger Speaker-Status");
  }
  return {
    enabled: value.enabled,
    next_broadcast: value.next_broadcast,
    next_broadcast_state: value.next_broadcast_state,
    ...(value.next_broadcast_script === undefined ? {} : { next_broadcast_script: value.next_broadcast_script }),
    ...(value.next_broadcast_items === undefined ? {} : { next_broadcast_items: value.next_broadcast_items }),
    ...(value.last_broadcast === undefined ? {} : { last_broadcast: value.last_broadcast }),
  };
}

function scriptPreview(script: string): string[] {
  return script.split(/\n\s*\n/)
    .slice(1, -1)
    .map(paragraph => paragraph.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 3)
    .map(paragraph => paragraph.length > 200 ? `${paragraph.slice(0, 197).trimEnd()}…` : paragraph);
}

export function newsPreview(status: SpeakerSchedule | null): string[] {
  if (!status?.enabled || !["ready", "claimed"].includes(status.next_broadcast_state || "") || !status.next_broadcast_script) return [];
  return scriptPreview(status.next_broadcast_script);
}

export function lastNewsPreview(status: SpeakerSchedule | null): string[] {
  return status?.last_broadcast ? scriptPreview(status.last_broadcast.script) : [];
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
  if (status.next_broadcast_state === "claimed") {
    return { title: "Speaker · wartet auf Liedende", detail: "Beginnt, sobald die Ansagen bereit sind.", warning: false };
  }
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
