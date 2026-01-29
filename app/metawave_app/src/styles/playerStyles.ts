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
  
  // Header
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
  settingsText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  logoutText: {
    color: colors.error,
    fontSize: 14,
  },
  
  // Content
  centerContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 16,
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
    maxWidth: 400,
    alignItems: "center",
    marginBottom: 24,
  },
  playerColumnDesktop: {
    maxWidth: 480,
  },
  
  // Cover
  cover: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 20,
  },
  coverDesktop: {
    width: 260,
    height: 260,
    borderRadius: 16,
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
  
  // Meta Block
  metaBlock: {
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  songTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  songTitleDesktop: {
    fontSize: 22,
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
  
  // Progress Bar
  progressBarWrapper: {
    width: "100%",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  progressBarBg: {
    flexDirection: "row",
    height: 4,
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
  volumeText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
  errorText: {
    color: colors.error,
    marginBottom: 12,
    textAlign: "center",
  },
  
  // Controls
  controlsRowMain: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginBottom: 20,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonDesktop: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  playButtonText: {
    color: colors.textPrimary,
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.backgroundCard,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonDesktop: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  controlsRowSecondary: {
    flexDirection: "row",
    gap: 12,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  
  // Queue
  queueContainer: {
    marginTop: 24,
    width: "100%",
    flex: 1,
  },
  queueContainerDesktop: {
    marginTop: 0,
    marginLeft: 32,
    flex: 1,
    maxWidth: 400,
    alignSelf: "stretch",
  },
  queueHeader: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  queueListContent: {
    flexGrow: 0,
  },
  queueItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.backgroundDark,
    marginBottom: 8,
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
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: colors.backgroundCard,
  },
  queueThumbnailPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  queueThumbnailText: {
    color: colors.textSecondary,
    fontSize: 18,
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
    color: colors.primaryLight,
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
  queueDragHandle: {
    marginRight: 8,
    padding: 4,
  },
  queueDragHandleText: {
    color: colors.textMuted,
    fontSize: 14,
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
