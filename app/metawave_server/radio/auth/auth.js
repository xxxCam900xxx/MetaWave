import { getMonthlyCode } from "./codeGenerator.js";

export const TOKEN_EXPIRY = 15 * 60 * 1000;
export const TOKENS = new Map();

export function login(req, res) {
  const code = req.query.code;
  if (!code || code !== getMonthlyCode()) {
    return res.status(401).json({ error: "Invalid code" });
  }

  const token = Math.random().toString(16).substring(2, 10).toUpperCase();
  TOKENS.set(token, { expiresAt: Date.now() + TOKEN_EXPIRY });
  res.json({ token, expiresIn: TOKEN_EXPIRY / 1000 });
}

export function authMiddleware(req, res, next) {
  const token = req.header("X-METAWAVE-TOKEN") || req.query.token;

  if (!token || !TOKENS.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const tokenData = TOKENS.get(token);
  const now = Date.now();

  if (tokenData.expiresAt < now) {
    TOKENS.delete(token);
    return res.status(401).json({ error: "Token expired" });
  }

  tokenData.expiresAt = now + TOKEN_EXPIRY;
  TOKENS.set(token, tokenData);

  next();
}

export function currentcode() {
  return getMonthlyCode();
}