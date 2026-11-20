import express from "express";
import http from "http";
import cors from "cors";
import compression from "compression";
import { setupSwagger } from "./swagger/SwaggerLogic.js";
import cron from "node-cron";

// Import Routers
import StreamRouter from "./core/RadioEngineRouter.js";
import AuthRouter from "./middleware/AuthRouter.js";
import NotificationRouter from "./notification/NotificationRouter.js";
import PlaylistRouter from "./playlist/PlaylistRouter.js";
import { speakerRouter, startSpeakerBridge } from "./core/SpeakerBridge.js";
import { radio } from "./core/RadioEngine.js";
import { votingStore } from "./core/VotingStore.js";
import { createVotingRouter } from "./core/VotingRouter.js";
import { getAllPlaylists } from "./playlist/PlaylistLogic.js";
import fs from "node:fs/promises";

// Import Websockets
import { setupWebSocket } from "./websocket/WebsocketLogic.js";

// Import Notification Job
import { runNotificationJob } from "./notification/NotificationJob.js";

const app = express();
const server = http.createServer(app);

const allowedOrigins = new Set([
    "https://metawave.timofej.ch",
    "https://www.metawave.timofej.ch",
]);

if (process.env.NODE_ENV !== "production") {
   [
      "http://localhost:3000",
      "http://localhost:19006",
      "http://localhost:19000",
      "http://localhost:8081",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:19006",
      "http://host.docker.internal:3000",
      "http://host.docker.internal:19006",
   ].forEach((o) => allowedOrigins.add(o));
}

console.log("CORS allowed origins:", Array.from(allowedOrigins));

// Compression für alle Responses - reduziert Datengröße drastisch
app.use(compression({
  level: 6, // Balanciert zwischen Geschwindigkeit und Kompression
  threshold: 1024, // Komprimiere nur Responses > 1KB
  filter: (req, res) => {
    // Komprimiere keine Audio-Streams
    if (req.path === '/stream') return false;
    return compression.filter(req, res);
  }
}));

app.use(
   cors({
      origin: (origin, callback) => {
         if (process.env.NODE_ENV !== "production") return callback(null, true);

         if (!origin) return callback(null, true);
         if (allowedOrigins.has(origin)) return callback(null, true);
         console.warn("CORS rejected origin:", origin);
         return callback(new Error("Not allowed by CORS"));
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
   })
);

app.use(express.json());

// Root Routes
app.get("/", (req, res) => res.redirect("/swagger"));
setupSwagger(app);

// Adding Routers
app.use("/auth", AuthRouter);
app.use("/stream", StreamRouter);
app.use("/notification", NotificationRouter);
app.use("/playlist", PlaylistRouter);
app.use("/speaker", speakerRouter);
app.use("/voting", createVotingRouter(radio, votingStore));

const recordSongStart = (filename, playId) => {
   try {
      votingStore.recordPlay(filename, playId);
   } catch (error) {
      votingStore.playCountError = true;
      console.error("[Voting] Abspielstart konnte nicht gespeichert werden:", error);
   }
};
radio.on("songStarted", recordSongStart);
if (!radio.isPaused && radio.queue[radio.currentIndex]) recordSongStart(radio.queue[radio.currentIndex].filename, radio.getMeta().playId);

// Setup WebSocket
setupWebSocket(server);

// Launching Server
const PORT = 8000;
server.listen(PORT, async () => {
   startSpeakerBridge(radio);
   const refreshPlaylistProgram = async () => {
      try {
         const programs = await getAllPlaylists();
         let memberships = {};
         if (programs.some(p => p.is_main && p.is_active)) {
            memberships = JSON.parse(await fs.readFile("/songs/playlist_membership.json", "utf8"));
            if (!memberships || Array.isArray(memberships) || typeof memberships !== "object" ||
                Object.values(memberships).some(ids => !Array.isArray(ids) || ids.some(id => typeof id !== "string"))) {
               throw new Error("Ungültige Playlist-Zuordnungen");
            }
         }
         if (!radio.updatePlaylistProgram(programs, memberships) && programs.some(p => p.is_main && p.is_active) &&
             !radio.pendingSpeaker && !radio.speakerEpisode) {
            console.warn("[Playlist] Hauptplaylist noch nicht synchronisiert oder ohne abspielbare Titel.");
         }
      } catch (error) {
         console.error("[Playlist] Sendeplan konnte nicht aktualisiert werden:", error.message);
         if (radio.playlistPrograms && radio.playlistMemberships) {
            try {
               radio.updatePlaylistProgram(radio.playlistPrograms, radio.playlistMemberships);
            } catch (cachedError) {
               console.error("[Playlist] Gespeicherter Sendeplan konnte nicht angewendet werden:", cachedError.message);
            }
         }
      }
   };
   refreshPlaylistProgram();
   setInterval(refreshPlaylistProgram, 15_000);
   console.log(`MetaWave Live Radio läuft auf Port ${PORT}`);
   console.log(`Swagger UI: http://localhost:${PORT}/swagger`);

   // Run Notification Job at startup to ensure current token exists
   try {
      const startupToken = await runNotificationJob();
      console.log(`Aktueller MetaWave Code: ${startupToken || "nicht verfügbar"}`);
   } catch (err) {
      console.error("Failed to run NotificationJob at startup:", err);
      console.log("Aktueller MetaWave Code: nicht verfügbar");
   }

    // Schedule monthly job: at 06:00 on day 1 of every month
    try {
       cron.schedule("0 6 1 * *", async () => {
          console.log("Running monthly NotificationJob...");
          try {
             await runNotificationJob();
          } catch (err) {
             console.error("Monthly NotificationJob failed:", err);
          }
       });
       console.log("Monthly NotificationJob scheduled: 06:00 on day 1 of each month");
    } catch (err) {
       console.error("Failed to schedule monthly NotificationJob:", err);
    }
});