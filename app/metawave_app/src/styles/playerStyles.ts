import { StyleSheet } from "react-native";
import { colors } from "../theme";

export const playerStyles = StyleSheet.create({
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
  settingsText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  logoutText: {
    color: colors.error,
    fontSize: 14,
  },
  centerContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  centerContentDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingBottom: 24,
  },
  playerColumn: {
    width: "100%",
    maxWidth: 520,
    alignItems: "center",
    marginBottom: 24,
  },
  cover: {
    width: 260,
    height: 260,
    borderRadius: 24,
    marginBottom: 24,
  },
  coverPlaceholder: {
    backgroundColor: colors.backgroundCard,
    alignItems: "center",
    justifyContent: "center",
  },
  coverPlaceholderText: {
    color: colors.textSecondary,
    fontSize: 22,
    fontWeight: "700",
  },
  metaBlock: {
    alignItems: "center",
    marginBottom: 24,
  },
  songTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  songAuthor: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  queueText: {
    color: colors.textSecondary,
    marginTop: 4,
    fontSize: 12,
  },
  progressBarWrapper: {
    width: "100%",
    marginBottom: 24,
  },
  progressBarBg: {
    flexDirection: "row",
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressBarFill: {
    backgroundColor: colors.primary,
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  progressLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  progressRightBlock: {
    alignItems: "flex-end",
  },
  progressEndLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  errorText: {
    color: colors.error,
    marginBottom: 12,
  },
  controlsRowMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "70%",
    marginBottom: 16,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonText: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.backgroundCard,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 18,
  },
  controlsRowSecondary: {
    flexDirection: "row",
    gap: 12,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.backgroundCard,
  },
  chipText: {
    color: colors.textPrimary,
  },
  queueContainer: {
    marginTop: 24,
    width: "100%",
    flex: 1,
  },
  queueContainerDesktop: {
    marginTop: 0,
    marginLeft: 32,
    flex: 1,
    maxWidth: 520,
    alignSelf: "stretch",
  },
  queueHeader: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  queueListContent: {
    flexGrow: 0,
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.backgroundDark,
    marginBottom: 6,
  },
  queueItemActive: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  queueItemPlayed: {
    opacity: 0.4,
  },
  queueThumbnail: {
    width: 42,
    height: 42,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: colors.backgroundCard,
  },
  queueThumbnailPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  queueThumbnailText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  queueTexts: {
    flex: 1,
    marginRight: 8,
  },
  queueTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  queueTitleActive: {
    color: colors.primary,
  },
  queueAuthor: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  queueDuration: {
    color: colors.textSecondary,
    fontSize: 12,
  },
});
