import { useState, useEffect } from "react";
import { login } from "./auth/auth";
import AudioPlayer from "./player/AudioPlayer";

export default function App() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function initLogin() {
      try {
        const t = await login();
        setToken(t);
      } catch (err) {
        console.error(err);
        setError("Login fehlgeschlagen");
      } finally {
        setLoading(false);
      }
    }

    initLogin();
  }, []);

  if (loading) return <p>Login läuft…</p>;
  if (error) return <p>{error}</p>;

  return <AudioPlayer token={token} />;
}