import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { API_BASE } from "../src/config";
import { inviteStyles as styles } from "../src/styles/inviteStyles";

export default function InviteScreen() {
  const router = useRouter();
  const [groupId, setGroupId] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [loadingLeave, setLoadingLeave] = useState(false);

  const handleInvite = async () => {
    if (!groupId.trim()) {
      Alert.alert("Fehlende groupId", "Bitte gib die Signal groupId ein.");
      return;
    }

    setLoadingInvite(true);
    try {
      const res = await fetch(`${API_BASE}/notification/signal/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ groupId: groupId.trim() }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const message = json?.message || "Invite fehlgeschlagen";
        Alert.alert("Fehler", message);
        return;
      }

      Alert.alert("Erfolg", json?.message || "Signal Gruppe wurde eingeladen.");
    } catch (err) {
      Alert.alert("Netzwerkfehler", "Konnte Invite nicht senden.");
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleLeave = async () => {
    if (!groupId.trim()) {
      Alert.alert("Fehlende groupId", "Bitte gib die Signal groupId ein.");
      return;
    }

    setLoadingLeave(true);
    try {
      const res = await fetch(`${API_BASE}/notification/signal/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ groupId: groupId.trim() }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const message = json?.message || "Leave fehlgeschlagen";
        Alert.alert("Fehler", message);
        return;
      }

      Alert.alert("Erfolg", json?.message || "Signal Gruppe wurde entfernt.");
    } catch (err) {
      Alert.alert("Netzwerkfehler", "Konnte Leave nicht senden.");
    } finally {
      setLoadingLeave(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Signal Notifier</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>Zurück</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Hinterlege hier die Signal groupId, die vom Signal-Backend verwendet wird, um MetaWave Codes zu schicken.
        </Text>

        <TextInput
          style={styles.input}
          value={groupId}
          onChangeText={setGroupId}
          placeholder="Signal groupId"
          autoCapitalize="none"
        />

        <TouchableOpacity style={styles.primaryButton} onPress={handleInvite} disabled={loadingInvite}>
          {loadingInvite ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Gruppe einladen</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleLeave} disabled={loadingLeave}>
          {loadingLeave ? <ActivityIndicator color="#ff6b6b" /> : <Text style={styles.secondaryText}>Gruppe entfernen</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
