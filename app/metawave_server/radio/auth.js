export const TOKEN_EXPIRY = 15 * 60 * 1000; // 15 Minuten Inaktivität
export const TOKENS = new Map();

/**
 * Middleware für Authentifizierung mit Keep-Alive Token
 */
export function authMiddleware(req, res, next) {
  const token = req.header("X-METAWAVE-TOKEN");

  if (!token || !TOKENS.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const tokenData = TOKENS.get(token);
  const now = Date.now();

  // Prüfen ob der Token abgelaufen ist
  if (tokenData.expiresAt < now) {
    TOKENS.delete(token);
    return res.status(401).json({ error: "Token expired" });
  }

  // Token-Nutzung → Keep-Alive: Ablaufzeit resetten
  tokenData.expiresAt = now + TOKEN_EXPIRY;
  TOKENS.set(token, tokenData);

  next();
}