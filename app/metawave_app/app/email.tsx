import React, { useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View, Platform, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { API_BASE } from "../src/config";
import { inviteStyles as styles } from "../src/styles/inviteStyles";
import { loginStyles as loginStyles } from "../src/styles/loginStyles";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../src/theme";

type GradientIconProps = {
  name: React.ComponentProps<typeof Ionicons>['name'];
  size: number;
  colors: [string, string, ...string[]];
};

function GradientIcon({ name, size, colors: gradColors }: GradientIconProps) {
  const container = { width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const };
  let MaskedViewModule: any = null;
  try {
    // try dynamic require to avoid bundler error if package isn't installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    MaskedViewModule = require('@react-native-masked-view/masked-view').default || require('@react-native-masked-view/masked-view');
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
          <TouchableOpacity onPress={() => { setResult(null); }} style={[styles.backButton, { marginLeft: 'auto' }]}>
            <Text style={styles.backButtonText}>Zurück</Text>
          </TouchableOpacity>
        </View>

        {isDesktop ? (
          <View style={styles.desktopWrapper}>
            <View style={[styles.cardContainer, styles.cardContainerDesktop]}>
              <View style={styles.iconSpacing}>
                <LinearGradient colors={[colors.primary, colors.primary]} style={[styles.resultIcon, styles.resultIconDesktop]}> 
                  <Ionicons name="chatbubble-ellipses" size={isDesktop ? 140 : 96} color="#ffffff" />
                </LinearGradient>
              </View>

              <Text style={[loginStyles.title, loginStyles.titleDesktop]}>Notifier {result.action === "aktiviert" ? "Aktiviert" : "Entfernt"}</Text>
              <Text style={[styles.resultText, styles.resultTextDesktop]}>
                {result.action === "aktiviert"
                  ? `Der Notifier für ${result.option} wurde aktiviert, sie sollten eine Benachrichtigung gekriegt haben mit MW-Code!`
                  : `Der Notifier für ${result.option} wurde entfernt.`}
              </Text>
            </View>
          </View>
        ) : (
          <View style={loginStyles.content}>
            <View style={styles.cardContainer}>
              <View style={[{ alignItems: 'center', width: '100%' }, styles.iconSpacing]}>
                <LinearGradient colors={[colors.primary, colors.primary]} style={[styles.resultIcon]}> 
                  <Ionicons name="chatbubble-ellipses" size={isDesktop ? 140 : 96} color="#ffffff" />
                </LinearGradient>
              </View>

              <Text style={loginStyles.title}>Notifier {result.action === "aktiviert" ? "Aktiviert" : "Entfernt"}</Text>
              <Text style={styles.resultText}>
                {result.action === "aktiviert"
                  ? `Der Notifier für ${result.option} wurde aktiviert, sie sollten eine Benachrichtigung gekriegt haben mit MW-Code!`
                  : `Der Notifier für ${result.option} wurde entfernt.`}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

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
                <GradientIcon name="mail" size={160} colors={[colors.primary, colors.primary]} />
              </View>
              <Text style={[loginStyles.title, loginStyles.titleDesktop]}>E-Mail Notifyer</Text>
            </View>

            <Text style={[loginStyles.subtitle, styles.titleSubtitleGap, styles.subtitleCardDesktop]}>
              Hinterlege hier eine E-Mail-Adresse, an die MetaWave Codes für den Login geschickt werden sollen.
            </Text>

            <TextInput
              style={[loginStyles.input, styles.inputCardDesktop]}
              value={email}
              onChangeText={setEmail}
              placeholder="E-Mail-Adresse"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TouchableOpacity style={[loginStyles.loginButton, styles.buttonCardDesktop, { marginTop: 16 }]} onPress={handleInvite} disabled={loadingInvite}>
              {loadingInvite ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[loginStyles.loginText, isDesktop && loginStyles.loginTextDesktop]}>Hinzufügen</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={[loginStyles.helperButton, styles.buttonCardDesktop, { marginTop: 8 }]} onPress={handleLeave} disabled={loadingLeave}>
              {loadingLeave ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={loginStyles.helperButtonText}>Löschen</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[loginStyles.content, { alignItems: 'flex-start' }]}>
          <View style={styles.cardContainer}>
            <View style={{ alignItems: 'flex-start', width: '100%' }}>
              <View style={[styles.iconSpacing, { alignSelf: 'flex-start' }]}>
                <GradientIcon name="mail" size={120} colors={[colors.primary, colors.primary]} />
              </View>
              <Text style={[loginStyles.title, { textAlign: 'left', alignSelf: 'flex-start', marginBottom: 16 }]}>E-Mail Notifyer</Text>
            </View>

            <Text style={[loginStyles.subtitle, { alignSelf: 'flex-start' }]}> 
              Hinterlege hier eine E-Mail-Adresse, an die MetaWave Codes für den Login geschickt werden sollen.
            </Text>

            <TextInput
              style={[loginStyles.input]}
              value={email}
              onChangeText={setEmail}
              placeholder="E-Mail-Adresse"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <TouchableOpacity style={[loginStyles.loginButton]} onPress={handleInvite} disabled={loadingInvite}>
              {loadingInvite ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[loginStyles.loginText, isDesktop && loginStyles.loginTextDesktop]}>Hinzufügen</Text>
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
                <Text style={loginStyles.helperButtonText}>Löschen</Text>
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
        <Text style={loginStyles.footerVersion}>v1.0.0</Text>
      </View>
    </SafeAreaView>
  );
}
