import { StyleSheet } from "react-native";
import { colors } from "../theme";

export const loginStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    color: colors.textPrimary,
  },
  
  // Content - Mobile
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  // Content - Desktop
  contentDesktop: {
    paddingHorizontal: 40,
    width: "100%",
    maxWidth: 920,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  
  // Logo - Mobile
  logoContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  logoContainerDesktop: {
    marginBottom: 32,
  },
  logo: {
    width: 160,
    height: 160,
    borderRadius: 5,
  },
  logoDesktop: {
    width: 180,
    height: 180,
    borderRadius: 28,
  },
  
  // Title - Mobile
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 32,
    textAlign: "center",
    lineHeight: 36,
  },
  titleDesktop: {
    fontSize: 32,
    marginBottom: 40,
    lineHeight: 44,
  },
  
  // Subtitle / Label - Mobile
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
    textAlign: "left",
    alignSelf: "center",
    width: "100%",
    maxWidth: 280,
    paddingLeft: 12,
  },
  subtitleDesktop: {
    maxWidth: 320,
    paddingLeft: 12,
  },
  
  // Input - Mobile
  input: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.backgroundInput,
    color: colors.textPrimary,
    marginBottom: 16,
    width: "100%",
    maxWidth: 280,
    fontSize: 16,
  },
  inputDesktop: {
    maxWidth: 320,
    paddingVertical: 16,
  },
  
  // Login Button - Mobile
  loginButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    marginBottom: 16,
    width: "100%",
    maxWidth: 280,
  },
  loginButtonDesktop: {
    maxWidth: 320,
    paddingVertical: 16,
    borderRadius: 18,
  },
  loginText: {
    color: colors.textPrimary,
    fontWeight: "600",
    fontSize: 16,
  },
  
  // Helper Text
  helperText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  helperRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    width: "100%",
    maxWidth: 280,
  },
  helperRowDesktop: {
    maxWidth: 320,
  },
  helperButton: {
    flex: 1,
    marginHorizontal: 6,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    height: 44,
  },
  helperButtonText: {
    color: colors.primaryLight,
    fontSize: 14,
    fontWeight: "600",
  },
  
  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.backgroundDark,
  },
  footerDesktop: {
    paddingHorizontal: 40,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerLink: {
    color: colors.textMuted,
    fontSize: 14,
  },
  footerDivider: {
    color: colors.textMuted,
    fontSize: 14,
    marginHorizontal: 8,
  },
  footerVersion: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
