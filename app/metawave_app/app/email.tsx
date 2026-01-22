import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { API_BASE } from "./config";
import { inviteStyles as styles } from "./styles/inviteStyles";

export default function EmailInviteScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [loadingLeave, setLoadingLeave] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) {
      Alert.alert("Fehlende E-Mail", "Bitte gib eine E-Mail-Adresse ein.");
      return;
    }

    setLoadingInvite(true);
    try {
      const res = await fetch(`${API_BASE}/notification/email/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const message = json?.error || json?.message || "Invite fehlgeschlagen";
        Alert.alert("Fehler", message);
        return;
      }

      Alert.alert("Erfolg", json?.message || "E-Mail-Empfänger wurde hinzugefügt.");
    } catch (err) {
      Alert.alert("Netzwerkfehler", "Konnte Invite nicht senden.");
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleLeave = async () => {
    if (!email.trim()) {
      Alert.alert("Fehlende E-Mail", "Bitte gib eine E-Mail-Adresse ein.");
      return;
    }

    setLoadingLeave(true);
    try {
      const res = await fetch(`${API_BASE}/notification/email/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const message = json?.error || json?.message || "Leave fehlgeschlagen";
        Alert.alert("Fehler", message);
        return;
      }

      Alert.alert("Erfolg", json?.message || "E-Mail-Empfänger wurde entfernt.");
    } catch (err) {
      Alert.alert("Netzwerkfehler", "Konnte Leave nicht senden.");
    } finally {
      setLoadingLeave(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>E-Mail Notification</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>Zurück</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Hinterlege hier eine E-Mail-Adresse, an die MetaWave Codes für den Login geschickt werden sollen.
        </Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="E-Mail-Adresse"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TouchableOpacity style={styles.primaryButton} onPress={handleInvite} disabled={loadingInvite}>
          {loadingInvite ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>E-Mail hinzufügen</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleLeave} disabled={loadingLeave}>
          {loadingLeave ? (
            <ActivityIndicator color="#ff6b6b" />
          ) : (
            <Text style={styles.secondaryText}>E-Mail entfernen</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
