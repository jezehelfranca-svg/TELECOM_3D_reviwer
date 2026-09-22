/**
 * Adapter between 3D Viewer mutable state and canonical Project Model.
 * Provides deterministic project model generation and cryptographic state hashing.
 */

// Pure JavaScript synchronous SHA-256 implementation (NIST FIPS 180-4 compliant)
export function sha256Sync(ascii) {
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

export function canonicalJson(obj) {
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
export function buildProjectModelFromViewerState(viewerState = {}) {
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
export function projectModelHash(model = {}, contextToken = '') {
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
