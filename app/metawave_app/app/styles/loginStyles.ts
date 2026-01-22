import { StyleSheet } from "react-native";

export const loginStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#050510",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050510",
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
    color: "#b0b0c0",
    marginBottom: 32,
  },
  input: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#151523",
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
  linkButton: {
    marginTop: 8,
  },
  linkText: {
    color: "#4fa3ff",
    textDecorationLine: "underline",
  },
});
