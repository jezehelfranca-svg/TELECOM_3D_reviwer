import { buildProjectModelFromViewerState, projectModelHash, sha256Sync } from '../src/adapter/viewer_project_adapter.js';

console.log('Testing viewer_project_adapter...');

// 1. Test sha256Sync
const testHash = sha256Sync('hello world');
// Known NIST SHA256 of "hello world" is b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
if (testHash !== 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9') {
  throw new Error(`SHA256 mismatch: got ${testHash}`);
}
console.log('  [PASS] sha256Sync matches NIST reference');

// 2. Test buildProjectModelFromViewerState
const mockViewerState = {
  devices: [
    { id: 'dev1', label: 'CCTV-021', system: 'CCTV', points: [{ x: 32, y: 15, z: 4.5 }] },
    { id: 'dev2', label: 'PAGA-CAB-A', system: 'PAGA', category: 'cabinet', points: [{ x: 5, y: 7, z: 0.0 }] }
  ],
  corridors: [
    { id: 'c1', label: 'CORR-MAIN-01', points: [{ x: 5, y: 5, z: 4.2 }, { x: 25, y: 5, z: 4.2 }] }
  ],
  cables: [],
  footprints: []
};

const model = buildProjectModelFromViewerState(mockViewerState);
if (model.devices.length !== 2) throw new Error('Expected 2 devices');
if (model.panels.length < 1) throw new Error('Expected at least 1 panel');
if (model.routeSegments.length !== 1) throw new Error('Expected 1 route segment');
console.log('  [PASS] buildProjectModelFromViewerState converted devices, panels, segments');

// 3. Test projectModelHash determinism
const hash1 = projectModelHash(model, 'token_123');
const hash2 = projectModelHash(model, 'token_123');
if (hash1 !== hash2) throw new Error('Hashes must be identical for same state');

const hash3 = projectModelHash(model, 'token_different');
if (hash1 === hash3) throw new Error('Hash must change with different token');

console.log('  [PASS] projectModelHash is deterministic and sensitive to context token');
console.log('All adapter tests PASSED!');
