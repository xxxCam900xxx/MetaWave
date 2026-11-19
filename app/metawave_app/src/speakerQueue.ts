export interface NewsSourceItem {
  title: string;
  summary: string;
  source: string;
  url: string | null;
}

export interface SpeakerSchedule {
  enabled: boolean;
  next_prepare?: string | null;
  next_broadcast: string | null;
  next_broadcast_state: string | null;
  transition_state?: string | null;
  job?: { state: string; scheduled: boolean; target: string } | null;
  last_scheduled?: { state: string; target: string } | null;
  next_broadcast_script?: string | null;
  next_broadcast_items?: NewsSourceItem[] | null;
  last_broadcast?: { target: string; script: string; items?: NewsSourceItem[] | null } | null;
}

export interface SpeakerQueueNotice {
  title: string;
  detail: string;
  warning: boolean;
  busy?: boolean;
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

function isJob(value: unknown): value is { state: string; target: string } {
  return isRecord(value) && typeof value.state === "string" && typeof value.target === "string" &&
    Number.isFinite(Date.parse(value.target));
}

function isCurrentJob(value: unknown): value is { state: string; target: string; scheduled: boolean } {
  return isRecord(value) && typeof value.scheduled === "boolean" && isJob(value);
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
      !(value.next_prepare == null || typeof value.next_prepare === "string") ||
      !(value.job == null || isCurrentJob(value.job)) ||
      !(value.last_scheduled == null || isJob(value.last_scheduled)) ||
      !(value.transition_state == null || typeof value.transition_state === "string") ||
      !(typeof value.next_broadcast === "string" || value.next_broadcast === null) ||
      !(typeof value.next_broadcast_state === "string" || value.next_broadcast_state === null) ||
      !(typeof value.next_broadcast_script === "string" || value.next_broadcast_script === null || value.next_broadcast_script === undefined) ||
      !(value.next_broadcast_items == null || isNewsItems(value.next_broadcast_items)) ||
      !(value.last_broadcast == null || isBroadcast(value.last_broadcast))) {
    throw new Error("Ungültiger Speaker-Status");
  }
  return {
    enabled: value.enabled,
    ...(value.next_prepare === undefined ? {} : { next_prepare: value.next_prepare }),
    next_broadcast: value.next_broadcast,
    next_broadcast_state: value.next_broadcast_state,
    ...(value.transition_state === undefined ? {} : { transition_state: value.transition_state }),
    ...(value.job === undefined ? {} : { job: value.job }),
    ...(value.last_scheduled === undefined ? {} : { last_scheduled: value.last_scheduled }),
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
  now: number = Date.now(),
): SpeakerQueueNotice | null {
  if (isSpeaker) {
    return { title: isPaused ? "Speaker · Pausiert" : "Speaker · Jetzt auf Sendung",
      detail: "Nachrichten und Moderation", warning: false };
  }
  if (unavailable) {
    return { title: "Speaker · Status nicht erreichbar", detail: "Die Sendezeit ist derzeit nicht verfügbar.", warning: true };
  }
  if (!status) return { title: "Speaker · Status wird geladen", detail: "Verbindung wird geprüft.", warning: false };
  if (!status.enabled) {
    if (status.job?.state === "preparing" && !status.job.scheduled) {
      return { title: "Speaker · Vorschau wird erstellt", detail: "Manueller Test · keine automatische Sendung", warning: false, busy: true };
    }
    return { title: "Speaker · Deaktiviert", detail: "Automatische Sendungen sind ausgeschaltet.", warning: false };
  }
  const target = status.next_broadcast ? Date.parse(status.next_broadcast) : NaN;
  if (!Number.isFinite(target)) {
    return { title: "Speaker · Sendezeit nicht verfügbar", detail: "Bitte die Speaker-Einstellungen prüfen.", warning: true };
  }
  const date = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(target));
  if (status.next_broadcast_state === "claimed") {
    return { title: "Speaker · wartet auf Liedende", detail: status.transition_state === "preparing"
      ? "Songansagen werden erstellt." : "Beginnt, sobald die Songansagen bereit sind.",
      warning: false, busy: status.transition_state === "preparing" };
  }
  if (status.next_broadcast_state && ["failed", "missed", "skipped"].includes(status.next_broadcast_state)) {
    return { title: "Speaker · Sendung fällt aus", detail: `Geplant: ${date} Uhr (CH) · Einstellungen und Protokoll prüfen.`, warning: true };
  }
  if (status.next_broadcast_state === "uncertain") {
    return { title: "Speaker · Ausspielung unbestätigt", detail: `Geplant: ${date} Uhr (CH)`, warning: true };
  }
  if (status.next_broadcast_state === "preparing") {
    return { title: "Speaker · Sendung wird erstellt", detail: `Nachrichten und Audio für ${date} Uhr (CH)`, warning: false, busy: true };
  }
  if (status.next_broadcast_state === "ready") {
    const preview = status.job?.state === "preparing" && !status.job.scheduled;
    return { title: "Speaker · Sendung bereit", detail: `${date} Uhr (CH) · ${isPaused
      ? "Radio pausiert, Sendung kann ausfallen." : "bei laufendem Radio."}${preview ? " Vorschau wird zusätzlich erstellt." : ""}`,
      warning: false, busy: preview };
  }
  if (!status.next_broadcast_state && now >= target - 3600000 + 30000) {
    const preview = status.job?.state === "preparing" && !status.job.scheduled;
    return { title: "Speaker · Keine Vorbereitung erkannt", detail: `Für ${date} Uhr (CH) ist noch kein Beitrag vorhanden.${preview ? " Eine manuelle Vorschau läuft." : ""}`, warning: true, busy: preview };
  }
  if (status.job?.state === "preparing" && !status.job.scheduled) {
    return { title: "Speaker · Vorschau wird erstellt", detail: "Manueller Test · keine automatische Sendung", warning: false, busy: true };
  }
  const preparation = status.next_prepare ? Date.parse(status.next_prepare) : NaN;
  const prepareText = Number.isFinite(preparation) && preparation === target - 3600000
    ? new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(preparation))
    : null;
  return {
    title: `Speaker · ${date} Uhr (CH)`,
    detail: isPaused ? "Entfällt, falls das Radio pausiert bleibt." :
      prepareText ? `Vorbereitung ab ${prepareText} Uhr (CH)` : "Geplant · nur bei laufendem Radio",
    warning: false,
  };
}

export function recentSpeakerWarning(status: SpeakerSchedule | null, now: number = Date.now()): string | null {
  const last = status?.last_scheduled;
  if (!last || !["failed", "missed", "skipped", "uncertain"].includes(last.state)) return null;
  const target = Date.parse(last.target);
  if (!Number.isFinite(target) || target > now || now - target > 24 * 3600000) return null;
  if (status?.last_broadcast && Date.parse(status.last_broadcast.target) > target) return null;
  const time = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(target));
  return last.state === "uncertain" ? `Ausspielung um ${time} Uhr (CH) nicht bestätigt.` :
    `Sendung um ${time} Uhr (CH) ausgefallen. Einstellungen und Protokoll prüfen.`;
}
