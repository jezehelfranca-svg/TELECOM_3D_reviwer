/**
 * Route graph import: opens the "Export graph JSON" file written by Telecom MTO's
 * 3D Review (route-graph.mjs, exportRouteGraph) in this reviewer.
 *
 * The graph export is not a project session, so the viewer's loader cannot read it
 * directly. Every graph node, edge, building and circuit carries the original source
 * record it was built from, so this module rebuilds a read-only session from those
 * records, in the drawing's own calibration, and adds the graph-only geometry
 * (connections and riser/drop transitions) as labelled route segments.
 *
 * Pure and dependency-free: runs in the browser and under Node tests.
 */
(function attachRouteGraphImport(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RouteGraphImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRouteGraphImport() {
  'use strict';

  const SUPPORTED_SCHEMA_VERSIONS = [1];
  // The viewer refuses sessions above these limits; refuse early with the same numbers.
  const MAX_OBJECTS = 20000;
  const MAX_VERTICES = 100000;
  const GRAPH_SERVICE = { connection: 'Graph: connection', transition: 'Graph: riser / drop' };
  // Elevation fields that are parsed in the drawing unit; stripped when re-projecting to metres.
  const ELEVATION_TEXT_KEYS = ['cableEntryElevation', 'fromCableEntryElevation', 'toCableEntryElevation', 'routeLayer', 'elevationLabel'];

  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = (value) => (value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function isRouteGraph(json) {
    return isObject(json) &&
      !Array.isArray(json.takeoffs) &&
      json.schemaVersion !== undefined &&
      Array.isArray(json.nodes) &&
      Array.isArray(json.edges) &&
      isObject(json.frame);
  }

  // The graph's frame maps drawing pixels to metres. When it is the plain calibration
  // (scale, base point, y down) the original records can be kept in their own pixels;
  // otherwise (a registered spatial transform) everything is re-projected to metres.
  function frameMapping(frame) {
    const calibration = isObject(frame && frame.calibration) ? frame.calibration : {};
    const ppu = finite(calibration.pixelsPerUnit);
    const unitToM = finite(calibration.unitToM);
    const baseX = finite(calibration.baseX) ?? 0;
    const baseY = finite(calibration.baseY) ?? 0;
    const unit = String(calibration.drawingUnit || '').toLowerCase();
    const coefficients = Array.isArray(calibration.transformCoefficients) ? calibration.transformCoefficients.map(Number) : null;
    if (!ppu || ppu <= 0 || !unitToM || unitToM <= 0 || !coefficients || coefficients.length !== 6 || coefficients.some((c) => !Number.isFinite(c))) {
      return { ok: false, reason: 'The graph frame has no usable calibration (pixelsPerUnit, unitToM and transformCoefficients are required).' };
    }
    const k = unitToM / ppu;
    const expected = [k, 0, -baseX * k, 0, -k, baseY * k];
    const tolerance = 1e-9 * Math.max(1, ...expected.map(Math.abs));
    const plain = ['m', 'mm', 'cm', 'ft', 'in'].includes(unit) && expected.every((value, index) => Math.abs(value - coefficients[index]) <= tolerance);
    const [a, b, c, d, e, f] = coefficients;
    const toMetres = (point) => ({ x: a * Number(point.x) + b * Number(point.y) + c, y: d * Number(point.x) + e * Number(point.y) + f });
    if (plain) {
      return {
        ok: true,
        mode: 'original',
        calibration: { unit, pixelsPerUnit: ppu, ...(calibration.basePointKnown ? { basePoint: { x: baseX, y: baseY } } : {}) },
        // Record points stay as they are; graph-only points (metres) go back to pixels.
        recordPoint: (point) => ({ ...point }),
        metresToPoint: (point) => ({ x: baseX + Number(point.x) / k, y: baseY - Number(point.y) / k }),
        zFromMetres: (z) => (z === null ? null : z / unitToM),
        recordZ: (z) => z,
        unitToM,
      };
    }
    return {
      ok: true,
      mode: 'metric',
      calibration: { unit: 'm', pixelsPerUnit: 1, basePoint: { x: 0, y: 0 } },
      recordPoint: (point) => {
        const metres = toMetres(point);
        const z = finite(point.z);
        const out = { ...point, x: metres.x, y: -metres.y };
        if (z === null) delete out.z;
        else out.z = z * unitToM;
        return out;
      },
      metresToPoint: (point) => ({ x: Number(point.x), y: -Number(point.y) }),
      zFromMetres: (z) => z,
      recordZ: (z) => (z === null ? null : z * unitToM),
      unitToM,
    };
  }

  // A drawable edge has at least two distinct vertices (a riser differs only in z).
  // Single-vertex and zero-length connections are coincident joins with nothing to show.
  function hasExtent(vertices) {
    if (!Array.isArray(vertices) || vertices.length < 2) return false;
    const first = vertices[0];
    return vertices.some((vertex) => Math.abs(vertex.x - first.x) > 1e-9 || Math.abs(vertex.y - first.y) > 1e-9 || Math.abs((finite(vertex.z) ?? 0) - (finite(first.z) ?? 0)) > 1e-9);
  }

  function withZ(point, z) {
    const out = { ...point };
    if (z === null || z === undefined) delete out.z;
    else out.z = z;
    return out;
  }

  // Re-express a source record in the target calibration.
  function mapRecord(record, mapping) {
    const out = clone(record);
    if (mapping.mode === 'original') return out;
    if (Array.isArray(out.points)) out.points = out.points.map(mapping.recordPoint);
    if (isObject(out.point)) out.point = mapping.recordPoint(out.point);
    ['elevation', 'baseElevation', 'topElevation'].forEach((key) => {
      const value = finite(out[key]);
      if (value !== null) out[key] = mapping.recordZ(value);
      else if (typeof out[key] === 'string') delete out[key];
    });
    delete out.elevationLabel;
    if (isObject(out.metadata)) {
      ELEVATION_TEXT_KEYS.forEach((key) => delete out.metadata[key]);
      if (Array.isArray(out.metadata.waypointBindings)) {
        out.metadata.waypointBindings = out.metadata.waypointBindings.map((binding) => (isObject(binding) && finite(binding.x) !== null ? mapping.recordPoint(binding) : binding));
      }
      delete out.metadata.routeCoordinatePoints;
    }
    return out;
  }

  function routeGraphToSession(graph) {
    if (!isRouteGraph(graph)) {
      return { ok: false, reason: 'This file is not a Telecom MTO route graph export.' };
    }
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(Number(graph.schemaVersion))) {
      return { ok: false, reason: `Route graph schema version ${graph.schemaVersion} is not supported by this reviewer (supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}).` };
    }
    const mapping = frameMapping(graph.frame);
    if (!mapping.ok) return { ok: false, reason: mapping.reason };
    const page = finite(graph.page) ?? 1;

    const collections = { takeoffs: new Map(), routeSegments: new Map(), routeNodes: new Map(), wbsZones: new Map() };
    const addRecord = (source) => {
      if (!isObject(source) || !isObject(source.record) || !collections[source.collection]) return;
      const id = String(source.record.id ?? source.id ?? '');
      if (!id || collections[source.collection].has(id)) return;
      const record = mapRecord(source.record, mapping);
      if (record.page === undefined) record.page = page;
      collections[source.collection].set(id, record);
    };

    graph.nodes.forEach((node) => addRecord(node && node.source));
    graph.edges.forEach((edge) => addRecord(edge && edge.source));
    (Array.isArray(graph.buildings) ? graph.buildings : []).forEach((building) => addRecord(building && building.source));
    (Array.isArray(graph.circuits) ? graph.circuits : []).forEach((circuit) => addRecord(circuit && circuit.source));

    // Graph-only geometry: snapped connections and riser/drop transitions, in metres.
    const graphSegments = [];
    for (const edge of graph.edges) {
      if (!edge || !GRAPH_SERVICE[edge.kind] || !hasExtent(edge.vertices)) continue;
      const points = edge.vertices.map((vertex) => withZ(mapping.metresToPoint(vertex), mapping.zFromMetres(finite(vertex.z))));
      graphSegments.push({
        id: String(edge.id),
        page,
        points,
        routeClass: GRAPH_SERVICE[edge.kind],
        metadata: {
          tagName: String(edge.id),
          service: GRAPH_SERVICE[edge.kind],
          graphEdgeKind: edge.kind,
          graphFrom: edge.from,
          graphTo: edge.to,
          lengthM: finite(edge.lengthM),
        },
      });
    }
    // A graph edge id never collides with a source record id, but guard anyway.
    graphSegments.forEach((segment) => {
      if (!collections.routeSegments.has(segment.id)) collections.routeSegments.set(segment.id, segment);
    });

    const session = {
      pageNum: page,
      calibration: mapping.calibration,
      drawingSource: { name: `Route graph · page ${page} · ${String(graph.sourceFingerprint || '').slice(0, 23)}` },
      takeoffs: [...collections.takeoffs.values()],
      routeSegments: [...collections.routeSegments.values()],
      routeNodes: [...collections.routeNodes.values()],
      wbsZones: [...collections.wbsZones.values()],
      routeGraphImport: {
        schemaVersion: graph.schemaVersion,
        ruleSetVersion: graph.ruleSetVersion || null,
        page,
        projectId: graph.projectId || '',
        sourceFingerprint: graph.sourceFingerprint || '',
        blocked: Boolean(graph.blocked),
        mode: mapping.mode,
        counts: {
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          buildings: Array.isArray(graph.buildings) ? graph.buildings.length : 0,
          circuits: Array.isArray(graph.circuits) ? graph.circuits.length : 0,
          findings: Array.isArray(graph.findings) ? graph.findings.length : 0,
        },
        findings: (Array.isArray(graph.findings) ? graph.findings : []).map((finding) => ({
          ruleId: finding.ruleId,
          severity: finding.severity,
          title: finding.ruleTitle || '',
          message: finding.message,
          affectedSourceIds: Array.isArray(finding.affectedSourceIds) ? finding.affectedSourceIds.map(String) : [],
        })),
        circuits: (Array.isArray(graph.circuits) ? graph.circuits : []).map((circuit) => ({
          id: String(circuit.id),
          system: circuit.system || '',
          topology: circuit.topology || '',
          deviceCount: Array.isArray(circuit.orderedDeviceIds) ? circuit.orderedDeviceIds.length : 0,
          containmentCount: Array.isArray(circuit.assignedContainmentIds) ? circuit.assignedContainmentIds.length : 0,
          label: (circuit.source && circuit.source.record && (circuit.source.record.label || (circuit.source.record.metadata && circuit.source.record.metadata.tagName))) || String(circuit.id),
        })),
      },
    };

    const objects = session.takeoffs.length + session.routeSegments.length + session.routeNodes.length + session.wbsZones.length;
    const vertices = [session.takeoffs, session.routeSegments, session.routeNodes, session.wbsZones]
      .reduce((total, list) => total + list.reduce((sum, item) => sum + (Array.isArray(item.points) ? item.points.length : 0) + (item.point ? 1 : 0), 0), 0);
    if (objects > MAX_OBJECTS || vertices > MAX_VERTICES) {
      return { ok: false, reason: `This route graph rebuilds to ${objects.toLocaleString()} objects and ${vertices.toLocaleString()} vertices, above the viewer's 20,000 / 100,000 limit. Export a single page or a smaller area.` };
    }
    if (!objects) return { ok: false, reason: 'This route graph contains no geometry to display.' };
    return { ok: true, session };
  }

  return Object.freeze({ isRouteGraph, routeGraphToSession, frameMapping, hasExtent, SUPPORTED_SCHEMA_VERSIONS });
});
