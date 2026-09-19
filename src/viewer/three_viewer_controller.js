/**
 * Three.js 3D Viewer Controller for Proposed Route Previews, Containment & Violations.
 * Stage 4 implementation for TELECOM_3D_reviwer.
 */

export class ThreeViewerController {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.groups = {
      devices: null,
      panels: null,
      walls: null,
      containment: null,
      penetrations: null,
      cables: null,
      preview: null,
      violations: null
    };
  }

  /**
   * Generates declarative 3D scene data specification for rendering in Three.js or WebGL.
   */
  generateSceneGraphData(projectModel, previewProposal = null) {
    const sceneData = {
      camera: {
        position: [25, 35, 45],
        target: [15, 0, 15]
      },
      objects: []
    };

    // 1. Devices
    for (const dev of (projectModel.devices || [])) {
      const loc = dev.location || { x: 0, y: 0, z: 0 };
      sceneData.objects.push({
        id: dev.id,
        tag: dev.tag,
        type: 'device',
        category: dev.category,
        geometry: 'cylinder',
        dimensions: [0.6, 0.6, 0.4],
        position: [loc.x, loc.z ?? 0, -loc.y],
        color: dev.system === 'PAGA' ? '#ffd166' : '#52d3e9',
        label: `${dev.tag} (EL +${(loc.z ?? 0).toFixed(2)}m)`
      });
    }

    // 2. Panels / Cabinets
    for (const p of (projectModel.panels || [])) {
      const loc = p.location || { x: 0, y: 0, z: 0 };
      const baseZ = p.base_elevation_m ?? 0;
      const topZ = p.top_elevation_m ?? 2.2;
      const height = topZ - baseZ;
      sceneData.objects.push({
        id: p.id,
        tag: p.tag,
        type: 'panel',
        geometry: 'box',
        dimensions: [0.8, height, 0.8],
        position: [loc.x, baseZ + height / 2, -loc.y],
        color: '#ff5c8a',
        label: `${p.tag} [${p.type}]`
      });
    }

    // 3. Walls
    for (const w of (projectModel.walls || [])) {
      sceneData.objects.push({
        id: w.id,
        tag: w.name || w.id,
        type: 'wall',
        geometry: 'wall_plane',
        p1: [w.p1.x, 0, -w.p1.y],
        p2: [w.p2.x, 0, -w.p2.y],
        height: 5.5,
        color: '#334155',
        opacity: 0.35
      });
    }

    // 4. Containment Segments
    for (const s of (projectModel.routeSegments || [])) {
      const z = s.elevation_m ?? 4.2;
      sceneData.objects.push({
        id: s.segment_id,
        tag: s.tag,
        type: 'containment_tray',
        p1: [s.start_point.x, z, -s.start_point.y],
        p2: [s.end_point.x, z, -s.end_point.y],
        color: s.outdoor ? '#f59e0b' : '#38bdf8',
        elevation_label: `EL +${z.toFixed(2)}m`,
        allowed_systems: s.allowed_systems
      });
    }

    // 5. Approved Penetrations
    for (const pen of (projectModel.penetrations || [])) {
      const loc = pen.location;
      sceneData.objects.push({
        id: pen.penetration_id,
        tag: pen.penetration_id,
        type: 'wall_penetration',
        geometry: 'torus',
        position: [loc.x, loc.z ?? 4.2, -loc.y],
        color: pen.is_approved ? '#10b981' : '#ef4444',
        status: pen.is_approved ? 'APPROVED' : 'UNAPPROVED'
      });
    }

    // 6. Committed Existing Cables
    for (const cable of (projectModel.cables || [])) {
      const pts = (cable.waypoints || []).map(wp => [wp.x, wp.z ?? 0, -wp.y]);
      sceneData.objects.push({
        id: cable.cable_id,
        tag: cable.tag,
        type: 'cable_committed',
        waypoints: pts,
        color: '#64748b',
        cable_type: cable.cable_type
      });
    }

    // 7. Proposed Cable Route (Glowing Preview)
    if (previewProposal && previewProposal.proposed_cable) {
      const cable = previewProposal.proposed_cable;
      const pts = (cable.waypoints || []).map(wp => [wp.x, wp.z ?? 0, -wp.y]);
      sceneData.objects.push({
        id: 'preview-' + cable.cable_id,
        tag: cable.tag + ' (PROPOSED)',
        type: 'cable_proposed',
        waypoints: pts,
        color: previewProposal.can_apply ? '#00f5d4' : '#f72585',
        pulse: true,
        cable_type: cable.cable_type,
        total_length_m: cable.total_length_m
      });
    }

    // 8. 3D Rule Violations Callout Pins
    if (previewProposal && previewProposal.validation_result) {
      for (const finding of (previewProposal.validation_result.findings || [])) {
        if (finding.location) {
          sceneData.objects.push({
            id: finding.finding_id,
            type: 'violation_pin',
            rule_id: finding.rule_id,
            severity: finding.severity,
            position: [finding.location.x, (finding.location.z ?? 0) + 1.0, -finding.location.y],
            message: finding.message
          });
        }
      }
    }

    return sceneData;
  }
}
