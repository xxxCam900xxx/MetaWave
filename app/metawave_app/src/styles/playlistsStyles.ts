import { StyleSheet, Platform, Dimensions } from "react-native";
import { colors } from "../theme";

const isWeb = Platform.OS === "web";
const { width } = Dimensions.get("window");
const isDesktop = isWeb && width >= 768;

export const playlistsStyles = StyleSheet.create<any>({
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
  content: {
    padding: 20,
    paddingBottom: 100,
    maxWidth: isDesktop ? 700 : undefined,
    alignSelf: isDesktop ? "center" : undefined,
    width: "100%",
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 16,
  },
  addCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  addTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.backgroundInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 2,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginTop: 24,
    lineHeight: 22,
  },
  playlistCard: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  playlistCardInactive: {
    borderLeftColor: colors.textMuted,
    opacity: 0.65,
  },
  playlistInfo: {
    flex: 1,
    marginRight: 10,
  },
  playlistName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 3,
  },
  playlistUrl: {
    fontSize: 12,
    color: colors.textSecondary,
    numberOfLines: 1,
  },
  playlistStatus: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: "500",
  },
  playlistStatusActive: {
    color: colors.success,
  },
  playlistStatusInactive: {
    color: colors.textMuted,
  },
  playlistActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deleteButton: {
    padding: 6,
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
  infoBox: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: colors.success,
  },
  infoText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
