export const TOKENS = new Map();

export function authMiddleware(req, res, next) {
  const token = req.header("X-METAWAVE-TOKEN");
  if (!token || !TOKENS.has(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Token ablaufen prüfen
  if (Date.now() > TOKENS.get(token)) {
    TOKENS.delete(token);
    return res.status(401).json({ error: "Token expired" });
  }

  next();
}