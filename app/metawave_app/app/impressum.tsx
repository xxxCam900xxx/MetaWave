import React from "react";
import { Image, Platform, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { impressumStyles as styles } from "../src/styles/impressumStyles";

export default function ImpressumScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const logoSource = Platform.OS === 'web'
    ? { uri: '/assets/icons/web/icon-192-maskable.png' }
    : require('./assets/icons/web/icon-192-maskable.png');

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.placeholder} />
          <Image
            source={logoSource}
            style={styles.logo}
            resizeMode="contain"
          />
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>Zurück</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && styles.scrollContentDesktop
        ]}
      >
        <Text style={styles.title}>Impressum</Text>
        
        <View style={styles.textContainer}>
          <Text style={styles.section}>
            <Text style={styles.label}>Angaben gemäß § 5 TMG:{"\n"}</Text>
            <Text style={styles.text}>
              Max Mustermann{"\n"}
              Musterstraße 123{"\n"}
              12345 Musterstadt{"\n"}
              Deutschland
            </Text>
          </Text>

          <Text style={styles.section}>
            <Text style={styles.label}>Kontakt:{"\n"}</Text>
            <Text style={styles.text}>
              Telefon: +49 (0) 123 456789{"\n"}
              E-Mail: kontakt@metawave.example.com
            </Text>
          </Text>

          <Text style={styles.section}>
            <Text style={styles.label}>Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:{"\n"}</Text>
            <Text style={styles.text}>
              Max Mustermann{"\n"}
              Musterstraße 123{"\n"}
              12345 Musterstadt
            </Text>
          </Text>

          <Text style={styles.section}>
            <Text style={styles.label}>Haftungsausschluss:{"\n\n"}</Text>
            <Text style={styles.label}>Haftung für Inhalte{"\n"}</Text>
            <Text style={styles.text}>
              Die Inhalte unserer Seiten wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, 
              Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen. 
              Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten 
              nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als 
              Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde 
              Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige 
              Tätigkeit hinweisen.{"\n\n"}
            </Text>

            <Text style={styles.label}>Haftung für Links{"\n"}</Text>
            <Text style={styles.text}>
              Unser Angebot enthält Links zu externen Webseiten Dritter, auf deren Inhalte wir keinen 
              Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. 
              Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der 
              Seiten verantwortlich.{"\n\n"}
            </Text>

            <Text style={styles.label}>Urheberrecht{"\n"}</Text>
            <Text style={styles.text}>
              Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen 
              dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art 
              der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen 
              Zustimmung des jeweiligen Autors bzw. Erstellers.
            </Text>
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Impressum / Datenschutz</Text>
        <Text style={styles.footerVersion}>v4.0.0</Text>
      </View>
    </SafeAreaView>
  );
}
