import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Switch, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { API_BASE } from "../src/config";
import { settingsStyles as styles } from "../src/styles/settingsStyles";

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [monotoneEnabled, setMonotoneEnabled] = useState(false);
  const [monotoneReduceLoud, setMonotoneReduceLoud] = useState(false);
  const tokenRef = React.useRef<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const stored = await AsyncStorage.getItem("authToken");
        if (!stored) {
          router.replace("/");
          return;
        }
        tokenRef.current = stored;
        await loadSettings();
      } catch (err) {
        Alert.alert("Fehler", "Einstellungen konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const loadSettings = async () => {
    if (!tokenRef.current) return;

    try {
      const res = await fetch(`${API_BASE}/stream/settings`, {
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
        },
      });

      if (!res.ok) return;

      const json = await res.json();
      if (typeof json?.monotoneEnabled === "boolean") {
        setMonotoneEnabled(json.monotoneEnabled);
      }
      if (typeof json?.monotoneReduceLoud === "boolean") {
        setMonotoneReduceLoud(json.monotoneReduceLoud);
      }
    } catch (err) {
      // Ignore loading errors
    }
  };

  const saveMonotoneSetting = async (value: boolean) => {
    if (!tokenRef.current) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/stream/settings/monotone`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: value }),
      });

      if (!res.ok) {
        Alert.alert("Fehler", "Einstellung konnte nicht gespeichert werden.");
        setMonotoneEnabled(!value);
        return;
      }

      setMonotoneEnabled(value);
    } catch (err) {
      Alert.alert("Fehler", "Verbindung zum Server fehlgeschlagen.");
      setMonotoneEnabled(!value);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMonotone = (value: boolean) => {
    saveMonotoneSetting(value);
  };

  const saveReduceLoudSetting = async (value: boolean) => {
    if (!tokenRef.current) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/stream/settings/monotone/reduce-loud`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: value }),
      });

      if (!res.ok) {
        Alert.alert("Fehler", "Einstellung konnte nicht gespeichert werden.");
        setMonotoneReduceLoud(!value);
        return;
      }

      setMonotoneReduceLoud(value);
    } catch (err) {
      Alert.alert("Fehler", "Verbindung zum Server fehlgeschlagen.");
      setMonotoneReduceLoud(!value);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReduceLoud = (value: boolean) => {
    saveReduceLoudSetting(value);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={styles.loadingText}>Einstellungen werden geladen…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Einstellungen</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audio Einstellungen</Text>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Monotone Equalizer</Text>
              <Text style={styles.settingDescription}>
                Normalisiert die Lautstärke: Hebt leise Songs an und reduziert laute Songs sanft
              </Text>
            </View>
            <Switch
              value={monotoneEnabled}
              onValueChange={handleToggleMonotone}
              disabled={saving}
              trackColor={{ false: "#3a3a3a", true: "#4CAF50" }}
              thumbColor={monotoneEnabled ? "#ffffff" : "#dddddd"}
              ios_backgroundColor="#3a3a3a"
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Laute Songs reduzieren</Text>
              <Text style={styles.settingDescription}>
                Reduziert zusätzlich sehr laute Songs sanft (benötigt Monotone Equalizer)
              </Text>
            </View>
            <Switch
              value={monotoneReduceLoud}
              onValueChange={handleToggleReduceLoud}
              disabled={saving || !monotoneEnabled}
              trackColor={{ false: "#3a3a3a", true: "#FF9800" }}
              thumbColor={monotoneReduceLoud ? "#ffffff" : "#dddddd"}
              ios_backgroundColor="#3a3a3a"
            />
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Über Monotone Equalizer</Text>
          <Text style={styles.infoText}>
            Diese Funktion analysiert die Lautstärke jedes Songs in Echtzeit. Zu leise Tracks werden automatisch verstärkt (bis zu 2,5x).{"\n\n"}
            Mit "Laute Songs reduzieren" werden zusätzlich sehr laute Songs sanft reduziert. Die Kompressionskurve schützt dabei die musikalische Dynamik.{"\n\n"}
            Ergebnis: Ein konsistentes Hörerlebnis ohne ständiges Nachregeln der Lautstärke.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
