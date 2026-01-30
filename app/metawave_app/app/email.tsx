import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View, Platform, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { API_BASE } from "../src/config";
import { inviteStyles as styles } from "../src/styles/inviteStyles";
import { loginStyles as loginStyles } from "../src/styles/loginStyles";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

export default function EmailInviteScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [email, setEmail] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [loadingLeave, setLoadingLeave] = useState(false);
  const [result, setResult] = useState<null | { option: string; action: string }>(null);

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

      // show result panel (activated)
      setResult({ option: "E-Mail", action: "aktiviert" });
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

      // show result panel (removed)
      setResult({ option: "E-Mail", action: "entfernt" });
    } catch (err) {
      Alert.alert("Netzwerkfehler", "Konnte Leave nicht senden.");
    } finally {
      setLoadingLeave(false);
    }
  };

  if (result) {
    return (
      <SafeAreaView style={loginStyles.container}>
        <View style={[styles.headerRow, isDesktop && styles.headerRowDesktop]}>
          <TouchableOpacity onPress={() => { setResult(null); }} style={styles.backButton}>
            <Text style={styles.backButtonText}>Zurück</Text>
          </TouchableOpacity>
        </View>

        <View style={[loginStyles.content, isDesktop && loginStyles.contentDesktop]}>
          <LinearGradient colors={["#6A55B7", "#2F2651"]} style={[styles.resultIcon, isDesktop && styles.resultIconDesktop]}> 
            <Ionicons name="chatbubble-ellipses" size={isDesktop ? 140 : 96} color="#ffffff" />
          </LinearGradient>

          <Text style={[loginStyles.title, isDesktop && loginStyles.titleDesktop]}>Notifier {result.action === "aktiviert" ? "Aktiviert" : "Entfernt"}</Text>
          <Text style={[styles.resultText, isDesktop && styles.resultTextDesktop]}>
            {result.action === "aktiviert"
              ? `Der Notifier für ${result.option} wurde aktiviert, sie sollten eine Benachrichtigung gekriegt haben mit MW-Code!`
              : `Der Notifier für ${result.option} wurde entfernt.`}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={loginStyles.container}>
      <View style={[styles.headerRow, isDesktop && styles.headerRowDesktop]}>
        <Text style={styles.headerLabel}>Notification Email</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Zurück</Text>
        </TouchableOpacity>
      </View>

      <View style={[loginStyles.content, isDesktop && loginStyles.contentDesktop]}>
        <View style={{ alignItems: "center", width: "100%" }}>
          <LinearGradient colors={["#6A55B7", "#2F2651"]} style={[styles.resultIcon, isDesktop && styles.resultIconDesktop, { marginBottom: 18 }]}> 
            <Ionicons name="mail" size={isDesktop ? 140 : 96} color="#ffffff" />
          </LinearGradient>
          <Text style={[loginStyles.title, isDesktop && loginStyles.titleDesktop]}>E-Mail Notifyer</Text>
        </View>

        <Text style={loginStyles.subtitle}>
          Hinterlege hier eine E-Mail-Adresse, an die MetaWave Codes für den Login geschickt werden sollen.
        </Text>

        <TextInput
          style={[loginStyles.input, isDesktop && loginStyles.inputDesktop]}
          value={email}
          onChangeText={setEmail}
          placeholder="E-Mail-Adresse"
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TouchableOpacity style={[loginStyles.loginButton, isDesktop && loginStyles.loginButtonDesktop]} onPress={handleInvite} disabled={loadingInvite}>
          {loadingInvite ? <ActivityIndicator color="#fff" /> : <Text style={loginStyles.loginText}>Hinzufügen</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={loginStyles.helperButton} onPress={handleLeave} disabled={loadingLeave}>
          {loadingLeave ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={loginStyles.helperButtonText}>Löschen</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
