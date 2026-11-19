import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useVoting, VotingStatisticsContent } from "../src/components/Voting";
import { votingStyles as styles } from "../src/styles/votingStyles";
import { colors } from "../src/theme";

export default function StatisticsScreen() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const voting = useVoting(token);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem("authToken").then(stored => {
      if (!active) return;
      if (stored) setToken(stored);
      else router.replace("/");
    }).catch(reason => {
      console.error("Anmeldung konnte nicht geladen werden:", reason);
      if (active) setAuthError("Anmeldung konnte nicht geladen werden.");
    });
    return () => { active = false; };
  }, [router]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/player");
  };

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.pageHeader}>
        <Text style={styles.brand}>MetaWave</Text>
        <TouchableOpacity style={styles.back} onPress={goBack} accessibilityRole="button" accessibilityLabel="Zurück zum Player">
          <Ionicons name="arrow-back-outline" size={18} color={colors.textSecondary} />
          <Text style={styles.backText}>Zum Player</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.pageContent}>
        {authError ? <Text style={styles.error}>{authError}</Text>
          : token ? <VotingStatisticsContent voting={voting} />
          : <ActivityIndicator color={colors.textPrimary} style={{ margin: 20 }} />}
      </ScrollView>
    </SafeAreaView>
  );
}
