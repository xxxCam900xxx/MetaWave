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
    userSelect: "none" as any,
    WebkitUserSelect: "none" as any,
  },
  centerContentDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
    minHeight: "100%",
  },
  playerColumn: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    marginBottom: 24,
    userSelect: "none" as any,
    WebkitUserSelect: "none" as any,
  },
  playerColumnDesktop: {
    flex: 1,
    width: "auto",
    minWidth: 500,
    maxWidth: 800,
    marginRight: 32,
    marginBottom: 0,
  },
  
  // Cover
  cover: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 32,
  },
  coverDesktop: {
    width: 300,
    height: 300,
    borderRadius: 16,
    marginBottom: 40,
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
    fontSize: 32,
  },
  songAuthor: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  songAuthorDesktop: {
    fontSize: 18,
    marginTop: 6,
  },
  queueText: {
    color: colors.textSecondary,
    marginTop: 4,
    fontSize: 12,
  },
  
  // Progress Bar
  progressBarWrapper: {
    width: "100%",
    marginTop: 32,
    marginBottom: 24,
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
  progressLabelDesktop: {
    fontSize: 16,
  },
  progressLeftBlock: {
    alignItems: "flex-start",
  },
  progressRightBlock: {
    alignItems: "flex-end",
  },
  progressEndLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  progressEndLabelDesktop: {
    fontSize: 14,
  },
  volumeText: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  volumeTextDesktop: {
    fontSize: 14,
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
    width: 90,
    height: 90,
    borderRadius: 45,
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
  // Mobile bottom sheet
  bottomSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.backgroundDark,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 0,
    paddingBottom: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 } as any,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
    userSelect: "none" as any,
    WebkitUserSelect: "none" as any,
    WebkitTouchCallout: "none" as any,
  },
  sheetHandleTouchArea: {
    width: "100%",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none" as any,
    cursor: "grab" as any,
  },
  sheetHandle: {
    width: 48,
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  queueContainerDesktop: {
    marginTop: 0,
    marginLeft: 0,
    marginRight: 16,
    width: 400,
    minWidth: 350,
    maxWidth: 420,
    alignSelf: "stretch",
    backgroundColor: colors.backgroundDark,
    borderRadius: 16,
    padding: 16,
    paddingTop: 12,
    position: "absolute" as const,
    right: 16,
    top: 16,
    bottom: 16,
  },
  queueHandleDesktop: {
    width: 48,
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 16,
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
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingLeft: 12,
    borderRadius: 12,
    backgroundColor: colors.backgroundCard,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: "transparent",
    userSelect: "none" as any,
    WebkitUserSelect: "none" as any,
  },
  queueItemActive: {
    backgroundColor: "#2A2545",
    borderLeftColor: colors.primary,
  },
  queueItemPlayed: {
    opacity: 0.5,
  },
  queueThumbnail: {
    width: 52,
    height: 52,
    borderRadius: 8,
    marginRight: 14,
    backgroundColor: colors.backgroundDark,
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
    fontSize: 15,
    fontWeight: "600",
  },
  queueTitleActive: {
    color: colors.primaryLight,
  },
  queueAuthor: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
    fontWeight: "500",
  },
  queueDuration: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  queueDragHandle: {
    marginRight: 10,
    padding: 4,
  },
  queueDragHandleText: {
    color: colors.textMuted,
    fontSize: 18,
    opacity: 0.6,
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
