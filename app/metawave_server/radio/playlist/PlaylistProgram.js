const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function validAnnualDate(value) {
  if (typeof value !== "string" || !/^\d{2}-\d{2}$/.test(value)) return false;
  const [month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(2024, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function inAnnualWindow(program, now = new Date()) {
  if (!program.start_date || !program.end_date) return false;
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  const time = `${parts.hour}:${parts.minute}`;
  const start = program.start_time;
  const end = program.end_time;
  const overnight = start > end;
  if (start !== end && !(overnight ? time >= start || time < end : time >= start && time < end)) return false;
  let date = `${parts.month}-${parts.day}`;
  if (overnight && time < end) {
    const previous = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - 1));
    date = `${String(previous.getUTCMonth() + 1).padStart(2, "0")}-${String(previous.getUTCDate()).padStart(2, "0")}`;
  }
  return program.start_date <= program.end_date
    ? date >= program.start_date && date <= program.end_date
    : date >= program.start_date || date <= program.end_date;
}

export function buildProgramQueue(catalog, memberships, programs, current, shuffle, now = new Date()) {
  const main = programs.find(p => p.is_main && p.is_active);
  if (!main || !Object.hasOwn(memberships, String(main.id))) return null;
  const byId = new Map(catalog.filter(song => song.id).map(song => [song.id, song]));
  const mainSongs = (memberships[main.id] || []).map(id => byId.get(id)).filter(Boolean);
  if (!mainSongs.length) return null;
  const mainIds = new Set(mainSongs.map(song => song.id));
  const seasonalIds = new Set();
  for (const program of programs) {
    if (!program.is_main && program.is_active && inAnnualWindow(program, now)) {
      for (const id of memberships[program.id] || []) {
        if (!mainIds.has(id) && byId.has(id)) seasonalIds.add(id);
      }
    }
  }
  const mainQueue = shuffle(mainSongs.filter(song => song.filename !== current?.filename));
  const seasonal = shuffle([...seasonalIds].map(id => byId.get(id))
    .filter(song => song.filename !== current?.filename));
  const queue = current ? [current] : [];
  let seasonalIndex = 0;
  for (let i = 0; i < mainQueue.length; i++) {
    queue.push(mainQueue[i]);
    if ((i + 1) % 3 === 0 && seasonalIndex < seasonal.length) queue.push(seasonal[seasonalIndex++]);
  }
  if (seasonalIndex === 0 && seasonal.length && mainQueue.length < 3) queue.push(seasonal[0]);
  return queue;
}
