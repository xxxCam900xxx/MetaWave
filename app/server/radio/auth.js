import fs from "fs";

const codes = JSON.parse(
  fs.readFileSync(new URL("./codes.json", import.meta.url))
);

export function authMiddleware(req, res, next) {
  const code = req.header("X-METAWAVE-CODE") || req.query.token;

  // Cleanup abgelaufene Tokens
  const now = Date.now();
  for (const [t, exp] of Object.entries(codes.tokens)) {
    if (exp < now) delete codes.tokens[t];
  }

  if (!code || !(codes.active.includes(code) || codes.tokens[code])) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}