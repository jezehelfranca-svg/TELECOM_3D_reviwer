/**
 * Local REST & Teams Copilot Bridge Server with Real Cactus-Needle Foundation Model Integration.
 * Stage 7 & Needle Upgrade implementation for TELECOM_3D_reviwer.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createMockPlantModel } from '../../demo/mock_plant_model.js';
import { AuditLogger } from '../recorder/audit_logger.js';
import { TeamsCopilotAdapter } from './copilot_adapter.js';
import { NeedleIntentParser } from '../needle/needle_assistant.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const plantModel = createMockPlantModel();
const auditLogger = new AuditLogger(plantModel);
const copilotAdapter = new TeamsCopilotAdapter(plantModel, auditLogger);

const PORT = process.env.PORT || 3000;
const NEEDLE_SIDECAR_PORT = process.env.NEEDLE_PORT || 5005;

// -----------------------------------------------------------------------------
// Cactus-Needle Engine Bridge Helpers
// -----------------------------------------------------------------------------

async function checkSidecarHealth() {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: NEEDLE_SIDECAR_PORT,
      path: '/health',
      method: 'GET',
      timeout: 1000
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ active: parsed.status === 'ready', sidecar: parsed });
        } catch {
          resolve({ active: false });
        }
      });
    });
    req.on('error', () => resolve({ active: false }));
    req.on('timeout', () => { req.destroy(); resolve({ active: false }); });
    req.end();
  });
}

async function callNeedleSidecarHttp(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    const req = http.request({
      hostname: '127.0.0.1',
      port: NEEDLE_SIDECAR_PORT,
      path: '/predict',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Needle sidecar HTTP timeout')); });
    req.write(data);
    req.end();
  });
}

async function callNeedleCli(query) {
  const pythonScript = path.join(rootDir, 'src/needle/needle_service.py');
  const { stdout } = await execFileAsync('python', [pythonScript, query], { timeout: 20000 });
  return JSON.parse(stdout);
}

export async function resolveNeedleIntent(prompt) {
  // 1. Try persistent Python HTTP Sidecar (ultra-fast resident model)
  try {
    const res = await callNeedleSidecarHttp(prompt);
    if (res && res.intent) {
      return { execution_tier: 'SIDECAR_HTTP', ...res };
    }
  } catch (err) {
    // Sidecar not available, attempt CLI fallback
  }

  // 2. Try direct Python CLI execution
  try {
    const res = await callNeedleCli(prompt);
    if (res && res.intent) {
      return { execution_tier: 'CLI_SPAWN', ...res };
    }
  } catch (err) {
    // Python CLI not available, fallback to internal JS regex
  }

  // 3. Fallback to client-side JS Regex Intent Parser
  const parsed = NeedleIntentParser.parseRequest(prompt);
  return {
    execution_tier: 'JS_REGEX_FALLBACK',
    engine: 'javascript-fallback',
    version: '1.0.0',
    query: prompt,
    success: true,
    confidence: parsed.confidence,
    prefill_tps: 0,
    decode_tps: 0,
    peak_ram_mb: 0,
    reasoning: 'Fallback deterministic pattern parser (Python Needle runtime unavailable).',
    tool_calls: [],
    intent: parsed.intent,
    evidence: parsed.evidence
  };
}

// -----------------------------------------------------------------------------
// HTTP Server & Routing
// -----------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    let pathname = '/';
    try {
      const host = req.headers.host || `localhost:${PORT}`;
      const parsedUrl = new URL(req.url || '/', `http://${host}`);
      pathname = parsedUrl.pathname;
    } catch {
      pathname = '/';
    }

  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const getBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });

  // REST API Endpoints
  if (pathname === '/api/health' && req.method === 'GET') {
    const sidecar = await checkSidecarHealth();
    return sendJson(200, {
      status: 'healthy',
      version: '1.1.0-experimental-needle',
      needle_sidecar_active: sidecar.active,
      needle_sidecar_info: sidecar.sidecar || null,
      timestamp: new Date().toISOString()
    });
  }

  if (pathname === '/api/needle/status' && req.method === 'GET') {
    const sidecar = await checkSidecarHealth();
    return sendJson(200, sidecar);
  }

  if (pathname === '/api/needle/predict' && req.method === 'POST') {
    try {
      const body = await getBody();
      const prompt = body.query || body.prompt || '';
      const result = await resolveNeedleIntent(prompt);
      return sendJson(200, result);
    } catch (err) {
      return sendJson(500, { error: err.message });
    }
  }

  if (pathname === '/api/copilot/action' && req.method === 'POST') {
    try {
      const body = await getBody();
      const result = await copilotAdapter.handleCopilotAction(body.action, body.parameters || {});
      return sendJson(200, result);
    } catch (err) {
      return sendJson(400, { status: 'ERROR', message: err.message });
    }
  }

  if (pathname === '/api/route/preview' && req.method === 'POST') {
    try {
      const body = await getBody();
      let prompt = body.prompt || body.query;
      let intent = body.intent;
      let evidence = body.evidence;
      let needleTelemetry = null;

      if (!intent && prompt) {
        // Resolve with real Cactus-Needle foundation model
        const needleRes = await resolveNeedleIntent(prompt);
        intent = needleRes.intent;
        evidence = needleRes.evidence;
        needleTelemetry = {
          execution_tier: needleRes.execution_tier,
          engine: needleRes.engine,
          version: needleRes.version,
          confidence: needleRes.confidence,
          prefill_tps: needleRes.prefill_tps,
          decode_tps: needleRes.decode_tps,
          peak_ram_mb: needleRes.peak_ram_mb,
          reasoning: needleRes.reasoning,
          tool_calls: needleRes.tool_calls
        };
      }

      const previewRes = copilotAdapter.actionPreviewRoute(intent || prompt, evidence);
      if (needleTelemetry) {
        previewRes.needle_telemetry = needleTelemetry;
        if (previewRes.preview) {
          previewRes.preview.needle_telemetry = needleTelemetry;
        }
      }
      return sendJson(200, previewRes);
    } catch (err) {
      return sendJson(400, { status: 'ERROR', message: err.message });
    }
  }

  if (pathname === '/api/route/apply' && req.method === 'POST') {
    try {
      const body = await getBody();
      const result = auditLogger.applyProposal(body.event_id, { notes: body.notes });
      return sendJson(200, result);
    } catch (err) {
      return sendJson(400, { status: 'ERROR', message: err.message });
    }
  }

  if (pathname === '/api/audit/history' && req.method === 'GET') {
    return sendJson(200, { events: auditLogger.getHistory() });
  }

  if (pathname === '/api/project/state' && req.method === 'GET') {
    return sendJson(200, plantModel);
  }

  // Static File Serving
  let filePath = path.join(rootDir, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(rootDir, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(rootDir, 'index.html');
      }
    } catch {
      filePath = path.join(rootDir, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
  } catch (outerErr) {
    console.error('[TELECOM 3D REVIEWER] Request handler error:', outerErr.message);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }
});

server.on('error', (err) => {
  console.error('[TELECOM 3D REVIEWER] Server error:', err.message);
});

server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) return;
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

process.stdout.on('error', (err) => { if (err.code === 'EPIPE') return; });
process.stderr.on('error', (err) => { if (err.code === 'EPIPE') return; });

process.on('uncaughtException', (err) => {
  console.error('[TELECOM 3D REVIEWER] Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[TELECOM 3D REVIEWER] Unhandled rejection:', reason);
});

process.on('SIGINT', () => {
  console.log('[TELECOM 3D REVIEWER] Shutting down (SIGINT)');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('[TELECOM 3D REVIEWER] Shutting down (SIGTERM)');
  server.close(() => process.exit(0));
});

process.on('exit', (code) => {
  console.log(`[TELECOM 3D REVIEWER] Process exited with code ${code}`);
});

server.listen(PORT, () => {
  console.log(`[TELECOM 3D REVIEWER] Server running at http://localhost:${PORT}`);
  console.log(`[TELECOM 3D REVIEWER] Connected to Cactus-Needle sidecar at port ${NEEDLE_SIDECAR_PORT}`);
});

// Keep event loop active indefinitely
setInterval(() => {
  console.log(`[TELECOM 3D REVIEWER] Heartbeat: server active at ${new Date().toISOString()}`);
}, 5 * 60 * 1000);

if (process.stdin.isTTY === false) {
  process.stdin.resume();
}
