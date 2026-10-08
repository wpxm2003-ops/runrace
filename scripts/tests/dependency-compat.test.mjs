import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));

// xcode only uses uuid.v4(). Keep the scoped override on CommonJS-compatible
// uuid 11 until upstream updates its dependency; uuid 12+ is ESM-only.
test('xcode can generate project identifiers with the patched UUID dependency', () => {
  const xcode = requireFrontend('xcode');
  const project = xcode.project('compatibility-fixture.pbxproj');
  project.hash = { project: { objects: {} } };
  const ids = Array.from({ length: 100 }, () => project.generateUuid());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[A-F0-9]{24}$/);
  const requireXcode = createRequire(requireFrontend.resolve('xcode'));
  assert.equal(requireXcode('uuid/package.json').version, '11.1.1');
});

// Firestore pins grpc-js ~1.9.0. This scoped 1.x override fixes the certificate
// and error-disclosure advisories without downgrading Firebase. Remove it when
// upstream allows a patched version. This is an offline load/lifecycle smoke
// test, not a Firestore network integration or security reproduction test.
test('Firestore loads and terminates with patched grpc-js', async () => {
  const requireFirestore = createRequire(requireFrontend.resolve('@firebase/firestore'));
  assert.equal(requireFirestore('@grpc/grpc-js/package.json').version, '1.14.5');
  const { initializeApp, deleteApp } = requireFrontend('firebase/app');
  const { getFirestore, terminate } = requireFrontend('firebase/firestore');
  const app = initializeApp({ projectId: 'dependency-compat-test' }, 'dependency-compat');
  try {
    await terminate(getFirestore(app));
  } finally {
    await deleteApp(app);
  }
});
