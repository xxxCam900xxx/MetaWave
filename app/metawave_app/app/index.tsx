import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { API_BASE } from "../src/config";
import { loginStyles as styles } from "../src/styles/loginStyles";
import { colors } from "../src/theme";

export default function Index() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [wavetoken, setWaveToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkExistingToken = async () => {
      try {
        // Check for URL parameters (token or wavetoken)
        const urlWaveToken = params.wavetoken || params.token;
        
        if (urlWaveToken && typeof urlWaveToken === "string") {
          // URL parameter login
          await handleUrlLogin(urlWaveToken);
          return;
        }

        const stored = await AsyncStorage.getItem("authToken");
        if (!stored) {
          setCheckingSession(false);
          return;
        }

        const res = await fetch(`${API_BASE}/auth/validate`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stored}`,
          },
        });

        if (res.ok) {
          const json = await res.json();
          if (json?.token) {
            await AsyncStorage.setItem("authToken", json.token);
          }
          router.replace("/player");
          return;
        }

        await AsyncStorage.removeItem("authToken");
      } catch (err) {
        // Silent fail, user can log in manually
      } finally {
        setCheckingSession(false);
      }
    };

    checkExistingToken();
  }, [router, params]);

  const handleUrlLogin = async (urlToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login?wavetoken=${encodeURIComponent(urlToken)}`);
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.token) {
        Alert.alert("Login Fehler", json?.message || "URL-basierte Authentifizierung fehlgeschlagen");
        setCheckingSession(false);
        return;
      }

      await AsyncStorage.setItem("authToken", json.token);
      router.replace("/player");
    } catch (err) {
      Alert.alert("Netzwerkfehler", "Keine Verbindung zum MetaWave Radio Server.");
      setCheckingSession(false);
    }
  };

  const handleLogin = async () => {
    if (!wavetoken.trim()) {
      Alert.alert("Fehlender Code", "Bitte gib deinen WaveToken ein.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ wavetoken: wavetoken.trim() }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const message = json?.message || "Login fehlgeschlagen";
        Alert.alert("Login Fehler", message);
        return;
      }

      if (!json?.token) {
        Alert.alert("Login Fehler", "Antwort vom Server ohne Token.");
        return;
      }

      await AsyncStorage.setItem("authToken", json.token);
      router.replace("/player");
    } catch (err) {
      Alert.alert("Netzwerkfehler", "Keine Verbindung zum MetaWave Radio Server.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Verbindung wird geprüft…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.content, isDesktop && styles.contentDesktop]}>
        <View style={[styles.logoContainer, isDesktop && styles.logoContainerDesktop]}>
          <Image 
            source={isDesktop ? require("./assets/icons/web/icon-512-maskable.png") : require("./assets/icons/web/icon-192-maskable.png")}
            style={[styles.logo, isDesktop && styles.logoDesktop]}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.title, isDesktop && styles.titleDesktop]}>Willkommen bei{"\n"}MetaWave!</Text>
        <Text style={[styles.subtitle, isDesktop && styles.subtitleDesktop]}>WaveToken</Text>

        <TextInput
          style={[styles.input, isDesktop && styles.inputDesktop]}
          value={wavetoken}
          onChangeText={setWaveToken}
          placeholder=""
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <TouchableOpacity 
          style={[styles.loginButton, isDesktop && styles.loginButtonDesktop]} 
          onPress={handleLogin} 
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginText}>Anmelden</Text>}
        </TouchableOpacity>

        <Text style={styles.helperText}>Kein WaveToken?</Text>

        <View style={[styles.helperRow, isDesktop && styles.helperRowDesktop]}>
          <TouchableOpacity style={styles.helperButton} onPress={() => router.push("/invite")}>
            <Text style={styles.helperButtonText}>Signal Invite</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.helperButton} onPress={() => router.push("/email")}>
            <Text style={styles.helperButtonText}>E-Mail Notifier</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Footer */}
      <View style={[styles.footer, isDesktop && styles.footerDesktop]}>
        <View style={styles.footerLeft}>
          <TouchableOpacity onPress={() => router.push('/impressum')}>
            <Text style={styles.footerLink}>Impressum</Text>
          </TouchableOpacity>
          <Text style={styles.footerDivider}>/</Text>
          <TouchableOpacity onPress={() => router.push('/datenschutz')}>
            <Text style={styles.footerLink}>Datenschutz</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.footerVersion}>v1.0.0</Text>
      </View>
    </SafeAreaView>
  );
}