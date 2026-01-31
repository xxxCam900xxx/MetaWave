import { StyleSheet } from "react-native";
import { colors } from "../theme";

export const datenschutzStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    backgroundColor: "#000000",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  placeholder: {
    width: 60,
  },
  logo: {
    width: 80,
    height: 80,
  },
  backButton: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: "400",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 80,
  },
  scrollContentDesktop: {
    paddingHorizontal: 120,
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 32,
    textAlign: "left",
  },
  textContainer: {
    flex: 1,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 24,
  },
  sublabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    lineHeight: 22,
  },
  text: {
    fontSize: 15,
    fontWeight: "400",
    color: colors.textPrimary,
    lineHeight: 22,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: "#000000",
    borderTopWidth: 0,
  },
  footerText: {
    fontSize: 12,
    color: "#666666",
    fontWeight: "400",
  },
  footerVersion: {
    fontSize: 12,
    color: "#666666",
    fontWeight: "400",
  },
});
