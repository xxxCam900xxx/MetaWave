import { api, setAuthToken } from "../api/client";
import { getMonthlyCode } from "../utils/codeGenerator";

export async function login() {
  const code = getMonthlyCode();

  const res = await api.get("/login", { params: { code } });
  const token = res.data.token;
  setAuthToken(token);
  return token;
}