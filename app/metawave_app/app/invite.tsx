import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { API_BASE } from "../src/config";
import { inviteStyles as styles } from "../src/styles/inviteStyles";
import { loginStyles as loginStyles } from "../src/styles/loginStyles";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../src/theme";

type GradientIconProps = {
  name: React.ComponentProps<typeof Ionicons>["name"];
  size: number;
  colors: [string, string, ...string[]];
};

function GradientIcon({ name, size, colors: gradColors }: GradientIconProps) {
  const container = { width: size, height: size, alignItems: "center" as const, justifyContent: "center" as const };
  let MaskedViewModule: any = null;
  try {
    // try dynamic require to avoid bundler error if package isn't installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    MaskedViewModule = require("@react-native-masked-view/masked-view").default || require("@react-native-masked-view/masked-view");
  } catch (e) {
    MaskedViewModule = null;
  }

  if (MaskedViewModule) {
    return (
      <MaskedViewModule
        style={container}
        maskElement={
          <View style={container}>
            <Ionicons name={name} size={size} color="black" />
          </View>
        }
      >
        <LinearGradient colors={gradColors} style={container} />
      </MaskedViewModule>
    );
  }

  // Fallback: render icon with single primary color if masked-view not available
  return <Ionicons name={name} size={size} color={gradColors[0] || colors.primary} />;
}

export default function InviteScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
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
    <SafeAreaView style={loginStyles.container}>
      <View style={[styles.headerRow, isDesktop && styles.headerRowDesktop]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backButton, { marginLeft: 'auto' }]}>
          <Text style={styles.backButtonText}>Zurück</Text>
        </TouchableOpacity>
      </View>

      {isDesktop ? (
        <View style={styles.desktopWrapper}>
          <View style={[styles.cardContainer, styles.cardContainerDesktop]}>
            <View style={{ alignItems: 'center', width: '100%' }}>
              <View style={styles.iconSpacing}>
                <GradientIcon name="chatbubble-ellipses" size={160} colors={[colors.primary, colors.primary]} />
              </View>
              <Text style={[loginStyles.title, loginStyles.titleDesktop]}>Signal Notifyer</Text>
            </View>

            <Text style={[loginStyles.subtitle, styles.titleSubtitleGap, styles.subtitleCardDesktop]}>
              Hinterlege hier die Signal groupId, die vom Signal-Backend verwendet wird, um MetaWave Codes zu schicken.
            </Text>

            <TextInput
              style={[loginStyles.input, styles.inputCardDesktop]}
              value={groupId}
              onChangeText={setGroupId}
              placeholder="Signal groupId"
              autoCapitalize="none"
            />

            <TouchableOpacity style={[loginStyles.loginButton, styles.buttonCardDesktop, { marginTop: 16 }]} onPress={handleInvite} disabled={loadingInvite}>
              {loadingInvite ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[loginStyles.loginText, isDesktop && loginStyles.loginTextDesktop]}>Gruppe einladen</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[loginStyles.loginButton, styles.buttonCardDesktop, { marginTop: 8, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.primaryLight }]} onPress={handleLeave} disabled={loadingLeave}>
              {loadingLeave ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={loginStyles.helperButtonText}>Gruppe entfernen</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[loginStyles.content, { alignItems: 'flex-start' }]}>
          <View style={styles.cardContainer}>
            <View style={{ alignItems: 'flex-start', width: '100%' }}>
              <View style={[styles.iconSpacing, { alignSelf: 'flex-start' }]}>
                <GradientIcon name="chatbubble-ellipses" size={120} colors={[colors.primary, colors.primary]} />
              </View>
              <Text style={[loginStyles.title, { textAlign: 'left', alignSelf: 'flex-start', marginBottom: 16 }]}>Signal Notifyer</Text>
            </View>

            <Text style={[loginStyles.subtitle, { alignSelf: 'flex-start' }]}> 
              Hinterlege hier die Signal groupId, die vom Signal-Backend verwendet wird, um MetaWave Codes zu schicken.
            </Text>

            <TextInput
              style={[loginStyles.input]}
              value={groupId}
              onChangeText={setGroupId}
              placeholder="Signal groupId"
              autoCapitalize="none"
            />

            <TouchableOpacity style={[loginStyles.loginButton]} onPress={handleInvite} disabled={loadingInvite}>
              {loadingInvite ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[loginStyles.loginText, isDesktop && loginStyles.loginTextDesktop]}>Gruppe einladen</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                loginStyles.loginButton,
                { marginTop: 8, backgroundColor: colors.backgroundCard, borderWidth: 1, borderColor: colors.primaryLight },
              ]}
              onPress={handleLeave}
              disabled={loadingLeave}
            >
              {loadingLeave ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={loginStyles.helperButtonText}>Gruppe entfernen</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        )}
        {/* Footer */}
        <View style={[loginStyles.footer, isDesktop && loginStyles.footerDesktop]}>
          <View style={loginStyles.footerLeft}>
            <TouchableOpacity onPress={() => router.push('/impressum')}>
              <Text style={loginStyles.footerLink}>Impressum</Text>
            </TouchableOpacity>
            <Text style={loginStyles.footerDivider}>/</Text>
            <TouchableOpacity onPress={() => router.push('/datenschutz')}>
              <Text style={loginStyles.footerLink}>Datenschutz</Text>
            </TouchableOpacity>
          </View>
          <Text style={loginStyles.footerVersion}>v4.0.0</Text>
        </View>
    </SafeAreaView>
  );
}
