export type UserRole = 'member' | 'owner' | 'head_admin';

export type PageId =
  | 'home'
  | 'gate'
  | 'jokes'
  | 'riddles'
  | 'facts'
  | 'challenges'
  | 'memes'
  | 'games'
  | 'signin'
  | 'signup'
  | 'reset'
  | 'dashboard';

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard' | 'epic';
export type MediaType = 'meme' | 'gif' | 'piskel';
export type SiteTheme = 'default' | 'sunset' | 'ice';
export type PendingContentType = 'jokes' | 'riddles' | 'facts' | 'challenges' | 'media' | 'games';

export interface UserPublic {
  uid: string;
  username: string;
  avatarUrl?: string;
  role: UserRole;
  bannedUntil?: string;
  banReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivate {
  uid: string;
  email: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Joke {
  id: string;
  setup: string;
  punch: string;
  authorId: string;
  authorName: string;
  createdAt?: unknown;
}

export interface Riddle {
  id: string;
  q: string;
  a: string;
  authorId: string;
  authorName: string;
  createdAt?: unknown;
}

export interface Fact {
  id: string;
  txt: string;
  authorId: string;
  authorName: string;
  createdAt?: unknown;
}

export interface Challenge {
  id: string;
  title: string;
  desc: string;
  difficulty: ChallengeDifficulty;
  icon: string;
  authorId: string;
  createdAt?: unknown;
}

export interface MediaItem {
  id: string;
  url: string;
  caption: string;
  type: MediaType;
  authorId: string;
  createdAt?: unknown;
}

export interface GameItem {
  id: string;
  name: string;
  desc?: string;
  icon: string;
  code: string;
  authorId?: string;
  createdAt?: unknown;
  isBuiltin?: boolean;
}

export interface ScheduleBlock {
  id: string;
  label: string;
  start: string;
  end: string;
  tz: string;
  days: number[];
  authorId: string;
  createdAt?: unknown;
}

export interface PendingItem {
  id: string;
  token: string;
  itemType: PendingContentType;
  payload: Record<string, unknown>;
  adderId: string;
  adderName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatThread {
  id: string;
  userId: string;
  username: string;
  lastMessage: string;
  unreadForOwner: boolean;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  from: 'user' | 'owner';
  senderUid: string;
  senderName: string;
  text: string;
  createdAt?: unknown;
}

export interface FeedbackItem {
  id: string;
  uid: string;
  name: string;
  rating: number;
  text: string;
  createdAt?: unknown;
}

export interface ActivityLog {
  id: string;
  actorUid: string;
  username: string;
  role: string;
  action: string;
  detail: string;
  createdAt?: unknown;
}

export interface Announcement {
  id: string;
  text: string;
  byUid: string;
  byName: string;
  createdAt?: unknown;
}

export interface Broadcast {
  id: string;
  text: string;
  byUid: string;
  byName: string;
  createdAt?: unknown;
}

export interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}
