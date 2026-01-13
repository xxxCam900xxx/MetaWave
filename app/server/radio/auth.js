import fs from "fs";

const codes = JSON.parse(
  fs.readFileSync(new URL("./codes.json", import.meta.url))
);

export function authMiddleware(req, res, next) {
  const code = req.header("X-METAWAVE-CODE");

  if (!code || !codes.active.includes(code)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}