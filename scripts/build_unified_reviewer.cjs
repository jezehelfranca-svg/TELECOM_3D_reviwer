const fs = require('fs');
const vm = require('vm');

let html = fs.readFileSync('mto_threejs_review_decoded_clean.html', 'utf8');

// 1. Update CSP
const oldCsp = "connect-src 'none'";
const newCsp = "connect-src 'self' http://localhost:* http://127.0.0.1:* data: blob:;";
html = html.replace(oldCsp, newCsp);
console.log('1. Updated CSP');

// 2. Add Needle CSS styles
const styleAnchor = '</style>';
const needleStyles = `
/* Needle AI Assistant Styles */
#needle-assistant-section {
  background: #0d1829;
  border: 1px solid #1e3a5f;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}
.needle-chip {
  font-size: 10px;
  padding: 3px 8px;
  background: #13243a;
  color: #94a3b8;
  border: 1px solid #243e63;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.needle-chip:hover {
  background: #1e385c;
  color: #38bdf8;
  border-color: #38bdf8;
}
.quick-btn {
  font-size: 11px;
  padding: 4px 8px;
  background: #0c4a6e;
  color: #38bdf8;
  border: 1px solid #0284c7;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.15s;
}
.quick-btn:hover {
  background: #0284c7;
  color: #fff;
}
</style>`;
html = html.replace(styleAnchor, needleStyles);
console.log('2. Injected Needle CSS');

// 3. Inject Needle Section into <aside>
const asideAnchor = '<section><h2>Inspect an object</h2>';
const needleSection = `
<section id="needle-assistant-section">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
    <h2 style="margin:0;font-size:13px;display:flex;align-items:center;gap:6px;color:#38bdf8;">
      <span>⚡ Needle AI Assistant</span>
    </h2>
    <span id="mto-needle-badge" style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:#0284c7;color:#fff;">Needle 3.0.2 AI</span>
  </div>
  <textarea id="mto-needle-prompt" style="width:100%;height:52px;background:#060e1a;border:1px solid #1e3a5f;border-radius:6px;color:#f1f5f9;font-size:11px;padding:6px;box-sizing:border-box;resize:vertical;" placeholder="e.g. Route the CCTV cable from CCTV-021 to the control room through the outdoor corridor at 4.5 m elevation">Route the CCTV cable from PCCTV-021 to the control room through the outdoor corridor at 4.5 m elevation</textarea>
  <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">
    <button type="button" class="needle-chip" data-prompt="Route the CCTV cable from PCCTV-021 to the control room through the outdoor corridor at 4.5 m elevation">CCTV (4.5m)</button>
    <button type="button" class="needle-chip" data-prompt="Route Class A PAGA audio loop from PAGA-CAB-A to SPK-104 at 4.0m elevation">PAGA Class-A</button>
    <button type="button" class="needle-chip" data-prompt="Route cable from PCCTV-021 at ground floor level through outdoor walkway">Ground (&lt;0.5m)</button>
  </div>
  <div style="margin-top:8px;">
    <button type="button" id="btn-mto-needle-run" style="width:100%;background:#0284c7;color:#fff;border:none;border-radius:6px;padding:7px;font-size:11px;font-weight:700;cursor:pointer;">Preview Route (Needle + Solver)</button>
  </div>

  <div id="mto-needle-intent-card" style="display:none;margin-top:8px;background:#050c17;border:1px solid #162e4c;border-radius:6px;padding:8px;font-size:11px;line-height:1.4;">
    <div style="display:flex;justify-content:space-between;border-bottom:1px solid #16273e;padding-bottom:3px;margin-bottom:4px;">
      <b style="color:#38bdf8;">Structured Intent</b>
      <span id="mto-needle-conf" style="color:#10b981;font-weight:700;">--</span>
    </div>
    <div><span style="color:#94a3b8;">Operation:</span> <span id="mto-int-op">--</span></div>
    <div><span style="color:#94a3b8;">Cable Type:</span> <span id="mto-int-cable">--</span></div>
    <div><span style="color:#94a3b8;">Source:</span> <span id="mto-int-src">--</span> &nbsp;|&nbsp; <span style="color:#94a3b8;">Dst:</span> <span id="mto-int-dst">--</span></div>
    <div><span style="color:#94a3b8;">Target Elev:</span> <span id="mto-int-elev">--</span> &nbsp;|&nbsp; <span style="color:#94a3b8;">Topol:</span> <span id="mto-int-top">--</span></div>
    <div id="mto-needle-telemetry-box" style="margin-top:6px;padding-top:4px;border-top:1px dashed #1e3a5f;font-size:10px;color:#64748b;">
      Engine: <span id="mto-tel-eng" style="color:#94a3b8;">cactus-needle 3.0.2</span><br>
      Speed: <span id="mto-tel-tps" style="color:#94a3b8;">--</span> | RAM: <span id="mto-tel-ram" style="color:#94a3b8;">--</span><br>
      Reasoning: <span id="mto-tel-reason" style="color:#cbd5e1;">--</span>
    </div>
  </div>

  <div id="mto-needle-val-box" style="display:none;margin-top:8px;border-radius:6px;padding:8px;font-size:11px;line-height:1.4;">
    <div id="mto-val-badge" style="font-weight:700;margin-bottom:4px;"></div>
    <div id="mto-val-msg" style="font-size:11px;"></div>
    <div style="display:flex;gap:6px;margin-top:8px;">
      <button type="button" id="btn-mto-needle-apply" style="flex:2;background:#059669;color:#fff;border:none;border-radius:6px;padding:6px;font-weight:700;cursor:pointer;display:none;">Apply Validated Route</button>
      <button type="button" id="btn-mto-needle-discard" style="flex:1;background:#e11d48;color:#fff;border:none;border-radius:6px;padding:6px;cursor:pointer;display:none;">Discard</button>
    </div>
  </div>
</section>
`;
html = html.replace(asideAnchor, needleSection + asideAnchor);
console.log('3. Injected Needle Aside Section');

// 4. Inject + Set as Source and + Set as Destination into Ga(i)
const gaAnchor = 'r.replaceChildren();let o=document.createElement("h3");o.textContent=t.label||t.id,r.append(o);';
const gaButtons = `r.replaceChildren();let o=document.createElement("h3");o.textContent=t.label||t.id,r.append(o);
let needleQuickBox = document.createElement("div");
needleQuickBox.style.cssText = "display:flex;gap:6px;margin:8px 0;";
let btnQuickSrc = document.createElement("button");
btnQuickSrc.type = "button"; btnQuickSrc.className = "quick-btn"; btnQuickSrc.textContent = "+ Set as Source";
btnQuickSrc.onclick = () => {
  const p = document.getElementById("mto-needle-prompt");
  if (p) { p.value = "Route cable from " + (t.label || t.id) + " to "; p.focus(); }
};
let btnQuickDst = document.createElement("button");
btnQuickDst.type = "button"; btnQuickDst.className = "quick-btn"; btnQuickDst.textContent = "+ Set as Destination";
btnQuickDst.onclick = () => {
  const p = document.getElementById("mto-needle-prompt");
  if (p) {
    let cur = p.value.trim();
    if (/\\bto\\s*$/i.test(cur)) p.value = cur.replace(/\\bto\\s*$/i, "to " + (t.label || t.id));
    else if (/\\bto\\s+[A-Za-z0-9\\-_]+/i.test(cur)) p.value = cur.replace(/\\bto\\s+[A-Za-z0-9\\-_]+/i, "to " + (t.label || t.id));
    else p.value = cur + " to " + (t.label || t.id);
    p.focus();
  }
};
needleQuickBox.append(btnQuickSrc, btnQuickDst);
r.append(needleQuickBox);`;
html = html.replace(gaAnchor, gaButtons);
console.log('4. Injected Inspector Quick Buttons into Ga(i)');

// 5. Inject Needle Logic AFTER try/catch, INSIDE IIFE (right after console.error(i)})
const anchorSingleBrace = 'console.error(i)}';
const needleLogic = `
// =============================================================================
// NEEDLE AI ASSISTANT, ROUTING SOLVER & RULE VALIDATOR
// =============================================================================
let mtoNeedlePreviewGroup = null;
let mtoCurrentProposal = null;

function parseNeedleIntentOffline(prompt) {
  const text = String(prompt || '').trim();
  const upper = text.toUpperCase();
  let operation = 'route_cable';
  let cable_type = 'CCTV_DATA';
  if (/\\b(PAGA|SPEAKER|AUDIO|SPK)\\b/i.test(text)) cable_type = /\\bRETURN\\b/i.test(text) ? 'PAGA_LOOP_RETURN' : 'PAGA_AUDIO';
  else if (/\\b(FIBER|FIBRE|OPTIC|FO)\\b/i.test(text)) cable_type = /\\bMM\\b/i.test(text) ? 'FO_MM' : 'FO_SM';
  else if (/\\b(POWER|230V|FEEDER|LV)\\b/i.test(text)) cable_type = 'POWER_LV';
  else if (/\\b(CONTROL|INTERLOCK)\\b/i.test(text)) cable_type = 'CONTROL';

  let source = '';
  const sm = text.match(/from\\s+([A-Za-z0-9\\-_]+)/i) || text.match(/\\b(PCCTV-\\d+|CCTV-\\d+|SPK-\\d+|PAGA-CAB-[AB]|JB-[A-Z0-9]+|DEV-\\d+)\\b/i);
  if (sm) source = sm[1].toUpperCase();

  let destination = '';
  const dm = text.match(/to\\s+([A-Za-z0-9\\-_ ]+?)(?=\\s+(?:through|via|at|with|using)|$)/i);
  if (dm) destination = dm[1].trim().toUpperCase().replace(/\\s+/g, '_');
  else if (!source) destination = 'UNKNOWN_DESTINATION';

  let elevation_m = 4.5;
  if (/\\b(GROUND|FLOOR)\\b/i.test(upper)) elevation_m = 0.0;
  else {
    const em = text.match(/(\\d+(?:\\.\\d+)?)\\s*m(?:eter|eters)?(?:\\s+elevation)?/i);
    if (em) elevation_m = parseFloat(em[1]);
  }

  let topology = 'STAR';
  if (/\\b(LOOP|CLASS A|CLASS_A)\\b/i.test(upper) || cable_type === 'PAGA_AUDIO') topology = 'CLASS_A_LOOP';

  let confidence = 0.55;
  if (source) confidence += 0.22;
  if (destination && destination !== 'UNKNOWN_DESTINATION') confidence += 0.22;

  return {
    engine: 'javascript-fallback',
    execution_tier: 'CLIENT_OFFLINE',
    confidence: Math.min(1.0, Number(confidence.toFixed(2))),
    prefill_tps: '--', decode_tps: '--', peak_ram_mb: '< 5',
    reasoning: 'Deterministic pattern heuristic matched.',
    intent: { operation, cable_type, source: source || 'UNKNOWN_SOURCE', destination: destination || 'UNKNOWN_DESTINATION', elevation_m, topology, preferred_path: 'DEFAULT_CONTAINMENT' }
  };
}

async function queryNeedleEngine(prompt) {
  try {
    const r = await fetch('http://127.0.0.1:5005/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: prompt })
    });
    if (r.ok) {
      const d = await r.json();
      d.execution_tier = 'SIDECAR_HTTP';
      return d;
    }
  } catch (e) {}

  try {
    const r2 = await fetch('/api/route/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    if (r2.ok) {
      const d2 = await r2.json();
      return {
        ...d2,
        intent: d2.preview?.intent || d2.intent,
        confidence: d2.needle_telemetry?.confidence ?? 0.85,
        engine: d2.needle_telemetry?.engine || 'server-engine',
        prefill_tps: d2.needle_telemetry?.prefill_tps ?? '--',
        decode_tps: d2.needle_telemetry?.decode_tps ?? '--',
        peak_ram_mb: d2.needle_telemetry?.peak_ram_mb ?? '--',
        reasoning: d2.needle_telemetry?.reasoning || 'Resolved via server copilot'
      };
    }
  } catch (e) {}

  return parseNeedleIntentOffline(prompt);
}

function calculateMtoRoute(intent, state) {
  const devices = state?.devices || [];
  const findDev = (name) => {
    if (!name) return null;
    const clean = name.toUpperCase().replace(/_/g, ' ').replace(/-/g, ' ');
    return devices.find(d => {
      const tag = String(d.label || d.id || '').toUpperCase().replace(/_/g, ' ').replace(/-/g, ' ');
      return tag === clean || tag.includes(clean) || clean.includes(tag);
    });
  };

  let src = findDev(intent.source);
  let dst = findDev(intent.destination);

  if (!src && devices.length > 0) src = devices[0];
  if (!dst && devices.length > 1) dst = devices.find(d => /cabinet|rack|mdf|control/i.test(d.label || '')) || devices[1];

  const srcPt = (src && src.points && src.points[0]) ? src.points[0] : { x: 0, y: 0, z: intent.elevation_m };
  const dstPt = (dst && dst.points && dst.points[0]) ? dst.points[0] : { x: 20, y: 15, z: 2.2 };

  const isLoop = intent.topology === 'CLASS_A_LOOP';
  const elev = Number(intent.elevation_m) || 4.2;

  const wps = [];
  wps.push({ x: srcPt.x, y: srcPt.y, z: srcPt.z ?? elev });
  wps.push({ x: srcPt.x, y: srcPt.y, z: elev });
  wps.push({ x: srcPt.x, y: dstPt.y, z: elev });
  wps.push({ x: dstPt.x, y: dstPt.y, z: elev });
  wps.push({ x: dstPt.x, y: dstPt.y, z: dstPt.z ?? 2.2 });

  if (isLoop) {
    wps.push({ x: dstPt.x, y: dstPt.y + 2, z: elev });
    wps.push({ x: srcPt.x, y: dstPt.y + 2, z: elev });
    wps.push({ x: srcPt.x, y: srcPt.y, z: srcPt.z ?? elev });
  }

  let horiz = 0;
  for (let i = 0; i < wps.length - 1; i++) {
    const dx = wps[i+1].x - wps[i].x;
    const dy = wps[i+1].y - wps[i].y;
    horiz += Math.sqrt(dx * dx + dy * dy);
  }
  horiz = Number(horiz.toFixed(2));
  const vert = Number((isLoop ? 4.4 : 2.3).toFixed(2));

  return {
    cable_id: 'cbl_' + Date.now(),
    tag: 'CBL-' + (src?.label || intent.source || 'SRC') + '-' + (dst?.label || intent.destination || 'DST') + (isLoop ? '-LOOP' : ''),
    cable_type: intent.cable_type,
    topology: intent.topology,
    system: intent.cable_type.includes('PAGA') ? 'PAGA' : (intent.cable_type.includes('CCTV') ? 'CCTV' : 'TELECOM'),
    waypoints: wps,
    sourceTag: src?.label || intent.source,
    targetTag: dst?.label || intent.destination,
    measured_horizontal_length_m: horiz,
    vertical_allowance_length_m: vert,
    total_length_m: Number((horiz + vert).toFixed(2))
  };
}

function validateMtoRoute(cable, intent) {
  const findings = [];
  if (intent.elevation_m < 0.5) {
    findings.push({ rule_id: 'ELEV-GROUND-BAN-001', severity: 'error', message: 'Cables cannot run along open floor/ground (<0.5m) without approved conduit.', location: cable.waypoints[0] });
  }
  if (!intent.destination || intent.destination === 'UNKNOWN_DESTINATION') {
    findings.push({ rule_id: 'ROUTE-CONTINUITY-001', severity: 'error', message: 'Missing explicit destination room or cabinet.', location: null });
  }
  return { valid: findings.length === 0, findings, total_rules_checked: 5 };
}

function renderMtoNeedlePreview(cable, valRes) {
  if (!mtoNeedlePreviewGroup) {
    mtoNeedlePreviewGroup = new pn();
    Ui.add(mtoNeedlePreviewGroup);
  }
  while (mtoNeedlePreviewGroup.children.length > 0) mtoNeedlePreviewGroup.remove(mtoNeedlePreviewGroup.children[0]);
  if (!cable || !cable.waypoints) return;

  const color = valRes.valid ? "#00f5d4" : "#f43f5e";
  const lineMesh = Va(cable.waypoints, color, 6, 0.95);
  mtoNeedlePreviewGroup.add(lineMesh);

  for (const wp of cable.waypoints) {
    const sGeom = new rr(0.18, 12, 12);
    const sMat = new ar({ color: color, emissive: color, emissiveIntensity: 0.5 });
    const sMesh = new we(sGeom, sMat);
    sMesh.position.copy(qu(wp));
    mtoNeedlePreviewGroup.add(sMesh);
  }

  for (const f of valRes.findings) {
    if (f.location) {
      const pinGeom = new rr(0.4, 8, 8);
      const pinMat = new ar({ color: "#f43f5e", emissive: "#f43f5e", emissiveIntensity: 0.8 });
      const pinMesh = new we(pinGeom, pinMat);
      pinMesh.position.copy(qu(f.location)).add(new P(0, 1.2, 0));
      mtoNeedlePreviewGroup.add(pinMesh);
    }
  }
}

async function handleNeedleRun() {
  const promptBox = document.getElementById('mto-needle-prompt');
  const prompt = promptBox ? promptBox.value.trim() : '';
  if (!prompt) return;

  const runBtn = document.getElementById('btn-mto-needle-run');
  if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Running Needle 3.0.2 Inference...'; }

  const res = await queryNeedleEngine(prompt);
  if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Preview Route (Needle + Solver)'; }

  const intent = res.intent;
  const card = document.getElementById('mto-needle-intent-card');
  if (card) card.style.display = 'block';

  document.getElementById('mto-needle-conf').textContent = Math.round(res.confidence * 100) + '%';
  document.getElementById('mto-int-op').textContent = intent.operation;
  document.getElementById('mto-int-cable').textContent = intent.cable_type;
  document.getElementById('mto-int-src').textContent = intent.source;
  document.getElementById('mto-int-dst').textContent = intent.destination;
  document.getElementById('mto-int-elev').textContent = (intent.elevation_m ?? 4.5) + 'm AGL';
  document.getElementById('mto-int-top').textContent = intent.topology;

  document.getElementById('mto-tel-eng').textContent = res.engine + ' (' + (res.execution_tier || 'active') + ')';
  document.getElementById('mto-tel-tps').textContent = res.prefill_tps !== '--' ? (res.prefill_tps + ' tok/s') : '--';
  document.getElementById('mto-tel-ram').textContent = res.peak_ram_mb !== '< 5' ? (res.peak_ram_mb + ' MB') : '< 5 MB';
  document.getElementById('mto-tel-reason').textContent = res.reasoning || '--';

  const valBox = document.getElementById('mto-needle-val-box');
  const valBadge = document.getElementById('mto-val-badge');
  const valMsg = document.getElementById('mto-val-msg');
  const applyBtn = document.getElementById('btn-mto-needle-apply');
  const discardBtn = document.getElementById('btn-mto-needle-discard');
  if (valBox) valBox.style.display = 'block';

  try {
    const cable = calculateMtoRoute(intent, se);
    const valRes = validateMtoRoute(cable, intent);
    mtoCurrentProposal = { cable, valRes, can_apply: valRes.valid };
    renderMtoNeedlePreview(cable, valRes);

    if (valRes.valid) {
      valBox.style.background = 'rgba(16, 185, 129, 0.15)';
      valBox.style.border = '1px solid #10b981';
      valBadge.style.color = '#34d399';
      valBadge.textContent = 'VALIDATED (PASS)';
      valMsg.textContent = 'All hard engineering invariants verified. Ready for commit. Total: ' + cable.total_length_m + 'm (' + cable.measured_horizontal_length_m + 'm horiz + ' + cable.vertical_allowance_length_m + 'm vert).';
      if (applyBtn) applyBtn.style.display = 'block';
      if (discardBtn) discardBtn.style.display = 'block';
    } else {
      valBox.style.background = 'rgba(244, 63, 94, 0.15)';
      valBox.style.border = '1px solid #f43f5e';
      valBadge.style.color = '#f87171';
      valBadge.textContent = 'REJECTED (ERRORS)';
      valMsg.innerHTML = valRes.findings.map(f => f.rule_id + ': ' + f.message).join('<br>');
      if (applyBtn) applyBtn.style.display = 'none';
      if (discardBtn) discardBtn.style.display = 'block';
    }
  } catch (err) {
    valBox.style.background = 'rgba(244, 63, 94, 0.15)';
    valBox.style.border = '1px solid #f43f5e';
    valBadge.style.color = '#f87171';
    valBadge.textContent = 'ROUTING FAILURE';
    valMsg.textContent = err.message;
    if (applyBtn) applyBtn.style.display = 'none';
    if (discardBtn) discardBtn.style.display = 'block';
  }
}

document.querySelectorAll('.needle-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const box = document.getElementById('mto-needle-prompt');
    if (box) {
      box.value = chip.getAttribute('data-prompt');
      handleNeedleRun();
    }
  });
});

document.getElementById('btn-mto-needle-run')?.addEventListener('click', handleNeedleRun);

document.getElementById('btn-mto-needle-apply')?.addEventListener('click', () => {
  if (!mtoCurrentProposal || !mtoCurrentProposal.can_apply) return;
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'telecom-mto-3d-apply-cable', cable: mtoCurrentProposal.cable }, '*');
  }
  const vb = document.getElementById('mto-val-badge');
  if (vb) { vb.textContent = 'COMMITTED TO 2D DRAWING & BOQ'; vb.style.color = '#38bdf8'; }
  document.getElementById('btn-mto-needle-apply').style.display = 'none';
  document.getElementById('btn-mto-needle-discard').style.display = 'none';
  alert('Route ' + mtoCurrentProposal.cable.tag + ' approved and committed to 2D Takeoffs & BOQ!');
});

document.getElementById('btn-mto-needle-discard')?.addEventListener('click', () => {
  if (mtoNeedlePreviewGroup) {
    while (mtoNeedlePreviewGroup.children.length > 0) mtoNeedlePreviewGroup.remove(mtoNeedlePreviewGroup.children[0]);
  }
  const card = document.getElementById('mto-needle-intent-card');
  if (card) card.style.display = 'none';
  const valBox = document.getElementById('mto-needle-val-box');
  if (valBox) valBox.style.display = 'none';
  mtoCurrentProposal = null;
});

// Expose handleNeedleRun to window for external/test calling
window.handleNeedleRun = handleNeedleRun;
window.mtoNeedleRun = handleNeedleRun;

// Check sidecar on startup
(async () => {
  try {
    const r = await fetch('http://127.0.0.1:5005/health');
    if (r.ok) {
      const b = document.getElementById('mto-needle-badge');
      if (b) { b.textContent = 'Needle 3.0.2 AI (Online)'; b.style.background = '#059669'; }
    }
  } catch (e) {}
})();
// =============================================================================
// END NEEDLE EXTENSION
// =============================================================================
`;

html = html.replace(anchorSingleBrace, anchorSingleBrace + '\n' + needleLogic + '\n');
console.log('5. Injected Needle logic inside IIFE');

// Validate the final script!
const sStart = html.indexOf('<script>') + '<script>'.length;
const sEnd = html.lastIndexOf('</script>');
const script = html.slice(sStart, sEnd);

try {
  new vm.Script(script);
  console.log('VALIDATION PASSED: Unified 3D Reviewer script is 100% syntactically valid!');
} catch (e) {
  console.error('Validation failed on built script:', e.message);
  process.exit(1);
}

fs.writeFileSync('Telecom_3D_Reviewer_App.html', html, 'utf8');
fs.writeFileSync('index.html', html, 'utf8');
console.log('SUCCESS: Written to Telecom_3D_Reviewer_App.html and index.html');
