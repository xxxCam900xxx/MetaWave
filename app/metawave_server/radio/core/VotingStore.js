import fs from "node:fs";
import path from "node:path";

const VOTER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validVoterId(value) {
  return typeof value === "string" && VOTER_ID.test(value);
}

export class VotingStore {
  constructor(file) {
    this.file = file;
    this.songs = new Map();
    if (!fs.existsSync(file)) return;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (![1, 2].includes(data.version) || !Array.isArray(data.songs)) throw new Error("Ungültige Voting-Daten");
    for (const entry of data.songs) {
      if (typeof entry.filename !== "string" || !entry.filename || this.songs.has(entry.filename) ||
          !Number.isSafeInteger(entry.plays) || entry.plays < 0 ||
          !Array.isArray(entry.votes)) throw new Error("Ungültiger Voting-Eintrag");
      const votes = new Map();
      for (const pair of entry.votes) {
        if (!Array.isArray(pair) || pair.length !== 2 || !validVoterId(pair[0]) ||
            ![1, -1].includes(pair[1]) || votes.has(pair[0].toLowerCase())) throw new Error("Ungültige Stimme");
        votes.set(pair[0].toLowerCase(), pair[1]);
      }
      if (data.version === 1) {
        this.songs.set(entry.filename, {
          plays: entry.plays,
          upvotes: [...votes.values()].filter(value => value === 1).length,
          downvotes: [...votes.values()].filter(value => value === -1).length,
          playId: null, votes: new Map(),
        });
      } else {
        if (!Number.isSafeInteger(entry.upvotes) || entry.upvotes < 0 ||
            !Number.isSafeInteger(entry.downvotes) || entry.downvotes < 0 ||
            !(entry.playId === null || validVoterId(entry.playId)) ||
            (entry.playId === null && votes.size > 0)) throw new Error("Ungültiger Voting-Eintrag");
        this.songs.set(entry.filename, { plays: entry.plays, upvotes: entry.upvotes, downvotes: entry.downvotes,
          playId: entry.playId, votes });
      }
    }
  }

  get(filename) {
    return this.songs.get(filename) || { plays: 0, upvotes: 0, downvotes: 0, playId: null, votes: new Map() };
  }

  update(filename, change) {
    const previous = this.get(filename);
    const entry = { ...previous, votes: new Map(previous.votes) };
    change(entry);
    const next = new Map(this.songs);
    next.set(filename, entry);
    const data = { version: 2, songs: Array.from(next, ([name, value]) => ({
      filename: name, plays: value.plays, upvotes: value.upvotes, downvotes: value.downvotes,
      playId: value.playId, votes: Array.from(value.votes),
    })) };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.file);
    this.songs = next;
  }

  vote(filename, playId, voter, value) {
    if (!validVoterId(playId) || !validVoterId(voter) || ![-1, 0, 1].includes(value)) throw new Error("INVALID_VOTE");
    if (this.get(filename).playId !== playId) throw new Error("STALE_PLAY");
    this.update(filename, entry => {
      if (value === 0) entry.votes.delete(voter.toLowerCase());
      else entry.votes.set(voter.toLowerCase(), value);
    });
  }

  recordPlay(filename, playId) {
    if (!validVoterId(playId)) throw new Error("INVALID_PLAY");
    this.update(filename, entry => {
      if (entry.playId === playId) throw new Error("DUPLICATE_PLAY");
      for (const value of entry.votes.values()) {
        if (value === 1) entry.upvotes++;
        else entry.downvotes++;
      }
      entry.votes.clear();
      entry.playId = playId;
      entry.plays++;
    });
  }

}

export const votingStore = new VotingStore(process.env.VOTING_DATA_FILE || "/songs/.metawave-voting/statistics.json");
