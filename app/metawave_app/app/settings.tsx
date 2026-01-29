import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Switch, Text, TouchableOpacity, View, ScrollView } from "react-native";
import Slider from "@react-native-community/slider";
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
  const [minArtistDistance, setMinArtistDistance] = useState(5);
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
      if (typeof json?.minArtistDistance === "number") {
        setMinArtistDistance(json.minArtistDistance);
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

  const saveArtistDistance = async (value: number) => {
    if (!tokenRef.current) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/stream/settings/artist-distance`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenRef.current}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ distance: value }),
      });

      if (!res.ok) {
        Alert.alert("Fehler", "Einstellung konnte nicht gespeichert werden.");
        return;
      }

      setMinArtistDistance(value);
    } catch (err) {
      Alert.alert("Fehler", "Verbindung zum Server fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  const handleArtistDistanceChange = (value: number) => {
    const rounded = Math.round(value);
    setMinArtistDistance(rounded);
  };

  const handleArtistDistanceComplete = (value: number) => {
    const rounded = Math.round(value);
    saveArtistDistance(rounded);
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
              <Text style={styles.settingLabel}>EBU R128 Normalisierung</Text>
              <Text style={styles.settingDescription}>
                Hebt leise Songs auf Broadcast-Standard an (-16 LUFS)
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
                Reduziert auch laute Songs auf -14 LUFS (benötigt EBU R128)
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Playlist Einstellungen</Text>
          
          <View style={styles.settingCard}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Mindest Künstler-Abstand</Text>
              <Text style={styles.settingDescription}>
                Verhindert, dass derselbe Künstler zu oft hintereinander spielt
              </Text>
            </View>
            
            <View style={styles.sliderContainer}>
              <View style={styles.sliderHeader}>
                <Text style={styles.sliderValue}>
                  {minArtistDistance === 0 ? "Aus" : `${minArtistDistance} Songs`}
                </Text>
              </View>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={15}
                step={1}
                value={minArtistDistance}
                onValueChange={handleArtistDistanceChange}
                onSlidingComplete={handleArtistDistanceComplete}
                disabled={saving}
                minimumTrackTintColor="#2196F3"
                maximumTrackTintColor="#3a3a3a"
                thumbTintColor="#ffffff"
              />
              <View style={styles.sliderLabels}>
                <Text style={styles.sliderLabelText}>0</Text>
                <Text style={styles.sliderLabelText}>15</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Über EBU R128 Normalisierung</Text>
          <Text style={styles.infoText}>
            Diese Funktion nutzt den professionellen Broadcasting-Standard EBU R128 (LUFS - Loudness Units relative to Full Scale).{"\n\n"}
            Songs werden auf -14 LUFS normalisiert, wie bei Spotify, YouTube und echten Radio-Services. LUFS berücksichtigt die menschliche Hörwahrnehmung und misst perzeptuelle Lautstärke.{"\n\n"}
            <Text style={{ fontWeight: 'bold' }}>Standard-Modus:</Text> Nur leise Songs werden lauter.{"\n"}
            <Text style={{ fontWeight: 'bold' }}>Erweiterter Modus:</Text> Alle Songs auf gleiche Lautstärke.{"\n\n"}
            Ergebnis: Professionelle Broadcast-Qualität mit True Peak Limiting (kein Clipping).
          </Text>
        </View>

        <View style={[styles.infoBox, { borderLeftColor: "#2196F3" }]}>
          <Text style={styles.infoTitle}>ℹ️ Über Künstler-Abstand</Text>
          <Text style={styles.infoText}>
            Der Smart Shuffle Algorithmus sorgt dafür, dass derselbe Künstler nicht zu häufig hintereinander gespielt wird.{"\n\n"}
            <Text style={{ fontWeight: 'bold' }}>Beispiel (5 Songs):</Text> Nach einem Song von Artist A werden mindestens 5 andere Songs gespielt, bevor wieder ein Song von A kommt.{"\n\n"}
            <Text style={{ fontWeight: 'bold' }}>Künstler-Erkennung:</Text> Der Algorithmus erkennt Variationen wie "Artist feat. Someone" als denselben Künstler.{"\n\n"}
            <Text style={{ fontWeight: 'bold' }}>Wert 0:</Text> Funktion ist deaktiviert, normaler Shuffle wird verwendet.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
