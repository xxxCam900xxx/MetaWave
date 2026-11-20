import React from "react";
import { Text, View } from "react-native";
import { SpeakerSchedule } from "../speakerQueue";
import { playerStyles as styles } from "../styles/playerStyles";

export default function ProgramSchedule({ schedule, unavailable }: {
  schedule: SpeakerSchedule | null; unavailable: boolean;
}) {
  const slots = !unavailable ? schedule?.today_program : undefined;
  return (
    <View style={styles.newsPreviewCard}>
      <Text style={styles.newsPreviewSection}>HEUTE IM PROGRAMM</Text>
      {slots && schedule?.today_date ? (
        <>
          <Text style={styles.programDate}>
            {schedule.today_date.split("-").reverse().join(".")} · Schweizer Zeit{schedule.enabled ? "" : " · Deaktiviert"}
          </Text>
          {slots.map(slot => (
            <View key={slot.time} style={[styles.programRow, slot.is_next && styles.programRowNext]}>
              <Text style={styles.programTime}>{slot.time}</Text>
              <View style={styles.programDetails}>
                <Text style={styles.programName}>{slot.name}</Text>
                <Text style={styles.programHost}>{slot.host}{slot.is_next ? " · Als Nächstes" : ""}</Text>
              </View>
            </View>
          ))}
          {slots.length === 0 && <Text style={styles.newsPreviewEmpty}>Heute gibt es keine gültigen Sendezeiten.</Text>}
          <Text style={styles.programNote}>Geplant · Format und Moderator können sich bei fehlenden Meldungen ändern.</Text>
        </>
      ) : <Text style={styles.newsPreviewEmpty}>{unavailable
        ? "Der Sendeplan ist derzeit nicht erreichbar."
        : schedule ? "Der Sendeplan ist nicht verfügbar." : "Der Sendeplan wird geladen."}</Text>}
    </View>
  );
}
