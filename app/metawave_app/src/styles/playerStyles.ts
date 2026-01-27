import { StyleSheet } from "react-native";

export const playerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1d1d1d",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1d1d1d",
  },
  loadingText: {
    marginTop: 12,
    color: "#ffffff",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  settingsText: {
    color: "#ffffff",
    fontSize: 14,
  },
  logoutText: {
    color: "#ff6b6b",
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
    backgroundColor: "#282828",
    alignItems: "center",
    justifyContent: "center",
  },
  coverPlaceholderText: {
    color: "#dddddd",
    fontSize: 22,
    fontWeight: "700",
  },
  metaBlock: {
    alignItems: "center",
    marginBottom: 24,
  },
  songTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  songAuthor: {
    color: "#dddddd",
    fontSize: 14,
    marginTop: 4,
    textAlign: "center",
  },
  queueText: {
    color: "#dddddd",
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
    backgroundColor: "#3a3a3a",
    overflow: "hidden",
  },
  progressBarFill: {
    backgroundColor: "#1db954",
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  progressLabel: {
    color: "#dddddd",
    fontSize: 12,
  },
  progressRightBlock: {
    alignItems: "flex-end",
  },
  progressEndLabel: {
    color: "#cccccc",
    fontSize: 11,
    marginTop: 2,
  },
  errorText: {
    color: "#ff6b6b",
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
    backgroundColor: "#1db954",
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonText: {
    color: "#000000",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#282828",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#ffffff",
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
    backgroundColor: "#282828",
  },
  chipText: {
    color: "#ffffff",
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
    color: "#ffffff",
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
    backgroundColor: "#282828",
    marginBottom: 6,
  },
  queueItemActive: {
    backgroundColor: "#1db95433",
  },
  queueItemPlayed: {
    opacity: 0.4,
  },
  queueThumbnail: {
    width: 42,
    height: 42,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: "#282828",
  },
  queueThumbnailPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  queueThumbnailText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  queueTexts: {
    flex: 1,
    marginRight: 8,
  },
  queueTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "500",
  },
  queueTitleActive: {
    color: "#1db954",
  },
  queueAuthor: {
    color: "#f0f0f0",
    fontSize: 12,
    marginTop: 2,
  },
  queueDuration: {
    color: "#f0f0f0",
    fontSize: 12,
  },
});
