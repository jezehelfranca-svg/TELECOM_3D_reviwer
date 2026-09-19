/**
 * Canonical Wiring Contract definitions & validation utilities.
 * Stage 1 implementation for TELECOM_3D_reviwer.
 */

export const SystemTypes = Object.freeze({
  CCTV: 'CCTV',
  PAGA: 'PAGA',
  TELECOM: 'TELECOM',
  SECURITY: 'SECURITY',
  FIRE_ALARM: 'FIRE_ALARM',
  POWER: 'POWER',
  CONTROL: 'CONTROL',
  FO: 'FO'
});

export const CableTypes = Object.freeze({
  CCTV_DATA: 'CCTV_DATA',
  PAGA_AUDIO: 'PAGA_AUDIO',
  PAGA_LOOP_RETURN: 'PAGA_LOOP_RETURN',
  POWER_LV: 'POWER_LV',
  CONTROL: 'CONTROL',
  FO_SM: 'FO_SM',
  FO_MM: 'FO_MM',
  INSTRUMENTATION: 'INSTRUMENTATION'
});

export const TopologyTypes = Object.freeze({
  CLASS_A_LOOP: 'CLASS_A_LOOP',
  RADIAL: 'RADIAL',
  STAR: 'STAR',
  DAISY_CHAIN: 'DAISY_CHAIN',
  MULTIDROP: 'MULTIDROP',
  REDUNDANT_RING: 'REDUNDANT_RING'
});

export const ContainmentTypes = Object.freeze({
  LADDER_TRAY: 'ladder_tray',
  PERFORATED_TRAY: 'perforated_tray',
  SOLID_TRUNKING: 'solid_trunking',
  CONDUIT_RSGC: 'conduit_rsgc',
  CONDUIT_PVC: 'conduit_pvc',
  DUCT_BANK: 'duct_bank',
  TRENCH: 'trench'
});

export const RouteSegmentTypes = Object.freeze({
  CORRIDOR_CONTAINMENT: 'corridor_containment',
  BRANCH_CONDUIT: 'branch_conduit',
  VERTICAL_RISER: 'vertical_riser',
  VERTICAL_DROP: 'vertical_drop',
  WALL_PENETRATION: 'wall_penetration_segment',
  TRENCH: 'trench',
  INFERRED_TIE_IN: 'inferred_tie_in'
});

export const SeverityLevels = Object.freeze({
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
});

/**
 * Standard Design Basis Elevations (m AGL)
 */
export const StandardElevations = Object.freeze({
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
export function validateCoordinates(coord, label = 'Coordinate') {
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
export function createDevice(spec) {
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
export function createPanel(spec) {
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
export function createCable(spec) {
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
export function createContainment(spec) {
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
export function createRouteSegment(spec) {
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
export function createWallPenetration(spec) {
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
export function createValidationFinding({
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
