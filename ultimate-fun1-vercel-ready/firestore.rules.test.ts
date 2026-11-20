/**
 * Dirty Dozen Security Rule Verification Cases
 * Verifies that all 12 adversarial payloads are rejected by firestore.rules.
 * Run against Firebase Emulator Suite when testing rules locally.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Self-Promotion on Signup',
    collectionPath: 'users_public/user_attacker',
    operation: 'create',
    auth: { uid: 'user_attacker', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'user_attacker',
      username: 'attacker',
      role: 'owner',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Shadow Field Injection',
    collectionPath: 'users_public/user_attacker',
    operation: 'create',
    auth: { uid: 'user_attacker', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'user_attacker',
      username: 'attacker',
      role: 'member',
      isVerified: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'PII Cross-Read',
    collectionPath: 'users_private/user_victim',
    operation: 'get',
    auth: { uid: 'user_attacker', email: 'attacker@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-User Chat Hijack',
    collectionPath: 'chatThreads/user_victim/messages/msg_1',
    operation: 'create',
    auth: { uid: 'user_attacker', email: 'attacker@example.com', email_verified: true },
    payload: {
      from: 'user',
      senderUid: 'user_attacker',
      senderName: 'attacker',
      text: 'hijacked',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Fake Owner Flag in Chat',
    collectionPath: 'chatThreads/user_attacker/messages/msg_1',
    operation: 'create',
    auth: { uid: 'user_attacker', email: 'attacker@example.com', email_verified: true },
    payload: {
      from: 'owner',
      senderUid: 'user_attacker',
      senderName: 'Owner',
      text: 'spoofed',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Unauthorized Joke Injection',
    collectionPath: 'jokes/joke_1',
    operation: 'create',
    auth: { uid: 'user_member', email: 'member@example.com', email_verified: true },
    payload: {
      setup: 'test',
      punch: 'test',
      authorId: 'user_member',
      authorName: 'member',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unverified Email Admin Spoof',
    collectionPath: 'announcements/ann_1',
    operation: 'create',
    auth: { uid: 'spoof_uid', email: 'amazingfunsos@gmail.com', email_verified: false },
    payload: {
      text: 'spoofed announcement',
      byUid: 'spoof_uid',
      byName: 'HeadAdmin',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Timestamp Forgery',
    collectionPath: 'jokes/joke_2',
    operation: 'create',
    auth: { uid: 'head_admin_uid', email: 'amazingfunsos@gmail.com', email_verified: true },
    payload: {
      setup: 'hello',
      punch: 'world',
      authorId: 'head_admin_uid',
      authorName: 'HeadAdmin',
      createdAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Oversized Media Payload DoS',
    collectionPath: 'media/media_big',
    operation: 'create',
    auth: { uid: 'head_admin_uid', email: 'amazingfunsos@gmail.com', email_verified: true },
    payload: {
      url: 'x'.repeat(900000),
      caption: 'too big',
      type: 'meme',
      authorId: 'head_admin_uid',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'ID Poisoning',
    collectionPath: 'jokes/invalid$id!bad',
    operation: 'create',
    auth: { uid: 'head_admin_uid', email: 'amazingfunsos@gmail.com', email_verified: true },
    payload: {
      setup: 'bad id',
      punch: 'nope',
      authorId: 'head_admin_uid',
      authorName: 'HeadAdmin',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Terminal State Bypass on PendingItem',
    collectionPath: 'pendingItems/pending_1',
    operation: 'update',
    auth: { uid: 'regular_owner', email: 'owner@example.com', email_verified: true },
    payload: {
      status: 'pending',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Banned Status Tampering',
    collectionPath: 'users_public/user_banned',
    operation: 'update',
    auth: { uid: 'user_banned', email: 'banned@example.com', email_verified: true },
    payload: {
      bannedUntil: '',
      banReason: '',
    },
    expected: 'PERMISSION_DENIED',
  },
];
