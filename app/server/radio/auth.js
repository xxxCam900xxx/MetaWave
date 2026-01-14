import fs from "fs";

const codes = JSON.parse(
  fs.readFileSync(new URL("./codes.json", import.meta.url))
);

export function authMiddleware(req, res, next) {
  const code = req.header("X-METAWAVE-CODE");

  if (!code) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // später: Token / DB / Expiry
  if (code.length < 6) {
    return res.status(401).json({ error: "Invalid code" });
  }

  next();
}