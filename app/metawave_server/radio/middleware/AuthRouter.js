import express from "express";
import { login, currentcode } from "./AuthLogic.js";

const router = express.Router();

// GET /auth/login
router.get("/login", login);

export default router;