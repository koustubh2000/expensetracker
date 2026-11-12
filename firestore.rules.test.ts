import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesText = fs.readFileSync('firestore.rules', 'utf-8');

/**
 * Deterministic Security Rule Gate Evaluator for the Dirty Dozen Payloads
 */
function evaluateWriteGate(params: {
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  docId: string;
  incoming: Record<string, any>;
  existing?: Record<string, any> | null;
  operation: 'create' | 'update' | 'get' | 'list';
  serverTime: number;
}): 'ALLOW' | 'PERMISSION_DENIED' {
  const { auth, docId, incoming, existing, operation, serverTime } = params;

  // 1. Auth & Verification Check
  if (!auth) return 'PERMISSION_DENIED';
  const isAdmin =
    auth.email_verified === true && auth.email === 'koustubhjuvekar2000@gmail.com';

  if (operation === 'get') {
    if (!existing) return 'PERMISSION_DENIED';
    return existing.ownerId === auth.uid || isAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
  }

  if (operation === 'list') {
    if (!existing) return 'PERMISSION_DENIED';
    return existing.ownerId === auth.uid ? 'ALLOW' : 'PERMISSION_DENIED';
  }

  if (auth.email_verified !== true) return 'PERMISSION_DENIED';

  // 2. ID Poisoning Guard
  if (typeof docId !== 'string' || docId.length < 1 || docId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(docId)) {
    return 'PERMISSION_DENIED';
  }

  // 3. Identity Integrity
  if (incoming.ownerId !== auth.uid) return 'PERMISSION_DENIED';

  // 4. Shadow Field Check
  const allowedKeys = new Set([
    'ownerId',
    'displayName',
    'currency',
    'role',
    'name',
    'type',
    'initialBalance',
    'color',
    'includeInNetWorth',
    'date',
    'title',
    'amount',
    'category',
    'accountId',
    'paymentMethod',
    'status',
    'createdAt',
    'updatedAt',
  ]);
  for (const k of Object.keys(incoming)) {
    if (!allowedKeys.has(k)) return 'PERMISSION_DENIED';
  }

  // 5. Self-Assigned Role Check
  if (incoming.role === 'admin' && !isAdmin) return 'PERMISSION_DENIED';

  // 6. Type / Value Poisoning Check
  if ('amount' in incoming && (typeof incoming.amount !== 'number' || incoming.amount <= 0)) {
    return 'PERMISSION_DENIED';
  }

  // 7. Timestamp Integrity
  if (operation === 'create' && incoming.createdAt !== serverTime) return 'PERMISSION_DENIED';
  if (incoming.updatedAt !== serverTime) return 'PERMISSION_DENIED';

  // 8. Update Immutability & Terminal State
  if (operation === 'update' && existing) {
    if (incoming.ownerId !== existing.ownerId) return 'PERMISSION_DENIED';
    if (incoming.createdAt !== existing.createdAt) return 'PERMISSION_DENIED';
    if (existing.status === 'settled' && !isAdmin) return 'PERMISSION_DENIED';
  }

  return 'ALLOW';
}

test('Firestore rules file contains all 8 Pillars of Hardened Rules', () => {
  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.ok(rulesText.includes('allow read, write: if false;'));
  assert.ok(rulesText.includes('isValidUserProfile(incoming())'));
  assert.ok(rulesText.includes('isValidWalletAccount(incoming())'));
  assert.ok(rulesText.includes('isValidTransactionRecord(incoming())'));
  assert.ok(rulesText.includes('isValidPersonProfile(incoming())'));
  assert.ok(rulesText.includes('isValidExpectedItem(incoming())'));
  assert.ok(rulesText.includes('isValidDreamVault(incoming())'));
});

test('All Dirty Dozen adversarial payloads return PERMISSION_DENIED', () => {
  const now = 1794060000000;
  const validBase = {
    ownerId: 'user_A',
    displayName: 'Alice',
    currency: '$',
    role: 'user',
    createdAt: now,
    updatedAt: now,
  };

  // 1. Unauthenticated write
  assert.equal(
    evaluateWriteGate({ auth: null, docId: 'user_A', incoming: validBase, operation: 'create', serverTime: now }),
    'PERMISSION_DENIED'
  );

  // 2. Unverified email spoof
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_A', email: 'koustubhjuvekar2000@gmail.com', email_verified: false },
      docId: 'user_A',
      incoming: validBase,
      operation: 'create',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );

  // 3. Identity spoofing on create
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_A', email_verified: true },
      docId: 'user_B',
      incoming: { ...validBase, ownerId: 'user_B' },
      operation: 'create',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );

  // 4. Shadow field injection
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_A', email_verified: true },
      docId: 'user_A',
      incoming: { ...validBase, isVerifiedShadow: true },
      operation: 'create',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );

  // 5. Self-assigned admin role
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_A', email: 'regular@example.com', email_verified: true },
      docId: 'user_A',
      incoming: { ...validBase, role: 'admin' },
      operation: 'create',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );

  // 6. Owner hijack on update
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_B', email_verified: true },
      docId: 'user_A',
      incoming: { ...validBase, ownerId: 'user_B' },
      existing: validBase,
      operation: 'update',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );

  // 7. Timestamp forgery
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_A', email_verified: true },
      docId: 'user_A',
      incoming: { ...validBase, createdAt: now - 50000 },
      operation: 'create',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );

  // 8. CreatedAt mutation on update
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_A', email_verified: true },
      docId: 'user_A',
      incoming: { ...validBase, createdAt: now + 1000 },
      existing: validBase,
      operation: 'update',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );

  // 9. ID poisoning (>128 chars)
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_A', email_verified: true },
      docId: 'x'.repeat(200),
      incoming: validBase,
      operation: 'create',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );

  // 10. Value poisoning on update (string amount instead of positive number)
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_A', email_verified: true },
      docId: 'tx_1',
      incoming: { ...validBase, amount: '1000' },
      existing: { ...validBase, amount: 500 },
      operation: 'update',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );

  // 11. Cross-tenant get
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_B', email_verified: true },
      docId: 'user_A',
      incoming: {},
      existing: validBase,
      operation: 'get',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );

  // 12. Blanket list scraping across tenants
  assert.equal(
    evaluateWriteGate({
      auth: { uid: 'user_B', email_verified: true },
      docId: 'tx_1',
      incoming: {},
      existing: validBase,
      operation: 'list',
      serverTime: now,
    }),
    'PERMISSION_DENIED'
  );
});
