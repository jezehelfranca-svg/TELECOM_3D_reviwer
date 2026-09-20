/**
 * Needle Client: In-App Agent Controller, Deterministic Routing & Commit Gate.
 */
(function(global) {
  'use strict';

  let mtoNeedlePreviewGroup = null;
  let mtoCurrentProposal = null;
  let mtoExecutionTier = 'PATTERN_FALLBACK';
  let mtoSessionId = null;
  const SIDECAR_URL = 'http://127.0.0.1:5005';

  function byId(id) {
    return document.getElementById(id);
  }

  function setBadge(tier, text) {
    const b = byId('mto-needle-badge');
    if (!b) return;
    b.className = 'needle-badge';
    if (tier === 'LOCAL_MODEL') {
      b.classList.add('needle-badge-local');
      b.textContent = text || 'Needle 3.0.2 AI';
    } else if (tier === 'PATTERN_FALLBACK') {
      b.classList.add('needle-badge-fallback');
      b.textContent = text || 'Pattern Fallback';
    } else {
      b.classList.add('needle-badge-offline');
      b.textContent = text || 'Model Unavailable';
    }
  }

  async function checkSidecarHealth() {
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 600);
      const res = await fetch(SIDECAR_URL + '/health', { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        mtoExecutionTier = 'LOCAL_MODEL';
        setBadge('LOCAL_MODEL', 'Needle ' + (data.version || '3.0.2') + ' AI');
        await syncSessionWithSidecar();
        return true;
      }
    } catch (e) {
      // Sidecar not running or unreachable
    }
    mtoExecutionTier = 'PATTERN_FALLBACK';
    setBadge('PATTERN_FALLBACK', 'Pattern Fallback');
    return false;
  }

  async function syncSessionWithSidecar() {
    try {
      const viewerState = ViewerBridge.getState() || {};
      const projectModel = TelecomEngine.buildProjectModelFromViewerState(viewerState);
      const contextToken = ViewerBridge.getContextToken();
      const res = await fetch(SIDECAR_URL + '/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_model: projectModel, context_token: contextToken })
      });
      if (res.ok) {
        const data = await res.json();
        mtoSessionId = data.session_id;
        return mtoSessionId;
      }
    } catch (e) {}
    return null;
  }

  function logTranscript(role, text) {
    const pane = byId('mto-needle-transcript');
    if (!pane) return;
    pane.style.display = 'block';
    const row = document.createElement('div');
    row.className = 'transcript-msg';
    if (role === 'user') {
      row.innerHTML = '<span class="transcript-user">You:</span> ' + escapeHtml(text);
    } else if (role === 'tool') {
      row.innerHTML = '<span class="transcript-tool">⚙ Tool:</span> ' + escapeHtml(text);
    } else if (role === 'finding') {
      row.innerHTML = '<span class="transcript-finding">⚠ Finding:</span> ' + escapeHtml(text);
    } else {
      row.innerHTML = '<span class="transcript-agent">Needle:</span> ' + escapeHtml(text);
    }
    pane.appendChild(row);
    pane.scrollTop = pane.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderNeedle3DPreview(cable, valRes) {
    const scene = ViewerBridge.getScene();
    if (!scene) return;

    if (!mtoNeedlePreviewGroup) {
      mtoNeedlePreviewGroup = ViewerBridge.createGroup();
      if (mtoNeedlePreviewGroup) scene.add(mtoNeedlePreviewGroup);
    }
    if (!mtoNeedlePreviewGroup) return;

    while (mtoNeedlePreviewGroup.children.length > 0) {
      mtoNeedlePreviewGroup.remove(mtoNeedlePreviewGroup.children[0]);
    }

    if (!cable || !cable.waypoints || cable.waypoints.length === 0) return;

    const isValid = valRes && valRes.valid;
    const colorHex = isValid ? '#00f5d4' : '#f43f5e';

    // Draw continuous 3D line
    const lineMesh = ViewerBridge.makeLine(cable.waypoints, colorHex, 6, 0.95);
    if (lineMesh) mtoNeedlePreviewGroup.add(lineMesh);

    // Draw spheres at each waypoint
    for (const wp of cable.waypoints) {
      const sMesh = ViewerBridge.createSphere(0.18, colorHex, 0.6);
      if (sMesh) {
        const v = ViewerBridge.toVec(wp);
        if (v) sMesh.position.copy(v);
        mtoNeedlePreviewGroup.add(sMesh);
      }
    }

    // Draw error pins at violation points
    if (valRes && valRes.findings) {
      for (const f of valRes.findings) {
        if (f.location) {
          const pinMesh = ViewerBridge.createSphere(0.35, '#f43f5e', 0.9);
          if (pinMesh) {
            const v = ViewerBridge.toVec(f.location);
            if (v && ViewerBridge.Vector3) {
              pinMesh.position.copy(v).add(new ViewerBridge.Vector3(0, 1.2, 0));
            }
            mtoNeedlePreviewGroup.add(pinMesh);
          }
        }
      }
    }
  }

  async function handleNeedleRun() {
    const promptInput = byId('mto-needle-prompt');
    const prompt = promptInput ? promptInput.value.trim() : '';
    if (!prompt) return;

    const runBtn = byId('btn-mto-needle-run');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = 'Running Needle Agent...';
    }

    logTranscript('user', prompt);

    const startTime = performance.now();
    let intent = null;
    let confidence = 0.5;
    let reasoning = '';
    let usedTier = mtoExecutionTier;
    let serverToolOutput = null;

    // Check sidecar if marked LOCAL_MODEL or re-check
    if (usedTier === 'LOCAL_MODEL') {
      try {
        if (!mtoSessionId) await syncSessionWithSidecar();
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 25000);
        const res = await fetch(SIDECAR_URL + '/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: mtoSessionId, query: prompt }),
          signal: ctrl.signal
        });
        clearTimeout(tid);
        if (res.ok) {
          const data = await res.json();
          intent = data.intent;
          confidence = data.confidence || 0.85;
          reasoning = data.reasoning || (data.tool_calls && data.tool_calls.length ? JSON.stringify(data.tool_calls[0]) : '');
          serverToolOutput = data.server_tool_output;
          usedTier = 'LOCAL_MODEL';
        }
      } catch (e) {
        usedTier = 'PATTERN_FALLBACK';
        setBadge('PATTERN_FALLBACK');
      }
    }

    // Fallback to local parser if sidecar failed or offline
    if (!intent) {
      usedTier = 'PATTERN_FALLBACK';
      const parsed = TelecomEngine.NeedleIntentParser.parseRequest(prompt);
      intent = parsed.intent;
      confidence = parsed.confidence;
      reasoning = 'Deterministic pattern extraction from natural language prompt.';
      setBadge('PATTERN_FALLBACK');
    }

    const elapsedMs = Math.round(performance.now() - startTime);

    // Get current 3D viewer state and convert to canonical project model
    const viewerState = ViewerBridge.getState() || {};
    const projectModel = TelecomEngine.buildProjectModelFromViewerState(viewerState);
    const contextToken = ViewerBridge.getContextToken();
    const modelHash = TelecomEngine.projectModelHash(projectModel, contextToken);

    // Update Intent Card UI
    const card = byId('mto-needle-intent-card');
    if (card) card.style.display = 'block';

    const confEl = byId('mto-needle-conf');
    if (confEl) {
      confEl.textContent = Math.round(confidence * 100) + '%';
      confEl.style.color = confidence >= 0.7 ? '#10b981' : (confidence >= 0.4 ? '#f59e0b' : '#ef4444');
    }

    if (byId('mto-int-op')) byId('mto-int-op').textContent = intent.operation || 'route_cable';
    if (byId('mto-int-cable')) byId('mto-int-cable').textContent = intent.cable_type || '--';
    if (byId('mto-int-src')) byId('mto-int-src').textContent = intent.source || '--';
    if (byId('mto-int-dst')) byId('mto-int-dst').textContent = intent.destination || '--';
    if (byId('mto-int-elev')) byId('mto-int-elev').textContent = (intent.elevation_m != null ? intent.elevation_m : 4.2) + 'm AGL';
    if (byId('mto-int-top')) byId('mto-int-top').textContent = intent.topology || 'STAR';

    // Update Honest Telemetry
    if (byId('mto-tel-tier')) byId('mto-tel-tier').textContent = usedTier;
    if (byId('mto-tel-latency')) byId('mto-tel-latency').textContent = elapsedMs + ' ms';
    if (byId('mto-tel-reason')) byId('mto-tel-reason').textContent = reasoning;

    // Handle inspection or explanation requests
    if (intent.operation === 'inspect_object') {
      const queryTag = String(intent.source || intent.device_tag || intent.target || '').trim().toUpperCase();
      const dev = serverToolOutput || (projectModel.devices || []).find(d => {
        const dt = String(d.tag || d.label || d.id || '').toUpperCase();
        return dt === queryTag || dt.includes(queryTag) || queryTag.includes(dt);
      });
      if (dev) {
        const loc = dev.location || { x: dev.x, y: dev.y, z: dev.z };
        logTranscript('tool', `inspect_device('${intent.source}') -> Found at (${loc.x}, ${loc.y}, ${loc.z}m) in ${dev.room_id || 'unassigned'}`);
      } else {
        logTranscript('tool', `inspect_device('${intent.source}') -> Device not found in active inventory`);
      }
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run Needle Agent'; }
      return;
    }

    if (intent.operation === 'explain_rule') {
      const rule = TelecomEngine.getRuleById(intent.rule_id);
      if (rule) {
        logTranscript('agent', `Rule [${rule.rule_id}] ${rule.name}: ${rule.description} Ref: ${rule.standards_reference}`);
      } else {
        logTranscript('agent', `Rule code ${intent.rule_id} not found in 11 formal engineering rules.`);
      }
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = 'Run Needle Agent'; }
      return;
    }

    // Execute Deterministic Solver & 11-Rule Validator
    logTranscript('tool', `DeterministicRouteSolver.solveRoute(${intent.source} -> ${intent.destination} @ ${intent.elevation_m ?? 4.2}m)`);

    let cable;
    try {
      const solver = new TelecomEngine.DeterministicRouteSolver(projectModel);
      cable = solver.solveRoute({
        source_id: intent.source,
        destination_id: intent.destination,
        cable_type: intent.cable_type,
        elevation_m: intent.elevation_m,
        topology: intent.topology,
        preferred_path: intent.preferred_path
      });
    } catch (solverErr) {
      logTranscript('finding', `Solver finding: ${solverErr.message}`);
      const valBox = byId('mto-needle-val-box');
      const valBadge = byId('mto-val-badge');
      const valMsg = byId('mto-val-msg');
      const btnApply = byId('btn-mto-needle-apply');
      const btnDiscard = byId('btn-mto-needle-discard');
      if (valBox && valBadge && valMsg) {
        valBox.style.display = 'block';
        valBox.style.background = '#2a0812';
        valBox.style.border = '1px solid #e11d48';
        valBadge.style.color = '#f43f5e';
        valBadge.textContent = '➗ ROUTING FAILED — NO CONTINUOUS PATH';
        valMsg.innerHTML = `<div style="margin-top:3px;color:#fca5a5;">${escapeHtml(solverErr.message)}</div>` +
          `<div style="margin-top:6px;font-size:11px;color:#94a3b8;">DeterministicRouteSolver verified that no continuous cable containment path connects <b>${escapeHtml(intent.source || 'source')}</b> and <b>${escapeHtml(intent.destination || 'destination')}</b>. Verify containment corridors or select an existing corridor route.</div>`;
        if (btnApply) btnApply.style.display = 'none';
        if (btnDiscard) btnDiscard.style.display = 'inline-block';
      }
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.textContent = 'Run Needle Agent';
      }
      return;
    }

    const validator = new TelecomEngine.DeterministicRouteValidator(projectModel);
    const valRes = validator.validateCandidateRoute(cable);

    logTranscript('tool', `DeterministicRouteValidator -> ${valRes.valid ? 'VALID' : 'VIOLATION'} (Passed: ${valRes.passed_rules.length}, Skipped: ${valRes.skipped_rules.length}, Findings: ${valRes.findings.length})`);

    // Render 3D Preview
    renderNeedle3DPreview(cable, valRes);

    // Save active proposal with state snapshot
    mtoCurrentProposal = {
      cable,
      validation: valRes,
      intent,
      modelHash,
      contextToken
    };

    // Update Validation UI Box
    const valBox = byId('mto-needle-val-box');
    const valBadge = byId('mto-val-badge');
    const valMsg = byId('mto-val-msg');
    const btnApply = byId('btn-mto-needle-apply');
    const btnDiscard = byId('btn-mto-needle-discard');

    if (valBox && valBadge && valMsg) {
      valBox.style.display = 'block';
      if (valRes.valid) {
        valBox.style.background = '#022c22';
        valBox.style.border = '1px solid #059669';
        valBadge.style.color = '#10b981';
        valBadge.textContent = '✔ ROUTE VALIDATED — READY TO COMMIT';
        valMsg.innerHTML = `<span style="color:#6ee7b7;">Length: <b>${cable.total_length_m} m</b> (Horiz: ${cable.measured_horizontal_length_m}m, Vert: ${cable.vertical_allowance_length_m}m)</span><br>` +
          `<span style="color:#94a3b8;font-size:10px;">Passed ${valRes.passed_rules.length}/11 rules (${valRes.skipped_rules.length} N/A). 0 errors.</span>`;
        if (btnApply) {
          btnApply.style.display = 'inline-block';
          btnApply.disabled = !ViewerBridge.isEditable();
          btnApply.textContent = ViewerBridge.isEditable() ? 'Apply Validated Route' : 'Read-Only Mode (Cannot Apply)';
        }
        if (btnDiscard) btnDiscard.style.display = 'inline-block';
      } else {
        valBox.style.background = '#2a0812';
        valBox.style.border = '1px solid #e11d48';
        valBadge.style.color = '#f43f5e';
        valBadge.textContent = '✖ ROUTE REJECTED — INVARIANTS VIOLATED';
        const errorsList = valRes.findings.map(f => {
          logTranscript('finding', `[${f.rule_id}] ${f.message}`);
          return `<div style="margin-top:3px;color:#fca5a5;">• <b>${escapeHtml(f.rule_id)}</b>: ${escapeHtml(f.message)}</div>`;
        }).join('');
        valMsg.innerHTML = errorsList;
        if (btnApply) btnApply.style.display = 'none';
        if (btnDiscard) btnDiscard.style.display = 'inline-block';
      }
    }

    if (runBtn) {
      runBtn.disabled = false;
      runBtn.textContent = 'Run Needle Agent';
    }
  }

  function handleNeedleApply() {
    if (!mtoCurrentProposal) return;
    const { cable, validation, modelHash, contextToken } = mtoCurrentProposal;

    // INVARIANT 1: validation.valid === true
    if (!validation || validation.valid !== true) {
      alert('Cannot commit route: Candidate route is invalid.');
      return;
    }

    // INVARIANT 2: zero error findings
    const errors = (validation.findings || []).filter(f => f.severity === 'error');
    if (errors.length > 0) {
      alert(`Cannot commit route: Found ${errors.length} unresolved error findings.`);
      return;
    }

    // INVARIANT 3: 11-rule coverage check
    const formalRules = TelecomEngine.FormalRuleLibrary || [];
    const passedSet = new Set(validation.passed_rules || []);
    const skippedSet = new Set((validation.skipped_rules || []).map(r => r.rule_id));
    for (const r of formalRules) {
      if (!passedSet.has(r.rule_id) && !skippedSet.has(r.rule_id)) {
        alert(`Cannot commit route: Rule ${r.rule_id} is unaccounted for in validation audit.`);
        return;
      }
    }

    // INVARIANT 4: modelHash match
    const currentModel = TelecomEngine.buildProjectModelFromViewerState(ViewerBridge.getState() || {});
    const currentHash = TelecomEngine.projectModelHash(currentModel, ViewerBridge.getContextToken());
    if (currentHash !== modelHash) {
      alert('Cannot commit route: 3D model geometry changed since proposal was generated. Please re-run solver.');
      return;
    }

    // INVARIANT 5: contextToken match
    if (ViewerBridge.getContextToken() !== contextToken) {
      alert('Cannot commit route: Context token mismatch (stale drawing session).');
      return;
    }

    // INVARIANT 6: emit postMessage to parent for 2D Take-off and BOQ commit
    logTranscript('agent', `Committing route ${cable.tag} (${cable.total_length_m}m) to 2D Take-off & BOQ...`);

    window.parent.postMessage({
      type: 'telecom-mto-3d-apply-cable',
      contextToken: contextToken,
      cable: {
        tag: cable.tag,
        cableType: cable.cable_type,
        sourceTag: cable.source_id,
        targetTag: cable.destination_id,
        waypoints: cable.waypoints,
        length_m: cable.total_length_m,
        total_length_m: cable.total_length_m
      },
      validation: validation
    }, '*');

    const btnApply = byId('btn-mto-needle-apply');
    if (btnApply) {
      btnApply.disabled = true;
      btnApply.textContent = '✔ Committed to 2D Take-off & BOQ';
      btnApply.style.background = '#047857';
    }
  }

  function handleNeedleDiscard() {
    if (mtoNeedlePreviewGroup) {
      while (mtoNeedlePreviewGroup.children.length > 0) {
        mtoNeedlePreviewGroup.remove(mtoNeedlePreviewGroup.children[0]);
      }
    }
    mtoCurrentProposal = null;
    const valBox = byId('mto-needle-val-box');
    if (valBox) valBox.style.display = 'none';
    const card = byId('mto-needle-intent-card');
    if (card) card.style.display = 'none';
    logTranscript('agent', 'Proposal discarded.');
  }

  // Bind DOM Event Listeners
  function initNeedleClient() {
    const runBtn = byId('btn-mto-needle-run');
    if (runBtn) runBtn.onclick = handleNeedleRun;

    const applyBtn = byId('btn-mto-needle-apply');
    if (applyBtn) applyBtn.onclick = handleNeedleApply;

    const discardBtn = byId('btn-mto-needle-discard');
    if (discardBtn) discardBtn.onclick = handleNeedleDiscard;

    const chips = document.querySelectorAll('.needle-chip');
    chips.forEach(chip => {
      chip.onclick = () => {
        const p = byId('mto-needle-prompt');
        if (p) {
          p.value = chip.getAttribute('data-prompt') || '';
          p.focus();
        }
      };
    });

    // Check sidecar health asynchronously
    checkSidecarHealth();

    // Listen for parent confirmation
    window.addEventListener('message', event => {
      if (!event.data) return;
      if (event.data.type === 'telecom-mto-3d-cable-applied') {
        if (event.data.ok) {
          logTranscript('agent', `✔ Cable ${event.data.cable?.tag || ''} successfully integrated into 2D drawing & BOQ!`);
        } else {
          logTranscript('finding', `Commit failed: ${event.data.error}`);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNeedleClient);
  } else {
    initNeedleClient();
  }

  global.NeedleClient = {
    run: handleNeedleRun,
    apply: handleNeedleApply,
    discard: handleNeedleDiscard,
    checkSidecarHealth: checkSidecarHealth,
    syncSessionWithSidecar: syncSessionWithSidecar
  };

})(typeof window !== 'undefined' ? window : this);
