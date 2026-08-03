/**
 * @file prototype-intake-card.ts
 * @description Local prototype runner script launching a zero-dependency HTTP preview server on port 3000 to display the Issue #121 Contextual Intake UI Card prototype.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

const PORT = 3000;
const HTML_PATH = path.join(__dirname, "../src/prototypes/contextual-intake-card-prototype.html");

if (!fs.existsSync(HTML_PATH)) {
  console.error("Error: Prototype HTML file not found at " + HTML_PATH);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const content = fs.readFileSync(HTML_PATH, "utf-8");
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(content);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}?variant=A`;
  console.log("====================================================");
  console.log("  PROTOTYPE RUNNER — Issue #121 Intake UI Card");
  console.log("====================================================");
  console.log(`Server listening on ${url}`);
  console.log("Variants available: ?variant=A, ?variant=B, ?variant=C");
  console.log("Press Ctrl+C to stop.");
  console.log("====================================================");

  // Auto-open browser on Windows if supported
  if (process.platform === "win32") {
    exec(`start ${url}`);
  }
});
