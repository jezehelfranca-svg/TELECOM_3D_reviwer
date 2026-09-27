/**
 * Route graph loader: lets "Open project JSON" also open a Telecom MTO route graph
 * export (route-graph-page-<N>.json). Spliced by scripts/build_unified_reviewer.cjs
 * inside the viewer's closure, so it calls the viewer's own loader (Ps), status and
 * error helpers (fe, Ni), element lookup (ut) and selection (ui, Ga).
 *
 * Project sessions load exactly as before. A route graph is rebuilt into a read-only
 * session by RouteGraphImport and shown with a panel of its findings and circuits.
 */
(function installRouteGraphImport() {
  'use strict';
  if (typeof RouteGraphImport === 'undefined' || typeof ut !== 'function' || typeof Ps !== 'function') return;
  const fileInput = ut('file');
  if (!fileInput) return;
  const MAX_BYTES = 50 * 1024 * 1024;
  const SEVERITY_ORDER = ['BLOCK', 'REVIEW', 'INFO'];

  const panel = document.createElement('section');
  panel.id = 'route-graph-panel';
  panel.hidden = true;
  const warningsSection = ut('warning-details') ? ut('warning-details').closest('section') : null;
  if (warningsSection && warningsSection.parentNode) warningsSection.parentNode.insertBefore(panel, warningsSection);

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  // Selects the most specific scene object whose record id is among the given ids:
  // a device, node, cable or containment before a building or zone outline.
  function selectFirst(ids) {
    if (typeof ui === 'undefined' || typeof Ga !== 'function') return false;
    const wanted = new Set(ids.map(String));
    const matches = ui.filter((object) => object && object.userData && object.userData.item && wanted.has(String(object.userData.item.id)));
    const hit = matches.find((object) => object.userData.kind !== 'footprints') || matches[0];
    if (!hit) return false;
    Ga(hit.userData.key);
    const list = ut('object-list');
    if (list) list.value = hit.userData.key;
    return true;
  }

  function hidePanel() {
    panel.hidden = true;
    panel.replaceChildren();
  }

  function renderPanel(meta) {
    panel.replaceChildren();
    panel.hidden = false;
    panel.append(element('h2', 'Route graph (read-only)'));
    const summary = element('p', `Graph v${meta.schemaVersion} · rules ${meta.ruleSetVersion || '—'} · page ${meta.page} · ${meta.counts.nodes} nodes · ${meta.counts.edges} edges · ${meta.counts.buildings} building envelope(s) · ${meta.counts.circuits} circuits`, 'small muted');
    panel.append(summary);
    panel.append(element('p', `Fingerprint ${String(meta.sourceFingerprint).slice(0, 23)} · ${meta.mode === 'original' ? 'drawing calibration kept' : 're-projected to registered metres'}${meta.blocked ? ' · graph was BLOCKED when exported' : ''}. Connections and riser/drop transitions from the graph are shown as containment with the service "Graph: …".`, 'small muted'));

    const findings = document.createElement('details');
    findings.open = meta.findings.some((finding) => finding.severity === 'BLOCK');
    findings.append(element('summary', `Findings (${meta.findings.length})`));
    const groups = new Map();
    meta.findings.forEach((finding) => {
      const key = SEVERITY_ORDER.includes(finding.severity) ? finding.severity : 'OTHER';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(finding);
    });
    [...SEVERITY_ORDER, 'OTHER'].filter((key) => groups.has(key)).forEach((key) => {
      findings.append(element('h3', `${key} · ${groups.get(key).length}`));
      const list = element('ul', null, 'small');
      groups.get(key).forEach((finding) => {
        const item = element('li');
        const button = element('button', `${finding.ruleId}${finding.title ? ` — ${finding.title}` : ''}`);
        button.type = 'button';
        button.title = 'Select the first affected object on the model';
        button.onclick = () => {
          if (!selectFirst(finding.affectedSourceIds)) fe(ut('status'), 'No affected object of this finding is drawn on this page');
        };
        item.append(button, element('div', finding.message, 'muted'));
        if (finding.affectedSourceIds.length) item.append(element('div', `Affects: ${finding.affectedSourceIds.join(', ')}`, 'muted'));
        list.append(item);
      });
      findings.append(list);
    });
    panel.append(findings);

    const circuits = document.createElement('details');
    circuits.append(element('summary', `Circuits and paths (${meta.circuits.length})`));
    const filter = element('input');
    filter.type = 'search';
    filter.placeholder = 'Filter by tag or system';
    filter.setAttribute('aria-label', 'Filter circuits');
    const circuitList = element('ul', null, 'small');
    const drawCircuits = () => {
      const query = filter.value.trim().toLowerCase();
      const shown = meta.circuits.filter((circuit) => !query || `${circuit.label} ${circuit.system} ${circuit.id}`.toLowerCase().includes(query)).slice(0, 300);
      circuitList.replaceChildren(...shown.map((circuit) => {
        const item = element('li');
        const button = element('button', circuit.label);
        button.type = 'button';
        button.onclick = () => {
          if (!selectFirst([circuit.id])) fe(ut('status'), 'This path is not drawn on this page');
        };
        item.append(button, element('span', ` ${circuit.system || 'Unassigned'}${circuit.deviceCount ? ` · ${circuit.deviceCount} devices` : ''}${circuit.containmentCount ? ` · ${circuit.containmentCount} containment` : ''}`, 'muted'));
        return item;
      }));
      if (shown.length === 300) circuitList.append(element('li', 'First 300 shown; filter to narrow.', 'muted'));
    };
    filter.oninput = drawCircuits;
    circuits.append(filter, circuitList);
    drawCircuits();
    panel.append(circuits);
  }

  fileInput.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    fe(ut('status'), 'Reading project…');
    try {
      if (file.size > MAX_BYTES) throw new Error('Choose a project session below 50 MB for this preview.');
      const json = JSON.parse(await file.text());
      if (RouteGraphImport.isRouteGraph(json)) {
        const result = RouteGraphImport.routeGraphToSession(json);
        if (!result.ok) throw new Error(result.reason);
        Ps(result.session, file.name, false);
        renderPanel(result.session.routeGraphImport);
      } else {
        hidePanel();
        Ps(json, file.name, false);
      }
    } catch (error) {
      Ni(`Could not open project: ${error.message}`);
      fe(ut('status'), 'Import needs attention');
    }
    event.target.value = '';
  };
  if (ut('demo')) ut('demo').addEventListener('click', hidePanel);
})();
