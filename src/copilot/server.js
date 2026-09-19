/**
 * Local REST & Teams Copilot Bridge Server.
 * Stage 7 implementation for TELECOM_3D_reviwer.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockPlantModel } from '../../demo/mock_plant_model.js';
import { AuditLogger } from '../recorder/audit_logger.js';
import { TeamsCopilotAdapter } from './copilot_adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const plantModel = createMockPlantModel();
const auditLogger = new AuditLogger(plantModel);
const copilotAdapter = new TeamsCopilotAdapter(plantModel, auditLogger);

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // JSON helper
  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // Body parser helper
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
    return sendJson(200, { status: 'healthy', version: '1.0.0-experimental', timestamp: new Date().toISOString() });
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
      const prompt = body.prompt || body.intent;
      const previewRes = copilotAdapter.actionPreviewRoute(prompt);
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

  // Static File Serving (fallback to index.html or files in rootDir)
  let filePath = path.join(rootDir, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(rootDir, 'index.html');
  }

  if (fs.existsSync(filePath)) {
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
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[TELECOM 3D REVIEWER] Server running at http://localhost:${PORT}`);
});
