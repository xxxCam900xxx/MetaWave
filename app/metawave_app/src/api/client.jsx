import axios from "axios";

export const API_BASE = "https://knobbiest-vickie-lifelike.ngrok-free.dev";

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "ngrok-skip-browser-warning": "true",
  },
});

export function setAuthToken(token) {
  api.defaults.headers.common["X-METAWAVE-TOKEN"] = token;
}