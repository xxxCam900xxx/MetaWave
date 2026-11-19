import React, { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { getVotingBrowserId, Vote, VotingStatistics, votingRequest } from "../voting";
import { votingStyles as styles } from "../styles/votingStyles";

type Ranking = "upvotes" | "downvotes" | "plays" | "artists";
const tabs: { value: Ranking; label: string }[] = [
  { value: "upvotes", label: "Upvotes" }, { value: "downvotes", label: "Downvotes" },
  { value: "plays", label: "Abspielungen" }, { value: "artists", label: "Künstler" },
];

export function useVoting(token: string | null, playId?: string | null) {
  const [browserId, setBrowserId] = useState<string | null>(null);
  const [statistics, setStatistics] = useState<VotingStatistics | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const busyRef = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    active.current = true;
    getVotingBrowserId().then(id => { if (active.current) setBrowserId(id); }).catch(reason => {
      console.error("Voting-Browser-ID konnte nicht erstellt werden:", reason);
      if (active.current) setError(reason instanceof Error ? reason.message : "Voting-Browser-ID konnte nicht erstellt werden.");
    });
    return () => { active.current = false; sequence.current++; };
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !browserId) return;
    const request = ++sequence.current;
    try {
      const result = await votingRequest<VotingStatistics>(token, `?browser_id=${encodeURIComponent(browserId)}`);
      if (active.current && request === sequence.current) {
        setStatistics(result);
        setError("");
      }
    } catch (reason) {
      console.error("Voting-Statistiken konnten nicht geladen werden:", reason);
      if (active.current && request === sequence.current) setError(reason instanceof Error ? reason.message : "Statistiken nicht erreichbar.");
    }
  }, [token, browserId]);

  useEffect(() => {
    if (!token || !browserId) return;
    void refresh();
    const timer = setInterval(() => { if (!busyRef.current) void refresh(); }, 20000);
    return () => { clearInterval(timer); sequence.current++; };
  }, [token, browserId, refresh, playId]);

  const change = useCallback(async (route: string, data: object): Promise<boolean> => {
    if (!token || !browserId || busyRef.current) return false;
    busyRef.current = true;
    sequence.current++;
    setBusy(true);
    try {
      await votingRequest(token, route, data);
      await refresh();
      return true;
    } catch (reason) {
      console.error("Voting-Aktion fehlgeschlagen:", reason);
      await refresh();
      if (active.current) setError(reason instanceof Error ? reason.message : "Aktion fehlgeschlagen.");
      return false;
    } finally {
      busyRef.current = false;
      if (active.current) setBusy(false);
    }
  }, [token, browserId, refresh]);

  return {
    statistics, error, busy, refresh,
    vote: (filename: string, currentPlayId: string, value: Vote) =>
      change("/vote", { filename, play_id: currentPlayId, browser_id: browserId, vote: value }),
  };
}

type Voting = ReturnType<typeof useVoting>;

export function VoteButtons({ voting, filename, playId, isSpeaker }: { voting: Voting; filename?: string; playId?: string | null; isSpeaker?: boolean }) {
  const song = voting.statistics?.songs.find(item => item.filename === filename);
  const isCurrentPlay = Boolean(song && playId && voting.statistics?.current_play?.id === playId &&
    voting.statistics.current_play.filename === filename);
  const canVote = isCurrentPlay && !voting.busy;
  if (isSpeaker || !filename) return null;
  return (
    <View>
      <View style={styles.voteRow}>
        {([1, -1] as const).map(value => (
          <TouchableOpacity key={value} style={[styles.voteButton, isCurrentPlay && song?.my_vote === value && styles.voteActive]}
            disabled={!canVote} accessibilityRole="button"
            accessibilityLabel={value === 1 ? "Titel positiv bewerten" : "Titel negativ bewerten"}
            accessibilityState={{ selected: isCurrentPlay && song?.my_vote === value, disabled: !canVote }}
            onPress={() => { if (playId && canVote) void voting.vote(filename, playId, song?.my_vote === value ? 0 : value); }}>
            <Ionicons name={value === 1 ? "thumbs-up-outline" : "thumbs-down-outline"} size={16} color="#FFFFFF" />
            <Text style={styles.voteText}>{value === 1 ? song?.upvotes ?? "–" : song?.downvotes ?? "–"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!voting.error && <Text style={styles.voteHint}>{voting.error}</Text>}
    </View>
  );
}

export function VotingStatisticsContent({ voting }: { voting: Voting }) {
  const [tab, setTab] = useState<Ranking>("upvotes");
  const songs = [...(voting.statistics?.songs || [])];
  if (tab === "upvotes" || tab === "downvotes" || tab === "plays") {
    const key = tab;
    songs.sort((a, b) => b[key] - a[key] || a.title.localeCompare(b.title, "de"));
  }

  return (
    <View>
      <Text style={styles.title}>Musik-Statistiken</Text>
      <Text style={styles.subtitle}>{voting.statistics?.total_songs ?? "–"} aktive Titel · Abspielungen zählen serverseitige Liedstarts, nicht einzelne Zuhörer.</Text>
      <View style={styles.tabs}>
        {tabs.map(item => (
          <TouchableOpacity key={item.value} style={[styles.tab, tab === item.value && styles.tabActive]}
            accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.value }}
            onPress={() => setTab(item.value)}>
            <Text style={styles.tabText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!voting.error && <Text style={styles.error}>{voting.error}</Text>}
      {!!voting.statistics?.warning && <Text style={styles.error}>{voting.statistics.warning}</Text>}
      {!voting.statistics && !voting.error ? <ActivityIndicator color="#FFFFFF" style={{ margin: 20 }} /> : (
        <View style={styles.list}>
          {tab === "artists" ? (
            voting.statistics?.artists.length ? voting.statistics.artists.map((artist, index) => (
              <View key={artist.name} style={styles.row}>
                <Text style={styles.rank}>{index + 1}</Text>
                <View style={styles.text}>
                  <Text style={styles.songTitle}>{artist.name}</Text>
                  <Text style={styles.detail}>{artist.songs} Titel · {artist.percent.toFixed(1)} % der aktiven Titel</Text>
                </View>
              </View>
            )) : <Text style={styles.empty}>Keine Künstler vorhanden.</Text>
          ) : songs.length ? songs.map((song, index) => (
            <View key={song.filename} style={styles.row}>
              <Text style={styles.rank}>{index + 1}</Text>
              <View style={styles.text}>
                <Text style={styles.songTitle}>{song.title}</Text>
                <Text style={styles.detail}>{song.author || "Unbekannt"} · ↑ {song.upvotes} · ↓ {song.downvotes} · {song.plays} Starts</Text>
              </View>
            </View>
          )) : <Text style={styles.empty}>Keine Titel vorhanden.</Text>}
        </View>
      )}
      <Text style={styles.subtitle}>Pro Browser ist eine Stimme je Wiedergabe möglich. Frühere Stimmen bleiben erhalten.</Text>
    </View>
  );
}
