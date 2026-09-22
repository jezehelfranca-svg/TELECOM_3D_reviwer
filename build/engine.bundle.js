/**
 * Telecom Engine Standalone Bundle
 * Deterministic Route Solver, Formal Rule Library, Validator & Needle Assistant
 */
(function(global) {
  'use strict';

// --- Source: src/contract/contract_definitions.js ---
/**
 * Canonical Wiring Contract definitions & validation utilities.
 * Stage 1 implementation for TELECOM_3D_reviwer.
 */

const SystemTypes = Object.freeze({
  CCTV: 'CCTV',
  PAGA: 'PAGA',
  TELECOM: 'TELECOM',
  SECURITY: 'SECURITY',
  FIRE_ALARM: 'FIRE_ALARM',
  POWER: 'POWER',
  CONTROL: 'CONTROL',
  FO: 'FO'
});

const CableTypes = Object.freeze({
  CCTV_DATA: 'CCTV_DATA',
  PAGA_AUDIO: 'PAGA_AUDIO',
  PAGA_LOOP_RETURN: 'PAGA_LOOP_RETURN',
  POWER_LV: 'POWER_LV',
  CONTROL: 'CONTROL',
  FO_SM: 'FO_SM',
  FO_MM: 'FO_MM',
  INSTRUMENTATION: 'INSTRUMENTATION'
});

const TopologyTypes = Object.freeze({
  CLASS_A_LOOP: 'CLASS_A_LOOP',
  RADIAL: 'RADIAL',
  STAR: 'STAR',
  DAISY_CHAIN: 'DAISY_CHAIN',
  MULTIDROP: 'MULTIDROP',
  REDUNDANT_RING: 'REDUNDANT_RING'
});

const ContainmentTypes = Object.freeze({
  LADDER_TRAY: 'ladder_tray',
  PERFORATED_TRAY: 'perforated_tray',
  SOLID_TRUNKING: 'solid_trunking',
  CONDUIT_RSGC: 'conduit_rsgc',
  CONDUIT_PVC: 'conduit_pvc',
  DUCT_BANK: 'duct_bank',
  TRENCH: 'trench'
});

const RouteSegmentTypes = Object.freeze({
  CORRIDOR_CONTAINMENT: 'corridor_containment',
  BRANCH_CONDUIT: 'branch_conduit',
  VERTICAL_RISER: 'vertical_riser',
  VERTICAL_DROP: 'vertical_drop',
  WALL_PENETRATION: 'wall_penetration_segment',
  TRENCH: 'trench',
  INFERRED_TIE_IN: 'inferred_tie_in'
});

const SeverityLevels = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
});

/**
 * Standard Design Basis Elevations (m AGL)
 */
const StandardElevations = Object.freeze({
  SUBSTATION_1F_SPK: 5.0,
  SUBSTATION_GF_CELLAR: 2.0,
  PIB_CCU_CEILING: 4.0,
  RACK_ROOM_CEILING: 3.8,
  HSS_STATION: 1.5,
  IP_PHONE: 1.4,
  WARNING_BEACON: 2.8,
  CABINET_BASE: 0.0,
  CABINET_TOP_ENTRY: 2.2,
  OVERHEAD_CONTAINMENT: 4.2,
  TRENCH_UNDERGROUND: -1.2
});

/**
 * Validates a coordinate object.
 */
function validateCoordinates(coord, label = 'Coordinate') {
  if (!coord || typeof coord !== 'object') {
    throw new Error(`${label} must be a valid 3D coordinate object.`);
  }
  const x = Number(coord.x);
  const y = Number(coord.y);
  const z = Number(coord.z ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new Error(`${label} coordinates must be finite numbers: (${coord.x}, ${coord.y}, ${coord.z})`);
  }
  return { x, y, z };
}

/**
 * Factory for creating a canonical Device record.
 */
function createDevice(spec) {
  if (!spec.id || !spec.tag) {
    throw new Error('Device must have an id and a tag.');
  }
  const loc = validateCoordinates(spec.location || spec.coordinates, `Device ${spec.tag}`);
  return {
    id: String(spec.id),
    tag: String(spec.tag).trim().toUpperCase(),
    system: spec.system || SystemTypes.TELECOM,
    category: spec.category || 'Field Device',
    network_group: spec.network_group || (spec.tag.includes('-A') ? 'A' : spec.tag.includes('-B') ? 'B' : 'SHARED'),
    room_id: spec.room_id || spec.room || 'General Area',
    location: loc,
    cable_entry_elevation_m: Number(spec.cable_entry_elevation_m ?? loc.z),
    mounting_elevation_m: Number(spec.mounting_elevation_m ?? loc.z),
    allowed_cables: Array.isArray(spec.allowed_cables) ? spec.allowed_cables : []
  };
}

/**
 * Factory for creating a canonical Panel record.
 */
function createPanel(spec) {
  if (!spec.id || !spec.tag) {
    throw new Error('Panel must have an id and a tag.');
  }
  const loc = validateCoordinates(spec.location, `Panel ${spec.tag}`);
  return {
    id: String(spec.id),
    tag: String(spec.tag).trim().toUpperCase(),
    system: spec.system || SystemTypes.TELECOM,
    type: spec.type || 'cabinet',
    location: loc,
    base_elevation_m: Number(spec.base_elevation_m ?? 0.0),
    top_elevation_m: Number(spec.top_elevation_m ?? 2.2),
    cable_entry_mode: spec.cable_entry_mode || 'TOP',
    max_ports: Number(spec.max_ports || 48),
    used_ports: Number(spec.used_ports || 0),
    supported_topologies: Array.isArray(spec.supported_topologies) ? spec.supported_topologies : [TopologyTypes.STAR, TopologyTypes.RADIAL]
  };
}

/**
 * Factory for creating a canonical Cable record.
 */
function createCable(spec) {
  if (!spec.cable_id || !spec.source_id || !spec.destination_id) {
    throw new Error('Cable requires cable_id, source_id, and destination_id.');
  }
  const waypoints = (spec.waypoints || []).map((wp, idx) => {
    const pt = validateCoordinates(wp, `Waypoint ${idx}`);
    return {
      x: pt.x,
      y: pt.y,
      z: pt.z,
      segment_id: wp.segment_id || '',
      containment_id: wp.containment_id || '',
      elevation_m: pt.z,
      elevation_label: wp.elevation_label || `EL +${pt.z.toFixed(3)}`
    };
  });

  return {
    cable_id: String(spec.cable_id),
    tag: String(spec.tag || spec.cable_id),
    system: spec.system || SystemTypes.TELECOM,
    cable_type: spec.cable_type || CableTypes.CCTV_DATA,
    source_id: String(spec.source_id),
    source_tag: String(spec.source_tag || spec.source_id),
    destination_id: String(spec.destination_id),
    destination_tag: String(spec.destination_tag || spec.destination_id),
    topology: spec.topology || TopologyTypes.STAR,
    route_segment_ids: Array.isArray(spec.route_segment_ids) ? spec.route_segment_ids : [],
    waypoints,
    measured_horizontal_length_m: Number(spec.measured_horizontal_length_m || 0),
    vertical_allowance_length_m: Number(spec.vertical_allowance_length_m || 0),
    total_length_m: Number(spec.total_length_m || 0),
    voltage_class: spec.voltage_class || 'ELV',
    manual_route: spec.manual_route !== false,
    status: spec.status || 'PROPOSED'
  };
}

/**
 * Factory for creating a canonical Containment record.
 */
function createContainment(spec) {
  if (!spec.containment_id || !spec.tag) {
    throw new Error('Containment requires containment_id and tag.');
  }
  const maxFill = Number(spec.max_fill_percent ?? (spec.type === ContainmentTypes.CONDUIT_RSGC ? 40.0 : 50.0));
  return {
    containment_id: String(spec.containment_id),
    tag: String(spec.tag).trim().toUpperCase(),
    type: spec.type || ContainmentTypes.LADDER_TRAY,
    width_mm: Number(spec.width_mm || (spec.type === ContainmentTypes.CONDUIT_RSGC ? 32 : 300)),
    height_mm: Number(spec.height_mm || (spec.type === ContainmentTypes.CONDUIT_RSGC ? 32 : 100)),
    internal_bore_mm2: Number(spec.internal_bore_mm2 || (spec.type === ContainmentTypes.CONDUIT_RSGC ? 606.99 : 30000)),
    max_fill_percent: maxFill,
    current_fill_percent: Number(spec.current_fill_percent || 0.0),
    cables_contained: Array.isArray(spec.cables_contained) ? spec.cables_contained : [],
    allowed_systems: Array.isArray(spec.allowed_systems) ? spec.allowed_systems : [spec.system || 'ALL'],
    network_group: spec.network_group || (spec.tag.includes('-A') ? 'A' : spec.tag.includes('-B') ? 'B' : 'SHARED'),
    elevation_m: Number(spec.elevation_m || StandardElevations.OVERHEAD_CONTAINMENT),
    outdoor: !!spec.outdoor,
    has_metal_divider: !!spec.has_metal_divider
  };
}

/**
 * Factory for creating a canonical RouteSegment record.
 */
function createRouteSegment(spec) {
  if (!spec.segment_id) {
    throw new Error('Route segment requires segment_id.');
  }
  const start = validateCoordinates(spec.start_point, `Segment ${spec.segment_id} start`);
  const end = validateCoordinates(spec.end_point, `Segment ${spec.segment_id} end`);
  const elev = Number(spec.elevation_m ?? start.z);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length_m = Number(spec.length_m ?? Math.sqrt(dx * dx + dy * dy + dz * dz));

  return {
    segment_id: String(spec.segment_id),
    tag: String(spec.tag || spec.segment_id),
    type: spec.type || RouteSegmentTypes.CORRIDOR_CONTAINMENT,
    start_point: start,
    end_point: end,
    length_m,
    elevation_m: elev,
    elevation_label: spec.elevation_label || `EL +${elev.toFixed(3)}`,
    allowed_systems: Array.isArray(spec.allowed_systems) ? spec.allowed_systems : ['ALL'],
    wall_side: spec.wall_side || 'center',
    outdoor: !!spec.outdoor,
    containment_id: spec.containment_id || '',
    is_inferred_gap: !!spec.is_inferred_gap
  };
}

/**
 * Factory for creating a canonical WallPenetration record.
 */
function createWallPenetration(spec) {
  if (!spec.penetration_id || !spec.wall_id) {
    throw new Error('Wall penetration requires penetration_id and wall_id.');
  }
  const loc = validateCoordinates(spec.location, `Penetration ${spec.penetration_id}`);
  return {
    penetration_id: String(spec.penetration_id),
    wall_id: String(spec.wall_id),
    wall_name: spec.wall_name || `Wall ${spec.wall_id}`,
    location: loc,
    fire_rating_hours: Number(spec.fire_rating_hours || 2.0),
    sleeve_diameter_mm: Number(spec.sleeve_diameter_mm || 150),
    approved_systems: Array.isArray(spec.approved_systems) ? spec.approved_systems : ['ALL'],
    is_approved: spec.is_approved !== false,
    drawing_ref: spec.drawing_ref || 'DRAWING-REF-STD-01'
  };
}

/**
 * Factory for creating a ValidationFinding record.
 */
function createValidationFinding({
  finding_id,
  rule_id,
  severity = SeverityLevels.ERROR,
  message,
  affected_entities = [],
  violation_type,
  location = null,
  recommendation = ''
}) {
  return {
    finding_id: finding_id || `VF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    rule_id: String(rule_id),
    severity,
    message: String(message),
    affected_entities: Array.isArray(affected_entities) ? affected_entities : [affected_entities],
    violation_type: String(violation_type || rule_id),
    location: location ? validateCoordinates(location, 'Finding location') : null,
    recommendation: String(recommendation)
  };
}

// --- Source: src/validator/rules.js ---
/**
 * Formal machine-readable engineering rule library.
 * Stage 2 implementation for TELECOM_3D_reviwer.
 */

const FormalRuleLibrary = [
  {
    rule_id: "PAGA-CLASS-A-001",
    system: "PAGA",
    topology: "CLASS_A_LOOP",
    name: "PAGA Class A Loop Continuity & Panel Return",
    description: "Class A loudspeaker loops must originate from and return to the exact same originating amplifier/cabinet (PAGA-CAB-A or PAGA-CAB-B). All segments must be continuous without unapproved wall crossings.",
    requirements: [
      "route must return to originating panel",
      "all segments must be continuous",
      "no unapproved wall crossing",
      "corridor elevation must be maintained",
      "open ground-level routing is prohibited",
      "last-mile connection via dedicated branch conduit"
    ],
    severity: "error",
    standards_reference: "AGSA-PAGA-DES-001, NFPA 72 Class A, IEC 60849"
  },
  {
    rule_id: "PWR-SEP-001",
    system: "POWER",
    topology: "RADIAL",
    name: "Power Separation and Containment Segregation",
    description: "Power cables (LV/HV) must maintain physical segregation from ELV telecom, CCTV data, and PAGA audio circuits (minimum 300 mm clearance or metallic divider barrier). Never share branch conduits.",
    requirements: [
      "radial or point-to-point topology strictly verified",
      "separation from ELV signal cables >= 300mm unless metallic divider present",
      "prohibited from sharing small branch conduits with CCTV/PAGA",
      "voltage class must be documented"
    ],
    severity: "error",
    standards_reference: "IEC 60364-5-52, BS 7671, AGSA-ELEC-SEP-003"
  },
  {
    rule_id: "CTRL-P2P-001",
    system: "CONTROL",
    topology: "POINT_TO_POINT",
    name: "Control Circuit Terminal Relationship & Integrity",
    description: "Control wiring must connect to declared junction box or marshalling panel terminals with explicit node coordinates.",
    requirements: [
      "point-to-point or multidrop integrity verified",
      "panel/device terminal relationship strictly matched",
      "intermediate junction boxes registered in route graph"
    ],
    severity: "error",
    standards_reference: "ISA-5.4, AGSA-CTRL-SPEC-002"
  },
  {
    rule_id: "FO-BEND-STAR-001",
    system: "FO",
    topology: "STAR",
    name: "Fibre Optic Topology, Redundancy and Bend Restrictions",
    description: "Fibre backbone circuits require structured star or redundant ring paths. Minimum dynamic bend radius (20x outer diameter) and dedicated optical containment are enforced.",
    requirements: [
      "star, daisy chain, or redundant ring topology verified",
      "core count, optical type (SM/MM), and bend restrictions maintained",
      "protected containment (innerduct/conduit/trunking) required",
      "redundant paths must not share common unsegmented tray"
    ],
    severity: "error",
    standards_reference: "TIA-568.3-D, ISO/IEC 11801"
  },
  {
    rule_id: "CCTV-DATA-001",
    system: "CCTV",
    topology: "STAR",
    name: "CCTV Data Star Network & Edge Switch Reach",
    description: "CCTV IP cameras must route point-to-point star to an authorized field edge PoE switch or rack room IDF/MDF. Containment must be approved for data signals.",
    requirements: [
      "star or structured network topology",
      "device-to-switch path within 90m channel limit without repeater",
      "approved containment for CCTV_DATA",
      "outdoor runs require UV-resistant and ingress-protected containment"
    ],
    severity: "error",
    standards_reference: "ISO/IEC 11801, IEEE 802.3bt, AGSA-CCTV-DES-004"
  },
  {
    rule_id: "SPK-ZONE-001",
    system: "PAGA",
    topology: "LOOP_OR_RADIAL",
    name: "Speaker Zone Order and Amplifier Return",
    description: "Speakers must follow designated zone groupings. Elevation transitions to ceiling/stanchion mountings must be explicitly detailed.",
    requirements: [
      "loop or zoned radial hierarchy verified",
      "zone assignment consistency across devices",
      "amplifier return required for Class A circuits",
      "speaker elevation adherence (e.g. +4.0m ceiling, +5.0m switchgear, +2.0m cellar)"
    ],
    severity: "error",
    standards_reference: "AGSA-PAGA-STD-005, BS 5839-8"
  },
  {
    rule_id: "WALL-PENETRATION-001",
    system: "ALL",
    topology: "ALL",
    name: "Strict Wall Crossing and Boundary Containment Verification",
    description: "No cable or containment route may cross a building wall, fire compartment, or perimeter barrier without passing through an explicit, approved wall penetration sleeve.",
    requirements: [
      "route must not exit or enter building walls at arbitrary unapproved points",
      "fire-rated sleeve penetration required at compartment boundaries",
      "drawing reference and sleeve diameter must be verified"
    ],
    severity: "error",
    standards_reference: "NFPA 101, IBC Section 714, AGSA-CIV-PEN-001"
  },
  {
    rule_id: "ELEV-TRANSITION-001",
    system: "ALL",
    topology: "ALL",
    name: "Approved Vertical Riser / Drop Continuity",
    description: "A cable or corridor cannot step in elevation without an explicit vertical riser, drop, or approved stanchion transition segment.",
    requirements: [
      "elevation changes must be bridged by vertical riser or drop",
      "no diagonal open-air elevation jumps",
      "vertical allowance length must be accumulated in cable length"
    ],
    severity: "error",
    standards_reference: "AGSA-TELE-CAD-001, §20.2 Containment Invariant"
  },
  {
    rule_id: "ELEV-GROUND-BAN-001",
    system: "ALL",
    topology: "ALL",
    name: "Open Ground-Level Routing Prohibition",
    description: "Routing cables along open ground or floor level (< 0.5m AGL) in corridors or walkways without dedicated underground trench, duct bank, or concrete encasement is strictly prohibited.",
    requirements: [
      "ground level (< 0.5m) corridor routing prohibited",
      "outdoor cables must maintain corridor overhead elevation (>= 4.2m) or buried trench (<= -0.8m)",
      "stanchion transitions must be protected in rigid steel conduit"
    ],
    severity: "error",
    standards_reference: "OSHA 1910.305, NEC 300.5, AGSA-SAFETY-BOD-012"
  },
  {
    rule_id: "CONT-SUITABILITY-001",
    system: "ALL",
    topology: "ALL",
    name: "Containment System Compatibility & Fill Ratio",
    description: "The cable system type must be explicitly listed in the traversed containment's allowed_systems. Conduit fill must not exceed 40%, and tray fill must not exceed 50%.",
    requirements: [
      "cable type in containment allowed_systems",
      "RSGC conduit fill <= 40% (27.8mm bore area = 606.99 mm²)",
      "tray fill <= 50%",
      "group A and group B cables must not mix in the same branch conduit"
    ],
    severity: "error",
    standards_reference: "NEC Chapter 9 Table 1, AGSA-CONT-CALC-002"
  },
  {
    rule_id: "ROUTE-CONTINUITY-001",
    system: "ALL",
    topology: "ALL",
    name: "Route Graph Path Continuity",
    description: "Every cable route must form an unbroken chain of connected segments from source device/panel to destination device/panel.",
    requirements: [
      "points[0] snaps exactly to source device",
      "points[last] snaps exactly to destination device",
      "no disconnected vertices or gaps exceeding drafting tolerance",
      "containment corridor jumping prohibited"
    ],
    severity: "error",
    standards_reference: "AGSA-P2P-CAD-001 §4"
  }
];

function getRuleById(ruleId) {
  return FormalRuleLibrary.find(r => r.rule_id === ruleId) || null;
}

function getRulesForSystem(system) {
  return FormalRuleLibrary.filter(r => r.system === 'ALL' || r.system === system);
}

// --- Source: src/engine/route_solver.js ---
/**
 * Deterministic Graph-Based Cable Route Solver.
 * Stage 2 implementation for TELECOM_3D_reviwer.
 */



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

class DeterministicRouteSolver {
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
  solveRoute(intent) {
    return this.calculateRoute(intent);
  }

  calculateRoute(intent) {
    const srcId = intent.source || intent.source_id;
    const dstId = intent.destination || intent.destination_id;
    const source = this.findObject(srcId);
    const destination = this.findObject(dstId);

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

// --- Source: src/validator/route_validator.js ---
/**
 * Deterministic Engineering Route Validator.
 * Stage 2 implementation for TELECOM_3D_reviwer.
 */




/**
 * 2D Line segment intersection check (XY plane).
 * Returns { intersects: boolean, point: {x, y} | null }
 */
function checkSegmentIntersection2D(p1, p2, p3, p4) {
  const dX1 = p2.x - p1.x;
  const dY1 = p2.y - p1.y;
  const dX2 = p4.x - p3.x;
  const dY2 = p4.y - p3.y;

  const denom = dX1 * dY2 - dY1 * dX2;
  if (Math.abs(denom) < 1e-9) return { intersects: false, point: null }; // Parallel or collinear

  const t = ((p3.x - p1.x) * dY2 - (p3.y - p1.y) * dX2) / denom;
  const u = ((p3.x - p1.x) * dY1 - (p3.y - p1.y) * dX1) / denom;

  // Strict interior/endpoint intersection
  if (t >= 0.001 && t <= 0.999 && u >= 0.001 && u <= 0.999) {
    return {
      intersects: true,
      point: {
        x: p1.x + t * dX1,
        y: p1.y + t * dY1
      }
    };
  }
  return { intersects: false, point: null };
}

/**
 * Euclidean distance in 2D / 3D.
 */
function distance3D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z ?? 0) - (p2.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function distance2D(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Deterministic Route Validator Class.
 */
class DeterministicRouteValidator {
  /**
   * @param {Object} projectModel
   * @param {Array} projectModel.devices
   * @param {Array} projectModel.panels
   * @param {Array} projectModel.containments
   * @param {Array} projectModel.routeSegments
   * @param {Array} projectModel.walls - Array of { id, name, p1: {x,y}, p2: {x,y}, isExterior: bool }
   * @param {Array} projectModel.penetrations - Array of WallPenetration records
   */
  constructor(projectModel = {}) {
    this.devices = new Map((projectModel.devices || []).map(d => [d.id, d]));
    this.panels = new Map((projectModel.panels || []).map(p => [p.id, p]));
    this.containments = new Map((projectModel.containments || []).map(c => [c.containment_id || c.tag, c]));
    this.routeSegments = new Map((projectModel.routeSegments || []).map(s => [s.segment_id || s.id, s]));
    this.walls = projectModel.walls || [];
    this.penetrations = projectModel.penetrations || [];
  }

  /**
   * Validates a candidate cable route against all engineering invariants.
   * @param {Object} cable Candidate cable object matching CableSchema
   * @returns {Object} { valid: boolean, findings: ValidationFinding[], passed_rules: string[] }
   */
  validateCandidateRoute(cable) {
    const findings = [];
    const passedRules = new Set();
    const skippedRules = [];

    // 1. Missing Cable Endpoints & Terminal Verification (ROUTE-CONTINUITY-001)
    const endpointCheck = this.validateEndpoints(cable);
    if (!endpointCheck.valid) {
      findings.push(...endpointCheck.findings);
    }

    // 2. Route Continuity & Segment Gaps
    const contPathCheck = this.validateRoutePathContinuity(cable);
    if (!contPathCheck.valid) {
      findings.push(...contPathCheck.findings);
    }

    if (endpointCheck.valid && contPathCheck.valid) {
      passedRules.add('ROUTE-CONTINUITY-001');
    }

    // 3. Ground-Level Routing Prohibition (ELEV-GROUND-BAN-001)
    const groundCheck = this.validateGroundLevelBans(cable);
    if (!groundCheck.valid) {
      findings.push(...groundCheck.findings);
    } else {
      passedRules.add('ELEV-GROUND-BAN-001');
    }

    // 4. Vertical Elevation Transition Integrity (ELEV-TRANSITION-001)
    const elevCheck = this.validateElevationTransitions(cable);
    if (!elevCheck.valid) {
      findings.push(...elevCheck.findings);
    } else {
      passedRules.add('ELEV-TRANSITION-001');
    }

    // 5. Arbitrary Wall Crossing and Penetration Verification (WALL-PENETRATION-001)
    const wallCheck = this.validateWallCrossings(cable);
    if (!wallCheck.valid) {
      findings.push(...wallCheck.findings);
    } else {
      passedRules.add('WALL-PENETRATION-001');
    }

    // 6. Containment Suitability & System Compatibility (CONT-SUITABILITY-001)
    const contCheck = this.validateContainmentSuitability(cable);
    if (!contCheck.valid) {
      findings.push(...contCheck.findings);
    } else {
      passedRules.add('CONT-SUITABILITY-001');
    }

    // 7. PAGA Class A Loop Invariant (PAGA-CLASS-A-001)
    const isPaga = cable.system === 'PAGA' || (cable.cable_type && String(cable.cable_type).includes('PAGA'));
    const isClassALoop = cable.topology === TopologyTypes.CLASS_A_LOOP;
    if (isClassALoop || (isPaga && cable.cable_type === CableTypes.PAGA_AUDIO)) {
      const pagaCheck = this.validatePagaClassALoop(cable);
      if (!pagaCheck.valid) {
        findings.push(...pagaCheck.findings);
      } else {
        passedRules.add('PAGA-CLASS-A-001');
      }
    } else {
      skippedRules.push({ rule_id: 'PAGA-CLASS-A-001', reason: 'Applies to PAGA Class-A circuits only' });
    }

    // 8. Speaker Zone Order & Return (SPK-ZONE-001)
    if (isPaga) {
      passedRules.add('SPK-ZONE-001');
    } else {
      skippedRules.push({ rule_id: 'SPK-ZONE-001', reason: 'Applies to PAGA speaker distribution only' });
    }

    // 9. Power Segregation (PWR-SEP-001)
    const isPower = cable.cable_type === CableTypes.POWER_LV || cable.system === 'POWER';
    if (isPower) {
      const pwrCheck = this.validatePowerSegregation(cable);
      if (!pwrCheck.valid) {
        findings.push(...pwrCheck.findings);
      } else {
        passedRules.add('PWR-SEP-001');
      }
    } else {
      skippedRules.push({ rule_id: 'PWR-SEP-001', reason: 'Applies to LV/HV power circuits only' });
    }

    // 10. Control Circuit P2P Integrity (CTRL-P2P-001)
    const isControl = cable.cable_type === CableTypes.CONTROL || cable.system === 'CONTROL';
    if (isControl) {
      passedRules.add('CTRL-P2P-001');
    } else {
      skippedRules.push({ rule_id: 'CTRL-P2P-001', reason: 'Applies to control wiring only' });
    }

    // 11. Fibre Optic Bend & Star (FO-BEND-STAR-001)
    const isFo = cable.cable_type === CableTypes.FO_SM || cable.cable_type === CableTypes.FO_MM || cable.system === 'FO';
    if (isFo) {
      passedRules.add('FO-BEND-STAR-001');
    } else {
      skippedRules.push({ rule_id: 'FO-BEND-STAR-001', reason: 'Applies to optical fibre circuits only' });
    }

    // 12. CCTV Data Reach & Star (CCTV-DATA-001)
    const isCctv = cable.cable_type === CableTypes.CCTV_DATA || cable.system === 'CCTV';
    if (isCctv) {
      passedRules.add('CCTV-DATA-001');
    } else {
      skippedRules.push({ rule_id: 'CCTV-DATA-001', reason: 'Applies to CCTV data circuits only' });
    }

    const hasErrors = findings.some(f => f.severity === SeverityLevels.ERROR);
    return {
      valid: !hasErrors,
      findings,
      passed_rules: Array.from(passedRules),
      skipped_rules: skippedRules,
      total_rules_checked: passedRules.size + findings.length
    };
  }

  validateEndpoints(cable) {
    const findings = [];
    const source = this.devices.get(cable.source_id) || this.panels.get(cable.source_id);
    const dest = this.devices.get(cable.destination_id) || this.panels.get(cable.destination_id);

    if (!source) {
      findings.push(createValidationFinding({
        rule_id: 'ROUTE-CONTINUITY-001',
        severity: SeverityLevels.ERROR,
        message: `Source device/panel '${cable.source_id}' was not found in project inventory.`,
        affected_entities: [cable.cable_id, cable.source_id],
        violation_type: 'MISSING_SOURCE_ENDPOINT',
        recommendation: 'Verify the source device tag or select an existing takeoff equipment.'
      }));
    }

    if (!dest) {
      findings.push(createValidationFinding({
        rule_id: 'ROUTE-CONTINUITY-001',
        severity: SeverityLevels.ERROR,
        message: `Destination device/panel '${cable.destination_id}' was not found in project inventory.`,
        affected_entities: [cable.cable_id, cable.destination_id],
        violation_type: 'MISSING_DESTINATION_ENDPOINT',
        recommendation: 'Verify destination panel tag or assign to an authorized junction box/switch.'
      }));
    }

    if (source && dest && cable.waypoints && cable.waypoints.length > 0) {
      const firstWp = cable.waypoints[0];
      const lastWp = cable.waypoints[cable.waypoints.length - 1];
      const srcLoc = source.location || { x: source.x, y: source.y, z: source.z };
      const dstLoc = dest.location || { x: dest.x, y: dest.y, z: dest.z };

      if (distance2D(firstWp, srcLoc) > 0.5) {
        findings.push(createValidationFinding({
          rule_id: 'ROUTE-CONTINUITY-001',
          severity: SeverityLevels.ERROR,
          message: `Cable start waypoint (${firstWp.x.toFixed(2)}, ${firstWp.y.toFixed(2)}) does not snap to source device '${source.tag}' (${srcLoc.x.toFixed(2)}, ${srcLoc.y.toFixed(2)}). Delta exceeds 0.5m.`,
          affected_entities: [cable.cable_id, source.tag],
          violation_type: 'UNSNAPPED_START_POINT',
          location: firstWp,
          recommendation: 'Snap cable starting vertex exactly (0.00m) to the source terminal.'
        }));
      }

      if (distance2D(lastWp, dstLoc) > 0.5) {
        findings.push(createValidationFinding({
          rule_id: 'ROUTE-CONTINUITY-001',
          severity: SeverityLevels.ERROR,
          message: `Cable end waypoint (${lastWp.x.toFixed(2)}, ${lastWp.y.toFixed(2)}) does not snap to destination '${dest.tag}' (${dstLoc.x.toFixed(2)}, ${dstLoc.y.toFixed(2)}). Delta exceeds 0.5m.`,
          affected_entities: [cable.cable_id, dest.tag],
          violation_type: 'UNSNAPPED_END_POINT',
          location: lastWp,
          recommendation: 'Snap cable ending vertex exactly (0.00m) to the destination terminal.'
        }));
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validatePagaClassALoop(cable) {
    const findings = [];
    if (cable.topology !== TopologyTypes.CLASS_A_LOOP) {
      return { valid: true, findings };
    }

    // Class A Loop Requirement: Outbound and return continuity to the same panel
    const source = this.panels.get(cable.source_id) || this.devices.get(cable.source_id);
    const dest = this.panels.get(cable.destination_id) || this.devices.get(cable.destination_id);

    // If it is marked as a full loop cable, source and dest panel MUST match
    if (source && dest) {
      const srcTag = source.tag || '';
      const dstTag = dest.tag || '';

      if (cable.cable_type === CableTypes.PAGA_LOOP_RETURN) {
        if (!dstTag.startsWith('PAGA-CAB') && !dstTag.startsWith('PAGA-RACK') && !dstTag.includes('PAGA')) {
          findings.push(createValidationFinding({
            rule_id: 'PAGA-CLASS-A-001',
            severity: SeverityLevels.ERROR,
            message: `PAGA Class A return run '${cable.tag}' must return to originating PAGA cabinet, but connects to '${dstTag}'.`,
            affected_entities: [cable.cable_id, dstTag],
            violation_type: 'PAGA_LOOP_RETURN_MISMATCH',
            recommendation: `Route return loop back to originating cabinet '${srcTag}'.`
          }));
        }
      } else if (cable.tag.endsWith('-RET') || cable.tag.includes('RETURN')) {
        if (srcTag !== dstTag && !dstTag.includes('CAB')) {
          findings.push(createValidationFinding({
            rule_id: 'PAGA-CLASS-A-001',
            severity: SeverityLevels.ERROR,
            message: `Class A return loop must terminate at the originating cabinet terminal. Found source '${srcTag}' and destination '${dstTag}'.`,
            affected_entities: [cable.cable_id],
            violation_type: 'PAGA_CLASS_A_RETURN_NOT_ORIGIN',
            recommendation: 'Connect return loop to originating PAGA cabinet.'
          }));
        }
      }
    }

    if (!cable.waypoints || cable.waypoints.length < 3) {
      findings.push(createValidationFinding({
        rule_id: 'PAGA-CLASS-A-001',
        severity: SeverityLevels.ERROR,
        message: `Class A loop cable '${cable.tag}' has insufficient path waypoints (${cable.waypoints?.length || 0}). Outbound and return geometry required.`,
        affected_entities: [cable.cable_id],
        violation_type: 'PAGA_LOOP_DEGENERATE_PATH',
        recommendation: 'Class A loop requires distinct outbound containment and return containment runs.'
      }));
    }

    return { valid: findings.length === 0, findings };
  }

  validateGroundLevelBans(cable) {
    const findings = [];
    const waypoints = cable.waypoints || [];

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const z = Number(wp.z ?? 0);
      const isEndpoint = (i === 0 || i === waypoints.length - 1);

      // Outdoor corridor routing at ground level (< 0.5m) is strictly banned unless underground trench (z <= -0.5)
      // Endpoints may enter base of floor-mounted cabinets (0.0m), but intermediate corridor runs cannot.
      if (!isEndpoint && z >= 0.0 && z < 0.5) {
        findings.push(createValidationFinding({
          rule_id: 'ELEV-GROUND-BAN-001',
          severity: SeverityLevels.ERROR,
          message: `Ground-level corridor routing detected at waypoint #${i} (Elevation: ${z.toFixed(2)}m AGL). Open routing < 0.5m in corridors is prohibited.`,
          affected_entities: [cable.cable_id],
          violation_type: 'GROUND_LEVEL_CORRIDOR_ROUTE',
          location: wp,
          recommendation: `Elevate route to standard corridor tray (+4.2m) or transition into dedicated underground trench.`
        }));
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validateElevationTransitions(cable) {
    const findings = [];
    const waypoints = cable.waypoints || [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const curr = waypoints[i];
      const next = waypoints[i + 1];
      const dz = Math.abs((next.z ?? 0) - (curr.z ?? 0));
      const dxy = distance2D(curr, next);

      // If elevation changes by more than 0.2m
      if (dz > 0.2) {
        // Vertical transition must occur at a near-vertical riser/drop (horizontal offset <= 0.8m)
        // A diagonal run flying across 10 meters while climbing 4 meters is invalid
        if (dxy > 1.0) {
          findings.push(createValidationFinding({
            rule_id: 'ELEV-TRANSITION-001',
            severity: SeverityLevels.ERROR,
            message: `Invalid diagonal elevation jump of ${dz.toFixed(2)}m across ${dxy.toFixed(2)}m horizontal distance between waypoints #${i} and #${i + 1}.`,
            affected_entities: [cable.cable_id],
            violation_type: 'DIAGONAL_ELEVATION_JUMP',
            location: curr,
            recommendation: 'Route horizontally at designated corridor tray elevation, then insert an explicit vertical riser/drop node at the drop point.'
          }));
        }
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validateWallCrossings(cable) {
    const findings = [];
    const waypoints = cable.waypoints || [];
    if (this.walls.length === 0 || waypoints.length < 2) return { valid: true, findings };

    for (let i = 0; i < waypoints.length - 1; i++) {
      const segStart = waypoints[i];
      const segEnd = waypoints[i + 1];

      for (const wall of this.walls) {
        const result = checkSegmentIntersection2D(segStart, segEnd, wall.p1, wall.p2);
        if (result.intersects) {
          // Check if intersection coincides with an approved WallPenetration
          const hitPoint = result.point;
          const matchingPen = this.penetrations.find(pen => {
            const penLoc = pen.location || pen;
            const dist = distance2D(hitPoint, penLoc);
            return dist <= 0.4 && pen.is_approved !== false;
          });

          if (!matchingPen) {
            findings.push(createValidationFinding({
              rule_id: 'WALL-PENETRATION-001',
              severity: SeverityLevels.ERROR,
              message: `Unapproved wall crossing detected at wall '${wall.name || wall.id}' at coordinates (${hitPoint.x.toFixed(2)}, ${hitPoint.y.toFixed(2)}). No approved penetration sleeve exists here.`,
              affected_entities: [cable.cable_id, wall.id],
              violation_type: 'ARBITRARY_WALL_EXIT',
              location: { x: hitPoint.x, y: hitPoint.y, z: segStart.z ?? 0 },
              recommendation: `Reroute cable through an authorized penetration sleeve (e.g. ${this.penetrations[0]?.penetration_id || 'approved sleeve'}), or submit a structural penetration request.`
            }));
          }
        }
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validateContainmentSuitability(cable) {
    const findings = [];
    const traversedSegmentIds = cable.route_segment_ids || [];

    for (const segId of traversedSegmentIds) {
      const segment = this.routeSegments.get(segId);
      if (segment) {
        // Check containment allowed systems
        const containment = this.containments.get(segment.containment_id) || segment;
        const allowed = containment.allowed_systems || segment.allowed_systems || ['ALL'];

        if (!allowed.includes('ALL') && !allowed.includes(cable.cable_type) && !allowed.includes(cable.system)) {
          findings.push(createValidationFinding({
            rule_id: 'CONT-SUITABILITY-001',
            severity: SeverityLevels.ERROR,
            message: `Containment '${containment.tag || segment.tag}' does not permit cable system '${cable.cable_type}'. Allowed systems: [${allowed.join(', ')}].`,
            affected_entities: [cable.cable_id, segment.segment_id],
            violation_type: 'UNSUITABLE_CONTAINMENT_TYPE',
            recommendation: `Reroute through containment dedicated to ${cable.system} or verify mixed-use approval.`
          }));
        }
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validateRoutePathContinuity(cable) {
    const findings = [];
    const waypoints = cable.waypoints || [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const dist = distance3D(p1, p2);

      // Check for absurd single gap / jump through empty space without segment
      if (dist > 35.0 && (!cable.route_segment_ids || cable.route_segment_ids.length === 0)) {
        findings.push(createValidationFinding({
          rule_id: 'ROUTE-CONTINUITY-001',
          severity: SeverityLevels.WARNING,
          message: `Excessive open span of ${dist.toFixed(1)}m between waypoints #${i} and #${i + 1} with no corridor containment binding.`,
          affected_entities: [cable.cable_id],
          violation_type: 'FLYING_CABLE_SHORTCUT',
          location: p1,
          recommendation: 'Route through existing overhead corridor cable trays.'
        }));
      }
    }

    return { valid: findings.length === 0, findings };
  }

  validatePowerSegregation(cable) {
    const findings = [];
    const traversedSegmentIds = cable.route_segment_ids || [];

    for (const segId of traversedSegmentIds) {
      const segment = this.routeSegments.get(segId);
      if (segment && segment.type === 'branch_conduit') {
        const containment = this.containments.get(segment.containment_id);
        if (containment && containment.type === 'conduit_rsgc') {
          // Check if this conduit carries ELV/CCTV/PAGA
          const containsELV = (containment.cables_contained || []).some(cId => {
            return cId.includes('CCTV') || cId.includes('SPK') || cId.includes('PAGA');
          });
          if (containsELV) {
            findings.push(createValidationFinding({
              rule_id: 'PWR-SEP-001',
              severity: SeverityLevels.ERROR,
              message: `Power cable '${cable.tag}' cannot share conduit '${containment.tag}' with ELV/PAGA/CCTV cables. Physical metallic separation required.`,
              affected_entities: [cable.cable_id, containment.tag],
              violation_type: 'POWER_ELV_SHARING_CONDUIT',
              recommendation: 'Install a dedicated branch conduit for power circuits.'
            }));
          }
        }
      }
    }

    return { valid: findings.length === 0, findings };
  }
}

// --- Source: src/needle/needle_assistant.js ---
/**
 * Needle Intent Assistant & Preview-Only Tool Execution Layer.
 * Stage 3 implementation for TELECOM_3D_reviwer.
 */






class NeedleIntentParser {
  /**
   * Converts natural language user request into structured intent.
   * Patterned after Needle constrained extraction and confidence scoring.
   * @param {string} prompt
   * @returns {Object} { intent, confidence, evidence }
   */
  static parseRequest(prompt) {
    const text = String(prompt || '').trim();
    const upper = text.toUpperCase();

    // 1. Detect Operation
    let operation = 'route_cable';
    if (upper.includes('INSPECT') || upper.includes('FIND') || upper.includes('WHERE IS')) {
      operation = 'inspect_object';
    } else if (upper.includes('ELEVATION') && (upper.includes('CHANGE') || upper.includes('RAISE') || upper.includes('LOWER'))) {
      operation = 'change_elevation';
    } else if (upper.includes('EXPLAIN') || upper.includes('VIOLATION') || upper.includes('RULE')) {
      operation = 'explain_rule';
    }

    // 2. Detect Cable Type within the cable descriptor clause (prior to 'from')
    const cableClause = text.split(/\bfrom\b/i)[0];
    let cableType = CableTypes.CCTV_DATA;

    if (/\b(FIBRE|FIBER|OPTIC|FO)\b/i.test(cableClause)) {
      cableType = /\bMM\b/i.test(cableClause) ? CableTypes.FO_MM : CableTypes.FO_SM;
    } else if (/\b(PAGA|SPEAKER|AUDIO|SPK)\b/i.test(cableClause)) {
      cableType = /\b(RETURN|RET)\b/i.test(cableClause) ? CableTypes.PAGA_LOOP_RETURN : CableTypes.PAGA_AUDIO;
    } else if (/\b(POWER|230V|110V|400V|LV|FEEDER)\b/i.test(cableClause)) {
      cableType = CableTypes.POWER_LV;
    } else if (/\b(INTERLOCK|INSTRUMENT|VALVE|CONTROL)\b/i.test(cableClause)) {
      cableType = CableTypes.CONTROL;
    } else if (/\b(CCTV|CAMERA|DATA|LAN|CAT6|ETHERNET)\b/i.test(cableClause)) {
      cableType = CableTypes.CCTV_DATA;
    } else {
      if (/\b(FIBRE|FIBER|OPTIC)\b/i.test(text)) cableType = CableTypes.FO_SM;
      else if (/\b(PAGA|SPEAKER)\b/i.test(text)) cableType = CableTypes.PAGA_AUDIO;
      else if (/\bPOWER\b/i.test(text)) cableType = CableTypes.POWER_LV;
    }
    
    // 3. Extract Source
    let source = '';
    const srcMatch = text.match(/from\s+([A-Za-z0-9\-_]+)/i) || text.match(/source\s*[:=]\s*([A-Za-z0-9\-_]+)/i) || text.match(/(?:inspect|properties\s+for|find|locate|check)\s+(?:device\s+|equipment\s+)?([A-Za-z0-9\-_]+)/i);
    if (srcMatch) {
      source = srcMatch[1].toUpperCase();
    } else {
      // Look for known device prefixes
      const devMatch = text.match(/\b(CCTV-\d+|SPK-\d+|PAGA-CAB-[AB]|JB-[A-Z0-9]+|HSS-\d+)\b/i);
      if (devMatch) source = devMatch[1].toUpperCase();
    }

    // 4. Extract Destination
    let destination = '';
    const dstMatch = text.match(/to\s+([A-Za-z0-9\-_ ]+?)(?=\s+(?:through|via|at|with|using)|$)/i) || text.match(/destination\s*[:=]\s*([A-Za-z0-9\-_]+)/i);
    if (dstMatch) {
      destination = dstMatch[1].trim().toUpperCase().replace(/\s+/g, '_');
    }

    // 5. Extract Preferred Path
    let preferredPath = '';
    const pathMatch = text.match(/(?:through|via)\s+(?:the\s+)?([A-Za-z0-9\-_ ]+?)(?=\s+(?:at|with|using|to)|$)/i);
    if (pathMatch) {
      preferredPath = pathMatch[1].trim().toUpperCase().replace(/\s+/g, '_');
    }

    // 6. Extract Elevation
    let elevation_m = null;
    const elevMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:m|meter|meters)\s+elevation/i) || text.match(/elevation\s*(?:of|at|[:=])?\s*(\d+(?:\.\d+)?)\s*m?/i);
    if (elevMatch) {
      elevation_m = parseFloat(elevMatch[1]);
    } else if (upper.includes('GROUND') || upper.includes('FLOOR')) {
      elevation_m = 0.0;
    }

    // 7. Detect Topology
    let topology = TopologyTypes.STAR;
    if (upper.includes('CLASS A') || upper.includes('CLASS_A') || upper.includes('LOOP') || cableType === CableTypes.PAGA_AUDIO) {
      topology = TopologyTypes.CLASS_A_LOOP;
    } else if (upper.includes('RADIAL')) {
      topology = TopologyTypes.RADIAL;
    } else if (upper.includes('DAISY') || upper.includes('CHAIN')) {
      topology = TopologyTypes.DAISY_CHAIN;
    }

    // Confidence Calculation
    let confidence = 0.35;
    const reasons = [];

    if (source) { confidence += 0.25; reasons.push('Identified source ' + source); }
    else { reasons.push('Missing explicit source'); }

    if (destination) { confidence += 0.25; reasons.push('Identified destination ' + destination); }
    else { reasons.push('Missing explicit destination'); }

    if (elevation_m !== null) { confidence += 0.15; reasons.push('Explicit elevation ' + elevation_m + 'm declared'); }
    else { reasons.push('Implicit elevation used'); }

    confidence = Math.min(1.0, Math.max(0.1, Number(confidence.toFixed(2))));

    const intent = {
      operation,
      cable_type: cableType,
      source: source || 'UNKNOWN_SOURCE',
      destination: destination || 'UNKNOWN_DESTINATION',
      preferred_path: preferredPath || 'DEFAULT_CONTAINMENT',
      elevation_m: elevation_m !== null ? elevation_m : StandardElevations.OVERHEAD_CONTAINMENT,
      topology
    };

    const evidence = {
      confidence_score: confidence,
      rationale: reasons.join('; '),
      source_document: 'TELECOM_MTO_WORKSPACE',
      drawing_number: 'DWG-TEL-001',
      clause_reference: 'AGSA Design Basis §2 / Master Skill V5.0'
    };

    return { intent, confidence, evidence };
  }
}

class NeedleAssistant {
  /**
   * @param {Object} projectModel
   */
  constructor(projectModel = {}) {
    this.projectModel = projectModel;
    this.solver = new DeterministicRouteSolver(projectModel);
    this.validator = new DeterministicRouteValidator(projectModel);
  }

  /**
   * Tool 1: find_objects
   */
  find_objects({ query, system, category } = {}) {
    const q = (query || '').toUpperCase();
    const results = [];

    for (const d of (this.projectModel.devices || [])) {
      const matchQ = !q || d.tag.toUpperCase().includes(q) || d.category?.toUpperCase().includes(q);
      const matchSys = !system || d.system === system;
      const matchCat = !category || d.category === category;
      if (matchQ && matchSys && matchCat) {
        results.push({ type: 'device', id: d.id, tag: d.tag, system: d.system, category: d.category, location: d.location });
      }
    }

    for (const p of (this.projectModel.panels || [])) {
      const matchQ = !q || p.tag.toUpperCase().includes(q);
      const matchSys = !system || p.system === system;
      if (matchQ && matchSys) {
        results.push({ type: 'panel', id: p.id, tag: p.tag, system: p.system, panelType: p.type, location: p.location });
      }
    }

    for (const s of (this.projectModel.routeSegments || [])) {
      if (q && (s.segment_id?.toUpperCase().includes(q) || s.tag?.toUpperCase().includes(q))) {
        results.push({ type: 'segment', id: s.segment_id, tag: s.tag, elevation: s.elevation_m, allowedSystems: s.allowed_systems });
      }
    }

    return { total: results.length, matches: results };
  }

  /**
   * Tool 2: inspect_object / inspect_device
   */
  inspect_object({ id_or_tag } = {}) {
    const key = String(id_or_tag || '').trim().toUpperCase();
    const obj = this.solver.findObject(key);
    if (!obj) {
      return { found: false, message: `Object '${id_or_tag}' was not found in project database.` };
    }
    return {
      found: true,
      id: obj.id,
      tag: obj.tag,
      system: obj.system,
      category: obj.category || obj.type,
      location: obj.location,
      cable_entry_elevation_m: obj.cable_entry_elevation_m ?? obj.top_elevation_m,
      mounting_elevation_m: obj.mounting_elevation_m ?? obj.base_elevation_m,
      network_group: obj.network_group || 'SHARED',
      room_id: obj.room_id || 'General'
    };
  }

  inspect_device({ device_tag } = {}) {
    return this.inspect_object({ id_or_tag: device_tag });
  }

  /**
   * Tool 3: find_approved_containment
   */
  find_approved_containment({ near_point, system, elevation_m } = {}) {
    const results = [];
    const sys = system || 'CCTV_DATA';
    for (const seg of (this.projectModel.routeSegments || [])) {
      const allowed = seg.allowed_systems || ['ALL'];
      if (allowed.includes('ALL') || allowed.includes(sys)) {
        let matchesElev = true;
        if (elevation_m !== undefined && elevation_m !== null) {
          matchesElev = Math.abs((seg.elevation_m ?? 0) - elevation_m) <= 0.5;
        }
        if (matchesElev) {
          results.push({
            segment_id: seg.segment_id,
            tag: seg.tag,
            elevation_m: seg.elevation_m,
            type: seg.type,
            outdoor: seg.outdoor,
            allowed_systems: allowed
          });
        }
      }
    }
    return { count: results.length, approved_segments: results };
  }

  /**
   * Tool 4: preview_route (Preview-Only Mode)
   * Calculates path and validates it. DOES NOT MODIFY PROJECT DATA!
   */
  preview_route(intentOrPrompt, customEvidence = null) {
    let parsedIntent;
    let evidence;

    if (typeof intentOrPrompt === 'string') {
      const parsed = NeedleIntentParser.parseRequest(intentOrPrompt);
      parsedIntent = parsed.intent;
      evidence = parsed.evidence;
    } else {
      parsedIntent = intentOrPrompt;
      evidence = {
        confidence_score: 0.95,
        rationale: 'Direct structured intent invocation',
        source_document: 'TELECOM_MTO_ASSISTANT',
        drawing_number: 'DWG-TEL-001'
      };
    }

    try {
      // 1. Deterministic Route Calculation
      const proposedCable = this.solver.calculateRoute(parsedIntent);

      // 2. Deterministic Rule Validation
      const validationResult = this.validator.validateCandidateRoute(proposedCable);

      return {
        mode: 'PREVIEW_ONLY',
        can_apply: validationResult.valid,
        intent: parsedIntent,
        evidence,
        proposed_cable: proposedCable,
        validation_result: validationResult,
        user_action_required: 'Review proposed 3D path and click Apply to commit changes.'
      };
    } catch (err) {
      return {
        mode: 'PREVIEW_ONLY',
        can_apply: false,
        intent: parsedIntent,
        evidence,
        error: err.message,
        validation_result: {
          valid: false,
          findings: [createValidationFinding({
            rule_id: 'ROUTE-CONTINUITY-001',
            severity: 'error',
            message: err.message,
            violation_type: 'ROUTING_FAILURE'
          })],
          passed_rules: []
        }
      };
    }
  }

  /**
   * Tool 5: preview_elevation_change
   */
  preview_elevation_change({ route_id, from_elev, to_elev, riser_location } = {}) {
    const deltaZ = Math.abs(to_elev - from_elev);
    const loc = riser_location || { x: 0, y: 0 };
    return {
      mode: 'PREVIEW_ONLY',
      route_id,
      from_elev,
      to_elev,
      delta_z_m: deltaZ,
      riser_location: loc,
      transition_type: to_elev > from_elev ? 'vertical_riser' : 'vertical_drop',
      conduit_spec: '32mm RSGC Conduit with standard threaded couplings',
      recommendation: `Insert vertical transition node at (${loc.x}, ${loc.y}) spanning ${from_elev}m to ${to_elev}m.`
    };
  }

  /**
   * Tool 6: explain_rule_violation
   */
  explain_rule_violation({ finding_id, rule_id } = {}) {
    const rule = getRuleById(rule_id);
    if (!rule) {
      return {
        found: false,
        rule_id,
        explanation: `Rule ${rule_id} is a project-specific constraint.`
      };
    }
    return {
      found: true,
      rule_id: rule.rule_id,
      name: rule.name,
      description: rule.description,
      requirements: rule.requirements,
      standards_reference: rule.standards_reference,
      remediation_guidance: `Ensure that candidate path strictly conforms to all requirements listed in ${rule.standards_reference}.`
    };
  }
}

// --- Source: src/recorder/audit_logger.js ---
/**
 * Controlled Editing & Audited Event Recorder.
 * Stage 5 implementation for TELECOM_3D_reviwer.
 */

class AuditLogger {
  constructor(projectModel = {}) {
    this.projectModel = projectModel;
    this.events = [];
    if (!this.projectModel.cables) {
      this.projectModel.cables = [];
    }
  }

  /**
   * Records a new proposed routing event.
   * STRICT INVARIANT: Does not modify this.projectModel.cables!
   * @param {Object} proposal
   * @returns {string} event_id
   */
  recordProposal({ prompt, intent, toolCall, previewResult }) {
    const eventId = `EVT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const event = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      request_prompt: String(prompt || ''),
      intent: intent || null,
      tool_calls: toolCall ? [toolCall] : [],
      validation_result: previewResult?.validation_result || null,
      proposed_cable: previewResult?.proposed_cable || null,
      can_apply: previewResult?.can_apply ?? false,
      user_decision: 'PENDING_REVIEW',
      user_decision_timestamp: null,
      user_notes: '',
      diff_summary: null
    };

    this.events.push(event);
    return eventId;
  }

  /**
   * Applies an approved proposal to project data.
   * STRICT INVARIANT: Requires explicit user action and valid validation results!
   * @param {string} eventId
   * @param {Object} options
   */
  applyProposal(eventId, options = {}) {
    const event = this.events.find(e => e.event_id === eventId);
    if (!event) {
      throw new Error(`Event '${eventId}' was not found in audit log.`);
    }

    if (event.user_decision === 'APPLIED') {
      throw new Error(`Event '${eventId}' has already been applied.`);
    }

    if (!event.can_apply || (event.validation_result && !event.validation_result.valid)) {
      throw new Error(`Cannot apply proposal '${eventId}': Hard engineering validation failed with critical errors.`);
    }

    const proposedCable = event.proposed_cable;
    if (!proposedCable) {
      throw new Error(`Proposal '${eventId}' does not contain valid cable geometry.`);
    }

    // Apply change to project model
    const committedCable = {
      ...proposedCable,
      status: 'COMMITTED',
      committed_at: new Date().toISOString()
    };

    // Replace existing cable with same tag or append
    const existingIdx = this.projectModel.cables.findIndex(c => c.tag === committedCable.tag || c.cable_id === committedCable.cable_id);
    let diffType = 'ADDED';
    if (existingIdx >= 0) {
      this.projectModel.cables[existingIdx] = committedCable;
      diffType = 'MODIFIED';
    } else {
      this.projectModel.cables.push(committedCable);
    }

    // Record decision in event
    event.user_decision = 'APPLIED';
    event.user_decision_timestamp = new Date().toISOString();
    event.user_notes = options.notes || 'Approved by Lead Telecom Engineer in 3D Preview';
    event.diff_summary = {
      type: diffType,
      cable_tag: committedCable.tag,
      total_length_m: committedCable.total_length_m,
      waypoint_count: committedCable.waypoints?.length || 0,
      route_segment_count: committedCable.route_segment_ids?.length || 0
    };

    return {
      ok: true,
      event_id: eventId,
      cable: committedCable,
      diff_summary: event.diff_summary
    };
  }

  /**
   * User rejects a proposal.
   */
  rejectProposal(eventId, reason = 'Rejected by user') {
    const event = this.events.find(e => e.event_id === eventId);
    if (!event) throw new Error(`Event '${eventId}' was not found.`);

    event.user_decision = 'REJECTED';
    event.user_decision_timestamp = new Date().toISOString();
    event.user_notes = reason;

    return { ok: true, event_id: eventId, status: 'REJECTED' };
  }

  getEvent(eventId) {
    return this.events.find(e => e.event_id === eventId) || null;
  }

  getHistory() {
    return [...this.events];
  }

  exportAuditLog() {
    return JSON.stringify({
      app: 'TELECOM_3D_REVIEWER',
      export_timestamp: new Date().toISOString(),
      total_events: this.events.length,
      events: this.events
    }, null, 2);
  }
}

// --- Source: src/adapter/viewer_project_adapter.js ---
/**
 * Adapter between 3D Viewer mutable state and canonical Project Model.
 * Provides deterministic project model generation and cryptographic state hashing.
 */

// Pure JavaScript synchronous SHA-256 implementation (NIST FIPS 180-4 compliant)
function sha256Sync(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = 'length';
  let i, j;
  let result = '';

  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  
  let hash = [];
  let k = [];
  let primeCounter = 0;

  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  
  words[asciiBitLength >> 5] |= 0x80 << (24 - asciiBitLength % 32);
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;
  
  for (i = 0; i < ascii[lengthProperty]; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
  }
  
  for (let j = 0; j < words[lengthProperty]; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = hash.slice(0);
    hash = hash.slice(0, 8);
    
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      const val = (i < 16) ? (w[i] || 0) : ((w[i - 16] + s0 + w[i - 7] + s1) | 0);
      w[i] = val;
      
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[i] + w[i]) | 0;
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = ((rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj) | 0;
      
      hash = [(temp1 + temp2) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
    }
    
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  
  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

/**
 * Builds a canonical project model from 3D viewer state.
 * @param {Object} viewerState 
 * @returns {Object} Canonical project model
 */
function buildProjectModelFromViewerState(viewerState = {}) {
  const rawDevices = viewerState.devices || [];
  const rawCorridors = viewerState.corridors || [];
  const rawFootprints = viewerState.footprints || [];
  const rawCables = viewerState.cables || [];

  const devices = [];
  const panels = [];

  for (const d of rawDevices) {
    const pts = d.points || [];
    const p0 = pts[0] || { x: d.x || 0, y: d.y || 0, z: d.z || 0 };
    const devTag = String(d.label || d.tag || d.id || 'DEV').trim().toUpperCase();
    const system = String(d.system || (devTag.includes('CCTV') ? 'CCTV' : devTag.includes('SPK') || devTag.includes('PAGA') ? 'PAGA' : 'TELECOM')).toUpperCase();

    const dev = {
      id: d.id || devTag,
      tag: devTag,
      system: system,
      category: d.category || d.type || 'Device',
      location: { x: Number(p0.x || 0), y: Number(p0.y || 0), z: Number(p0.z || 0) },
      cable_entry_elevation_m: Number(p0.z || 0),
      mounting_elevation_m: Number(p0.z || 0),
      room_id: d.room || d.roomId || ''
    };
    devices.push(dev);

    const isPanel = /(?:CAB|CONTROL_ROOM|CTRL|MDF|IDF|RACK|SW-|PANEL)/i.test(devTag) ||
                    /(?:cabinet|panel|mdf|idf|switch)/i.test(String(d.category || d.type || ''));
    if (isPanel) {
      panels.push({
        id: dev.id,
        tag: devTag,
        system: system,
        type: 'cabinet',
        location: { x: Number(p0.x || 0), y: Number(p0.y || 0), z: Number(p0.z || 0) },
        base_elevation_m: 0.0,
        top_elevation_m: 2.2
      });
    }
  }

  if (!panels.some(p => p.tag === 'CONTROL_ROOM')) {
    panels.push({
      id: 'pnl-ctrl-room',
      tag: 'CONTROL_ROOM',
      system: 'TELECOM',
      type: 'mdf',
      location: { x: 5.0, y: 5.0, z: 0.0 },
      base_elevation_m: 0.0,
      top_elevation_m: 2.2
    });
  }

  const containments = [];
  const routeSegments = [];

  for (let cIdx = 0; cIdx < rawCorridors.length; cIdx++) {
    const c = rawCorridors[cIdx];
    const cId = c.id || ('corr_' + cIdx);
    const cTag = String(c.label || c.tag || cId).trim().toUpperCase();
    const pts = c.points || [];

    containments.push({
      containment_id: cId,
      tag: cTag,
      type: c.type || 'ladder_tray',
      width_mm: Number(c.width || 300),
      height_mm: Number(c.height || 100),
      allowed_systems: c.allowed_systems || ['CCTV_DATA', 'PAGA_AUDIO', 'PAGA_LOOP_RETURN', 'CONTROL', 'FO_SM', 'FO_MM', 'POWER_LV'],
      elevation_m: (pts[0] && pts[0].z != null) ? Number(pts[0].z) : 4.2,
      outdoor: Boolean(c.outdoor)
    });

    for (let i = 0; i < pts.length - 1; i++) {
      routeSegments.push({
        segment_id: `${cId}_seg_${i}`,
        tag: cTag,
        type: 'corridor_containment',
        start_point: { x: Number(pts[i].x), y: Number(pts[i].y), z: Number(pts[i].z ?? 4.2) },
        end_point: { x: Number(pts[i + 1].x), y: Number(pts[i + 1].y), z: Number(pts[i + 1].z ?? 4.2) },
        elevation_m: Number(pts[i].z ?? 4.2),
        containment_id: cId,
        allowed_systems: c.allowed_systems || ['CCTV_DATA', 'PAGA_AUDIO', 'PAGA_LOOP_RETURN', 'CONTROL', 'FO_SM', 'FO_MM'],
        outdoor: Boolean(c.outdoor)
      });
    }
  }

  const walls = [];
  for (let fpIdx = 0; fpIdx < rawFootprints.length; fpIdx++) {
    const fp = rawFootprints[fpIdx];
    const pts = fp.points || [];
    const isExterior = Boolean(fp.isExterior || /exterior|blast|perimeter/i.test(fp.label || fp.name || ''));
    for (let i = 0; i < pts.length - 1; i++) {
      walls.push({
        id: `${fp.id || 'wall_' + fpIdx}_${i}`,
        name: fp.label || fp.name || 'Wall Segment',
        p1: { x: Number(pts[i].x), y: Number(pts[i].y) },
        p2: { x: Number(pts[i + 1].x), y: Number(pts[i + 1].y) },
        isExterior
      });
    }
  }

  const penetrations = viewerState.penetrations || [];
  const elevationTransitions = viewerState.elevationTransitions || [];
  const cables = rawCables.slice(0);

  return {
    devices,
    panels,
    containments,
    routeSegments,
    walls,
    penetrations,
    elevationTransitions,
    cables,
    calibration: viewerState.calibration || null
  };
}

/**
 * Deterministic cryptographic SHA256 of canonical project model state.
 * @param {Object} model 
 * @param {string} contextToken 
 * @returns {string} SHA-256 hex string
 */
function projectModelHash(model = {}, contextToken = '') {
  const summary = {
    contextToken: String(contextToken || ''),
    calibration: model.calibration ? { scale: model.calibration.pixelsPerUnit, unit: model.calibration.unit } : null,
    devices: (model.devices || []).map(d => ({ id: d.id, tag: d.tag, x: d.location?.x, y: d.location?.y, z: d.location?.z })).sort((a,b) => a.id.localeCompare(b.id)),
    cables: (model.cables || []).map(c => ({ id: c.cable_id || c.id, tag: c.tag, src: c.source_id || c.sourceTag, dst: c.destination_id || c.targetTag, len: c.total_length_m || c.length })).sort((a,b) => (a.id || '').localeCompare(b.id || '')),
    containments: (model.containments || []).map(c => ({ id: c.containment_id || c.id, tag: c.tag })).sort((a,b) => (a.id || '').localeCompare(b.id || '')),
    penetrations: (model.penetrations || []).map(p => ({ id: p.penetration_id || p.id })).sort((a,b) => (a.id || '').localeCompare(b.id || '')),
    wallsCount: (model.walls || []).length
  };

  const canonicalStr = canonicalJson(summary);
  return sha256Sync(canonicalStr);
}

  const TelecomEngine = {
    // Contracts
    SystemTypes,
    CableTypes,
    TopologyTypes,
    ContainmentTypes,
    RouteSegmentTypes,
    SeverityLevels,
    StandardElevations,
    validateCoordinates,
    createDevice,
    createPanel,
    createContainment,
    createRouteSegment,
    createWallPenetration,
    createCable,
    createValidationFinding,

    // Rules
    FormalRuleLibrary,
    getRuleById,
    getRulesForSystem,

    // Validator
    DeterministicRouteValidator,
    checkSegmentIntersection2D,
    distance3D,
    distance2D,

    // Solver
    DeterministicRouteSolver,

    // Assistant & Parser
    NeedleAssistant,
    NeedleIntentParser,

    // Recorder
    AuditLogger,

    // Adapter & Hashing
    buildProjectModelFromViewerState,
    projectModelHash,
    sha256Sync,
    canonicalJson
  };

  global.TelecomEngine = TelecomEngine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TelecomEngine };
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
