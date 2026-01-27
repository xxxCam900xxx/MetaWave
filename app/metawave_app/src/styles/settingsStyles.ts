import { StyleSheet } from "react-native";

export const settingsStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1d1d1d",
  },
  centered: {
    flex: 1,
    backgroundColor: "#1d1d1d",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#ffffff",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  backButton: {
    fontSize: 16,
    color: "#ffffff",
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  content: {
    padding: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#dddddd",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#282828",
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 6,
  },
  settingDescription: {
    fontSize: 14,
    color: "#aaaaaa",
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: "#282828",
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF50",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: "#cccccc",
    lineHeight: 22,
  },
});
