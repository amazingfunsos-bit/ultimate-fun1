# Ultimate Fun — Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Identity Integrity**: Every user-created document (`users_public`, `users_private`, `feedback`, `chatThreads`, `acceptedChallenges`) must bind its `uid` / `userId` / `senderUid` to `request.auth.uid` upon creation and keep it immutable on update.
2. **Privilege Escalation Prevention**: Users creating `users_public/{userId}` cannot self-assign `role: 'owner'` or `'head_admin'` (unless they match the verified Head Admin email `amazingfunsos@gmail.com`). Regular users cannot modify `role`, `bannedUntil`, or `banReason`. Only `isHeadAdmin()` can grant/revoke `admins/{adminId}` or promote/demote owners.
3. **PII Isolation**: Email addresses live exclusively in `users_private/{userId}`, never in `users_public/{userId}`. Only the owner (`request.auth.uid == userId`) or an admin may read `users_private/{userId}`.
4. **Master Gate & Chat Isolation**: Messages in `chatThreads/{threadId}/messages/{messageId}` inherit access from the parent `chatThreads/{threadId}` document (`userId == request.auth.uid` or `isAdmin()`). Members can only read/write their own thread.
5. **Admin Content Authority**: Only verified admins/owners (`isAdmin()`) can create, update, or delete shared content (`jokes`, `riddles`, `facts`, `challenges`, `media`, `games`, `schedules`), and only `isHeadAdmin()` can publish `announcements`, `broadcasts`, `siteConfig`, or clear `activityLogs`.
6. **Temporal & Structural Integrity**: All `createdAt` / `updatedAt` fields must equal `request.time`. All document IDs must match `^[a-zA-Z0-9_\-]+$` (1–128 chars). Every string and array field has strict `.size()` bounds matching `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Promotion on Signup**: Member sends `users_public/{uid}` with `{ uid, username: "hacker", role: "owner", createdAt, updatedAt }` -> **DENIED**.
2. **Shadow Field Injection**: Member sends `users_public/{uid}` with `{ uid, username: "bob", role: "member", isVerified: true, createdAt, updatedAt }` -> **DENIED** (`hasOnly` check).
3. **PII Cross-Read**: User A attempts `get` on `users_private/{userB}` -> **DENIED**.
4. **Cross-User Chat Hijack**: User A attempts to read or post to `chatThreads/{userB}/messages/{msgId}` -> **DENIED**.
5. **Fake Owner Flag in Chat**: User A posts a message to their own chat thread with `from: "owner"` -> **DENIED** (non-admins must have `from == "user"`).
6. **Unauthorized Joke Injection**: Non-owner member attempts to `create` a document in `/jokes/{jokeId}` -> **DENIED**.
7. **Unverified Email Admin Spoof**: Token with `email: "amazingfunsos@gmail.com"` and `email_verified: false` attempts admin write -> **DENIED**.
8. **Timestamp Forgery**: Admin attempts to create a joke with `createdAt` set to a client-chosen past timestamp instead of `request.time` -> **DENIED**.
9. **1MB+ Payload DoS**: Admin attempts to create a `media` document with `url.size() > 850000` -> **DENIED**.
10. **ID Poisoning**: Attacker attempts write to `/jokes/invalid$id*with>128chars...` -> **DENIED** (`isValidId`).
11. **Terminal State Bypass on PendingItem**: Non-head-admin attempts to update a `pendingItems/{id}` document that already has `status: "approved"` -> **DENIED**.
12. **Banned Status Tampering**: Banned member attempts to update `users_public/{uid}` to clear `bannedUntil` -> **DENIED** (`affectedKeys().hasOnly(['username', 'avatarUrl', 'updatedAt'])`).
