import axios from "axios";

export const API_BASE = "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
});

export function setAuthToken(token) {
  api.defaults.headers.common["X-METAWAVE-TOKEN"] = token;
}