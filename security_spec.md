# Phase 0: Payload-First Security TDD Specification

## 1. Data Invariants
1. **Strict Ownership (`ownerId`)**: Every document in `/saved_scenarios/{scenarioId}`, `/saved_queries/{queryId}`, and `/cost_overrides/{overrideId}` must carry an `ownerId` matching `request.auth.uid` with a verified email (`request.auth.token.email_verified == true`).
2. **No Blanket List / Query Enforcer**: `allow list` on all collections must explicitly validate `resource.data.ownerId == request.auth.uid`.
3. **Path Variable Hardening**: All single-document operations (`get`, `create`, `update`, `delete`) validate the document ID via `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).
4. **Immutable Ownership & Temporal Integrity**: `ownerId` and `createdAt` cannot be modified on update, and `createdAt` must equal `request.time` on creation.
5. **Strict Key & Boundary Validation**: `hasAll` and `hasOnly` enforce exact schema keys with explicit string length and numeric boundary constraints.

## 2. The "Dirty Dozen" Payloads

1. **Unauthenticated Write**: `auth = null`, creating `/saved_scenarios/scen_1`. Expected: `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth = { uid: 'user_1', token: { email_verified: false } }`, creating `/saved_scenarios/scen_1`. Expected: `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: `auth.uid = 'user_1'`, payload `ownerId = 'user_2'` on `/saved_scenarios/scen_1`. Expected: `PERMISSION_DENIED`.
4. **Shadow Field Injection on Create**: Adding `isAdmin: true` to `/saved_scenarios/scen_1`. Expected: `PERMISSION_DENIED`.
5. **ID Poisoning Attack**: Document ID with special characters or length > 128 chars. Expected: `PERMISSION_DENIED`.
6. **Denial of Wallet / Oversized String**: `sqlText` exceeding 4000 characters in `/saved_queries/q_1`. Expected: `PERMISSION_DENIED`.
7. **Cross-Tenant Read (`get`)**: `user_2` reading `/saved_scenarios/scen_1` owned by `user_1`. Expected: `PERMISSION_DENIED`.
8. **Unconstrained List Scraping (`list`)**: `user_2` listing `/saved_scenarios` without `where('ownerId', '==', 'user_2')`. Expected: `PERMISSION_DENIED`.
9. **Owner Hijack on Update**: Changing `ownerId` from `'user_1'` to `'user_2'` during update. Expected: `PERMISSION_DENIED`.
10. **Timestamp Forgery on Create**: Supplying a forged past/future timestamp instead of `request.time`. Expected: `PERMISSION_DENIED`.
11. **Value Poisoning on Update**: Updating `fuelPricePerGallon` with a string `"free"` or negative number `-10`. Expected: `PERMISSION_DENIED`.
12. **Cross-Tenant Delete**: `user_2` attempting to delete `user_1`'s `/cost_overrides/ov_1`. Expected: `PERMISSION_DENIED`.
