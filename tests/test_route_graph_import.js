import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { isRouteGraph, routeGraphToSession, frameMapping, hasExtent } = require('../src/viewer/route_graph_import.cjs');

console.log('Testing route_graph_import...');

let assertions = 0;
function check(condition, message) {
  if (!condition) throw new Error(message);
  assertions += 1;
}

// The viewer's own pixel -> metre conversion (Gu): x = (px - baseX) / ppu * unitToM,
// y = (baseY - py) / ppu * unitToM. Reimplemented here to prove the round trip.
const UNIT_TO_M = { m: 1, mm: 0.001, cm: 0.01, ft: 0.3048, in: 0.0254 };
function viewerMetres(point, calibration) {
  const base = calibration.basePoint || { x: 0, y: 0 };
  const k = UNIT_TO_M[calibration.unit] / calibration.pixelsPerUnit;
  return { x: (Number(point.x) - base.x) * k, y: (base.y - Number(point.y)) * k };
}

// Fixture: a graph exported by Telecom MTO's route-graph.mjs from its synthetic demo
// project (no project data). Its own connections are all zero-length joins, so a riser
// and a connection with real extent are added to exercise the graph-only geometry.
const exported = JSON.parse(fs.readFileSync(new URL('./fixtures/route-graph-demo.json', import.meta.url), 'utf8'));
const graph = JSON.parse(JSON.stringify(exported));
graph.edges.push(
  { id: 'transition:TEST-RISER', kind: 'transition', page: 1, from: 'transition:TEST-RISER:low', to: 'transition:TEST-RISER:high', vertices: [{ x: 10, y: -5, z: 0.5 }, { x: 10, y: -5, z: 4.2 }], lengthM: 3.7 },
  { id: 'connect:TEST-A|TEST-B', kind: 'connection', page: 1, from: 'a', to: 'b', vertices: [{ x: 12, y: -6, z: 4.2 }, { x: 12.25, y: -6.5, z: 4.2 }], lengthM: 0.559 },
);

// 1. Detection
check(isRouteGraph(graph), 'fixture should be recognised as a route graph');
check(!isRouteGraph({ takeoffs: [], calibration: { unit: 'm', pixelsPerUnit: 1 } }), 'a project session is not a route graph');
check(!isRouteGraph(null) && !isRouteGraph([]) && !isRouteGraph({ nodes: [], edges: [] }), 'incomplete objects are not route graphs');
console.log('  [PASS] isRouteGraph detects graph exports and rejects sessions');

// 2. Conversion keeps every source record once, plus graph-only segments
const result = routeGraphToSession(graph);
check(result.ok, `conversion should succeed: ${result.reason}`);
const session = result.session;
check(Array.isArray(session.takeoffs) && session.calibration && session.calibration.pixelsPerUnit > 0, 'session has takeoffs and calibration, as the viewer loader requires');
const sourceIds = (collection) => new Set([...graph.nodes, ...graph.edges, ...graph.buildings, ...graph.circuits]
  .map((item) => item.source)
  .filter((source) => source && source.collection === collection && source.record)
  .map((source) => String(source.record.id)));
check(session.takeoffs.length === sourceIds('takeoffs').size, 'every takeoff record appears once');
check(session.routeNodes.length === sourceIds('routeNodes').size, 'every route node record appears once');
check(session.wbsZones.length === sourceIds('wbsZones').size && session.wbsZones.length === graph.buildings.length, 'every building envelope appears once');
const graphOnly = graph.edges.filter((edge) => (edge.kind === 'connection' || edge.kind === 'transition') && hasExtent(edge.vertices));
check(graphOnly.length === 2, 'only the riser and the real connection are drawable; zero-length joins are skipped');
check(!hasExtent([{ x: 1, y: 1, z: 3 }]) && !hasExtent([{ x: 1, y: 1, z: 3 }, { x: 1, y: 1, z: 3 }]) && hasExtent([{ x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: 3 }]), 'coincident joins are skipped; vertical risers are kept');
check(session.routeSegments.length === sourceIds('routeSegments').size + graphOnly.length, 'route segments = source segments + graph connections/transitions');
console.log('  [PASS] records are rebuilt once each, graph-only edges added');

// 3. Records are kept byte-identical in the original calibration
check(result.session.routeGraphImport.mode === 'original', 'plain calibration keeps the original drawing pixels');
const firstDevice = graph.nodes.find((node) => node.kind === 'device');
const rebuiltDevice = session.takeoffs.find((takeoff) => takeoff.id === firstDevice.source.record.id);
check(JSON.stringify(rebuiltDevice) === JSON.stringify(firstDevice.source.record), 'device record is unchanged');
console.log('  [PASS] source records are unchanged');

// 4. Round trip: the viewer's conversion of rebuilt geometry lands on the graph's metres
for (const node of graph.nodes.filter((item) => item.kind === 'device')) {
  const takeoff = session.takeoffs.find((item) => item.id === node.source.record.id);
  const metres = viewerMetres(takeoff.points[0], session.calibration);
  check(Math.abs(metres.x - node.x) < 1e-3 && Math.abs(metres.y - node.y) < 1e-3, `device ${node.id} lands within 1 mm`);
}
for (const edge of graphOnly) {
  const segment = session.routeSegments.find((item) => item.id === edge.id);
  segment.points.forEach((point, index) => {
    const metres = viewerMetres(point, session.calibration);
    check(Math.abs(metres.x - edge.vertices[index].x) < 1e-3 && Math.abs(metres.y - edge.vertices[index].y) < 1e-3, `edge ${edge.id} vertex ${index} lands within 1 mm`);
    check(Math.abs(Number(point.z) - edge.vertices[index].z) < 1e-9, `edge ${edge.id} vertex ${index} keeps its elevation`);
  });
}
console.log('  [PASS] devices and graph-only edges round-trip to the graph metres within 1 mm');

// 5. Findings and circuits are carried for the panel
const meta = session.routeGraphImport;
check(meta.findings.length === graph.findings.length && meta.circuits.length === graph.circuits.length, 'findings and circuits carried through');
check(meta.findings.every((finding) => finding.ruleId && finding.severity && Array.isArray(finding.affectedSourceIds)), 'findings keep rule, severity and affected ids');
check(meta.sourceFingerprint === graph.sourceFingerprint, 'fingerprint carried through');
console.log('  [PASS] findings, circuits and fingerprint carried for the panel');

// 6. A registered (non-plain) frame is re-projected to metres
const rotated = JSON.parse(JSON.stringify(graph));
const angle = Math.PI / 6;
const k = 1 / 20;
rotated.frame.calibration.transformCoefficients = [k * Math.cos(angle), -k * Math.sin(angle), 100, -k * Math.sin(angle), -k * Math.cos(angle), 200];
const mapping = frameMapping(rotated.frame);
check(mapping.ok && mapping.mode === 'metric', 'a rotated frame uses metric mode');
const rotatedSession = routeGraphToSession(rotated).session;
const rotatedDevice = rotatedSession.takeoffs.find((item) => item.id === firstDevice.source.record.id);
const [a, b, c, d, e, f] = rotated.frame.calibration.transformCoefficients;
const raw = firstDevice.source.record.points[0];
const expected = { x: a * raw.x + b * raw.y + c, y: d * raw.x + e * raw.y + f };
const shown = viewerMetres(rotatedDevice.points[0], rotatedSession.calibration);
check(Math.abs(shown.x - expected.x) < 1e-6 && Math.abs(shown.y - expected.y) < 1e-6, 'metric mode lands records on the registered metres');
console.log('  [PASS] registered frames are re-projected to metres');

// 7. Refusals
check(!routeGraphToSession({ ...graph, schemaVersion: 99 }).ok, 'unknown schema is refused');
check(!routeGraphToSession({ ...graph, nodes: [], edges: [], buildings: [], circuits: [] }).ok, 'empty graph is refused');
check(!routeGraphToSession({ ...graph, frame: { calibration: {} } }).ok, 'graph without calibration is refused');
const huge = { ...graph, edges: Array.from({ length: 20001 }, (_, index) => ({ id: `connection:${index}`, kind: 'connection', vertices: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })) };
check(!routeGraphToSession(huge).ok, 'graph over the viewer limit is refused');
console.log('  [PASS] unsupported, empty, uncalibrated and oversized graphs are refused');

console.log(`\nRoute graph import: all checks PASSED (${assertions} assertions).`);
