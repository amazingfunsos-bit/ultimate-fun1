import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, HEAD_ADMIN_EMAIL, OperationType } from '../firebase';
import { ALL_TIMEZONES, DAY_NAMES } from '../constants/builtinGames';
import { clampStr, LIMITS, VALID_TIME_REGEX } from '../constants/validation';
import type {
  ActivityLog,
  Announcement,
  Broadcast,
  Challenge,
  ChallengeDifficulty,
  ChatMessage,
  ChatThread,
  Fact,
  FeedbackItem,
  GameItem,
  Joke,
  MediaItem,
  MediaType,
  PendingContentType,
  PendingItem,
  Riddle,
  ScheduleBlock,
  SiteTheme,
  UserPublic,
} from '../types';
import {
  buildItemSummary,
  fileToBoundedDataUrl,
  fmt12,
  formatTzOption,
  isInBlock,
  isUserBanned,
  ITEM_TYPE_META,
  sendApprovalEmail,
} from '../utils/schedule';

type DashTab =
  | 'jokes'
  | 'riddles'
  | 'facts'
  | 'challenges'
  | 'media'
  | 'games'
  | 'schedule'
  | 'users'
  | 'inbox'
  | 'pending'
  | 'activity'
  | 'feedback'
  | 'announcements'
  | 'broadcast'
  | 'theme'
  | 'userstats'
  | 'export';

interface OwnerDashboardProps {
  currentUser: UserPublic;
  jokes: Joke[];
  riddles: Riddle[];
  facts: Fact[];
  challenges: Challenge[];
  media: MediaItem[];
  games: GameItem[];
  schedules: ScheduleBlock[];
  users: UserPublic[];
  pendingItems: PendingItem[];
  announcements: Announcement[];
  broadcasts: Broadcast[];
  siteTheme: SiteTheme;
  activeBlock: ScheduleBlock | null;
  clockStr: string;
  onPlayGame: (game: GameItem) => void;
  onApprovePending: (item: PendingItem) => Promise<void>;
  onRejectPending: (item: PendingItem) => Promise<void>;
  onToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  currentUser,
  jokes,
  riddles,
  facts,
  challenges,
  media,
  games,
  schedules,
  users,
  pendingItems,
  announcements,
  broadcasts,
  siteTheme,
  activeBlock,
  clockStr,
  onPlayGame,
  onApprovePending,
  onRejectPending,
  onToast,
}) => {
  const isHeadAdmin =
    (auth.currentUser?.email || '').toLowerCase() === HEAD_ADMIN_EMAIL.toLowerCase();
  const [tab, setTab] = useState<DashTab>('jokes');
  const [requireApproval, setRequireApproval] = useState(!isHeadAdmin);

  // Content form states
  const [jokeSetup, setJokeSetup] = useState('');
  const [jokePunch, setJokePunch] = useState('');
  const [bulkJokesOpen, setBulkJokesOpen] = useState(false);
  const [bulkJokesTxt, setBulkJokesTxt] = useState('');

  const [riddleQ, setRiddleQ] = useState('');
  const [riddleA, setRiddleA] = useState('');
  const [bulkRiddlesOpen, setBulkRiddlesOpen] = useState(false);
  const [bulkRiddlesTxt, setBulkRiddlesTxt] = useState('');

  const [factTxt, setFactTxt] = useState('');
  const [bulkFactsOpen, setBulkFactsOpen] = useState(false);
  const [bulkFactsTxt, setBulkFactsTxt] = useState('');

  const [chTitle, setChTitle] = useState('');
  const [chDesc, setChDesc] = useState('');
  const [chDiff, setChDiff] = useState<ChallengeDifficulty>('easy');
  const [chIcon, setChIcon] = useState('🔥');

  const [mediaUrlInput, setMediaUrlInput] = useState('');
  const [mediaFileNote, setMediaFileNote] = useState('No file selected yet.');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('meme');
  const [bulkMediaOpen, setBulkMediaOpen] = useState(false);
  const [bulkMediaItems, setBulkMediaItems] = useState<
    Array<{ name: string; url: string; caption: string; type: MediaType }>
  >([]);
  const mediaFileRef = useRef<HTMLInputElement | null>(null);

  const [gameName, setGameName] = useState('');
  const [gameDesc, setGameDesc] = useState('');
  const [gameIcon, setGameIcon] = useState('🎮');
  const [gameCode, setGameCode] = useState('');

  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [schTz, setSchTz] = useState(
    ALL_TIMEZONES.includes(detectedTz) ? detectedTz : 'America/New_York'
  );
  const [schStart, setSchStart] = useState('08:00');
  const [schEnd, setSchEnd] = useState('09:00');
  const [schLabel, setSchLabel] = useState('');
  const [schDays, setSchDays] = useState<number[]>([1, 2, 3, 4, 5]);

  // Users tab
  const [userSearch, setUserSearch] = useState('');
  const [banTargetUid, setBanTargetUid] = useState<string | null>(null);
  const [banDur, setBanDur] = useState('1');
  const [banReason, setBanReason] = useState('');
  const [resetTargetUid, setResetTargetUid] = useState<string | null>(null);
  const [resetTargetPass, setResetTargetPass] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);

  // Head-admin only live logs & feedback
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [announcementText, setAnnouncementText] = useState('');
  const [broadcastText, setBroadcastText] = useState('');

  // Inbox state
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [inboxReply, setInboxReply] = useState('');
  const inboxMsgEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isHeadAdmin) return;
    const unsubAct = onSnapshot(
      query(collection(db, 'activityLogs'), orderBy('createdAt', 'desc')),
      (snap) => {
        setActivityLogs(
          snap.docs.slice(0, 100).map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ActivityLog, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'activityLogs')
    );

    const unsubFb = onSnapshot(
      query(collection(db, 'feedback'), orderBy('createdAt', 'desc')),
      (snap) => {
        setFeedbackList(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<FeedbackItem, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'feedback')
    );

    const unsubThreads = onSnapshot(
      query(collection(db, 'chatThreads'), orderBy('updatedAt', 'desc')),
      (snap) => {
        setThreads(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ChatThread, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chatThreads')
    );

    return () => {
      unsubAct();
      unsubFb();
      unsubThreads();
    };
  }, [isHeadAdmin]);

  useEffect(() => {
    if (!activeThreadId || !isHeadAdmin) {
      setThreadMessages([]);
      return;
    }
    const path = `chatThreads/${activeThreadId}/messages`;
    const unsub = onSnapshot(
      query(collection(db, 'chatThreads', activeThreadId, 'messages'), orderBy('createdAt', 'asc')),
      (snap) => {
        setThreadMessages(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ChatMessage, 'id'>),
          }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [activeThreadId, isHeadAdmin]);

  useEffect(() => {
    inboxMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  const logAction = async (action: string, detail = '') => {
    if (isHeadAdmin) return;
    const logId = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, 'activityLogs', logId), {
        actorUid: currentUser.uid,
        username: clampStr(currentUser.username, LIMITS.USERNAME_MAX),
        role: currentUser.role,
        action: clampStr(action, LIMITS.ACTIVITY_ACTION_MAX),
        detail: clampStr(detail, LIMITS.ACTIVITY_DETAIL_MAX),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `activityLogs/${logId}`);
    }
  };

  const publishOrQueue = async (
    itemType: PendingContentType,
    payload: Record<string, unknown>,
    successMsg: string
  ) => {
    const id = `${itemType}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (requireApproval) {
      const token = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const path = `pendingItems/${token}`;
      try {
        await setDoc(doc(db, 'pendingItems', token), {
          token,
          itemType,
          payload,
          adderId: currentUser.uid,
          adderName: clampStr(currentUser.username, LIMITS.USERNAME_MAX),
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const emailed = await sendApprovalEmail(itemType, payload, currentUser.username, token);
        onToast(
          emailed
            ? '📧 Sent for approval & saved to queue!'
            : '⏳ Saved to Pending tab (email notification skipped).',
          'info'
        );
        await logAction(`Submitted ${itemType} for approval`, buildItemSummary(itemType, payload));
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
      return;
    }

    const path = `${itemType}/${id}`;
    try {
      await setDoc(doc(db, itemType, id), {
        ...payload,
        authorId: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      onToast(successMsg);
      await logAction(`Published ${itemType}`, buildItemSummary(itemType, payload));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleAddJoke = async () => {
    const setup = clampStr(jokeSetup, LIMITS.JOKE_SETUP_MAX);
    const punch = clampStr(jokePunch, LIMITS.JOKE_PUNCH_MAX);
    if (!setup || !punch) {
      onToast('Fill in both setup and punchline!', 'error');
      return;
    }
    setJokeSetup('');
    setJokePunch('');
    await publishOrQueue(
      'jokes',
      { setup, punch, authorName: clampStr(currentUser.username, LIMITS.USERNAME_MAX) },
      '😂 Joke saved for everyone!'
    );
  };

  const handleBulkJokes = async () => {
    const lines = bulkJokesTxt
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    let count = 0;
    for (const line of lines) {
      const [s, p] = line.split('|').map((v) => v?.trim() || '');
      const setup = clampStr(s, LIMITS.JOKE_SETUP_MAX);
      const punch = clampStr(p, LIMITS.JOKE_PUNCH_MAX);
      if (setup && punch) {
        await publishOrQueue(
          'jokes',
          { setup, punch, authorName: clampStr(currentUser.username, LIMITS.USERNAME_MAX) },
          '😂 Imported!'
        );
        count++;
      }
    }
    if (!count) {
      onToast('No valid jokes found. Use: Setup | Punchline', 'error');
      return;
    }
    setBulkJokesTxt('');
    setBulkJokesOpen(false);
    onToast(`Imported ${count} joke${count > 1 ? 's' : ''}!`);
  };

  const handleAddRiddle = async () => {
    const q = clampStr(riddleQ, LIMITS.RIDDLE_Q_MAX);
    const a = clampStr(riddleA, LIMITS.RIDDLE_A_MAX);
    if (!q || !a) {
      onToast('Fill in both riddle and answer!', 'error');
      return;
    }
    setRiddleQ('');
    setRiddleA('');
    await publishOrQueue(
      'riddles',
      { q, a, authorName: clampStr(currentUser.username, LIMITS.USERNAME_MAX) },
      '🧠 Riddle saved for everyone!'
    );
  };

  const handleBulkRiddles = async () => {
    const lines = bulkRiddlesTxt
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    let count = 0;
    for (const line of lines) {
      const [qv, av] = line.split('|').map((v) => v?.trim() || '');
      const q = clampStr(qv, LIMITS.RIDDLE_Q_MAX);
      const a = clampStr(av, LIMITS.RIDDLE_A_MAX);
      if (q && a) {
        await publishOrQueue(
          'riddles',
          { q, a, authorName: clampStr(currentUser.username, LIMITS.USERNAME_MAX) },
          '🧠 Imported!'
        );
        count++;
      }
    }
    if (!count) {
      onToast('No valid riddles found. Use: Question | Answer', 'error');
      return;
    }
    setBulkRiddlesTxt('');
    setBulkRiddlesOpen(false);
    onToast(`Imported ${count} riddle${count > 1 ? 's' : ''}!`);
  };

  const handleAddFact = async () => {
    const txt = clampStr(factTxt, LIMITS.FACT_MAX);
    if (!txt) {
      onToast('Enter a fact!', 'error');
      return;
    }
    setFactTxt('');
    await publishOrQueue(
      'facts',
      { txt, authorName: clampStr(currentUser.username, LIMITS.USERNAME_MAX) },
      '💡 Fact saved for everyone!'
    );
  };

  const handleBulkFacts = async () => {
    const lines = bulkFactsTxt
      .split('\n')
      .map((l) => clampStr(l, LIMITS.FACT_MAX))
      .filter(Boolean);
    if (!lines.length) {
      onToast('No facts found.', 'error');
      return;
    }
    for (const txt of lines) {
      await publishOrQueue(
        'facts',
        { txt, authorName: clampStr(currentUser.username, LIMITS.USERNAME_MAX) },
        '💡 Imported!'
      );
    }
    setBulkFactsTxt('');
    setBulkFactsOpen(false);
    onToast(`Imported ${lines.length} fact${lines.length > 1 ? 's' : ''}!`);
  };

  const handleAddChallenge = async () => {
    const title = clampStr(chTitle, LIMITS.CHALLENGE_TITLE_MAX);
    const desc = clampStr(chDesc, LIMITS.CHALLENGE_DESC_MAX);
    const icon = clampStr(chIcon || '🔥', LIMITS.ICON_MAX) || '🔥';
    if (!title || !desc) {
      onToast('Fill in title and description!', 'error');
      return;
    }
    setChTitle('');
    setChDesc('');
    setChIcon('🔥');
    await publishOrQueue(
      'challenges',
      { title, desc, difficulty: chDiff, icon },
      '🔥 Challenge saved for everyone!'
    );
  };

  const handleMediaFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setMediaFileNote('No file selected yet.');
      return;
    }
    try {
      const bounded = await fileToBoundedDataUrl(file, LIMITS.MEDIA_URL_MAX);
      setMediaUrlInput(bounded);
      setMediaFileNote(`Selected & ready: ${file.name}`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'File error.', 'error');
      setMediaFileNote('File too large.');
    }
  };

  const handleAddMedia = async () => {
    const url = mediaUrlInput.trim().slice(0, LIMITS.MEDIA_URL_MAX);
    const caption = clampStr(mediaCaption, LIMITS.MEDIA_CAPTION_MAX);
    if (!url || !caption) {
      onToast('Upload a file (or paste an image URL) and enter a caption!', 'error');
      return;
    }
    setMediaUrlInput('');
    setMediaCaption('');
    setMediaFileNote('No file selected yet.');
    if (mediaFileRef.current) mediaFileRef.current.value = '';
    await publishOrQueue('media', { url, caption, type: mediaType }, '🖼️ Media saved for everyone!');
  };

  const handleBulkMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const next: Array<{ name: string; url: string; caption: string; type: MediaType }> = [];
    for (const f of files) {
      try {
        const url = await fileToBoundedDataUrl(f, LIMITS.MEDIA_URL_MAX);
        next.push({
          name: f.name,
          url,
          caption: f.name.replace(/\.[^.]+$/, ''),
          type: f.type === 'image/gif' ? 'gif' : 'meme',
        });
      } catch {
        onToast(`${f.name} skipped (too large for Firestore).`, 'error');
      }
    }
    setBulkMediaItems(next);
  };

  const handleBulkMediaUpload = async () => {
    if (!bulkMediaItems.length) {
      onToast('Select files first!', 'error');
      return;
    }
    for (const item of bulkMediaItems) {
      await publishOrQueue(
        'media',
        {
          url: item.url,
          caption: clampStr(item.caption || item.name, LIMITS.MEDIA_CAPTION_MAX),
          type: item.type,
        },
        '🖼️ Media uploaded!'
      );
    }
    setBulkMediaItems([]);
    setBulkMediaOpen(false);
    onToast(`Uploaded ${bulkMediaItems.length} file(s)!`);
  };

  const handleAddGame = async () => {
    const name = clampStr(gameName, LIMITS.GAME_NAME_MAX);
    const desc = clampStr(gameDesc, LIMITS.GAME_DESC_MAX);
    const icon = clampStr(gameIcon || '🎮', LIMITS.ICON_MAX) || '🎮';
    const code = gameCode.trim().slice(0, LIMITS.GAME_CODE_MAX);
    if (!name || !code) {
      onToast('Enter game name and HTML/JS code!', 'error');
      return;
    }
    setGameName('');
    setGameDesc('');
    setGameIcon('🎮');
    setGameCode('');
    await publishOrQueue('games', { name, desc, icon, code }, '🎮 Game published for everyone!');
  };

  const handleDeleteDoc = async (col: string, id: string) => {
    const path = `${col}/${id}`;
    try {
      await deleteDoc(doc(db, col, id));
      onToast('Deleted.', 'error');
      await logAction(`Deleted ${col} item`, id);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleAddSchedule = async () => {
    const label = clampStr(schLabel || 'Class Time', LIMITS.SCHEDULE_LABEL_MAX) || 'Class Time';
    if (!VALID_TIME_REGEX.test(schStart) || !VALID_TIME_REGEX.test(schEnd)) {
      onToast('Invalid start or end time!', 'error');
      return;
    }
    if (schStart >= schEnd) {
      onToast('End time must be after start time!', 'error');
      return;
    }
    if (!schDays.length) {
      onToast('Select at least one day!', 'error');
      return;
    }
    const id = `sch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const path = `schedules/${id}`;
    try {
      await setDoc(doc(db, 'schedules', id), {
        label,
        start: schStart,
        end: schEnd,
        tz: clampStr(schTz, LIMITS.SCHEDULE_TZ_MAX),
        days: schDays.slice(0, LIMITS.SCHEDULE_DAYS_MAX),
        authorId: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      setSchLabel('');
      onToast('🔒 Class time block saved for everyone!', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const handleSetOwnerRole = async (target: UserPublic, makeOwner: boolean) => {
    if (!isHeadAdmin) {
      onToast('Only the Head Admin can change owner roles!', 'error');
      return;
    }
    if (target.role === 'head_admin') return;
    const batch = writeBatch(db);
    const nextRole = makeOwner ? 'owner' : 'member';
    batch.update(doc(db, 'users_public', target.uid), {
      role: nextRole,
      updatedAt: serverTimestamp(),
    });
    if (makeOwner) {
      batch.set(doc(db, 'admins', target.uid), {
        uid: target.uid,
        role: 'owner',
        grantedBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });
    } else {
      batch.delete(doc(db, 'admins', target.uid));
    }
    try {
      await batch.commit();
      onToast(
        makeOwner ? `👑 ${target.username} is now an Owner!` : `${target.username} is now a Member.`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users_public/${target.uid}`);
    }
  };

  const handleConfirmBan = async (target: UserPublic) => {
    if (target.role === 'owner' || target.role === 'head_admin') {
      onToast('Cannot ban an owner!', 'error');
      return;
    }
    const until =
      banDur === 'permanent'
        ? 'permanent'
        : String(Date.now() + Number(banDur) * 24 * 60 * 60 * 1000);
    const path = `users_public/${target.uid}`;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users_public', target.uid), {
        bannedUntil: clampStr(until, LIMITS.BAN_UNTIL_MAX),
        banReason: clampStr(banReason, LIMITS.BAN_REASON_MAX),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setBanTargetUid(null);
      setBanReason('');
      onToast(`🚫 ${target.username} has been banned.`, 'error');
      await logAction('Banned user', `${target.username} · ${banReason || 'No reason'}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleUnban = async (target: UserPublic) => {
    const path = `users_public/${target.uid}`;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users_public', target.uid), {
        bannedUntil: '',
        banReason: '',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      onToast(`✅ ${target.username} has been unbanned!`);
      await logAction('Unbanned user', target.username);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDeleteUser = async (target: UserPublic) => {
    if (!isHeadAdmin || target.role === 'head_admin') return;
    if (!window.confirm(`Delete user "${target.username}"? This cannot be undone.`)) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'users_public', target.uid));
      batch.delete(doc(db, 'users_private', target.uid));
      if (target.role === 'owner') {
        batch.delete(doc(db, 'admins', target.uid));
      }
      await batch.commit();
      onToast(`User "${target.username}" deleted.`, 'error');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users_public/${target.uid}`);
    }
  };

  const handleAdminResetPassword = async (target: UserPublic) => {
    if (!isHeadAdmin || !auth.currentUser) return;
    if (resetTargetPass.length < LIMITS.PASSWORD_MIN) {
      onToast(`New password must be at least ${LIMITS.PASSWORD_MIN} characters.`, 'error');
      return;
    }
    setResetSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/auth/admin-reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetUid: target.uid,
          newPassword: resetTargetPass,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        onToast(data.error || 'Could not reset password.', 'error');
        return;
      }
      setResetTargetUid(null);
      setResetTargetPass('');
      onToast(`🔑 Password reset for ${target.username}!`);
    } catch {
      onToast('Network error resetting password.', 'error');
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleOpenInboxThread = async (t: ChatThread) => {
    setActiveThreadId(t.id);
    if (t.unreadForOwner) {
      try {
        await setDoc(
          doc(db, 'chatThreads', t.id),
          {
            userId: t.userId,
            username: t.username,
            lastMessage: t.lastMessage,
            unreadForOwner: false,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `chatThreads/${t.id}`);
      }
    }
  };

  const handleSendInboxReply = async () => {
    if (!activeThreadId) return;
    const text = clampStr(inboxReply, LIMITS.CHAT_TEXT_MAX);
    if (!text) return;
    const targetThread = threads.find((t) => t.id === activeThreadId);
    if (!targetThread) return;
    setInboxReply('');
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'chatThreads', activeThreadId),
        {
          userId: targetThread.userId,
          username: targetThread.username,
          lastMessage: clampStr(text, LIMITS.CHAT_LAST_MSG_MAX),
          unreadForOwner: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      batch.set(doc(db, 'chatThreads', activeThreadId, 'messages', msgId), {
        from: 'owner',
        senderUid: currentUser.uid,
        senderName: clampStr(`👑 ${currentUser.username}`, LIMITS.CHAT_SENDER_NAME_MAX),
        text,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `chatThreads/${activeThreadId}`);
    }
  };

  const handlePostAnnouncement = async () => {
    const text = clampStr(announcementText, LIMITS.ANNOUNCEMENT_MAX);
    if (!text) {
      onToast('Write an announcement first.', 'error');
      return;
    }
    const id = `ann_${Date.now()}`;
    try {
      await setDoc(doc(db, 'announcements', id), {
        text,
        byUid: currentUser.uid,
        byName: clampStr(currentUser.username, LIMITS.USERNAME_MAX),
        createdAt: serverTimestamp(),
      });
      setAnnouncementText('');
      onToast('📢 Announcement pinned for everyone!');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `announcements/${id}`);
    }
  };

  const handleSendBroadcast = async () => {
    const text = clampStr(broadcastText, LIMITS.BROADCAST_MAX);
    if (!text) {
      onToast('Write a broadcast message first.', 'error');
      return;
    }
    const id = `bc_${Date.now()}`;
    try {
      await setDoc(doc(db, 'broadcasts', id), {
        text,
        byUid: currentUser.uid,
        byName: clampStr(currentUser.username, LIMITS.USERNAME_MAX),
        createdAt: serverTimestamp(),
      });
      setBroadcastText('');
      onToast('📣 Broadcast sent to all online users!');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `broadcasts/${id}`);
    }
  };

  const handleThemeChange = async (theme: SiteTheme) => {
    try {
      await setDoc(doc(db, 'siteConfig', 'settings'), {
        siteTheme: theme,
        updatedBy: currentUser.uid,
        updatedAt: serverTimestamp(),
      });
      onToast(`🎨 Theme updated to ${theme} for everyone!`, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'siteConfig/settings');
    }
  };

  const handleClearLogs = async () => {
    for (const log of activityLogs) {
      await deleteDoc(doc(db, 'activityLogs', log.id));
    }
    onToast('Activity log cleared.', 'info');
  };

  const handleExportAll = () => {
    const data = JSON.stringify(
      {
        exportedAt: Date.now(),
        jokes,
        riddles,
        facts,
        challenges,
        media,
        games,
        schedules,
        users,
        announcements,
        broadcasts,
      },
      null,
      2
    );
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ultimatefun-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    onToast('JSON export downloaded.', 'info');
  };

  const handleExportMediaFiles = () => {
    const uploads = media.filter((m) => m.url.startsWith('data:image/'));
    if (!uploads.length) {
      onToast('No uploaded meme/gif files to export.', 'error');
      return;
    }
    uploads.forEach((m, i) => {
      const ext = (m.url.match(/^data:image\/([a-zA-Z0-9+.-]+);/)?.[1] || 'png').replace('jpeg', 'jpg');
      const a = document.createElement('a');
      a.href = m.url;
      a.download = `media-${i + 1}.${ext}`;
      a.click();
    });
    onToast(`Exported ${uploads.length} media file(s).`, 'info');
  };

  const pendingOnly = pendingItems.filter((p) => p.status === 'pending');
  const unreadThreadsCount = threads.filter((t) => t.unreadForOwner).length;
  const filteredUsers = users.filter((u) =>
    !userSearch.trim()
      ? true
      : u.username.toLowerCase().includes(userSearch.trim().toLowerCase())
  );

  const tzNowPreview = (() => {
    try {
      return new Date().toLocaleTimeString('en-US', {
        timeZone: schTz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  })();

  return (
    <div className="max-w-[1040px] mx-auto px-4 py-6 animate-fadeIn">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-4xl text-[var(--yellow)] tracking-wider">
            {isHeadAdmin ? '⭐ Head Admin Dashboard' : '⚙️ Owner Dashboard'}
          </h1>
          <p className="text-xs text-[#f0f4ff]/55 mt-1">
            {isHeadAdmin
              ? 'Full cloud control — every change syncs live to all users’ computers'
              : 'Add and manage site content synced via Firebase'}
          </p>
        </div>

        <label className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!requireApproval}
            onChange={(e) => setRequireApproval(!e.target.checked)}
            className="accent-[var(--green)] w-4 h-4 cursor-pointer"
          />
          <span className={!requireApproval ? 'text-[var(--green)]' : 'text-[#f0f4ff]/70'}>
            {!requireApproval
              ? '⚡ Publish Live Immediately'
              : '📧 Require Email Approval First'}
          </span>
        </label>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mb-5">
        {[
          ['Jokes', jokes.length],
          ['Riddles', riddles.length],
          ['Facts', facts.length],
          ['Challenges', challenges.length],
          ['Media', media.length],
          ['Games', games.length],
          ['Users', users.length],
        ].map(([label, num]) => (
          <div
            key={String(label)}
            className="bg-[#00b4d8]/10 border-2 border-[#00b4d8]/25 rounded-xl py-2.5 px-2 text-center"
          >
            <div className="font-display text-2xl text-[var(--yellow)]">{num}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#f0f4ff]/50">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {[
          { id: 'jokes', label: '😂 Jokes', activeCls: 'bg-[var(--cyan)] border-[var(--cyan)] text-[var(--navy)]' },
          { id: 'riddles', label: '🧠 Riddles', activeCls: 'bg-[var(--cyan)] border-[var(--cyan)] text-[var(--navy)]' },
          { id: 'facts', label: '💡 Facts', activeCls: 'bg-[var(--cyan)] border-[var(--cyan)] text-[var(--navy)]' },
          { id: 'challenges', label: '🔥 Challenges', activeCls: 'bg-[var(--red)] border-[var(--red)] text-white' },
          { id: 'media', label: '🖼️ Memes/GIFs', activeCls: 'bg-[var(--pink)] border-[var(--pink)] text-white' },
          { id: 'games', label: '🎮 Games', activeCls: 'bg-[var(--purple)] border-[var(--purple)] text-white' },
          { id: 'schedule', label: '🔒 Class Times', activeCls: 'bg-[var(--red)] border-[var(--red)] text-white' },
          { id: 'users', label: '👥 Users', activeCls: 'bg-[var(--cyan)] border-[var(--cyan)] text-[var(--navy)]' },
          ...(isHeadAdmin
            ? [
                {
                  id: 'inbox',
                  label: `💬 Inbox${unreadThreadsCount ? ` (${unreadThreadsCount})` : ''}`,
                  activeCls: 'bg-[var(--cyan)] border-[var(--cyan)] text-[var(--navy)]',
                },
              ]
            : []),
          {
            id: 'pending',
            label: `⏳ Pending${pendingOnly.length ? ` (${pendingOnly.length})` : ''}`,
            activeCls: 'bg-[var(--red)] border-[var(--red)] text-white',
          },
          ...(isHeadAdmin
            ? [
                { id: 'activity', label: '⭐ Activity Log', activeCls: 'bg-[var(--yellow)] border-[var(--yellow)] text-[var(--navy)]' },
                { id: 'feedback', label: '💬 Feedback', activeCls: 'bg-[var(--cyan)] border-[var(--cyan)] text-[var(--navy)]' },
                { id: 'announcements', label: '📢 Announcements', activeCls: 'bg-[var(--yellow)] border-[var(--yellow)] text-[var(--navy)]' },
                { id: 'broadcast', label: '📣 Broadcast', activeCls: 'bg-[var(--red)] border-[var(--red)] text-white' },
                { id: 'theme', label: '🎨 Theme', activeCls: 'bg-[var(--green)] border-[var(--green)] text-[var(--navy)]' },
                { id: 'userstats', label: '📊 User Stats', activeCls: 'bg-[var(--purple)] border-[var(--purple)] text-white' },
                { id: 'export', label: '📦 Export', activeCls: 'bg-[var(--orange)] border-[var(--orange)] text-white' },
              ]
            : []),
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as DashTab)}
            className={`px-3.5 py-1.5 rounded-full border-2 text-xs font-bold cursor-pointer transition ${
              tab === t.id
                ? t.activeCls
                : 'border-[#00b4d8]/30 text-[#f0f4ff]/70 hover:border-[var(--cyan)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* JOKES TAB */}
      {tab === 'jokes' && (
        <div>
          <div className="bg-white/[0.04] border-2 border-[#00b4d8]/20 rounded-2xl p-5 mb-5">
            <h3 className="font-display text-2xl text-[var(--orange)] tracking-wide mb-3">
              Add a Joke
              <button
                type="button"
                onClick={() => setBulkJokesOpen((v) => !v)}
                className="ml-3 text-xs font-sans font-bold text-[var(--cyan)] underline cursor-pointer"
              >
                + Bulk Add
              </button>
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--cyan)] mb-1">
                  Setup
                </label>
                <textarea
                  value={jokeSetup}
                  onChange={(e) => setJokeSetup(e.target.value)}
                  maxLength={LIMITS.JOKE_SETUP_MAX}
                  placeholder="Why did the chicken cross the road?"
                  className="w-full min-h-[70px] bg-white/[0.07] border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl p-2.5 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--cyan)] mb-1">
                  Punchline
                </label>
                <textarea
                  value={jokePunch}
                  onChange={(e) => setJokePunch(e.target.value)}
                  maxLength={LIMITS.JOKE_PUNCH_MAX}
                  placeholder="To get to the other side!"
                  className="w-full min-h-[55px] bg-white/[0.07] border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl p-2.5 text-sm text-white outline-none"
                />
              </div>
              <button
                onClick={handleAddJoke}
                className="px-5 py-2 rounded-full bg-[var(--green)] text-[#0a2010] font-extrabold text-xs uppercase cursor-pointer"
              >
                + Add Joke
              </button>
            </div>
            {bulkJokesOpen && (
              <div className="mt-4 p-3 rounded-xl bg-black/25 border border-dashed border-[#00b4d8]/30">
                <textarea
                  value={bulkJokesTxt}
                  onChange={(e) => setBulkJokesTxt(e.target.value)}
                  placeholder="Setup | Punchline (one per line)"
                  className="w-full min-h-[100px] bg-white/5 border border-[#00b4d8]/25 rounded-lg p-2.5 font-mono text-xs text-white outline-none"
                />
                <button
                  onClick={handleBulkJokes}
                  className="mt-2 px-4 py-1.5 rounded-full bg-[var(--green)] text-[#0a2010] font-extrabold text-xs uppercase cursor-pointer"
                >
                  📥 Import Jokes
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {jokes.map((j) => (
              <div
                key={j.id}
                className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3.5 flex items-start justify-between gap-3"
              >
                <div className="text-sm">
                  <strong className="text-[var(--yellow)] block">{j.setup}</strong>
                  <span className="text-[#f0f4ff]/55 text-xs">{j.punch}</span>
                </div>
                <button
                  onClick={() => handleDeleteDoc('jokes', j.id)}
                  className="bg-[#e63946]/15 border border-[#e63946]/35 text-[#f8a5aa] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RIDDLES TAB */}
      {tab === 'riddles' && (
        <div>
          <div className="bg-white/[0.04] border-2 border-[#00b4d8]/20 rounded-2xl p-5 mb-5">
            <h3 className="font-display text-2xl text-[var(--orange)] tracking-wide mb-3">
              Add a Riddle
              <button
                type="button"
                onClick={() => setBulkRiddlesOpen((v) => !v)}
                className="ml-3 text-xs font-sans font-bold text-[var(--cyan)] underline cursor-pointer"
              >
                + Bulk Add
              </button>
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--cyan)] mb-1">
                  Riddle
                </label>
                <textarea
                  value={riddleQ}
                  onChange={(e) => setRiddleQ(e.target.value)}
                  maxLength={LIMITS.RIDDLE_Q_MAX}
                  placeholder="I speak without a mouth..."
                  className="w-full min-h-[70px] bg-white/[0.07] border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl p-2.5 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--cyan)] mb-1">
                  Answer
                </label>
                <textarea
                  value={riddleA}
                  onChange={(e) => setRiddleA(e.target.value)}
                  maxLength={LIMITS.RIDDLE_A_MAX}
                  placeholder="An echo"
                  className="w-full min-h-[55px] bg-white/[0.07] border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl p-2.5 text-sm text-white outline-none"
                />
              </div>
              <button
                onClick={handleAddRiddle}
                className="px-5 py-2 rounded-full bg-[var(--green)] text-[#0a2010] font-extrabold text-xs uppercase cursor-pointer"
              >
                + Add Riddle
              </button>
            </div>
            {bulkRiddlesOpen && (
              <div className="mt-4 p-3 rounded-xl bg-black/25 border border-dashed border-[#00b4d8]/30">
                <textarea
                  value={bulkRiddlesTxt}
                  onChange={(e) => setBulkRiddlesTxt(e.target.value)}
                  placeholder="Question | Answer (one per line)"
                  className="w-full min-h-[100px] bg-white/5 border border-[#00b4d8]/25 rounded-lg p-2.5 font-mono text-xs text-white outline-none"
                />
                <button
                  onClick={handleBulkRiddles}
                  className="mt-2 px-4 py-1.5 rounded-full bg-[var(--green)] text-[#0a2010] font-extrabold text-xs uppercase cursor-pointer"
                >
                  📥 Import Riddles
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {riddles.map((r) => (
              <div
                key={r.id}
                className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3.5 flex items-start justify-between gap-3"
              >
                <div className="text-sm">
                  <strong className="text-[var(--cyan)] block">{r.q}</strong>
                  <span className="text-[#f0f4ff]/55 text-xs">Answer: {r.a}</span>
                </div>
                <button
                  onClick={() => handleDeleteDoc('riddles', r.id)}
                  className="bg-[#e63946]/15 border border-[#e63946]/35 text-[#f8a5aa] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FACTS TAB */}
      {tab === 'facts' && (
        <div>
          <div className="bg-white/[0.04] border-2 border-[#00b4d8]/20 rounded-2xl p-5 mb-5">
            <h3 className="font-display text-2xl text-[var(--orange)] tracking-wide mb-3">
              Add a Fact
              <button
                type="button"
                onClick={() => setBulkFactsOpen((v) => !v)}
                className="ml-3 text-xs font-sans font-bold text-[var(--cyan)] underline cursor-pointer"
              >
                + Bulk Add
              </button>
            </h3>
            <textarea
              value={factTxt}
              onChange={(e) => setFactTxt(e.target.value)}
              maxLength={LIMITS.FACT_MAX}
              placeholder="Did you know..."
              className="w-full min-h-[75px] bg-white/[0.07] border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl p-2.5 text-sm text-white outline-none mb-3"
            />
            <button
              onClick={handleAddFact}
              className="px-5 py-2 rounded-full bg-[var(--green)] text-[#0a2010] font-extrabold text-xs uppercase cursor-pointer"
            >
              + Add Fact
            </button>
            {bulkFactsOpen && (
              <div className="mt-4 p-3 rounded-xl bg-black/25 border border-dashed border-[#00b4d8]/30">
                <textarea
                  value={bulkFactsTxt}
                  onChange={(e) => setBulkFactsTxt(e.target.value)}
                  placeholder="One fact per line..."
                  className="w-full min-h-[100px] bg-white/5 border border-[#00b4d8]/25 rounded-lg p-2.5 font-mono text-xs text-white outline-none"
                />
                <button
                  onClick={handleBulkFacts}
                  className="mt-2 px-4 py-1.5 rounded-full bg-[var(--green)] text-[#0a2010] font-extrabold text-xs uppercase cursor-pointer"
                >
                  📥 Import Facts
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {facts.map((f) => (
              <div
                key={f.id}
                className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3.5 flex items-start justify-between gap-3"
              >
                <div className="text-sm text-[#f0f4ff]/85">{f.txt}</div>
                <button
                  onClick={() => handleDeleteDoc('facts', f.id)}
                  className="bg-[#e63946]/15 border border-[#e63946]/35 text-[#f8a5aa] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CHALLENGES TAB */}
      {tab === 'challenges' && (
        <div>
          <div className="bg-white/[0.04] border-2 border-[#e63946]/30 rounded-2xl p-5 mb-5 space-y-3">
            <h3 className="font-display text-2xl text-[var(--red)] tracking-wide">
              🔥 Add a Challenge
            </h3>
            <input
              value={chTitle}
              onChange={(e) => setChTitle(e.target.value)}
              maxLength={LIMITS.CHALLENGE_TITLE_MAX}
              placeholder="Title (e.g. The 100 Push-up Challenge)"
              className="w-full bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
            />
            <textarea
              value={chDesc}
              onChange={(e) => setChDesc(e.target.value)}
              maxLength={LIMITS.CHALLENGE_DESC_MAX}
              placeholder="What must the challenger do?"
              className="w-full min-h-[70px] bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
            />
            <div className="grid sm:grid-cols-2 gap-3">
              <select
                value={chDiff}
                onChange={(e) => setChDiff(e.target.value as ChallengeDifficulty)}
                className="bg-[#0d1f42] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
              >
                <option value="easy">🟢 Easy</option>
                <option value="medium">🟡 Medium</option>
                <option value="hard">🔴 Hard</option>
                <option value="epic">💜 Epic</option>
              </select>
              <input
                value={chIcon}
                onChange={(e) => setChIcon(e.target.value)}
                maxLength={4}
                placeholder="Icon / Emoji (e.g. 🏋️)"
                className="bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
              />
            </div>
            <button
              onClick={handleAddChallenge}
              className="px-5 py-2 rounded-full bg-[var(--red)] text-white font-extrabold text-xs uppercase cursor-pointer"
            >
              + Add Challenge
            </button>
          </div>
          <div className="space-y-2">
            {challenges.map((c) => (
              <div
                key={c.id}
                className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3.5 flex items-start justify-between gap-3"
              >
                <div className="text-sm">
                  <strong className="text-[var(--red)]">
                    {c.icon} {c.title}
                  </strong>{' '}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 uppercase">
                    {c.difficulty}
                  </span>
                  <div className="text-[#f0f4ff]/55 text-xs mt-1">{c.desc}</div>
                </div>
                <button
                  onClick={() => handleDeleteDoc('challenges', c.id)}
                  className="bg-[#e63946]/15 border border-[#e63946]/35 text-[#f8a5aa] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MEDIA TAB */}
      {tab === 'media' && (
        <div>
          <div className="bg-white/[0.04] border-2 border-[#f72585]/30 rounded-2xl p-5 mb-5 space-y-3">
            <h3 className="font-display text-2xl text-[var(--pink)] tracking-wide">
              🖼️ Add Meme, GIF or Pixel Art
              <button
                type="button"
                onClick={() => setBulkMediaOpen((v) => !v)}
                className="ml-3 text-xs font-sans font-bold text-[var(--cyan)] underline cursor-pointer"
              >
                + Bulk Add
              </button>
            </h3>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--cyan)] mb-1">
                Upload File (auto-compressed for cloud DB)
              </label>
              <input
                ref={mediaFileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleMediaFile}
                className="w-full text-xs text-[#f0f4ff]/80 bg-white/5 border border-[#00b4d8]/25 rounded-xl p-2"
              />
              <div className="text-[11px] text-[#f0f4ff]/45 mt-1">{mediaFileNote}</div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--cyan)] mb-1">
                Or Paste Image / GIF URL
              </label>
              <input
                value={mediaUrlInput.startsWith('data:') ? '' : mediaUrlInput}
                onChange={(e) => setMediaUrlInput(e.target.value)}
                placeholder="https://media.giphy.com/..."
                className="w-full bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                value={mediaCaption}
                onChange={(e) => setMediaCaption(e.target.value)}
                maxLength={LIMITS.MEDIA_CAPTION_MAX}
                placeholder="Caption (e.g. When Monday hits different...)"
                className="bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
              />
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as MediaType)}
                className="bg-[#0d1f42] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
              >
                <option value="meme">🖼️ Meme</option>
                <option value="gif">🎞️ GIF</option>
                <option value="piskel">🎨 Pixel Art (Piskel)</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                onClick={handleAddMedia}
                className="px-5 py-2 rounded-full bg-[var(--pink)] text-white font-extrabold text-xs uppercase cursor-pointer"
              >
                + Add Media
              </button>
              <a
                href="https://www.piskelapp.com/p/create/sprite"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-full border border-[#f72585]/40 text-[var(--pink)] font-bold text-xs uppercase"
              >
                🎨 Open Piskel Editor
              </a>
            </div>
            {bulkMediaOpen && (
              <div className="mt-3 p-3 rounded-xl bg-black/25 border border-dashed border-[#f72585]/35 space-y-2">
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleBulkMediaSelect}
                  className="text-xs"
                />
                {bulkMediaItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      value={item.caption}
                      onChange={(e) => {
                        const copy = [...bulkMediaItems];
                        copy[idx].caption = e.target.value;
                        setBulkMediaItems(copy);
                      }}
                      className="flex-1 bg-white/5 border border-[#f72585]/30 rounded px-2 py-1 text-xs text-white"
                    />
                    <select
                      value={item.type}
                      onChange={(e) => {
                        const copy = [...bulkMediaItems];
                        copy[idx].type = e.target.value as MediaType;
                        setBulkMediaItems(copy);
                      }}
                      className="bg-[#0d1f42] border border-[#f72585]/30 rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="meme">Meme</option>
                      <option value="gif">GIF</option>
                      <option value="piskel">Pixel Art</option>
                    </select>
                  </div>
                ))}
                <button
                  onClick={handleBulkMediaUpload}
                  className="px-4 py-1.5 rounded-full bg-[var(--pink)] text-white font-extrabold text-xs uppercase cursor-pointer"
                >
                  📥 Upload All
                </button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {media.map((m) => (
              <div
                key={m.id}
                className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase text-[var(--pink)] mr-2">
                    {m.type}
                  </span>
                  <span className="text-sm font-semibold">{m.caption}</span>
                </div>
                <button
                  onClick={() => handleDeleteDoc('media', m.id)}
                  className="bg-[#e63946]/15 border border-[#e63946]/35 text-[#f8a5aa] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GAMES TAB */}
      {tab === 'games' && (
        <div>
          <div className="bg-white/[0.04] border-2 border-[#7c3aed]/40 rounded-2xl p-5 mb-5 space-y-3">
            <h3 className="font-display text-2xl text-[#a78bfa] tracking-wide">🎮 Add a Game</h3>
            <div className="grid sm:grid-cols-3 gap-3">
              <input
                value={gameName}
                onChange={(e) => setGameName(e.target.value)}
                maxLength={LIMITS.GAME_NAME_MAX}
                placeholder="Game Name"
                className="bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
              />
              <input
                value={gameDesc}
                onChange={(e) => setGameDesc(e.target.value)}
                maxLength={LIMITS.GAME_DESC_MAX}
                placeholder="Short description"
                className="bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
              />
              <input
                value={gameIcon}
                onChange={(e) => setGameIcon(e.target.value)}
                maxLength={4}
                placeholder="🎮"
                className="bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
              />
            </div>
            <textarea
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value)}
              maxLength={LIMITS.GAME_CODE_MAX}
              placeholder="Paste complete self-contained HTML game code here..."
              className="w-full min-h-[150px] bg-black/40 border-2 border-[#7c3aed]/40 rounded-xl p-3 font-mono text-xs text-[#a78bfa] outline-none"
            />
            <button
              onClick={handleAddGame}
              className="px-5 py-2 rounded-full bg-[var(--purple)] text-white font-extrabold text-xs uppercase cursor-pointer"
            >
              🎮 Publish Game
            </button>
          </div>
          <div className="space-y-2">
            {games.map((g) => (
              <div
                key={g.id}
                className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3.5 flex items-center justify-between gap-3"
              >
                <div>
                  <strong className="text-[#a78bfa]">
                    {g.icon} {g.name}
                  </strong>
                  <div className="text-xs text-[#f0f4ff]/55">{g.desc}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onPlayGame(g)}
                    className="px-3 py-1 rounded-full bg-[var(--purple)] text-white text-xs font-bold cursor-pointer"
                  >
                    ▶ Test
                  </button>
                  <button
                    onClick={() => handleDeleteDoc('games', g.id)}
                    className="bg-[#e63946]/15 border border-[#e63946]/35 text-[#f8a5aa] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SCHEDULE TAB */}
      {tab === 'schedule' && (
        <div>
          <div className="bg-white/[0.04] border-2 border-[#e63946]/40 rounded-2xl p-5 mb-5 space-y-3">
            <h3 className="font-display text-2xl text-[var(--red)] tracking-wide">
              🔒 Add Class Time Block
            </h3>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[var(--cyan)] mb-1">
                🌍 School / Class Timezone
              </label>
              <select
                value={schTz}
                onChange={(e) => setSchTz(e.target.value)}
                className="w-full bg-[#0d1f42] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
              >
                {ALL_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {formatTzOption(tz)}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-[#f0f4ff]/40 mt-1">
                Current time in {schTz.replace(/_/g, ' ')}: {tzNowPreview}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--cyan)] mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={schStart}
                  onChange={(e) => setSchStart(e.target.value)}
                  className="w-full bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase text-[var(--cyan)] mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={schEnd}
                  onChange={(e) => setSchEnd(e.target.value)}
                  className="w-full bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
                />
              </div>
            </div>
            <input
              value={schLabel}
              onChange={(e) => setSchLabel(e.target.value)}
              maxLength={LIMITS.SCHEDULE_LABEL_MAX}
              placeholder="Label (e.g. Period 1 — Math)"
              className="w-full bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
            />
            <div className="flex flex-wrap gap-3">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schDays.includes(d)}
                    onChange={(e) => {
                      if (e.target.checked) setSchDays((prev) => [...prev, d]);
                      else setSchDays((prev) => prev.filter((x) => x !== d));
                    }}
                    className="accent-[var(--red)]"
                  />
                  {DAY_NAMES[d]}
                </label>
              ))}
            </div>
            <button
              onClick={handleAddSchedule}
              className="px-5 py-2 rounded-full bg-[var(--red)] text-white font-extrabold text-xs uppercase cursor-pointer"
            >
              🔒 Add Time Block
            </button>
          </div>

          <div className="mb-4 p-3 rounded-xl bg-white/[0.04] border border-white/10 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-[#f0f4ff]/55">Current status:</span>
            <span
              className={`px-3 py-1 rounded-full font-extrabold uppercase ${
                activeBlock
                  ? 'bg-[#e63946]/20 text-[var(--red)]'
                  : 'bg-[#06d6a0]/15 text-[var(--green)]'
              }`}
            >
              {activeBlock ? '🔴 Site Locked' : '🟢 Site Open'}
            </span>
            <span className="text-[#f0f4ff]/45">
              {activeBlock
                ? `${activeBlock.label} · ends ${fmt12(activeBlock.end)}`
                : `Your local time: ${clockStr}`}
            </span>
          </div>

          <div className="space-y-2">
            {schedules.map((s) => {
              const live = isInBlock(s, new Date());
              return (
                <div
                  key={s.id}
                  className="bg-[#e63946]/[0.07] border border-[#e63946]/25 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <strong className="text-[var(--red)]">{s.label}</strong>
                    {live && (
                      <span className="ml-2 text-[10px] font-extrabold px-2 py-0.5 rounded bg-[#e63946]/30 text-[#ff8a8a] animate-clockTick">
                        ● LIVE NOW
                      </span>
                    )}
                    <div className="text-xs text-[#f0f4ff]/60 mt-1">
                      ⏰ {fmt12(s.start)} – {fmt12(s.end)} · 🌍 {s.tz.replace(/_/g, ' ')}
                    </div>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {DAY_NAMES.map((name, i) => (
                        <span
                          key={name}
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                            s.days.includes(i)
                              ? 'bg-[var(--red)] text-white'
                              : 'bg-[#e63946]/20 text-[var(--red)]'
                          }`}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDoc('schedules', s.id)}
                    className="bg-[#e63946]/15 border border-[#e63946]/35 text-[#f8a5aa] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* USERS TAB */}
      {tab === 'users' && (
        <div>
          <input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="🔍 Search users by username..."
            className="w-full mb-3 bg-white/[0.06] border-2 border-[#00b4d8]/20 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
          />
          <div className="space-y-2">
            {filteredUsers.map((u) => {
              const banned = isUserBanned(u);
              const isMe = u.uid === currentUser.uid;
              return (
                <div
                  key={u.uid}
                  className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3.5 flex flex-wrap items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-[#00b4d8]/20 border border-[#00b4d8]/40 flex items-center justify-center font-extrabold text-sm uppercase overflow-hidden shrink-0">
                    {u.avatarUrl ? (
                      <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      u.username.slice(0, 2)
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-sm flex flex-wrap items-center gap-2">
                      <span>{u.username}</span>
                      {u.role === 'head_admin' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#ffd60a]/25 text-[var(--yellow)]">
                          ⭐ Head Admin
                        </span>
                      )}
                      {u.role === 'owner' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#ffd60a]/20 text-[var(--yellow)]">
                          👑 Owner
                        </span>
                      )}
                      {u.role === 'member' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#00b4d8]/15 text-[var(--cyan)]">
                          Member
                        </span>
                      )}
                      {isMe && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#06d6a0]/15 text-[var(--green)]">
                          YOU
                        </span>
                      )}
                      {banned && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#e63946]/25 text-[var(--red)]">
                          🚫 Banned
                        </span>
                      )}
                    </div>
                    {banned && u.banReason && (
                      <div className="text-xs text-[#f0f4ff]/45 mt-0.5">Reason: {u.banReason}</div>
                    )}
                    {banTargetUid === u.uid && (
                      <div className="mt-2 p-2.5 rounded-lg bg-[#e63946]/10 border border-[#e63946]/25 flex flex-wrap gap-2 items-center">
                        <select
                          value={banDur}
                          onChange={(e) => setBanDur(e.target.value)}
                          className="bg-black/40 border border-[#e63946]/30 rounded px-2 py-1 text-xs text-white"
                        >
                          <option value="1">1 Day</option>
                          <option value="3">3 Days</option>
                          <option value="30">1 Month</option>
                          <option value="permanent">Permanent</option>
                        </select>
                        <input
                          value={banReason}
                          onChange={(e) => setBanReason(e.target.value)}
                          placeholder="Reason (optional)"
                          className="flex-1 min-w-[120px] bg-black/40 border border-[#e63946]/30 rounded px-2 py-1 text-xs text-white"
                        />
                        <button
                          onClick={() => handleConfirmBan(u)}
                          className="px-2.5 py-1 rounded bg-[var(--red)] text-white text-xs font-bold cursor-pointer"
                        >
                          Confirm Ban
                        </button>
                        <button
                          onClick={() => setBanTargetUid(null)}
                          className="px-2.5 py-1 rounded bg-white/10 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {resetTargetUid === u.uid && (
                      <div className="mt-2 p-2.5 rounded-lg bg-[#00b4d8]/10 border border-[#00b4d8]/25 flex flex-wrap gap-2 items-center">
                        <input
                          type="password"
                          minLength={LIMITS.PASSWORD_MIN}
                          maxLength={LIMITS.PASSWORD_MAX}
                          value={resetTargetPass}
                          onChange={(e) => setResetTargetPass(e.target.value)}
                          placeholder="New password (6+ chars)"
                          className="flex-1 min-w-[150px] bg-black/40 border border-[#00b4d8]/30 rounded px-2 py-1 text-xs text-white"
                        />
                        <button
                          disabled={resetSubmitting}
                          onClick={() => handleAdminResetPassword(u)}
                          className="px-2.5 py-1 rounded bg-[var(--cyan)] text-[var(--navy)] text-xs font-extrabold cursor-pointer disabled:opacity-60"
                        >
                          {resetSubmitting ? 'Saving...' : 'Confirm Reset'}
                        </button>
                        <button
                          onClick={() => {
                            setResetTargetUid(null);
                            setResetTargetPass('');
                          }}
                          className="px-2.5 py-1 rounded bg-white/10 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {isHeadAdmin && !isMe && u.role === 'member' && (
                      <button
                        onClick={() => handleSetOwnerRole(u, true)}
                        className="px-2.5 py-1 rounded-lg bg-[#ffd60a]/15 border border-[#ffd60a]/30 text-[var(--yellow)] text-[11px] font-bold cursor-pointer"
                      >
                        👑 Make Owner
                      </button>
                    )}
                    {isHeadAdmin && !isMe && u.role === 'owner' && (
                      <button
                        onClick={() => handleSetOwnerRole(u, false)}
                        className="px-2.5 py-1 rounded-lg bg-[#f77f00]/15 border border-[#f77f00]/30 text-[#ffb347] text-[11px] font-bold cursor-pointer"
                      >
                        ⬇ Remove Owner
                      </button>
                    )}
                    {!isMe && !banned && u.role === 'member' && (
                      <button
                        onClick={() => setBanTargetUid(u.uid)}
                        className="px-2.5 py-1 rounded-lg bg-[#e63946]/15 border border-[#e63946]/30 text-[#f8a5aa] text-[11px] font-bold cursor-pointer"
                      >
                        🚫 Ban
                      </button>
                    )}
                    {!isMe && banned && (
                      <button
                        onClick={() => handleUnban(u)}
                        className="px-2.5 py-1 rounded-lg bg-[#06d6a0]/15 border border-[#06d6a0]/30 text-[var(--green)] text-[11px] font-bold cursor-pointer"
                      >
                        ✅ Unban
                      </button>
                    )}
                    {isHeadAdmin && !isMe && u.role !== 'head_admin' && (
                      <button
                        onClick={() => {
                          setResetTargetUid(u.uid);
                          setResetTargetPass('');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#00b4d8]/15 border border-[#00b4d8]/30 text-[var(--cyan)] text-[11px] font-bold cursor-pointer"
                      >
                        🔑 Reset Password
                      </button>
                    )}
                    {isHeadAdmin && !isMe && u.role !== 'head_admin' && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="px-2.5 py-1 rounded-lg bg-[#e63946]/15 border border-[#e63946]/30 text-[#f8a5aa] text-[11px] font-bold cursor-pointer"
                      >
                        🗑 Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INBOX TAB */}
      {tab === 'inbox' && isHeadAdmin && (
        <div className="flex flex-col sm:flex-row h-[460px] border border-[#00b4d8]/20 rounded-2xl overflow-hidden">
          <div className="sm:w-[270px] bg-white/[0.03] border-b sm:border-b-0 sm:border-r border-[#00b4d8]/15 flex flex-col">
            <div className="p-3 border-b border-[#00b4d8]/15 bg-[#00b4d8]/5">
              <div className="font-display text-lg text-[var(--cyan)]">💬 Conversations</div>
              <div className="text-[11px] text-[#f0f4ff]/45">{threads.length} active chats</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleOpenInboxThread(t)}
                  className={`p-3 border-b border-white/5 cursor-pointer flex gap-2.5 items-center ${
                    activeThreadId === t.id ? 'bg-[#00b4d8]/15 border-l-4 border-l-[var(--cyan)]' : 'hover:bg-[#00b4d8]/5'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-[#00b4d8]/25 flex items-center justify-center text-xs font-extrabold uppercase shrink-0">
                    {t.username.slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate flex items-center gap-1.5">
                      {t.username}
                      {t.unreadForOwner && (
                        <span className="w-2 h-2 rounded-full bg-[var(--cyan)] inline-block" />
                      )}
                    </div>
                    <div className="text-[11px] text-[#f0f4ff]/45 truncate">{t.lastMessage}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col bg-[#0a1628]/60">
            {!activeThreadId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[#f0f4ff]/35 text-sm">
                <div className="text-4xl mb-2">💬</div>
                Select a conversation to reply
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
                  {threadMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[75%] px-3.5 py-2.5 rounded-xl text-xs leading-relaxed ${
                        m.from === 'owner'
                          ? 'self-end bg-[#00b4d8]/20 border border-[#00b4d8]/30'
                          : 'self-start bg-white/[0.07] border border-white/10'
                      }`}
                    >
                      <div className="text-[10px] font-extrabold uppercase opacity-60 mb-0.5">
                        {m.senderName}
                      </div>
                      {m.text}
                    </div>
                  ))}
                  <div ref={inboxMsgEndRef} />
                </div>
                <div className="p-3 border-t border-[#00b4d8]/15 flex gap-2">
                  <input
                    value={inboxReply}
                    onChange={(e) => setInboxReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSendInboxReply();
                    }}
                    placeholder="Type your reply…"
                    className="flex-1 bg-white/[0.07] border-2 border-[#00b4d8]/20 rounded-xl px-3 py-2 text-xs text-white outline-none"
                  />
                  <button
                    onClick={handleSendInboxReply}
                    className="px-4 py-2 rounded-xl bg-[var(--cyan)] text-[var(--navy)] font-extrabold text-xs cursor-pointer"
                  >
                    Send ➤
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* PENDING TAB */}
      {tab === 'pending' && (
        <div className="space-y-2.5">
          {pendingOnly.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.04] border-2 border-dashed border-[#00b4d8]/25 rounded-2xl text-[#f0f4ff]/50">
              <div className="text-4xl mb-2">✅</div>
              No pending items — all caught up!
            </div>
          ) : (
            pendingOnly.map((p) => {
              const meta = ITEM_TYPE_META[p.itemType];
              return (
                <div
                  key={p.id}
                  className="p-3.5 rounded-xl bg-[#ffd60a]/5 border border-[#ffd60a]/20 flex gap-3 items-start"
                >
                  <div className="text-xl">{meta.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-extrabold uppercase text-[var(--yellow)]">
                      {meta.label} · added by {p.adderName}
                    </div>
                    <div className="text-xs text-white/90 mt-1 whitespace-pre-wrap">
                      {buildItemSummary(p.itemType, p.payload)}
                    </div>
                    <div className="flex gap-2 mt-2.5">
                      <button
                        onClick={() => onApprovePending(p)}
                        className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold cursor-pointer"
                      >
                        ✅ Approve &amp; Publish
                      </button>
                      <button
                        onClick={() => onRejectPending(p)}
                        className="px-3 py-1 rounded-lg bg-[#e63946]/15 border border-[#e63946]/30 text-[var(--red)] text-xs font-extrabold cursor-pointer"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ACTIVITY LOG */}
      {tab === 'activity' && isHeadAdmin && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-display text-2xl text-[var(--yellow)]">⭐ Owner Activity Log</h3>
            <button
              onClick={handleClearLogs}
              className="px-3 py-1.5 rounded-full bg-[#e63946]/20 text-[var(--red)] text-xs font-bold cursor-pointer"
            >
              🗑 Clear Log
            </button>
          </div>
          <div className="space-y-2">
            {activityLogs.map((l) => (
              <div
                key={l.id}
                className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3 text-xs"
              >
                <strong className="text-[var(--yellow)]">{l.username}</strong>{' '}
                <span className="text-[var(--cyan)]">({l.role})</span> — {l.action}
                {l.detail && <div className="text-[#f0f4ff]/45 mt-1">{l.detail}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FEEDBACK */}
      {tab === 'feedback' && isHeadAdmin && (
        <div className="space-y-2">
          {feedbackList.map((f) => (
            <div
              key={f.id}
              className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3.5 text-sm"
            >
              <strong className="text-[var(--cyan)]">{f.name}</strong>{' '}
              <span className="ml-2">{'⭐'.repeat(f.rating)}</span>
              {f.text && <div className="text-xs text-[#f0f4ff]/75 mt-1">"{f.text}"</div>}
            </div>
          ))}
        </div>
      )}

      {/* ANNOUNCEMENTS */}
      {tab === 'announcements' && isHeadAdmin && (
        <div>
          <div className="bg-white/[0.04] border border-[#00b4d8]/20 rounded-2xl p-4 mb-4">
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              maxLength={LIMITS.ANNOUNCEMENT_MAX}
              placeholder="Type an announcement to pin site-wide..."
              className="w-full min-h-[70px] bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none mb-2"
            />
            <button
              onClick={handlePostAnnouncement}
              className="px-5 py-2 rounded-full bg-[var(--green)] text-[#0a2010] font-extrabold text-xs uppercase cursor-pointer"
            >
              📢 Post Announcement
            </button>
          </div>
          <div className="space-y-2">
            {announcements.map((a) => (
              <div
                key={a.id}
                className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3.5 flex justify-between gap-3"
              >
                <div className="text-sm text-[var(--yellow)] font-semibold">{a.text}</div>
                <button
                  onClick={() => handleDeleteDoc('announcements', a.id)}
                  className="bg-[#e63946]/15 border border-[#e63946]/35 text-[#f8a5aa] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BROADCAST */}
      {tab === 'broadcast' && isHeadAdmin && (
        <div>
          <div className="bg-white/[0.04] border border-[#e63946]/30 rounded-2xl p-4 mb-4">
            <textarea
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              maxLength={LIMITS.BROADCAST_MAX}
              placeholder="Urgent broadcast toast for online users..."
              className="w-full min-h-[70px] bg-white/[0.07] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none mb-2"
            />
            <button
              onClick={handleSendBroadcast}
              className="px-5 py-2 rounded-full bg-[var(--red)] text-white font-extrabold text-xs uppercase cursor-pointer"
            >
              📣 Send Broadcast
            </button>
          </div>
          <div className="space-y-2">
            {broadcasts.map((b) => (
              <div
                key={b.id}
                className="bg-white/[0.04] border border-[#00b4d8]/15 rounded-xl p-3.5 flex justify-between gap-3"
              >
                <div className="text-sm text-[#ff8a8a] font-semibold">{b.text}</div>
                <button
                  onClick={() => handleDeleteDoc('broadcasts', b.id)}
                  className="bg-[#e63946]/15 border border-[#e63946]/35 text-[#f8a5aa] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* THEME */}
      {tab === 'theme' && isHeadAdmin && (
        <div className="bg-white/[0.04] border border-[#00b4d8]/20 rounded-2xl p-5">
          <label className="block text-xs font-bold uppercase text-[var(--cyan)] mb-2">
            Site-Wide Theme Preset (updates all computers immediately)
          </label>
          <select
            value={siteTheme}
            onChange={(e) => handleThemeChange(e.target.value as SiteTheme)}
            className="w-full max-w-xs bg-[#0d1f42] border-2 border-[#00b4d8]/25 rounded-xl p-2.5 text-sm text-white outline-none"
          >
            <option value="default">Default Neon</option>
            <option value="sunset">Sunset</option>
            <option value="ice">Ice</option>
          </select>
        </div>
      )}

      {/* USER STATS */}
      {tab === 'userstats' && isHeadAdmin && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            ['Total Users', users.length],
            ['Members', users.filter((u) => u.role === 'member').length],
            ['Owners', users.filter((u) => u.role === 'owner' || u.role === 'head_admin').length],
            ['Head Admins', users.filter((u) => u.role === 'head_admin').length],
            ['Banned Accounts', users.filter((u) => isUserBanned(u)).length],
            ['Memes/GIFs', media.length],
          ].map(([label, val]) => (
            <div
              key={String(label)}
              className="bg-white/5 border border-white/10 rounded-xl p-4"
            >
              <strong className="block text-2xl text-[var(--yellow)]">{val}</strong>
              <span className="text-xs text-[#f0f4ff]/55">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* EXPORT */}
      {tab === 'export' && isHeadAdmin && (
        <div className="bg-white/[0.04] border border-[#00b4d8]/20 rounded-2xl p-5 flex flex-wrap gap-3">
          <button
            onClick={handleExportAll}
            className="px-5 py-2.5 rounded-full bg-[var(--green)] text-[#0a2010] font-extrabold text-xs uppercase cursor-pointer"
          >
            📦 Export Full JSON
          </button>
          <button
            onClick={handleExportMediaFiles}
            className="px-5 py-2.5 rounded-full bg-[#f77f00]/20 text-[#ffb347] border border-[#f77f00]/40 font-extrabold text-xs uppercase cursor-pointer"
          >
            🖼️ Export Uploaded Media Files
          </button>
        </div>
      )}
    </div>
  );
};
