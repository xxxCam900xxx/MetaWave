import jwt from "jsonwebtoken";
import { getStoredTokenForCurrentMonth } from "./WaveTokenLogic.js";

const SECRET = process.env.AUTH_SECRET || "changeme_must_set_AUTH_SECRET";
const TOKEN_EXPIRY_SECONDS = parseInt(process.env.AUTH_TOKEN_EXPIRY, 10) || 30 * 60; // Alt: 30 minutes

// POST /auth/login
export async function login(req, res) {
  const { wavetoken } = req.body || {};

  const expected = await getStoredTokenForCurrentMonth();
  if (!expected) return res.status(500).json({ status: 500, message: "WaveToken not configured in database" });
  if (!wavetoken || wavetoken !== expected) {
    return res.status(401).json({ status: 401, message: "Invalid wavetoken" });
  }

  const token = jwt.sign({ scope: "stream" }, SECRET, { expiresIn: TOKEN_EXPIRY_SECONDS });
  return res.status(200).json({ status: 200, message: "Sucessfully Logged In", token });
}

// POST /auth/validate
export async function validate(req, res) {
  const auth = req.header("Authorization") || "";
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return res.status(401).json({ status: 401, message: "Invalid Authorization header" });

  const token = parts[1];
  try {
    const payload = jwt.verify(token, SECRET);
    const refreshed = jwt.sign({ scope: payload.scope }, SECRET, { expiresIn: TOKEN_EXPIRY_SECONDS });
    return res.status(200).json({ status: 200, message: "Token is Valid and Refreshed", token: refreshed });
  } catch (err) {
    return res.status(401).json({ status: 401, message: "Token invalid or expired" });
  }
}

export function authMiddleware(req, res, next) {
  const auth = req.header("Authorization") || "";
  const parts = auth.split(" ");

  let token = null;
  if (parts.length === 2 && parts[0] === "Bearer") {
    token = parts[1];
  }

  if (!token && req.query && typeof req.query.token === "string") {
    token = req.query.token;
  }
  if (!token && req.query && typeof req.query.access_token === "string") {
    token = req.query.access_token;
  }

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    jwt.verify(token, SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export function verifyToken(token) {
  if (!token) return false;
  try {
    jwt.verify(token, SECRET);
    return true;
  } catch (err) {
    return false;
  }
}