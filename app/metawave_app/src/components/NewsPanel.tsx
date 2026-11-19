import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Linking, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { NewsSourceItem, safeNewsUrl, SpeakerQueueNotice, SpeakerSchedule } from "../speakerQueue";
import { playerStyles as styles } from "../styles/playerStyles";

type Reading = { title: string; body: string; source?: string; url?: string | null; isScript?: boolean };

const formatBroadcastTime = (value: string): string => new Intl.DateTimeFormat("de-CH", {
  timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

function BroadcastSection({ title, time, badge, ready, script, items, empty, onRead }: {
  title: string; time: string; badge?: string; ready?: boolean; script?: string | null;
  items?: NewsSourceItem[] | null; empty: string; onRead: (reading: Reading) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.newsPreviewCard}>
      <TouchableOpacity onPress={() => setExpanded(value => !value)} accessibilityRole="button"
        accessibilityLabel={title} accessibilityState={{ expanded }} aria-expanded={expanded} style={styles.newsSectionToggle}>
        <View style={styles.newsSectionHeading}>
          <Text style={styles.newsPreviewSection}>{title}</Text>
          <Text style={styles.newsPreviewTime}>{time}</Text>
          {badge && <Text style={[styles.newsPreviewBadge, ready && styles.newsPreviewBadgeReady]}>{badge}</Text>}
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#C4BECD" />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.newsSectionBody}>
          {script ? (
            <>
              <TouchableOpacity style={styles.newsStoryButton} accessibilityRole="button"
                onPress={() => onRead({ title: "Sendungsskript", body: script, isScript: true })}>
                <Text style={styles.newsStoryTitle}>Sendungsskript lesen</Text>
                <Ionicons name="chevron-forward" size={16} color="#B5B0BF" />
              </TouchableOpacity>
              {items && items.length > 0 ? (
                <>
                  <Text style={styles.newsPreviewEmpty}>RSS-Auswahl für die Sendung · nicht jede Meldung muss im Skript vorkommen.</Text>
                  {items.map((item, index) => (
                    <TouchableOpacity key={`${index}-${item.title}`} style={styles.newsStoryButton} accessibilityRole="button"
                      onPress={() => onRead({ title: item.title, body: item.summary, source: item.source, url: item.url })}>
                      <View style={styles.newsStoryText}>
                        <Text style={styles.newsStoryTitle} numberOfLines={2}>{item.title}</Text>
                        <Text style={styles.newsStorySource} numberOfLines={1}>{item.source || "RSS-Quelle"}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#B5B0BF" />
                    </TouchableOpacity>
                  ))}
                </>
              ) : <Text style={styles.newsPreviewEmpty}>Für diese Sendung wurden keine Quellen gespeichert.</Text>}
            </>
          ) : <Text style={styles.newsPreviewEmpty}>{empty}</Text>}
        </View>
      )}
    </View>
  );
}

export default function NewsPanel({ schedule, unavailable, notice, recentWarning, narrow }: {
  schedule: SpeakerSchedule | null; unavailable: boolean; notice: SpeakerQueueNotice | null; recentWarning: string | null; narrow: boolean;
}) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [linkError, setLinkError] = useState("");
  const ready = !unavailable && Boolean(schedule?.enabled) &&
    ["ready", "claimed"].includes(schedule?.next_broadcast_state || "");
  const nextTime = schedule?.next_broadcast && Number.isFinite(Date.parse(schedule.next_broadcast))
    ? formatBroadcastTime(schedule.next_broadcast) : null;
  const badge = unavailable ? "Nicht erreichbar" : !schedule ? "Wird geladen" : !schedule.enabled ? "Deaktiviert" :
    schedule.next_broadcast_state === "claimed" ? "Wartet auf Liedende" :
    schedule.next_broadcast_state === "preparing" ? "Wird erstellt" :
    ready ? "Bereit" : notice?.warning ? "Sendung nicht verfügbar" : "Noch nicht bereit";
  const nextEmpty = unavailable ? "Der Speaker-Status ist derzeit nicht erreichbar." :
    !schedule ? "Der Speaker-Status wird geladen." : !schedule.enabled ? "Aktiviere den Speaker in den Einstellungen." :
    notice?.warning ? notice.title : "Die Meldungen erscheinen, sobald sie bereit sind.";
  const openReading = (value: Reading) => { setLinkError(""); setReading(value); };
  const url = safeNewsUrl(reading?.url ?? null);

  const openSource = async () => {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error("Could not open news source", error);
      setLinkError("Die Quelle konnte nicht geöffnet werden.");
    }
  };

  return (
    <>
      <View style={[styles.queueContainerDesktop, styles.newsPreview, narrow && { width: 190 }]}>
        <View style={styles.newsPreviewHeader}>
          <View style={styles.newsPreviewIcon}>
            <Ionicons name="radio-outline" size={20} color="#C8B7FF" />
          </View>
          <View style={styles.newsPreviewHeading}>
            <Text style={styles.newsPreviewEyebrow}>METAWAVE RADIO</Text>
            <Text style={styles.newsPreviewTitle}>MetaWave Update</Text>
            <Text style={styles.newsPreviewSubtitle}>Mit Alex · KI-Moderation</Text>
          </View>
        </View>
        <ScrollView style={styles.newsPreviewContent} nestedScrollEnabled>
          {notice && (
            <View style={styles.speakerStatusCard} accessibilityLiveRegion="polite">
              <View style={styles.speakerStatusHeader}>
                {notice.busy ? <ActivityIndicator size="small" color="#B7A2EF" /> :
                  <Ionicons name={notice.warning ? "alert-circle-outline" : "radio-outline"} size={16} color={notice.warning ? "#FF9B9B" : "#B7A2EF"} />}
                <Text style={[styles.speakerStatusTitle, notice.warning && styles.speakerStatusWarning]}>{notice.title}</Text>
              </View>
              <Text style={styles.speakerStatusDetail}>{notice.detail}</Text>
              {!!recentWarning && <Text style={styles.speakerStatusWarning}>{recentWarning}</Text>}
            </View>
          )}
          <BroadcastSection title="NÄCHSTE SENDUNG"
            time={nextTime && !unavailable && schedule?.enabled ? `${nextTime} Uhr · Schweizer Zeit` : "Termin noch nicht verfügbar"}
            badge={badge} ready={ready} script={ready ? schedule?.next_broadcast_script : null}
            items={ready ? schedule?.next_broadcast_items : null} empty={nextEmpty} onRead={openReading} />
          <BroadcastSection title="ZULETZT GESENDET"
            time={schedule?.last_broadcast && !unavailable ? `${formatBroadcastTime(schedule.last_broadcast.target)} Uhr · Schweizer Zeit` : "Noch keine Sendung"}
            script={!unavailable ? schedule?.last_broadcast?.script : null}
            items={!unavailable ? schedule?.last_broadcast?.items : null}
            empty={unavailable ? "Nachrichten derzeit nicht erreichbar." : "Noch keine ausgestrahlten Nachrichten vorhanden."}
            onRead={openReading} />
          <Text style={styles.newsPreviewDisclaimer}>KI-generiertes Skript · Inhalte bitte prüfen</Text>
        </ScrollView>
      </View>
      <Modal visible={reading !== null} transparent animationType="fade" onRequestClose={() => setReading(null)}>
        <View style={styles.newsModalOverlay}>
          <TouchableOpacity style={styles.newsModalBackdrop} onPress={() => setReading(null)}
            accessibilityRole="button" accessibilityLabel="Lesefenster schliessen" />
          <View style={styles.newsModal} accessibilityViewIsModal>
            <View style={styles.newsModalHeader}>
              <Text style={styles.newsModalEyebrow}>{reading?.isScript ? "METAWAVE UPDATE · KI-SKRIPT" : "RSS-ZUSAMMENFASSUNG"}</Text>
              <TouchableOpacity onPress={() => setReading(null)} accessibilityRole="button" accessibilityLabel="Schliessen">
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.newsModalTitle}>{reading?.title}</Text>
            {!!reading?.source && <Text style={styles.newsModalSource}>{reading.source}</Text>}
            <ScrollView style={styles.newsModalContent}>
              <Text style={styles.newsModalBody} selectable>{reading?.body || "Für diese Meldung wurde keine Zusammenfassung mitgeliefert."}</Text>
            </ScrollView>
            {reading?.isScript ? (
              <Text style={styles.newsModalNote}>KI-generierter Text · Aussagen können fehlerhaft sein.</Text>
            ) : url ? (
              <TouchableOpacity style={styles.newsModalLink} onPress={openSource} accessibilityRole="link">
                <Text style={styles.newsModalLinkText}>Quelle öffnen</Text>
                <Ionicons name="open-outline" size={17} color="#FFFFFF" />
              </TouchableOpacity>
            ) : <Text style={styles.newsModalNote}>Für diese Meldung ist kein gültiger Quellenlink verfügbar.</Text>}
            {!!linkError && <Text style={styles.newsModalError}>{linkError}</Text>}
          </View>
        </View>
      </Modal>
    </>
  );
}
