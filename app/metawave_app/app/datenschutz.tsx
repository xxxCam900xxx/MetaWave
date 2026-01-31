import React from "react";
import { Image, Platform, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { datenschutzStyles as styles } from "../src/styles/datenschutzStyles";

export default function DatenschutzScreen() {
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
        <Text style={styles.title}>Datenschutz</Text>
        
        <View style={styles.textContainer}>
          <Text style={styles.section}>
            <Text style={styles.label}>1. Datenschutz auf einen Blick{"\n\n"}</Text>
            <Text style={styles.sublabel}>Allgemeine Hinweise{"\n"}</Text>
            <Text style={styles.text}>
              Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren 
              personenbezogenen Daten passiert, wenn Sie unsere App nutzen. Personenbezogene Daten 
              sind alle Daten, mit denen Sie persönlich identifiziert werden können. Ausführliche 
              Informationen zum Thema Datenschutz entnehmen Sie unserer unter diesem Text aufgeführten 
              Datenschutzerklärung.
            </Text>
          </Text>

          <Text style={styles.section}>
            <Text style={styles.label}>2. Datenerfassung in unserer App{"\n\n"}</Text>
            <Text style={styles.sublabel}>Wer ist verantwortlich für die Datenerfassung in dieser App?{"\n"}</Text>
            <Text style={styles.text}>
              Die Datenverarbeitung in dieser App erfolgt durch den App-Betreiber. Dessen 
              Kontaktdaten können Sie dem Impressum dieser App entnehmen.{"\n\n"}
            </Text>

            <Text style={styles.sublabel}>Wie erfassen wir Ihre Daten?{"\n"}</Text>
            <Text style={styles.text}>
              Ihre Daten werden zum einen dadurch erhoben, dass Sie uns diese mitteilen. Hierbei 
              kann es sich z.B. um Daten handeln, die Sie in ein Kontaktformular eingeben.{"\n\n"}
              
              Andere Daten werden automatisch beim Nutzen der App durch unsere IT-Systeme erfasst. 
              Das sind vor allem technische Daten (z.B. Betriebssystem oder Uhrzeit des Seitenaufrufs).
            </Text>
          </Text>

          <Text style={styles.section}>
            <Text style={styles.label}>3. Wofür nutzen wir Ihre Daten?{"\n\n"}</Text>
            <Text style={styles.text}>
              Ein Teil der Daten wird erhoben, um eine fehlerfreie Bereitstellung der App zu 
              gewährleisten. Andere Daten können zur Analyse Ihres Nutzerverhaltens verwendet werden.{"\n\n"}
              
              Die Verarbeitung Ihrer personenbezogenen Daten erfolgt auf Grundlage von Art. 6 Abs. 1 
              lit. a DSGVO (Einwilligung), lit. b DSGVO (Vertragserfüllung) oder lit. f DSGVO 
              (berechtigtes Interesse).
            </Text>
          </Text>

          <Text style={styles.section}>
            <Text style={styles.label}>4. Welche Rechte haben Sie bezüglich Ihrer Daten?{"\n\n"}</Text>
            <Text style={styles.text}>
              Sie haben jederzeit das Recht, unentgeltlich Auskunft über Herkunft, Empfänger und 
              Zweck Ihrer gespeicherten personenbezogenen Daten zu erhalten. Sie haben außerdem ein 
              Recht, die Berichtigung oder Löschung dieser Daten zu verlangen. Wenn Sie eine 
              Einwilligung zur Datenverarbeitung erteilt haben, können Sie diese Einwilligung 
              jederzeit für die Zukunft widerrufen.{"\n\n"}
              
              Außerdem haben Sie das Recht, unter bestimmten Umständen die Einschränkung der 
              Verarbeitung Ihrer personenbezogenen Daten zu verlangen. Des Weiteren steht Ihnen ein 
              Beschwerderecht bei der zuständigen Aufsichtsbehörde zu.
            </Text>
          </Text>

          <Text style={styles.section}>
            <Text style={styles.label}>5. Hosting und Content Delivery Networks (CDN){"\n\n"}</Text>
            <Text style={styles.text}>
              Wir hosten die Inhalte unserer App bei einem oder mehreren externen Dienstleistern. 
              Die personenbezogenen Daten, die in dieser App erfasst werden, werden auf den Servern 
              des Hosters gespeichert. Hierbei kann es sich v.a. um IP-Adressen, Kontaktanfragen, 
              Meta- und Kommunikationsdaten handeln.{"\n\n"}
              
              Der Einsatz des Hosters erfolgt zum Zwecke der Vertragserfüllung gegenüber unseren 
              potenziellen und bestehenden Kunden (Art. 6 Abs. 1 lit. b DSGVO) und im Interesse 
              einer sicheren, schnellen und effizienten Bereitstellung unseres Online-Angebots durch 
              einen professionellen Anbieter (Art. 6 Abs. 1 lit. f DSGVO).
            </Text>
          </Text>

          <Text style={styles.section}>
            <Text style={styles.label}>6. Allgemeine Hinweise und Pflichtinformationen{"\n\n"}</Text>
            <Text style={styles.sublabel}>Widerruf Ihrer Einwilligung zur Datenverarbeitung{"\n"}</Text>
            <Text style={styles.text}>
              Viele Datenverarbeitungsvorgänge sind nur mit Ihrer ausdrücklichen Einwilligung möglich. 
              Sie können eine bereits erteilte Einwilligung jederzeit widerrufen. Die Rechtmäßigkeit 
              der bis zum Widerruf erfolgten Datenverarbeitung bleibt vom Widerruf unberührt.{"\n\n"}
            </Text>

            <Text style={styles.sublabel}>SSL- bzw. TLS-Verschlüsselung{"\n"}</Text>
            <Text style={styles.text}>
              Diese App nutzt aus Sicherheitsgründen und zum Schutz der Übertragung vertraulicher 
              Inhalte eine SSL- bzw. TLS-Verschlüsselung. Eine verschlüsselte Verbindung erkennen 
              Sie daran, dass die Adresszeile des Browsers von "http://" auf "https://" wechselt und 
              an dem Schloss-Symbol in Ihrer Browserzeile.
            </Text>
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Impressum / Datenschutz</Text>
        <Text style={styles.footerVersion}>v1.0.0</Text>
      </View>
    </SafeAreaView>
  );
}
