/**
 * Phase 0: Security Rules Verification Spec (Dirty Dozen Test Cases)
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated create rejected',
    collection: 'saved_scenarios',
    docId: 'scen_1',
    operation: 'create',
    auth: null,
    payload: { ownerId: 'anon', name: 'Test' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email create rejected',
    collection: 'saved_scenarios',
    docId: 'scen_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: false },
    payload: { ownerId: 'user_1', name: 'Test' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Identity spoofing ownerId mismatch rejected',
    collection: 'saved_scenarios',
    docId: 'scen_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_2', name: 'Spoofed' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow field injection rejected by hasOnly',
    collection: 'saved_queries',
    docId: 'query_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      ownerId: 'user_1',
      title: 'Valid',
      businessPurpose: 'Valid',
      sqlText: 'SELECT 1',
      ghostField: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Path ID poisoning rejected',
    collection: 'saved_queries',
    docId: 'invalid$id!with*chars',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: {},
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Oversized SQL text payload rejected',
    collection: 'saved_queries',
    docId: 'query_2',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: {
      ownerId: 'user_1',
      title: 'Overflow',
      businessPurpose: 'Overflow',
      sqlText: 'A'.repeat(5000),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Cross-tenant get rejected',
    collection: 'saved_scenarios',
    docId: 'scen_user1',
    operation: 'get',
    auth: { uid: 'user_2', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Unfiltered list across tenants rejected',
    collection: 'saved_scenarios',
    docId: '*',
    operation: 'list',
    auth: { uid: 'user_2', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immutable ownerId mutation on update rejected',
    collection: 'saved_scenarios',
    docId: 'scen_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_2' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Forged createdAt timestamp on create rejected',
    collection: 'cost_overrides',
    docId: 'ov_1',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value poisoning out-of-range fuel price rejected',
    collection: 'saved_scenarios',
    docId: 'scen_1',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    payload: { fuelPricePerGallon: -50 },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Cross-tenant delete rejected',
    collection: 'cost_overrides',
    docId: 'ov_user1',
    operation: 'delete',
    auth: { uid: 'user_2', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];
