#!/usr/bin/env node
// Test OpenClaw chat with Ollama via WebSocket
// Usage: node test-ollama-chat.js

const WebSocket = require("ws");
const crypto = require("crypto");
const http = require("http");

const TOKEN = "d30caef5e76ea02268349446c24babc21d59db6b1d8eccb1612924eef40222b3";
const OLLAMA_URL = "http://localhost:11434";
const GW_URL = "ws://127.0.0.1:3000";

// Step 1: Test Ollama directly
console.log("=== STEP 1: Testing Ollama directly ===");
const reqData = JSON.stringify({
  model: "gemma4",
  messages: [{ role: "user", content: "say hi" }],
  max_tokens: 20,
  stream: false
});

const ollamaReq = http.request(OLLAMA_URL + "/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Content-Length": reqData.length },
  timeout: 60000
}, (res) => {
  let body = "";
  res.on("data", (d) => body += d);
  res.on("end", () => {
    try {
      const d = JSON.parse(body);
      console.log("Ollama OK:", d.choices[0].message.content);
    } catch (e) {
      console.log("Ollama parse error:", body.substring(0, 200));
    }
    // Step 2: Test WebSocket
    testWebSocket();
  });
});
ollamaReq.on("error", (e) => { console.log("Ollama FAIL:", e.message); process.exit(1); });
ollamaReq.write(reqData);
ollamaReq.end();

function testWebSocket() {
  console.log("\n=== STEP 2: Testing OpenClaw WebSocket ===");
  const ws = new WebSocket(GW_URL + "/embed?token=" + TOKEN);
  let msgCount = 0;

  ws.on("open", () => console.log("WS: connected"));

  ws.on("message", (raw) => {
    msgCount++;
    let msg;
    try { msg = JSON.parse(raw); } catch { console.log("WS: non-JSON:", raw.toString().substring(0, 100)); return; }

    const event = msg.event || (msg.type === "event" ? msg.event : null);
    const method = msg.method;

    // Challenge-response auth
    if (event === "connect.challenge") {
      const nonce = msg.payload ? msg.payload.nonce : msg.nonce;
      console.log("WS: challenge received, responding...");
      const response = crypto.createHmac("sha256", TOKEN).update(nonce).digest("hex");
      ws.send(JSON.stringify({ type: "event", event: "connect.response", payload: { response } }));
      return;
    }

    if (event === "connect.ready") {
      console.log("WS: authenticated!");
      // Send chat
      const chatMsg = { jsonrpc: "2.0", method: "chat.send", params: { message: "say hello in one word" }, id: "test-1" };
      console.log("WS: sending chat.send...");
      ws.send(JSON.stringify(chatMsg));
      return;
    }

    // RPC response to our chat.send
    if (msg.id === "test-1") {
      console.log("WS: chat.send acknowledged:", JSON.stringify(msg).substring(0, 200));
      return;
    }

    // Chat response chunks
    if (method === "chat.chunk" || method === "chat.delta" || method === "embedded.chunk") {
      const text = msg.params?.text || msg.params?.content || msg.params?.delta || "";
      process.stdout.write(text);
      return;
    }

    if (method === "chat.end" || method === "chat.complete" || method === "embedded.end") {
      console.log("\nWS: === CHAT COMPLETE ===");
      ws.close();
      process.exit(0);
      return;
    }

    if (method === "embedded.error" || msg.error) {
      console.log("WS: ERROR:", JSON.stringify(msg.error || msg.params).substring(0, 500));
      ws.close();
      process.exit(1);
      return;
    }

    // Log everything else
    console.log("WS: [" + (method || event || msg.type || "?") + "]", JSON.stringify(msg).substring(0, 200));
  });

  ws.on("error", (e) => { console.log("WS: connection error:", e.message); process.exit(1); });
  ws.on("close", (code, reason) => { console.log("WS: closed code=" + code); });

  setTimeout(() => {
    console.log("\nWS: TIMEOUT 120s - messages received:", msgCount);
    // Check Ollama logs
    const { execSync } = require("child_process");
    try {
      const logs = execSync("journalctl -u ollama --since '2 min ago' --no-pager 2>/dev/null | grep GIN | tail -5").toString();
      console.log("Ollama access log:\n" + logs);
    } catch {}
    process.exit(2);
  }, 120000);
}
