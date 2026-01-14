export async function initWebSocket(server, radio) {
  const WebSocket = await import("ws");
  const wss = new WebSocket.Server({ server });

  wss.on("connection", ws => {
    console.log("WebSocket client connected");

    const sendMeta = meta => ws.send(JSON.stringify({ type: "meta", data: meta }));
    radio.on("meta", sendMeta);

    ws.on("close", () => {
      radio.off("meta", sendMeta);
    });
  });
}