import { StyleSheet } from "react-native";
import { colors } from "../theme";

export const inviteStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headerLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "500",
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  backButton: {
    backgroundColor: colors.backgroundCard,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  // Desktop variants
  headerRowDesktop: {
    paddingHorizontal: 40,
    paddingTop: 20,
  },
  contentDesktop: {
    flex: 1,
    paddingTop: 56,
    alignItems: "center",
    justifyContent: "center",
    maxWidth: 920,
    alignSelf: "center",
  },
  primaryButtonDesktop: {
    width: 320,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonDesktop: {
    width: 320,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: 24,
    fontSize: 14,
  },
  primaryButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    marginBottom: 12,
  },
  primaryText: {
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundDark,
  },
  secondaryText: {
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 16,
  },
  // Result / confirmation panel
  resultContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  resultIcon: {
    width: 180,
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    backgroundColor: "transparent",
  },
  resultTitle: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  resultText: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  resultTitleDesktop: {
    fontSize: 36,
  },
  resultIconDesktop: {
    width: 260,
    height: 260,
    marginBottom: 36,
    backgroundColor: "transparent",
  },
  resultTextDesktop: {
    fontSize: 18,
    maxWidth: 520,
  },
  // Main title style reused for page title
  pageTitle: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 18,
    textAlign: "center",
  },
  pageTitleDesktop: {
    fontSize: 40,
    marginTop: 28,
    marginBottom: 28,
  },
  // Gradient fallbacks (use primary color if expo-linear-gradient unavailable)
  resultIconGradient: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDesktopGradient: {
    backgroundColor: colors.primary,
  },
  inputDesktop: {
    width: 420,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundInput,
    color: colors.textPrimary,
    marginBottom: 18,
    width: "100%",
    maxWidth: 420,
    fontSize: 16,
  },
  // Desktop centering wrapper
  desktopWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  // Card container used for desktop and mobile card layout
  cardContainer: {
    width: '100%',
    paddingHorizontal: 24,
  },
  cardContainerDesktop: {
    maxWidth: 520,
    width: '100%',
    paddingHorizontal: 0,
    alignItems: 'center',
  },
  // Desktop-specific input/button sizes inside the card
  inputCardDesktop: {
    width: 480,
    maxWidth: 480,
  },
  buttonCardDesktop: {
    width: 480,
    maxWidth: 480,
  },
  // Spacing helpers
  iconSpacing: {
    marginBottom: 24,
  },
  titleSubtitleGap: {
    marginBottom: 16,
  },
  // Subtitle centering for desktop card
  subtitleCardDesktop: {
    alignSelf: 'center',
    textAlign: 'center',
    maxWidth: 480,
    paddingLeft: 0,
  },
});
