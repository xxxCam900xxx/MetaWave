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
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  backText: {
    color: colors.primaryLight,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: 24,
    fontSize: 14,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.backgroundInput,
    color: colors.textPrimary,
    marginBottom: 24,
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
    color: colors.error,
    fontWeight: "600",
    fontSize: 16,
  },
});
