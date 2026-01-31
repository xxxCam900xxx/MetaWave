import { StyleSheet, Platform, Dimensions } from "react-native";
import { colors } from "../theme";

const isWeb = Platform.OS === "web";
const { width } = Dimensions.get("window");
const isDesktop = isWeb && width >= 768;

export const settingsStyles = StyleSheet.create<any>({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textPrimary,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.backgroundDark,
  },
  headerRowDesktop: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerIcon: {
    padding: 4,
  },
  headerIconText: {
    color: colors.textSecondary,
    fontSize: 18,
  },
  headerIconTextLogout: {
    color: colors.error,
    fontSize: 18,
  },
  backButton: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  mobileBackButtonContainer: {
    alignItems: "center",
    paddingVertical: 24,
    marginTop: 16,
  },
  mobileBackButton: {
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  mobileBackButtonText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  settingsText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  logoutText: {
    color: colors.error,
    fontSize: 14,
  },
  content: {
    padding: 24,
    paddingBottom: 100,
  },
  sectionsContainer: {
    flexDirection: isDesktop ? "row" : "column",
    justifyContent: isDesktop ? "center" : "flex-start",
    gap: isDesktop ? 48 : 0,
  },
  section: {
    marginBottom: isDesktop ? 0 : 20,
    flex: isDesktop ? 1 : undefined,
    maxWidth: isDesktop ? 400 : undefined,
  },

  // Desktop back button placed under settings
  desktopBackButtonContainer: {
    alignItems: "center",
    marginVertical: 20,
  },
  desktopBackButton: {
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 24,
  },
  desktopBackButtonText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.backgroundCard,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: 8,
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 16,
    marginBottom: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  settingCard: {
    backgroundColor: colors.backgroundCard,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: 8,
    paddingLeft: 16,
    paddingRight: 16,
    paddingVertical: 16,
    marginBottom: 12,
  },
  sliderContainer: {
    marginTop: 8,
  },
  sliderHeader: {
    marginBottom: 0,
    alignItems: "center",
  },
  sliderValue: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    textAlign: "center",
  },
  slider: {
    width: "100%",
    height: 40,
  },
  sliderLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -4,
  },
  sliderLabelText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  infoBox: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  // Mobile back button at bottom
  mobileBackButtonContainer: {
    alignItems: "center",
    paddingVertical: 24,
    marginTop: 16,
  },
  mobileBackButton: {
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
  },
  mobileBackButtonText: {
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.backgroundDark,
  },
  footerDesktop: {
    paddingHorizontal: 24,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerLink: {
    color: colors.textMuted,
    fontSize: 12,
  },
  footerDivider: {
    color: colors.textMuted,
    fontSize: 12,
    marginHorizontal: 8,
  },
  footerVersion: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
