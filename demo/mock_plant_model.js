/**
 * Mock Plant Spatial Model for Testing and Demonstration.
 * Features realistic CCUS / Substation geometry with indoor/outdoor compartments,
 * wall barriers, approved sleeves, and containment networks.
 */

import {
  createDevice,
  createPanel,
  createContainment,
  createRouteSegment,
  createWallPenetration,
  SystemTypes,
  CableTypes,
  ContainmentTypes
} from '../src/contract/contract_definitions.js';

export function createMockPlantModel() {
  const devices = [
    createDevice({
      id: 'dev-cctv-021',
      tag: 'CCTV-021',
      system: SystemTypes.CCTV,
      category: 'Fixed Outdoor Camera',
      location: { x: 32.0, y: 15.0, z: 4.5 },
      cable_entry_elevation_m: 4.5,
      mounting_elevation_m: 4.5,
      room_id: 'Outdoor Corridor Portal'
    }),
    createDevice({
      id: 'dev-cctv-002',
      tag: 'CCTV-002',
      system: SystemTypes.CCTV,
      category: 'Indoor Dome Camera',
      location: { x: 12.0, y: 5.0, z: 3.5 },
      cable_entry_elevation_m: 3.5,
      mounting_elevation_m: 3.5,
      room_id: 'Switchgear Hall'
    }),
    createDevice({
      id: 'dev-spk-101',
      tag: 'SPK-101',
      system: SystemTypes.PAGA,
      category: 'Indoor Horn Speaker',
      location: { x: 8.0, y: 5.0, z: 4.0 },
      cable_entry_elevation_m: 4.0,
      room_id: 'Switchgear Hall'
    }),
    createDevice({
      id: 'dev-spk-102',
      tag: 'SPK-102',
      system: SystemTypes.PAGA,
      category: 'Indoor Ceiling Speaker',
      location: { x: 14.0, y: 5.0, z: 4.0 },
      cable_entry_elevation_m: 4.0,
      room_id: 'Switchgear Hall'
    }),
    createDevice({
      id: 'dev-spk-103',
      tag: 'SPK-103',
      system: SystemTypes.PAGA,
      category: 'Indoor Ceiling Speaker',
      location: { x: 18.0, y: 5.0, z: 4.0 },
      cable_entry_elevation_m: 4.0,
      room_id: 'Switchgear Hall'
    }),
    createDevice({
      id: 'dev-spk-104',
      tag: 'SPK-104',
      system: SystemTypes.PAGA,
      category: 'Indoor Horn Speaker',
      location: { x: 22.0, y: 5.0, z: 4.0 },
      cable_entry_elevation_m: 4.0,
      room_id: 'Switchgear Hall'
    }),
    createDevice({
      id: 'dev-pwr-vfd-01',
      tag: 'PWR-VFD-01',
      system: SystemTypes.POWER,
      category: 'VFD Motor Starter Feeder',
      location: { x: 10.0, y: 5.0, z: 1.2 },
      cable_entry_elevation_m: 1.2,
      room_id: 'Electrical Cellar'
    }),
    createDevice({
      id: 'dev-ctrl-valve-01',
      tag: 'CTRL-VALVE-01',
      system: SystemTypes.CONTROL,
      category: 'Solenoid Emergency Valve',
      location: { x: 20.0, y: 5.0, z: 1.5 },
      cable_entry_elevation_m: 1.5,
      room_id: 'Process Area'
    })
  ];

  const panels = [
    createPanel({
      id: 'pnl-ctrl-room',
      tag: 'CONTROL_ROOM',
      system: SystemTypes.TELECOM,
      type: 'mdf',
      location: { x: 5.0, y: 5.0, z: 0.0 },
      base_elevation_m: 0.0,
      top_elevation_m: 2.2
    }),
    createPanel({
      id: 'pnl-paga-cab-a',
      tag: 'PAGA-CAB-A',
      system: SystemTypes.PAGA,
      type: 'cabinet',
      location: { x: 5.0, y: 7.0, z: 0.0 },
      base_elevation_m: 0.0,
      top_elevation_m: 2.2
    }),
    createPanel({
      id: 'pnl-sw-sec-01',
      tag: 'SW-SEC-01',
      system: SystemTypes.CCTV,
      type: 'edge_switch',
      location: { x: 5.0, y: 6.0, z: 1.8 },
      base_elevation_m: 1.8,
      top_elevation_m: 2.2
    })
  ];

  const walls = [
    // Exterior East Wall at X = 25.0, separating Indoor from Outdoor Yard
    {
      id: 'WALL-EXT-EAST',
      name: 'Exterior Blast & Fire Wall East',
      p1: { x: 25.0, y: 0.0 },
      p2: { x: 25.0, y: 25.0 },
      isExterior: true
    }
  ];

  const penetrations = [
    createWallPenetration({
      penetration_id: 'PEN-EXT-E01',
      wall_id: 'WALL-EXT-EAST',
      wall_name: 'Exterior Blast & Fire Wall East',
      location: { x: 25.0, y: 15.0, z: 4.5 },
      fire_rating_hours: 3.0,
      sleeve_diameter_mm: 200,
      approved_systems: ['CCTV_DATA', 'PAGA_AUDIO', 'PAGA_LOOP_RETURN', 'CONTROL', 'FO_SM'],
      is_approved: true,
      drawing_ref: 'DWG-PEN-E01-REV-C'
    })
  ];

  const containments = [
    createContainment({
      containment_id: 'CT-MAIN-01',
      tag: 'CT-MAIN-01',
      type: ContainmentTypes.LADDER_TRAY,
      width_mm: 450,
      height_mm: 100,
      allowed_systems: ['CCTV_DATA', 'PAGA_AUDIO', 'PAGA_LOOP_RETURN', 'CONTROL', 'FO_SM', 'FO_MM'],
      elevation_m: 4.2,
      outdoor: false
    }),
    createContainment({
      containment_id: 'CT-OUTDOOR-01',
      tag: 'CT-OUTDOOR-01',
      type: ContainmentTypes.LADDER_TRAY,
      width_mm: 300,
      height_mm: 100,
      allowed_systems: ['CCTV_DATA', 'PAGA_AUDIO', 'PAGA_LOOP_RETURN', 'CONTROL', 'FO_SM'],
      elevation_m: 4.5,
      outdoor: true
    }),
    createContainment({
      containment_id: 'CDT-PWR-01',
      tag: 'CDT-PWR-01',
      type: ContainmentTypes.CONDUIT_RSGC,
      width_mm: 32,
      allowed_systems: ['POWER_LV'],
      elevation_m: 1.5,
      outdoor: false
    })
  ];

  const routeSegments = [
    // Equipment room overhead tray connecting PAGA and MDF racks
    createRouteSegment({
      segment_id: 'CORR-RACK-01',
      tag: 'CORR-RACK-01',
      type: 'corridor_containment',
      start_point: { x: 5.0, y: 7.0, z: 4.2 },
      end_point: { x: 5.0, y: 5.0, z: 4.2 },
      elevation_m: 4.2,
      containment_id: 'CT-MAIN-01',
      allowed_systems: ['CCTV_DATA', 'PAGA_AUDIO', 'PAGA_LOOP_RETURN', 'CONTROL', 'FO_SM', 'POWER_LV'],
      outdoor: false
    }),
    // Main indoor corridor spine at EL +4.2m
    createRouteSegment({
      segment_id: 'CORR-MAIN-01',
      tag: 'CORR-MAIN-01',
      type: 'corridor_containment',
      start_point: { x: 5.0, y: 5.0, z: 4.2 },
      end_point: { x: 25.0, y: 5.0, z: 4.2 },
      elevation_m: 4.2,
      containment_id: 'CT-MAIN-01',
      allowed_systems: ['CCTV_DATA', 'PAGA_AUDIO', 'PAGA_LOOP_RETURN', 'CONTROL', 'FO_SM'],
      outdoor: false
    }),
    // Cross corridor along interior wall up to penetration sleeve
    createRouteSegment({
      segment_id: 'CORR-CROSS-01',
      tag: 'CORR-CROSS-01',
      type: 'corridor_containment',
      start_point: { x: 25.0, y: 5.0, z: 4.2 },
      end_point: { x: 25.0, y: 15.0, z: 4.5 },
      elevation_m: 4.2,
      containment_id: 'CT-MAIN-01',
      allowed_systems: ['CCTV_DATA', 'PAGA_AUDIO', 'PAGA_LOOP_RETURN', 'CONTROL', 'FO_SM'],
      outdoor: false
    }),
    // Outdoor corridor from penetration to CCTV-021 at EL +4.5m
    createRouteSegment({
      segment_id: 'CORR-C-012',
      tag: 'CORR-C-012',
      type: 'corridor_containment',
      start_point: { x: 25.0, y: 15.0, z: 4.5 },
      end_point: { x: 32.0, y: 15.0, z: 4.5 },
      elevation_m: 4.5,
      containment_id: 'CT-OUTDOOR-01',
      allowed_systems: ['CCTV_DATA', 'PAGA_AUDIO', 'PAGA_LOOP_RETURN', 'CONTROL', 'FO_SM'],
      wall_side: 'north',
      outdoor: true
    })
  ];

  const elevationTransitions = [
    // Drop at Control Room cabinet
    {
      transition_id: 'RISER-CTRL-01',
      type: 'vertical_riser',
      x: 5.0,
      y: 5.0,
      start_elevation_m: 2.2,
      end_elevation_m: 4.2,
      delta_z_m: 2.0,
      containment_id: 'CDT-BR-CTRL',
      approved: true
    },
    // Drop at PAGA Cabinet A
    {
      transition_id: 'RISER-PAGA-01',
      type: 'vertical_riser',
      x: 5.0,
      y: 7.0,
      start_elevation_m: 2.2,
      end_elevation_m: 4.2,
      delta_z_m: 2.0,
      containment_id: 'CDT-BR-PAGA',
      approved: true
    }
  ];

  return {
    devices,
    panels,
    walls,
    penetrations,
    containments,
    routeSegments,
    elevationTransitions,
    cables: []
  };
}
