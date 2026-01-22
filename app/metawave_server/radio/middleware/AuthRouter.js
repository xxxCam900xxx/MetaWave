import express from "express";
import { login, validate } from "./AuthLogic.js";

const router = express.Router();

// POST /auth/login
router.post("/login", login);

// POST /auth/validate
router.post("/validate", validate);

export default router;