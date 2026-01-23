import { StyleSheet } from "react-native";

export const loginStyles = StyleSheet.create({
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
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 64,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#dddddd",
    marginBottom: 32,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#282828",
    color: "#ffffff",
    marginBottom: 16,
  },
  loginButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1db954",
    marginBottom: 16,
  },
  loginText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 16,
  },
  helperRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  helperButton: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#282828",
    borderWidth: 1,
    borderColor: "#888888",
  },
  helperButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "500",
  },
});
