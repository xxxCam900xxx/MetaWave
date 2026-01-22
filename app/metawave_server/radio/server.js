import express from "express";
import http from "http";
import cors from "cors";
import { currentcode } from "./middleware/AuthLogic.js";
import { setupSwagger } from "./swagger/SwaggerLogic.js";

// Import Routers
import StreamRouter from "./core/RadioEngineRouter.js";
import AuthRouter from "./middleware/AuthRouter.js";
import NotificationRouter from "./notification/NotificationRouter.js";

// Import Websockets
import { setupWebSocket } from "./websocket/WebsocketLogic.js";

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Root Routes
app.get("/", (req, res) => res.redirect("/swagger"));
setupSwagger(app);

// Adding Routers
app.use("/auth", AuthRouter);
app.use("/stream", StreamRouter);
app.use("/notification", NotificationRouter);

// Setup WebSocket
setupWebSocket(server);

// Launching Server
const PORT = 8000;
server.listen(PORT, async () => {
   console.log(`MetaWave Live Radio läuft auf Port ${PORT}`);
   console.log(`Swagger UI: http://localhost:${PORT}/swagger`);
   console.log(`Aktueller MetaWave Code: ${currentcode()}`);
});