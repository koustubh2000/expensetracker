# Security Specification — PocketLedger Cloud & Vault (`security_spec.md`)

## 1. Data Invariants
1. **Strict Ownership**: Every document in `/profiles/{userId}`, `/accounts/{accountId}`, `/transactions/{transactionId}`, `/people/{personId}`, `/expectedItems/{itemId}`, and `/dreamVaults/{vaultId}` must have `ownerId == request.auth.uid`.
2. **Verified Identity**: Standard writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Bootstrapped Admin**: Runtime user `koustubhjuvekar2000@gmail.com` (with `email_verified == true`) or a document in `/admins/{uid}` is recognized by `isAdmin()`.
4. **Immutable Audit Fields**: `ownerId` and `createdAt` can never be mutated during an `update`.
5. **Server Timestamps**: `createdAt == request.time` on `create`; `updatedAt == request.time` on `create` and `update`.
6. **Strict Schema & Size Bounds**: Every `create` and `update` invokes `isValid[Entity](incoming())` enforcing `hasAll`, `hasOnly`, string `.size()` limits, and numeric bounds.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null` attempting `create` on `/accounts/acc_1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth.token.email = "koustubhjuvekar2000@gmail.com"`, `email_verified = false` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: `auth.uid = "user_A"` creating `/transactions/tx_1` with `ownerId: "user_B"` -> `PERMISSION_DENIED`.
4. **Shadow Field Injection on Create**: Adding `isSuperAdmin: true` to `/profiles/user_A` -> `PERMISSION_DENIED` via `hasOnly`.
5. **Self-Assigned Admin Role on Profile Create**: Creating `/profiles/user_A` with `role: "admin"` when not `isAdmin()` -> `PERMISSION_DENIED`.
6. **Owner Hijack on Update**: Updating `ownerId` on `/accounts/acc_1` from `"user_A"` to `"user_B"` -> `PERMISSION_DENIED`.
7. **Timestamp Forgery**: Providing a past/future client timestamp instead of `request.time` for `createdAt` or `updatedAt` -> `PERMISSION_DENIED`.
8. **CreatedAt Mutation**: Modifying `createdAt` during an `update` on `/dreamVaults/dv_1` -> `PERMISSION_DENIED`.
9. **ID Poisoning**: Creating `/accounts/{200_char_junk_id}` -> `PERMISSION_DENIED` via `isValidId()`.
10. **Value Poisoning on Update**: Updating `amount` on `/transactions/tx_1` to a string `"1000"` instead of a number -> `PERMISSION_DENIED` via `isValidTransactionRecord(incoming())`.
11. **Cross-Tenant Read/Delete**: `user_B` attempting `get` or `delete` on `user_A`'s `/people/p_1` -> `PERMISSION_DENIED`.
12. **Blanket List Scraping**: `user_B` running an unfiltered `list` query on `/transactions` -> `PERMISSION_DENIED` because `allow list` enforces `resource.data.ownerId == request.auth.uid`.
