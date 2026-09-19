/**
 * Deterministic Graph-Based Cable Route Solver.
 * Stage 2 implementation for TELECOM_3D_reviwer.
 */

import {
  CableTypes,
  TopologyTypes,
  StandardElevations,
  createCable
} from '../contract/contract_definitions.js';

function projectPointToSegment2D(p, s1, s2) {
  const dx = s2.x - s1.x;
  const dy = s2.y - s1.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: { x: s1.x, y: s1.y }, t: 0, distSq: (p.x - s1.x) ** 2 + (p.y - s1.y) ** 2 };
  const t = Math.max(0, Math.min(1, ((p.x - s1.x) * dx + (p.y - s1.y) * dy) / lenSq));
  const proj = { x: s1.x + t * dx, y: s1.y + t * dy };
  const distSq = (p.x - proj.x) ** 2 + (p.y - proj.y) ** 2;
  return { point: proj, t, distSq };
}

export class DeterministicRouteSolver {
  /**
   * @param {Object} projectModel
   */
  constructor(projectModel = {}) {
    this.devices = new Map((projectModel.devices || []).map(d => [d.id, d]));
    this.panels = new Map((projectModel.panels || []).map(p => [p.id, p]));
    this.containments = new Map((projectModel.containments || []).map(c => [c.containment_id || c.tag, c]));
    this.routeSegments = projectModel.routeSegments || [];
    this.walls = projectModel.walls || [];
    this.penetrations = projectModel.penetrations || [];
    this.elevationTransitions = projectModel.elevationTransitions || [];
    this.graph = new Map(); // nodeId -> Array<{ to, weight, segmentId, containmentId, elevation, type, targetPt }>
    this.nodes = new Map(); // nodeId -> { x, y, z, id }

    this.buildSpatialGraph();
  }

  nodeKey(pt) {
    return `${Number(pt.x).toFixed(2)},${Number(pt.y).toFixed(2)},${Number(pt.z ?? 0).toFixed(2)}`;
  }

  addNode(pt) {
    const key = this.nodeKey(pt);
    if (!this.nodes.has(key)) {
      this.nodes.set(key, { x: Number(pt.x), y: Number(pt.y), z: Number(pt.z ?? 0), id: key });
      this.graph.set(key, []);
    }
    return key;
  }

  addEdge(p1, p2, meta = {}) {
    const k1 = this.addNode(p1);
    const k2 = this.addNode(p2);
    if (k1 === k2) return;

    const pt1 = this.nodes.get(k1);
    const pt2 = this.nodes.get(k2);

    const dx = pt2.x - pt1.x;
    const dy = pt2.y - pt1.y;
    const dz = pt2.z - pt1.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const allowed = Array.isArray(meta.allowedSystems) ? meta.allowedSystems : ['ALL'];

    this.graph.get(k1).push({
      to: k2,
      weight: dist,
      segmentId: meta.segmentId || '',
      containmentId: meta.containmentId || '',
      elevation: pt2.z,
      type: meta.type || 'corridor',
      allowedSystems: allowed,
      targetPt: pt2
    });

    this.graph.get(k2).push({
      to: k1,
      weight: dist,
      segmentId: meta.segmentId || '',
      containmentId: meta.containmentId || '',
      elevation: pt1.z,
      type: meta.type || 'corridor',
      allowedSystems: allowed,
      targetPt: pt1
    });
  }

  buildSpatialGraph() {
    // Collect all candidate tap points (devices, panels, transitions, penetrations)
    const candidates = [];

    for (const dev of this.devices.values()) {
      const loc = dev.location || { x: dev.x, y: dev.y, z: dev.cable_entry_elevation_m ?? 0 };
      const z = Number(dev.cable_entry_elevation_m ?? loc.z ?? 0);
      candidates.push({ x: loc.x, y: loc.y, z, tag: dev.tag, type: 'device', entity: dev });
    }

    for (const p of this.panels.values()) {
      const loc = p.location || { x: p.x, y: p.y, z: p.top_elevation_m ?? 2.2 };
      const z = Number(p.top_elevation_m ?? loc.z ?? 2.2);
      candidates.push({ x: loc.x, y: loc.y, z, tag: p.tag, type: 'panel', entity: p });
    }

    for (const pen of this.penetrations) {
      if (pen.is_approved !== false) {
        const loc = pen.location;
        candidates.push({ x: loc.x, y: loc.y, z: loc.z ?? 4.5, tag: pen.penetration_id, type: 'penetration', entity: pen });
      }
    }

    for (const tr of this.elevationTransitions) {
      candidates.push({ x: tr.x, y: tr.y, z: tr.end_elevation_m, tag: tr.transition_id, type: 'transition_high', entity: tr });
      candidates.push({ x: tr.x, y: tr.y, z: tr.start_elevation_m, tag: tr.transition_id, type: 'transition_low', entity: tr });
    }

    // 1. For each corridor segment, find intersecting / projected candidates and subdivide
    for (const seg of this.routeSegments) {
      const z = Number(seg.elevation_m ?? seg.start_point?.z ?? StandardElevations.OVERHEAD_CONTAINMENT);
      const s1 = { x: seg.start_point.x, y: seg.start_point.y, z };
      const s2 = { x: seg.end_point.x, y: seg.end_point.y, z };

      const subPoints = [
        { t: 0, pt: s1 },
        { t: 1, pt: s2 }
      ];

      for (const cand of candidates) {
        const proj = projectPointToSegment2D(cand, s1, s2);
        // If projection falls onto segment within 12 meters
        if (proj.t >= 0.001 && proj.t <= 0.999 && proj.distSq <= 144) {
          const ptOnCorridor = { x: proj.point.x, y: proj.point.y, z };
          subPoints.push({ t: proj.t, pt: ptOnCorridor });
        }
      }

      // Sort points along segment by t
      subPoints.sort((a, b) => a.t - b.t);

      // Connect consecutive subpoints with corridor edges
      for (let i = 0; i < subPoints.length - 1; i++) {
        const pA = subPoints[i].pt;
        const pB = subPoints[i + 1].pt;
        this.addEdge(pA, pB, {
          segmentId: seg.segment_id,
          containmentId: seg.containment_id,
          allowedSystems: seg.allowed_systems,
          type: seg.type || 'corridor_containment'
        });
      }
    }

    // 2. Add explicit vertical transitions (risers/drops)
    for (const tr of this.elevationTransitions) {
      const pLow = { x: tr.x, y: tr.y, z: Math.min(tr.start_elevation_m, tr.end_elevation_m) };
      const pHigh = { x: tr.x, y: tr.y, z: Math.max(tr.start_elevation_m, tr.end_elevation_m) };
      this.addEdge(pLow, pHigh, {
        segmentId: tr.transition_id,
        containmentId: tr.containment_id,
        type: tr.type || 'vertical_riser',
        allowedSystems: ['ALL']
      });
    }

    // 3. Connect each candidate device / panel to nearest corridor point
    for (const cand of candidates) {
      const candPt = { x: cand.x, y: cand.y, z: cand.z };
      this.addNode(candPt);

      // Find closest node in graph that lies on containment corridor
      let bestNode = null;
      let minD = Infinity;

      for (const [key, node] of this.nodes) {
        if (key === this.nodeKey(candPt)) continue;
        const dxy = Math.sqrt((node.x - candPt.x) ** 2 + (node.y - candPt.y) ** 2);
        const dz = Math.abs(node.z - candPt.z);
        const totalD = dxy + dz * 0.5;

        if (dxy <= 12.0 && totalD < minD) {
          minD = totalD;
          bestNode = node;
        }
      }

      if (bestNode && minD < Infinity) {
        // Connect device to corridor node: first horizontal branch conduit, then vertical drop/riser
        const intermediate = { x: bestNode.x, y: bestNode.y, z: candPt.z };
        if (Math.sqrt((candPt.x - intermediate.x) ** 2 + (candPt.y - intermediate.y) ** 2) > 0.01) {
          this.addEdge(candPt, intermediate, {
            segmentId: `CDT-BR-${cand.tag}`,
            type: 'branch_conduit',
            allowedSystems: ['ALL']
          });
        }
        if (Math.abs(intermediate.z - bestNode.z) > 0.05) {
          this.addEdge(intermediate, bestNode, {
            segmentId: `DROP-${cand.tag}`,
            type: 'vertical_drop',
            allowedSystems: ['ALL']
          });
        }
      }
    }
  }

  /**
   * Finds the shortest constrained path using Dijkstra on the spatial graph.
   */
  findConstrainedPath(startPt, endPt, options = {}) {
    const startKey = this.nodeKey(startPt);
    const endKey = this.nodeKey(endPt);

    if (!this.nodes.has(startKey)) this.addNode(startPt);
    if (!this.nodes.has(endKey)) this.addNode(endPt);

    const distances = new Map();
    const previous = new Map();
    const edgeUsed = new Map();
    const unvisited = new Set(this.nodes.keys());

    for (const key of this.nodes.keys()) {
      distances.set(key, Infinity);
    }
    distances.set(startKey, 0);

    const cableType = options.cableType || 'ALL';

    while (unvisited.size > 0) {
      let current = null;
      let minD = Infinity;
      for (const node of unvisited) {
        const d = distances.get(node);
        if (d < minD) {
          minD = d;
          current = node;
        }
      }

      if (!current || minD === Infinity || current === endKey) break;
      unvisited.delete(current);

      const neighbors = this.graph.get(current) || [];
      for (const edge of neighbors) {
        if (!unvisited.has(edge.to)) continue;

        // Check system suitability
        if (cableType !== 'ALL' && !edge.allowedSystems.includes('ALL') && !edge.allowedSystems.includes(cableType)) {
          continue; // Incompatible containment edge
        }

        const alt = distances.get(current) + edge.weight;
        if (alt < distances.get(edge.to)) {
          distances.set(edge.to, alt);
          previous.set(edge.to, current);
          edgeUsed.set(edge.to, edge);
        }
      }
    }

    if (distances.get(endKey) === Infinity) {
      return null; // No path found
    }

    // Reconstruct path
    const pathKeys = [];
    let curr = endKey;
    while (curr) {
      pathKeys.unshift(curr);
      curr = previous.get(curr);
    }

    const waypoints = [];
    const segmentIds = new Set();
    let horizLen = 0;
    let vertLen = 0;

    for (let i = 0; i < pathKeys.length; i++) {
      const node = this.nodes.get(pathKeys[i]);
      const edge = i > 0 ? edgeUsed.get(pathKeys[i]) : null;
      if (edge && edge.segmentId) segmentIds.add(edge.segmentId);

      waypoints.push({
        x: node.x,
        y: node.y,
        z: node.z,
        segment_id: edge?.segmentId || '',
        containment_id: edge?.containmentId || '',
        elevation_m: node.z,
        elevation_label: `EL +${node.z.toFixed(3)}`
      });

      if (i > 0) {
        const prev = waypoints[i - 1];
        const dx = node.x - prev.x;
        const dy = node.y - prev.y;
        const dz = Math.abs(node.z - prev.z);
        horizLen += Math.sqrt(dx * dx + dy * dy);
        vertLen += dz;
      }
    }

    return {
      waypoints,
      route_segment_ids: Array.from(segmentIds),
      measured_horizontal_length_m: Number(horizLen.toFixed(2)),
      vertical_allowance_length_m: Number(vertLen.toFixed(2)),
      total_length_m: Number((horizLen + vertLen).toFixed(2))
    };
  }

  /**
   * Deterministically calculates a complete cable route for an intent.
   * @param {Object} intent
   * @returns {Object} Canonical Cable object
   */
  calculateRoute(intent) {
    const source = this.findObject(intent.source);
    const destination = this.findObject(intent.destination);

    if (!source) throw new Error(`Source object '${intent.source}' could not be located in project.`);
    if (!destination) throw new Error(`Destination object '${intent.destination}' could not be located in project.`);

    const srcX = source.location?.x ?? source.x;
    const srcY = source.location?.y ?? source.y;
    const srcZ = Number(source.cable_entry_elevation_m ?? source.top_elevation_m ?? source.location?.z ?? 0);
    const srcLoc = { x: srcX, y: srcY, z: srcZ };

    const dstX = destination.location?.x ?? destination.x;
    const dstY = destination.location?.y ?? destination.y;
    const dstZ = Number(destination.cable_entry_elevation_m ?? destination.top_elevation_m ?? destination.location?.z ?? 0);
    const dstLoc = { x: dstX, y: dstY, z: dstZ };

    const topology = intent.topology || (intent.cable_type?.includes('PAGA') ? TopologyTypes.CLASS_A_LOOP : TopologyTypes.STAR);

    if (topology === TopologyTypes.CLASS_A_LOOP) {
      // Class A Loop: Outbound from Panel -> Device, and Return path from Device -> Panel
      const outbound = this.findConstrainedPath(srcLoc, dstLoc, { cableType: intent.cable_type });
      if (!outbound) throw new Error(`Could not find a valid containment path from ${source.tag} to ${destination.tag}.`);

      // Return leg back to source panel
      const retLeg = this.findConstrainedPath(dstLoc, srcLoc, { cableType: intent.cable_type });
      if (!retLeg) throw new Error(`Could not find a return containment path back to ${source.tag}.`);

      const fullWaypoints = [...outbound.waypoints, ...retLeg.waypoints.slice(1)];
      const combinedSegs = Array.from(new Set([...outbound.route_segment_ids, ...retLeg.route_segment_ids]));
      const horiz = Number((outbound.measured_horizontal_length_m + retLeg.measured_horizontal_length_m).toFixed(2));
      const vert = Number((outbound.vertical_allowance_length_m + retLeg.vertical_allowance_length_m).toFixed(2));

      return createCable({
        cable_id: `CBL-${intent.cable_type || 'PAGA'}-${Date.now().toString().slice(-4)}`,
        tag: `CBL-${source.tag}-${destination.tag}-LOOP`,
        system: source.system || 'PAGA',
        cable_type: intent.cable_type || CableTypes.PAGA_AUDIO,
        source_id: source.id,
        source_tag: source.tag,
        destination_id: source.id, // Class A loop terminates at originating cabinet
        destination_tag: source.tag,
        topology: TopologyTypes.CLASS_A_LOOP,
        waypoints: fullWaypoints,
        route_segment_ids: combinedSegs,
        measured_horizontal_length_m: horiz,
        vertical_allowance_length_m: vert,
        total_length_m: Number((horiz + vert).toFixed(2)),
        status: 'PROPOSED'
      });
    }

    // Standard Point-to-Point / Star
    const solution = this.findConstrainedPath(srcLoc, dstLoc, { cableType: intent.cable_type });
    if (!solution) {
      throw new Error(`Could not find a continuous containment path between ${source.tag} and ${destination.tag}. Check for missing containment or wall penetrations.`);
    }

    return createCable({
      cable_id: `CBL-${intent.cable_type || 'DATA'}-${Date.now().toString().slice(-4)}`,
      tag: `CBL-${source.tag}-${destination.tag}`,
      system: source.system || 'CCTV',
      cable_type: intent.cable_type || CableTypes.CCTV_DATA,
      source_id: source.id,
      source_tag: source.tag,
      destination_id: destination.id,
      destination_tag: destination.tag,
      topology: topology,
      waypoints: solution.waypoints,
      route_segment_ids: solution.route_segment_ids,
      measured_horizontal_length_m: solution.measured_horizontal_length_m,
      vertical_allowance_length_m: solution.vertical_allowance_length_m,
      total_length_m: solution.total_length_m,
      status: 'PROPOSED'
    });
  }

  findObject(identifier) {
    if (!identifier) return null;
    const cleanId = String(identifier).trim().toUpperCase().replace(/^THE_/, '');
    for (const d of this.devices.values()) {
      if (d.id === identifier || d.tag.toUpperCase() === cleanId) return d;
    }
    for (const p of this.panels.values()) {
      if (p.id === identifier || p.tag.toUpperCase() === cleanId) return p;
    }
    return null;
  }
}
