import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Switch, Text, TouchableOpacity, View, ScrollView, Platform, useWindowDimensions } from "react-native";
import Slider from "@react-native-community/slider";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_BASE } from "../src/config";
import { settingsStyles as styles } from "../src/styles/settingsStyles";

export default function SettingsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === "web" && width >= 768;
  const logout = async () => {
    await AsyncStorage.removeItem("authToken");
    router.replace("/");
  };
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
      {/* Header (copied from player) */}
      <View style={[styles.headerRow, isDesktop && styles.headerRowDesktop]}>
        <Text style={styles.headerTitle} selectable={false}>MetaWave</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            style={styles.headerIcon}
            onPress={() => {
              if (Platform.OS === "web") {
                window.location.reload();
              } else {
                router.replace("/settings" as any);
              }
            }}
          >
            <Ionicons name="refresh-outline" size={18} color="#737373" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.push("/settings" as any)}>
            <Ionicons name="settings-outline" size={18} color="#737373" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={logout}>
            <Ionicons name="log-out-outline" size={18} color="#FF6B6B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Desktop: (removed top-right) — now placed under settings content */}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.sectionsContainer, { flexDirection: isDesktop ? "row" : "column", justifyContent: isDesktop ? "center" : "flex-start", gap: isDesktop ? 48 : 0 }]}>
          {/* Audio Einstellungen */}
          <View style={[styles.section, isDesktop && { flex: 1, maxWidth: 400 }]}>
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
                trackColor={{ false: "#3a3a3a", true: "#4CAF50" }}
                thumbColor={monotoneReduceLoud ? "#ffffff" : "#dddddd"}
                ios_backgroundColor="#3a3a3a"
              />
            </View>
          </View>

          {/* Playlist Einstellungen */}
          <View style={[styles.section, isDesktop && { flex: 1, maxWidth: 400 }]}>
            <Text style={styles.sectionTitle}>Playlist Einstellungen</Text>
            
            <View style={styles.settingCard}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Minimaler Abstand zwischen Künstlern</Text>
                <Text style={styles.settingDescription}>
                  Mindestanzahl an Songs zwischen zwei Titeln desselben Künstlers
                </Text>
              </View>
              
              <View style={styles.sliderContainer}>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={15}
                  step={1}
                  value={minArtistDistance}
                  onValueChange={handleArtistDistanceChange}
                  onSlidingComplete={handleArtistDistanceComplete}
                  disabled={saving}
                  minimumTrackTintColor="#7C4DFF"
                  maximumTrackTintColor="#3a3a3a"
                  thumbTintColor="#7C4DFF"
                />
                <View style={styles.sliderLabels}>
                  <Text style={styles.sliderLabelText}>0</Text>
                  <Text style={styles.sliderValue}>
                    {minArtistDistance === 0 ? "Aus" : `${minArtistDistance} Songs`}
                  </Text>
                  <Text style={styles.sliderLabelText}>15</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Mobile: Back button removed from ScrollView to keep it fixed at bottom */}
      </ScrollView>

      {/* Mobile: Back button fixed at bottom center (outside ScrollView) */}
      {!isDesktop && (
        <View style={styles.mobileBackButtonContainer}>
          <TouchableOpacity style={styles.mobileBackButton} onPress={() => router.push("/player" as any)}>
            <Text style={styles.mobileBackButtonText}>Zurück</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Desktop: Back button centered under settings */}
      {isDesktop && (
        <View style={styles.desktopBackButtonContainer}>
          <TouchableOpacity style={styles.desktopBackButton} onPress={() => router.push("/player" as any)}>
            <Text style={styles.desktopBackButtonText}>Zurück</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Footer (copied from player) - only on desktop */}
      {isDesktop && (
        <View style={[styles.footer, styles.footerDesktop]}>
          <View style={styles.footerLeft}>
            <TouchableOpacity onPress={() => router.push("/impressum" as any)}>
              <Text style={styles.footerLink}>Impressum</Text>
            </TouchableOpacity>
            <Text style={styles.footerDivider}>/</Text>
            <TouchableOpacity onPress={() => router.push("/datenschutz" as any)}>
              <Text style={styles.footerLink}>Datenschutz</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.footerVersion}>v1.0.0</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
