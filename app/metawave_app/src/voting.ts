import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { API_BASE } from "./config";

export type Vote = -1 | 0 | 1;
export interface SongStatistic {
  filename: string;
  title: string;
  author: string;
  upvotes: number;
  downvotes: number;
  my_vote: Vote;
  plays: number;
}
export interface VotingStatistics {
  songs: SongStatistic[];
  current_play: { filename: string; id: string } | null;
  total_songs: number;
  artists: { name: string; songs: number; percent: number }[];
  warning: string | null;
}

const STORAGE_KEY = "metawaveVotingBrowserId";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createBrowserId(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Sichere Browser-ID ist nicht verfügbar.");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function getVotingBrowserId(): Promise<string> {
  if (Platform.OS === "web") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && UUID.test(stored)) return stored;
    const id = createBrowserId();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  }
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored && UUID.test(stored)) return stored;
  const id = createBrowserId();
  await AsyncStorage.setItem(STORAGE_KEY, id);
  return id;
}

export async function votingRequest<T>(token: string, route: string, data?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}/voting${route}`, {
    method: data === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `Voting HTTP ${response.status}`);
  return result as T;
}
