import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  HEAD_ADMIN_EMAIL,
  OperationType,
  testConnection,
} from './firebase';
import {
  BUILTIN_GAMES,
  STARTER_CHALLENGES,
  STARTER_MEDIA,
} from './constants/builtinGames';
import { clampStr, LIMITS } from './constants/validation';
import type {
  Announcement,
  Broadcast,
  Challenge,
  ChallengeDifficulty,
  Fact,
  GameItem,
  Joke,
  MediaItem,
  MediaType,
  PageId,
  PendingItem,
  Riddle,
  ScheduleBlock,
  SiteTheme,
  ToastMessage,
  UserPublic,
} from './types';
import {
  formatEndLocal,
  getCurrentBlock,
  isUserBanned,
  levenshtein,
} from './utils/schedule';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LockdownOverlay } from './components/LockdownOverlay';
import { ProfileModal } from './components/ProfileModal';
import { ChatWidget } from './components/ChatWidget';
import { OwnerDashboard } from './components/OwnerDashboard';

const THEME_SETS: Record<
  SiteTheme,
  { cyan: string; purple: string; red: string; yellow: string; orange: string; green: string }
> = {
  default: {
    cyan: '#00b4d8',
    purple: '#7c3aed',
    red: '#e63946',
    yellow: '#ffd60a',
    orange: '#f77f00',
    green: '#06d6a0',
  },
  sunset: {
    cyan: '#ff9f1c',
    purple: '#e5383b',
    red: '#d7263d',
    yellow: '#ffd166',
    orange: '#f77f00',
    green: '#8ac926',
  },
  ice: {
    cyan: '#4cc9f0',
    purple: '#4361ee',
    red: '#4895ef',
    yellow: '#90e0ef',
    orange: '#00b4d8',
    green: '#80ed99',
  },
};

function UltimateFunApp() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserPublic | null>(null);
  const [page, setPage] = useState<PageId>('home');

  // Shared Firestore collections
  const [jokes, setJokes] = useState<Joke[]>([]);
  const [riddles, setRiddles] = useState<Riddle[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [games, setGames] = useState<GameItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleBlock[]>([]);
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [acceptedChallengeIds, setAcceptedChallengeIds] = useState<Set<string>>(new Set());
  const [siteTheme, setSiteTheme] = useState<SiteTheme>('default');

  // Interactive page states
  const [riddleGuesses, setRiddleGuesses] = useState<Record<string, string>>({});
  const [riddleResults, setRiddleResults] = useState<
    Record<string, { correct: boolean; message: string }>
  >({});
  const [challengeFilter, setChallengeFilter] = useState<'all' | ChallengeDifficulty>('all');
  const [mediaFilter, setMediaFilter] = useState<'all' | MediaType>('all');

  // Modals & UI
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);
  const [challengeModal, setChallengeModal] = useState<Challenge | null>(null);
  const [activeGame, setActiveGame] = useState<GameItem | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<ToastMessage | null>(null);
  const [clockStr, setClockStr] = useState(() =>
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  );
  const [nowDate, setNowDate] = useState(() => new Date());

  // Email/Password Auth form states
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signInError, setSignInError] = useState('');
  const [signUpUsername, setSignUpUsername] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpRecoveryCode, setSignUpRecoveryCode] = useState('');
  const [signUpError, setSignUpError] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const seededRef = useRef(false);
  const pendingUsernameRef = useRef<string | null>(null);
  const lastBroadcastIdRef = useRef<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMsg({ id: Date.now(), text, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3200);
  };

  // Boot connection check
  useEffect(() => {
    testConnection();
  }, []);

  // Live 1-second clock & schedule check
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNowDate(d);
      setClockStr(
        d.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Apply site theme CSS vars
  useEffect(() => {
    const t = THEME_SETS[siteTheme] || THEME_SETS.default;
    const root = document.documentElement;
    root.style.setProperty('--cyan', t.cyan);
    root.style.setProperty('--purple', t.purple);
    root.style.setProperty('--red', t.red);
    root.style.setProperty('--yellow', t.yellow);
    root.style.setProperty('--orange', t.orange);
    root.style.setProperty('--green', t.green);
  }, [siteTheme]);

  // Escape closes modals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightbox(null);
        setChallengeModal(null);
        setActiveGame(null);
        setProfileOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Auth listener + user profile bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setAuthUser(fbUser);
      if (!fbUser) {
        setCurrentUser(null);
        setAuthReady(true);
        return;
      }
      try {
        const pubRef = doc(db, 'users_public', fbUser.uid);
        const privRef = doc(db, 'users_private', fbUser.uid);
        const pubSnap = await getDoc(pubRef);
        const isHeadAdminEmail =
          (fbUser.email || '').toLowerCase() === HEAD_ADMIN_EMAIL.toLowerCase();

        if (!pubSnap.exists()) {
          const baseName =
            pendingUsernameRef.current ||
            fbUser.displayName ||
            (fbUser.email ? fbUser.email.split('@')[0] : 'Player');
          pendingUsernameRef.current = null;
          const username = clampStr(baseName, LIMITS.USERNAME_MAX) || 'Player';
          const role = isHeadAdminEmail ? 'head_admin' : 'member';
          const batch = writeBatch(db);
          batch.set(pubRef, {
            uid: fbUser.uid,
            username,
            avatarUrl: fbUser.photoURL ? clampStr(fbUser.photoURL, LIMITS.AVATAR_MAX) : '',
            role,
            bannedUntil: '',
            banReason: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          batch.set(privRef, {
            uid: fbUser.uid,
            email: clampStr(fbUser.email || 'user@example.com', LIMITS.EMAIL_MAX),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          await batch.commit();
        } else if (isHeadAdminEmail && pubSnap.data().role !== 'head_admin') {
          await setDoc(
            pubRef,
            {
              role: 'head_admin',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users_public/${fbUser.uid}`);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to current user profile
  useEffect(() => {
    if (!authReady || !authUser) return;
    const path = `users_public/${authUser.uid}`;
    const unsub = onSnapshot(
      doc(db, 'users_public', authUser.uid),
      (snap) => {
        if (snap.exists()) {
          setCurrentUser(snap.data() as UserPublic);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [authReady, authUser]);

  // Seed starter challenges & media once when Head Admin logs in and collections are empty
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'head_admin' || seededRef.current) return;
    seededRef.current = true;
    (async () => {
      try {
        const chSnap = await getDocs(collection(db, 'challenges'));
        if (chSnap.empty) {
          const batch = writeBatch(db);
          STARTER_CHALLENGES.forEach((c) => {
            batch.set(doc(db, 'challenges', c.id), {
              title: c.title,
              desc: c.desc,
              difficulty: c.difficulty,
              icon: c.icon,
              authorId: currentUser.uid,
              createdAt: serverTimestamp(),
            });
          });
          await batch.commit();
        }
        const mSnap = await getDocs(collection(db, 'media'));
        if (mSnap.empty) {
          const batch = writeBatch(db);
          STARTER_MEDIA.forEach((m) => {
            batch.set(doc(db, 'media', m.id), {
              url: m.url,
              caption: m.caption,
              type: m.type,
              authorId: currentUser.uid,
              createdAt: serverTimestamp(),
            });
          });
          await batch.commit();
        }
      } catch (err) {
        console.warn('Starter seed check:', err);
      }
    })();
  }, [currentUser]);

  // Attach shared Firestore listeners ONLY when authenticated and not banned
  useEffect(() => {
    if (!authReady || !authUser) {
      setJokes([]);
      setRiddles([]);
      setFacts([]);
      setChallenges([]);
      setMedia([]);
      setGames([]);
      setSchedules([]);
      setUsers([]);
      setAnnouncements([]);
      setBroadcasts([]);
      setAcceptedChallengeIds(new Set());
      return;
    }

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        query(collection(db, 'jokes'), orderBy('createdAt', 'desc')),
        (snap) => setJokes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Joke, 'id'>) }))),
        (err) => handleFirestoreError(err, OperationType.LIST, 'jokes')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'riddles'), orderBy('createdAt', 'desc')),
        (snap) =>
          setRiddles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Riddle, 'id'>) }))),
        (err) => handleFirestoreError(err, OperationType.LIST, 'riddles')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'facts'), orderBy('createdAt', 'desc')),
        (snap) => setFacts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Fact, 'id'>) }))),
        (err) => handleFirestoreError(err, OperationType.LIST, 'facts')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'challenges'), orderBy('createdAt', 'desc')),
        (snap) =>
          setChallenges(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Challenge, 'id'>) }))
          ),
        (err) => handleFirestoreError(err, OperationType.LIST, 'challenges')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'media'), orderBy('createdAt', 'desc')),
        (snap) =>
          setMedia(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MediaItem, 'id'>) }))),
        (err) => handleFirestoreError(err, OperationType.LIST, 'media')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'games'), orderBy('createdAt', 'desc')),
        (snap) =>
          setGames(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GameItem, 'id'>) }))),
        (err) => handleFirestoreError(err, OperationType.LIST, 'games')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'schedules'), orderBy('createdAt', 'desc')),
        (snap) =>
          setSchedules(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ScheduleBlock, 'id'>) }))
          ),
        (err) => handleFirestoreError(err, OperationType.LIST, 'schedules')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users_public'),
        (snap) => setUsers(snap.docs.map((d) => d.data() as UserPublic)),
        (err) => handleFirestoreError(err, OperationType.LIST, 'users_public')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users_public', authUser.uid, 'acceptedChallenges'),
        (snap) => setAcceptedChallengeIds(new Set(snap.docs.map((d) => d.id))),
        (err) =>
          handleFirestoreError(
            err,
            OperationType.LIST,
            `users_public/${authUser.uid}/acceptedChallenges`
          )
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'announcements'), orderBy('createdAt', 'desc')),
        (snap) =>
          setAnnouncements(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) }))
          ),
        (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc')),
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Broadcast, 'id'>),
          }));
          setBroadcasts(list);
          if (list.length > 0) {
            const latest = list[0];
            if (lastBroadcastIdRef.current !== null && lastBroadcastIdRef.current !== latest.id) {
              showToast(`📣 Broadcast: ${latest.text}`, 'info');
            }
            lastBroadcastIdRef.current = latest.id;
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'broadcasts')
      )
    );

    unsubs.push(
      onSnapshot(
        doc(db, 'siteConfig', 'settings'),
        (snap) => {
          if (snap.exists()) {
            const theme = snap.data().siteTheme as SiteTheme;
            if (theme) setSiteTheme(theme);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'siteConfig/settings')
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, authUser]);

  // Pending approvals listener for owners/head admin
  const isHeadAdminUser =
    (authUser?.email || '').toLowerCase() === HEAD_ADMIN_EMAIL.toLowerCase();
  const isOwner = isHeadAdminUser || currentUser?.role === 'owner';
  useEffect(() => {
    if (!authReady || !authUser || !isOwner) {
      setPendingItems([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'pendingItems'), orderBy('createdAt', 'desc')),
      (snap) => {
        setPendingItems(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PendingItem, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pendingItems')
    );
    return () => unsub();
  }, [authReady, authUser, isOwner]);

  const handleApprovePending = async (item: PendingItem) => {
    if (!currentUser || !isOwner) return;
    const newId = `${item.itemType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, item.itemType, newId), {
        ...item.payload,
        authorId: item.adderId,
        createdAt: serverTimestamp(),
      });
      batch.update(doc(db, 'pendingItems', item.id), {
        status: 'approved',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      showToast('✅ Approved and published to everyone!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `pendingItems/${item.id}`);
    }
  };

  const handleRejectPending = async (item: PendingItem) => {
    if (!currentUser || !isOwner) return;
    try {
      await setDoc(
        doc(db, 'pendingItems', item.id),
        {
          ...item,
          status: 'rejected',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      showToast('❌ Item rejected.', 'error');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `pendingItems/${item.id}`);
    }
  };

  // Handle ?approve= / ?reject= links from EmailJS emails
  useEffect(() => {
    if (!currentUser || !isOwner) return;
    const params = new URLSearchParams(window.location.search);
    const approveToken = params.get('approve');
    const rejectToken = params.get('reject');
    if (!approveToken && !rejectToken) return;
    window.history.replaceState({}, '', window.location.pathname);

    (async () => {
      const token = approveToken || rejectToken;
      if (!token) return;
      const snap = await getDoc(doc(db, 'pendingItems', token));
      if (!snap.exists()) {
        showToast('Pending item not found.', 'error');
        return;
      }
      const p = { id: snap.id, ...(snap.data() as Omit<PendingItem, 'id'>) };
      if (p.status !== 'pending') {
        showToast('Item already processed.', 'info');
        return;
      }
      if (approveToken) await handleApprovePending(p);
      else await handleRejectPending(p);
    })();
  }, [currentUser, isOwner]);

  const formatAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    switch (code) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Try signing in instead.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Incorrect email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is not enabled yet in Firebase Console.';
      default:
        return err instanceof Error ? err.message : 'Authentication failed.';
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError('');
    const email = signInEmail.trim();
    if (!email || !signInPassword) {
      setSignInError('Please enter your email and password.');
      return;
    }
    setAuthSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, signInPassword);
      setSignInPassword('');
      showToast('Signed in! Welcome to Ultimate Fun 🎉');
      setPage('home');
    } catch (err) {
      setSignInError(formatAuthError(err));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignUpError('');
    const email = signUpEmail.trim();
    const desiredName = clampStr(signUpUsername, LIMITS.USERNAME_MAX);
    const recoveryCode = signUpRecoveryCode.trim();
    if (!email || !signUpPassword) {
      setSignUpError('Please enter an email and password.');
      return;
    }
    if (signUpPassword.length < LIMITS.PASSWORD_MIN) {
      setSignUpError(`Password must be at least ${LIMITS.PASSWORD_MIN} characters.`);
      return;
    }
    if (recoveryCode.length < LIMITS.RECOVERY_CODE_MIN) {
      setSignUpError(
        `Recovery Code / PIN must be at least ${LIMITS.RECOVERY_CODE_MIN} characters (used to reset your password without email).`
      );
      return;
    }
    setAuthSubmitting(true);
    pendingUsernameRef.current = desiredName || email.split('@')[0] || 'Player';
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, signUpPassword);
      if (desiredName) {
        await updateProfile(cred.user, { displayName: desiredName });
      }
      let recoveryNote = '';
      try {
        const idToken = await cred.user.getIdToken();
        const res = await fetch('/api/auth/set-recovery-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ recoveryCode }),
        });
        if (!res.ok) {
          recoveryNote =
            ' (Note: Recovery Code saving awaits Firebase IAM setup — you can re-save it in Profile.)';
        }
      } catch {
        recoveryNote = ' (You can re-save your Recovery Code anytime in Profile.)';
      }
      setSignUpPassword('');
      setSignUpUsername('');
      setSignUpRecoveryCode('');
      showToast(`Account created! Welcome to Ultimate Fun 🎉${recoveryNote}`);
      setPage('home');
    } catch (err) {
      pendingUsernameRef.current = null;
      setSignUpError(formatAuthError(err));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleResetWithRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    const email = resetEmail.trim();
    const code = resetCode.trim();
    if (!email || !code || !resetNewPassword) {
      setResetError('Fill in your email, recovery code, and new password.');
      return;
    }
    if (code.length < LIMITS.RECOVERY_CODE_MIN) {
      setResetError(`Recovery code must be at least ${LIMITS.RECOVERY_CODE_MIN} characters.`);
      return;
    }
    if (resetNewPassword.length < LIMITS.PASSWORD_MIN) {
      setResetError(`New password must be at least ${LIMITS.PASSWORD_MIN} characters.`);
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setResetError('New passwords do not match.');
      return;
    }
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-with-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          recoveryCode: code,
          newPassword: resetNewPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setResetError(data.error || 'Could not reset password.');
        return;
      }
      await signInWithEmailAndPassword(auth, email, resetNewPassword);
      setResetCode('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      showToast('Password reset! You are now signed in 🔑');
      setPage('home');
    } catch (err) {
      setResetError(formatAuthError(err));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setPage('home');
    showToast('Signed out. See you soon!');
  };

  const requireAuthNav = (dest: PageId) => {
    if (!currentUser) {
      setPage('gate');
      return;
    }
    setPage(dest);
  };

  const checkRiddle = (r: Riddle) => {
    const guess = (riddleGuesses[r.id] || '').trim().toLowerCase();
    const answer = r.a.trim().toLowerCase();
    if (!guess) {
      setRiddleResults((prev) => ({
        ...prev,
        [r.id]: { correct: false, message: '❓ Type an answer first!' },
      }));
      return;
    }
    const isCorrect =
      guess === answer ||
      answer.includes(guess) ||
      guess.includes(answer) ||
      levenshtein(guess, answer) <= Math.floor(answer.length * 0.3);

    setRiddleResults((prev) => ({
      ...prev,
      [r.id]: isCorrect
        ? { correct: true, message: `✅ Correct! The answer is: ${r.a}` }
        : { correct: false, message: '❌ Not quite — try again!' },
    }));
  };

  const handleAcceptChallenge = async () => {
    if (!challengeModal || !currentUser) return;
    const chId = challengeModal.id;
    const path = `users_public/${currentUser.uid}/acceptedChallenges/${chId}`;
    try {
      await setDoc(doc(db, 'users_public', currentUser.uid, 'acceptedChallenges', chId), {
        uid: currentUser.uid,
        challengeId: chId,
        acceptedAt: serverTimestamp(),
      });
      setChallengeModal(null);
      showToast('Challenge accepted! You got this 💪');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const activeBlock = useMemo(() => getCurrentBlock(schedules, nowDate), [schedules, nowDate]);
  const latestAnnouncement = announcements[0] || null;
  const allGames = useMemo(() => [...BUILTIN_GAMES, ...games], [games]);
  const filteredChallenges = useMemo(
    () =>
      challengeFilter === 'all'
        ? challenges
        : challenges.filter((c) => c.difficulty === challengeFilter),
    [challenges, challengeFilter]
  );
  const filteredMedia = useMemo(
    () => (mediaFilter === 'all' ? media : media.filter((m) => m.type === mediaFilter)),
    [media, mediaFilter]
  );

  // Loading state
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex flex-col items-center justify-center gap-4">
        <div className="text-5xl">☁️</div>
        <div className="font-display text-3xl text-[#ffd60a] tracking-widest">
          Connecting to Database…
        </div>
        <div className="text-xs text-[#f0f4ff]/45">Syncing shared data across devices</div>
      </div>
    );
  }

  // Banned screen
  if (currentUser && isUserBanned(currentUser)) {
    const untilText =
      currentUser.bannedUntil === 'permanent'
        ? 'permanently'
        : `until ${new Date(Number(currentUser.bannedUntil)).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}`;
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white/5 border-2 border-[#e63946]/50 rounded-2xl p-8">
          <div className="text-5xl mb-3">🚫</div>
          <h1 className="font-display text-4xl text-[#e63946] tracking-wider mb-2">
            Account Banned
          </h1>
          <p className="text-sm text-[#f0f4ff]/75 mb-2">
            Your account is banned {untilText}.
          </p>
          {currentUser.banReason && (
            <p className="text-xs text-[#f0f4ff]/50 mb-6">Reason: {currentUser.banReason}</p>
          )}
          <button
            onClick={handleLogout}
            className="px-6 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-bold cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--navy)] text-[var(--white)]">
      {/* Class-Time Fullscreen Lockdown */}
      <LockdownOverlay activeBlock={activeBlock} isOwner={!!isOwner} clockStr={clockStr} />

      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed bottom-12 right-4 z-[999] max-w-[270px] px-4 py-2.5 rounded-xl font-extrabold text-xs shadow-xl transition ${
            toastMsg.type === 'error'
              ? 'bg-[var(--red)] text-white'
              : toastMsg.type === 'info'
                ? 'bg-[var(--purple)] text-white'
                : 'bg-[var(--green)] text-[#0a2010]'
          }`}
        >
          {toastMsg.text}
        </div>
      )}

      {/* Owner Quick Access FAB */}
      <button
        onClick={() => {
          if (!currentUser) {
            setPage('signin');
            showToast('Sign in as owner to access backend.', 'info');
            return;
          }
          if (!isOwner) {
            showToast('Owner access only!', 'error');
            return;
          }
          setPage('dashboard');
        }}
        title="Owner Dashboard"
        className="fixed bottom-3.5 right-3.5 z-[300] bg-white/5 hover:bg-[#7c3aed]/25 border border-white/10 hover:border-[#7c3aed]/50 text-[#f0f4ff]/40 hover:text-[#a78bfa] rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer transition"
      >
        ⚙
      </button>

      {/* Top Navigation */}
      <nav className="sticky top-0 z-[200] bg-gradient-to-br from-[#0d1f42] to-[#1a3a6b] border-b-[3px] border-[var(--cyan)] px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <div
          onClick={() => setPage('home')}
          className="font-display text-3xl text-[var(--yellow)] tracking-widest cursor-pointer drop-shadow-[3px_3px_0_var(--orange)]"
        >
          ULTIMATE<span className="text-[var(--cyan)]">FUN</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setPage('home')}
            className="px-3 py-1 rounded-full border-2 border-[var(--cyan)] text-xs font-bold hover:bg-[var(--cyan)] hover:text-[var(--navy)] transition cursor-pointer"
          >
            🏠 Home
          </button>

          {!currentUser ? (
            <>
              <button
                onClick={() => {
                  setSignInError('');
                  setPage('signin');
                }}
                className="px-3 py-1 rounded-full border-2 border-[var(--cyan)] text-xs font-bold hover:bg-[var(--cyan)] hover:text-[var(--navy)] transition cursor-pointer"
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setSignUpError('');
                  setPage('signup');
                }}
                className="px-3 py-1 rounded-full bg-[var(--orange)] border-2 border-[var(--orange)] text-white text-xs font-bold hover:brightness-110 transition cursor-pointer"
              >
                Join Free
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setPage('jokes')}
                className="px-3 py-1 rounded-full border-2 border-[var(--cyan)] text-xs font-bold hover:bg-[var(--cyan)] hover:text-[var(--navy)] transition cursor-pointer"
              >
                😂 Jokes
              </button>
              <button
                onClick={() => setPage('riddles')}
                className="px-3 py-1 rounded-full border-2 border-[var(--cyan)] text-xs font-bold hover:bg-[var(--cyan)] hover:text-[var(--navy)] transition cursor-pointer"
              >
                🧠 Riddles
              </button>
              <button
                onClick={() => setPage('facts')}
                className="px-3 py-1 rounded-full border-2 border-[var(--cyan)] text-xs font-bold hover:bg-[var(--cyan)] hover:text-[var(--navy)] transition cursor-pointer"
              >
                💡 Facts
              </button>
              <button
                onClick={() => setPage('challenges')}
                className="px-3 py-1 rounded-full bg-gradient-to-br from-[var(--red)] to-[var(--orange)] border-2 border-[var(--red)] text-white text-xs font-bold cursor-pointer"
              >
                🔥 Challenges
              </button>
              <button
                onClick={() => setPage('memes')}
                className="px-3 py-1 rounded-full bg-gradient-to-br from-[var(--green)] to-[var(--cyan)] border-2 border-[var(--green)] text-[var(--navy)] text-xs font-bold cursor-pointer"
              >
                🖼️ Memes
              </button>
              <button
                onClick={() => setPage('games')}
                className="px-3 py-1 rounded-full bg-gradient-to-br from-[var(--purple)] to-[var(--pink)] border-2 border-[var(--purple)] text-white text-xs font-bold cursor-pointer"
              >
                🎮 Games
              </button>
              {isOwner && (
                <button
                  onClick={() => setPage('dashboard')}
                  className="px-3 py-1 rounded-full border-2 border-[var(--yellow)] text-[var(--yellow)] text-xs font-bold hover:bg-[var(--yellow)] hover:text-[var(--navy)] transition cursor-pointer"
                >
                  ⚙️ Dashboard
                </button>
              )}
              <button
                onClick={handleLogout}
                className="px-3 py-1 rounded-full bg-[var(--orange)] border-2 border-[var(--orange)] text-white text-xs font-bold cursor-pointer"
              >
                Logout
              </button>
              <button
                onClick={() => setProfileOpen(true)}
                title="Edit Profile"
                className="w-8 h-8 rounded-full border-2 border-[#ffd60a]/40 bg-[#ffd60a]/15 text-[var(--yellow)] font-extrabold text-xs uppercase flex items-center justify-center overflow-hidden cursor-pointer"
              >
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  currentUser.username.slice(0, 2)
                )}
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Class Banner */}
      {activeBlock && (
        <div className="w-full bg-gradient-to-r from-[#e63946]/20 to-[#7c3aed]/15 border-b-2 border-[#e63946]/40 px-4 py-1.5 text-center text-xs font-extrabold text-[#ff8a8a]">
          🔒 <span className="text-[var(--yellow)]">📚 {activeBlock.label} — CLASS TIME</span> —
          site locked for students{' '}
          <span className="text-[#f0f4ff]/55 ml-2">· ends {formatEndLocal(activeBlock)}</span>
        </div>
      )}

      {/* Announcement Banner */}
      {latestAnnouncement && (
        <div className="w-full bg-gradient-to-r from-[#ffd60a]/15 to-[#00b4d8]/15 border-b border-[#ffd60a]/35 px-4 py-2 text-center text-xs font-bold text-[var(--yellow)]">
          📢 {latestAnnouncement.text}
          <span className="text-[#f0f4ff]/60 ml-2">by {latestAnnouncement.byName}</span>
        </div>
      )}

      {/* HOME PAGE */}
      {page === 'home' && (
        <div className="animate-fadeIn">
          <div className="relative min-h-[430px] flex flex-col items-center justify-center text-center px-5 py-12 bg-gradient-to-br from-[#0a1628] via-[#1a3a6b] to-[#0a2040] overflow-hidden">
            <span className="animate-float absolute top-[10%] left-[5%] text-3xl opacity-40 pointer-events-none">
              🎮
            </span>
            <span className="animate-float absolute top-[20%] right-[8%] text-3xl opacity-40 pointer-events-none">
              💥
            </span>
            <span className="animate-float absolute bottom-[20%] left-[10%] text-3xl opacity-40 pointer-events-none">
              🎯
            </span>
            <span className="animate-float absolute bottom-[15%] right-[5%] text-3xl opacity-40 pointer-events-none">
              🏆
            </span>
            <h1 className="font-display text-6xl sm:text-7xl leading-[0.95] text-[var(--yellow)] tracking-[3px] mb-3.5 drop-shadow-[4px_4px_0_var(--orange)]">
              ULTIMATE<span className="block text-[var(--cyan)]">FUN</span>
            </h1>
            <p className="text-base text-[#f0f4ff]/75 max-w-md mx-auto mb-7 font-semibold">
              {currentUser
                ? `Welcome back, ${currentUser.username}! Jump into the fun 👇`
                : 'Jokes · Riddles · Facts · Challenges · Memes · Games. Sign in to unlock everything!'}
            </p>
            <div className="flex flex-wrap gap-2.5 justify-center">
              {currentUser ? (
                <>
                  <button
                    onClick={() => requireAuthNav('jokes')}
                    className="px-6 py-3 rounded-full bg-gradient-to-br from-[var(--orange)] to-[#ffb347] text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 transition"
                  >
                    😂 Jokes
                  </button>
                  <button
                    onClick={() => requireAuthNav('challenges')}
                    className="px-6 py-3 rounded-full bg-gradient-to-br from-[var(--red)] to-[var(--orange)] text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 transition"
                  >
                    🔥 Challenges
                  </button>
                  <button
                    onClick={() => requireAuthNav('games')}
                    className="px-6 py-3 rounded-full bg-gradient-to-br from-[var(--purple)] to-[var(--pink)] text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 transition"
                  >
                    🎮 Games
                  </button>
                  <button
                    onClick={() => requireAuthNav('memes')}
                    className="px-6 py-3 rounded-full border-2 border-[var(--cyan)] text-[var(--cyan)] font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:bg-[var(--cyan)] hover:text-[var(--navy)] transition"
                  >
                    🖼️ Memes
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setSignUpError('');
                      setPage('signup');
                    }}
                    className="px-7 py-3.5 rounded-full bg-gradient-to-br from-[var(--orange)] to-[#ffb347] text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 transition"
                  >
                    🚀 Create Account
                  </button>
                  <button
                    onClick={() => {
                      setSignInError('');
                      setPage('signin');
                    }}
                    className="px-7 py-3.5 rounded-full border-2 border-[var(--cyan)] text-[var(--cyan)] font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:bg-[var(--cyan)] hover:text-[var(--navy)] transition"
                  >
                    Sign In
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="max-w-[960px] mx-auto px-5 py-7">
            <h2 className="font-display text-3xl text-[var(--cyan)] tracking-widest border-b-[3px] border-[var(--orange)] pb-2 mb-5">
              What&apos;s Inside?
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3.5">
              {[
                { dest: 'jokes' as PageId, icon: '😂', text: 'Hilarious jokes to keep you laughing all day.', tag: 'Jokes', cls: 'bg-[#ffd60a]/15 text-[var(--yellow)]' },
                { dest: 'riddles' as PageId, icon: '🧠', text: 'Mind-bending riddles to test your brain.', tag: 'Riddles', cls: 'bg-[#00b4d8]/15 text-[var(--cyan)]' },
                { dest: 'facts' as PageId, icon: '💡', text: 'Wild facts you will not believe are true.', tag: 'Facts', cls: 'bg-[#06d6a0]/15 text-[var(--green)]' },
                { dest: 'challenges' as PageId, icon: '🔥', text: 'Epic challenges to test your limits.', tag: 'Challenges', cls: 'bg-[#e63946]/15 text-[var(--red)]' },
                { dest: 'memes' as PageId, icon: '🖼️', text: 'Memes & GIFs to share with your squad.', tag: 'Memes & GIFs', cls: 'bg-[#f72585]/15 text-[var(--pink)]' },
                { dest: 'games' as PageId, icon: '🎮', text: 'Addictive mini-games ready to play.', tag: 'Games', cls: 'bg-[#7c3aed]/20 text-[#a78bfa]' },
              ].map((card) => (
                <div
                  key={card.dest}
                  onClick={() => requireAuthNav(card.dest)}
                  className="bg-[#1a3a6b]/60 border-2 border-[#00b4d8]/25 hover:border-[var(--cyan)] hover:-translate-y-1 rounded-2xl p-4 cursor-pointer transition"
                >
                  <div className="text-3xl mb-2">{card.icon}</div>
                  <div className="text-xs text-[#f0f4ff]/85 leading-relaxed">{card.text}</div>
                  <span
                    className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-2 uppercase ${card.cls}`}
                  >
                    {card.tag}
                  </span>
                </div>
              ))}
            </div>

            {!currentUser && (
              <div className="text-center mt-7 p-6 bg-[#00b4d8]/5 border-2 border-dashed border-[#00b4d8]/25 rounded-2xl">
                <div className="text-3xl mb-2">🔒</div>
                <p className="text-sm text-[#f0f4ff]/60 mb-4">
                  Sign up or sign in with your email and password to access all shared content across every computer
                </p>
                <div className="flex flex-wrap gap-2.5 justify-center">
                  <button
                    onClick={() => {
                      setSignUpError('');
                      setPage('signup');
                    }}
                    className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[var(--orange)] to-[#ffb347] text-white font-extrabold text-xs uppercase cursor-pointer"
                  >
                    Create Account 🚀
                  </button>
                  <button
                    onClick={() => {
                      setSignInError('');
                      setPage('signin');
                    }}
                    className="px-6 py-2.5 rounded-full border-2 border-[var(--cyan)] text-[var(--cyan)] font-extrabold text-xs uppercase cursor-pointer hover:bg-[var(--cyan)] hover:text-[var(--navy)] transition"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MEMBERS-ONLY GATE */}
      {page === 'gate' && (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white/5 border-2 border-[#00b4d8]/30 rounded-2xl p-8 text-center animate-fadeIn">
            <div className="text-5xl mb-3">🔒</div>
            <h2 className="font-display text-4xl text-[var(--yellow)] tracking-wider mb-2">
              Members Only!
            </h2>
            <p className="text-sm text-[#f0f4ff]/60 mb-6">
              Sign up or log in with your email and password to unlock Jokes, Riddles, Facts, Challenges, Memes, and Games — synced live across all computers.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setSignUpError('');
                  setPage('signup');
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--orange)] to-[#ffb347] text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:shadow-lg"
              >
                Create Account 🚀
              </button>
              <button
                onClick={() => {
                  setSignInError('');
                  setPage('signin');
                }}
                className="w-full py-3 rounded-xl border-2 border-[var(--cyan)] text-[var(--cyan)] font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:bg-[var(--cyan)] hover:text-[var(--navy)] transition"
              >
                Already a Member? Sign In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMAIL & PASSWORD SIGN IN */}
      {page === 'signin' && (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white/5 border-2 border-[#00b4d8]/30 rounded-2xl p-8 animate-fadeIn">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🚀</div>
              <h2 className="font-display text-4xl text-[var(--yellow)] tracking-wider">
                Welcome Back!
              </h2>
              <p className="text-xs text-[#f0f4ff]/55 mt-1">
                Sign in with your email and password
              </p>
            </div>

            {signInError && (
              <div className="mb-4 p-3 rounded-xl bg-[#e63946]/15 border border-[#e63946]/40 text-[#f8a5aa] text-xs font-semibold">
                {signInError}
              </div>
            )}

            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={LIMITS.EMAIL_MAX}
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(signInEmail.trim());
                      setResetError('');
                      setPage('reset');
                    }}
                    className="text-[11px] font-bold text-[var(--yellow)] hover:underline cursor-pointer"
                  >
                    Reset Password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--orange)] to-[#ffb347] text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:shadow-lg disabled:opacity-60"
              >
                {authSubmitting ? 'Signing In...' : 'Sign In 🎉'}
              </button>
            </form>

            <div className="text-center mt-5 text-xs text-[#f0f4ff]/55">
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setSignUpError('');
                  setPage('signup');
                }}
                className="text-[var(--cyan)] font-bold hover:underline cursor-pointer"
              >
                Sign Up Free →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMAIL & PASSWORD SIGN UP */}
      {page === 'signup' && (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white/5 border-2 border-[#00b4d8]/30 rounded-2xl p-8 animate-fadeIn">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">✨</div>
              <h2 className="font-display text-4xl text-[var(--yellow)] tracking-wider">
                Create Account
              </h2>
              <p className="text-xs text-[#f0f4ff]/55 mt-1">
                Sign up with email &amp; password — instant access, no confirmation email needed!
              </p>
            </div>

            {signUpError && (
              <div className="mb-4 p-3 rounded-xl bg-[#e63946]/15 border border-[#e63946]/40 text-[#f8a5aa] text-xs font-semibold">
                {signUpError}
              </div>
            )}

            <form onSubmit={handleEmailSignUp} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)] mb-1.5">
                  Username <span className="text-[#f0f4ff]/40 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  maxLength={LIMITS.USERNAME_MAX}
                  value={signUpUsername}
                  onChange={(e) => setSignUpUsername(e.target.value)}
                  placeholder="Pick a display name"
                  className="w-full bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)] mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={LIMITS.EMAIL_MAX}
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)] mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={LIMITS.PASSWORD_MIN}
                  maxLength={LIMITS.PASSWORD_MAX}
                  autoComplete="new-password"
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)] mb-1.5">
                  Secret Recovery Code / PIN
                </label>
                <input
                  type="text"
                  required
                  minLength={LIMITS.RECOVERY_CODE_MIN}
                  maxLength={LIMITS.RECOVERY_CODE_MAX}
                  value={signUpRecoveryCode}
                  onChange={(e) => setSignUpRecoveryCode(e.target.value)}
                  placeholder="4+ chars (used to reset password without email)"
                  className="w-full bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
                <p className="text-[11px] text-[#f0f4ff]/45 mt-1">
                  Remember this code! It lets you reset your password anytime with no email.
                </p>
              </div>

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--orange)] to-[#ffb347] text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:shadow-lg disabled:opacity-60"
              >
                {authSubmitting ? 'Creating Account...' : 'Sign Up & Enter 🚀'}
              </button>
            </form>

            <div className="text-center mt-5 text-xs text-[#f0f4ff]/55">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setSignInError('');
                  setPage('signin');
                }}
                className="text-[var(--cyan)] font-bold hover:underline cursor-pointer"
              >
                Sign In →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET PASSWORD WITHOUT EMAIL */}
      {page === 'reset' && (
        <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white/5 border-2 border-[#00b4d8]/30 rounded-2xl p-8 animate-fadeIn">
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">🔑</div>
              <h2 className="font-display text-4xl text-[var(--yellow)] tracking-wider">
                Reset Password
              </h2>
              <p className="text-xs text-[#f0f4ff]/55 mt-1">
                No email needed — enter your account email and your Secret Recovery Code
              </p>
            </div>

            {resetError && (
              <div className="mb-4 p-3 rounded-xl bg-[#e63946]/15 border border-[#e63946]/40 text-[#f8a5aa] text-xs font-semibold">
                {resetError}
              </div>
            )}

            <form onSubmit={handleResetWithRecovery} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)] mb-1.5">
                  Account Email
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={LIMITS.EMAIL_MAX}
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)] mb-1.5">
                  Secret Recovery Code / PIN
                </label>
                <input
                  type="text"
                  required
                  minLength={LIMITS.RECOVERY_CODE_MIN}
                  maxLength={LIMITS.RECOVERY_CODE_MAX}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="Enter the recovery code you set"
                  className="w-full bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)] mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={LIMITS.PASSWORD_MIN}
                  maxLength={LIMITS.PASSWORD_MAX}
                  autoComplete="new-password"
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)] mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={LIMITS.PASSWORD_MIN}
                  maxLength={LIMITS.PASSWORD_MAX}
                  autoComplete="new-password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  placeholder="Type new password again"
                  className="w-full bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--orange)] to-[#ffb347] text-white font-extrabold text-sm uppercase tracking-wider cursor-pointer hover:shadow-lg disabled:opacity-60"
              >
                {authSubmitting ? 'Resetting...' : 'Reset Password & Sign In 🔑'}
              </button>
            </form>

            <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] text-[#f0f4ff]/50 text-center">
              Forgot your Recovery Code too? Ask the Head Admin to reset your password in the Dashboard → Users tab.
            </div>

            <div className="text-center mt-4 text-xs text-[#f0f4ff]/55">
              <button
                type="button"
                onClick={() => {
                  setSignInError('');
                  setPage('signin');
                }}
                className="text-[var(--cyan)] font-bold hover:underline cursor-pointer"
              >
                ← Back to Sign In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JOKES PAGE */}
      {page === 'jokes' && currentUser && (
        <div className="max-w-[960px] mx-auto px-5 py-7 animate-fadeIn">
          <h2 className="font-display text-3xl text-[var(--cyan)] tracking-widest border-b-[3px] border-[var(--orange)] pb-2 mb-5">
            😂 Jokes
          </h2>
          {jokes.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.04] border-2 border-dashed border-[#00b4d8]/30 rounded-2xl text-[#f0f4ff]/50">
              <div className="text-5xl mb-3">😂</div>
              No jokes yet — check back soon!
            </div>
          ) : (
            <div className="space-y-3">
              {jokes.map((j) => (
                <div
                  key={j.id}
                  className="bg-[#1a3a6b]/60 border-2 border-[#00b4d8]/25 rounded-2xl p-4"
                >
                  <div className="font-bold text-[var(--yellow)] text-sm mb-1.5">{j.setup}</div>
                  <div className="text-[#f0f4ff]/80 text-sm">{j.punch}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RIDDLES PAGE */}
      {page === 'riddles' && currentUser && (
        <div className="max-w-[960px] mx-auto px-5 py-7 animate-fadeIn">
          <h2 className="font-display text-3xl text-[var(--cyan)] tracking-widest border-b-[3px] border-[var(--orange)] pb-2 mb-5">
            🧠 Riddles
          </h2>
          {riddles.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.04] border-2 border-dashed border-[#00b4d8]/30 rounded-2xl text-[#f0f4ff]/50">
              <div className="text-5xl mb-3">🧠</div>
              No riddles yet — check back soon!
            </div>
          ) : (
            <div className="space-y-3">
              {riddles.map((r) => {
                const res = riddleResults[r.id];
                return (
                  <div
                    key={r.id}
                    className="bg-[#00b4d8]/[0.06] border-2 border-[#00b4d8]/20 rounded-2xl p-5"
                  >
                    <div className="font-bold text-[var(--cyan)] text-base mb-3">🧠 {r.q}</div>
                    <div className="flex gap-2">
                      <input
                        value={riddleGuesses[r.id] || ''}
                        disabled={res?.correct}
                        onChange={(e) =>
                          setRiddleGuesses((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') checkRiddle(r);
                        }}
                        placeholder="Type your answer…"
                        className="flex-1 bg-white/[0.07] border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2 text-sm text-white outline-none disabled:opacity-60"
                      />
                      <button
                        disabled={res?.correct}
                        onClick={() => checkRiddle(r)}
                        className="px-4 py-2 rounded-xl bg-[var(--cyan)] text-[var(--navy)] font-extrabold text-xs cursor-pointer disabled:opacity-50"
                      >
                        Submit
                      </button>
                    </div>
                    {res && (
                      <div
                        className={`mt-2.5 text-xs font-bold ${
                          res.correct ? 'text-[var(--green)]' : 'text-[var(--red)]'
                        }`}
                      >
                        {res.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FACTS PAGE */}
      {page === 'facts' && currentUser && (
        <div className="max-w-[960px] mx-auto px-5 py-7 animate-fadeIn">
          <h2 className="font-display text-3xl text-[var(--cyan)] tracking-widest border-b-[3px] border-[var(--orange)] pb-2 mb-5">
            💡 Facts
          </h2>
          {facts.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.04] border-2 border-dashed border-[#00b4d8]/30 rounded-2xl text-[#f0f4ff]/50">
              <div className="text-5xl mb-3">💡</div>
              No facts yet — check back soon!
            </div>
          ) : (
            <div className="space-y-3">
              {facts.map((f) => (
                <div
                  key={f.id}
                  className="bg-[#1a3a6b]/60 border-2 border-[#00b4d8]/25 rounded-2xl p-4 text-sm text-[#f0f4ff]/85 leading-relaxed"
                >
                  💡 {f.txt}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CHALLENGES PAGE */}
      {page === 'challenges' && currentUser && (
        <div className="max-w-[960px] mx-auto px-5 py-7 animate-fadeIn">
          <h2 className="font-display text-3xl text-[var(--cyan)] tracking-widest border-b-[3px] border-[var(--orange)] pb-2 mb-3">
            🔥 Challenges
          </h2>
          <p className="text-xs text-[#f0f4ff]/55 mb-4">
            Pick a challenge. Accept it. Prove yourself. 💪
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              ['all', 'All'],
              ['easy', '🟢 Easy'],
              ['medium', '🟡 Medium'],
              ['hard', '🔴 Hard'],
              ['epic', '💜 Epic'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setChallengeFilter(val as 'all' | ChallengeDifficulty)}
                className={`px-4 py-1.5 rounded-full border-2 text-xs font-bold cursor-pointer transition ${
                  challengeFilter === val
                    ? 'bg-[var(--red)] border-[var(--red)] text-white'
                    : 'border-white/15 text-[#f0f4ff]/65'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredChallenges.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.04] border-2 border-dashed border-[#00b4d8]/30 rounded-2xl text-[#f0f4ff]/50">
              <div className="text-5xl mb-3">🔥</div>
              No challenges here yet!
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredChallenges.map((c) => {
                const accepted = acceptedChallengeIds.has(c.id);
                return (
                  <div
                    key={c.id}
                    className="bg-gradient-to-br from-[#e63946]/10 to-[#f77f00]/10 border-2 border-[#e63946]/30 rounded-2xl p-5"
                  >
                    <span className="inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-white/10 mb-2">
                      {c.difficulty}
                    </span>
                    <div className="font-display text-2xl text-[var(--yellow)] mb-2">
                      {c.icon} {c.title}
                    </div>
                    <div className="text-xs text-[#f0f4ff]/80 leading-relaxed mb-4">{c.desc}</div>
                    {accepted ? (
                      <span className="inline-block px-4 py-1.5 rounded-full border-2 border-[var(--green)] bg-[#06d6a0]/10 text-[var(--green)] text-xs font-extrabold uppercase">
                        ✅ Challenge Accepted!
                      </span>
                    ) : (
                      <button
                        onClick={() => setChallengeModal(c)}
                        className="px-4 py-2 rounded-full bg-gradient-to-r from-[var(--red)] to-[var(--orange)] text-white text-xs font-extrabold uppercase cursor-pointer"
                      >
                        🔥 Accept Challenge
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MEMES & GIFS PAGE */}
      {page === 'memes' && currentUser && (
        <div className="max-w-[960px] mx-auto px-5 py-7 animate-fadeIn">
          <h2 className="font-display text-3xl text-[var(--cyan)] tracking-widest border-b-[3px] border-[var(--orange)] pb-2 mb-4">
            🖼️ Memes &amp; GIFs
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              ['all', 'All'],
              ['meme', '🖼️ Memes'],
              ['gif', '🎞️ GIFs'],
              ['piskel', '🎨 Pixel Art'],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setMediaFilter(val as 'all' | MediaType)}
                className={`px-4 py-1.5 rounded-full border-2 text-xs font-bold cursor-pointer transition ${
                  mediaFilter === val
                    ? 'bg-[var(--pink)] border-[var(--pink)] text-white'
                    : 'border-[#f72585]/30 text-[#f0f4ff]/65'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {filteredMedia.length === 0 ? (
            <div className="text-center py-12 bg-white/[0.04] border-2 border-dashed border-[#00b4d8]/30 rounded-2xl text-[#f0f4ff]/50">
              <div className="text-5xl mb-3">🖼️</div>
              No media yet — check back soon!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredMedia.map((m) => (
                <div
                  key={m.id}
                  onClick={() => setLightbox({ url: m.url, caption: m.caption })}
                  className="bg-[#1a3a6b]/50 border-2 border-[#f72585]/25 hover:border-[var(--pink)] rounded-2xl overflow-hidden cursor-pointer transition"
                >
                  <div className="h-[190px] bg-black/30 flex items-center justify-center overflow-hidden">
                    <img
                      src={m.url}
                      alt={m.caption}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-3 text-sm font-bold text-[#f0f4ff]/90">{m.caption}</div>
                  <span className="inline-block mx-3 mb-3 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#f72585]/20 text-[var(--pink)]">
                    {m.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GAMES PAGE */}
      {page === 'games' && currentUser && (
        <div className="max-w-[960px] mx-auto px-5 py-7 animate-fadeIn">
          <h2 className="font-display text-3xl text-[var(--cyan)] tracking-widest border-b-[3px] border-[var(--orange)] pb-2 mb-3">
            🎮 Games
          </h2>
          <p className="text-xs text-[#f0f4ff]/55 mb-5">
            Built-in games + games added by the owner. Click Play to launch! 🕹️
          </p>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
            {allGames.map((g) => (
              <div
                key={g.id}
                className="bg-gradient-to-br from-[#7c3aed]/15 to-[#f72585]/10 border-2 border-[#7c3aed]/35 hover:border-[var(--purple)] rounded-2xl p-5 transition"
              >
                <div className="text-4xl mb-2.5">{g.icon}</div>
                <div className="font-display text-2xl text-[var(--yellow)] mb-1">{g.name}</div>
                <div className="text-xs text-[#f0f4ff]/75 mb-4">{g.desc || 'A fun game!'}</div>
                <button
                  onClick={() => setActiveGame(g)}
                  className="px-5 py-2 rounded-full bg-gradient-to-r from-[var(--purple)] to-[var(--pink)] text-white text-xs font-extrabold uppercase cursor-pointer"
                >
                  ▶ Play Now
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OWNER DASHBOARD */}
      {page === 'dashboard' && currentUser && isOwner && (
        <OwnerDashboard
          currentUser={currentUser}
          jokes={jokes}
          riddles={riddles}
          facts={facts}
          challenges={challenges}
          media={media}
          games={games}
          schedules={schedules}
          users={users}
          pendingItems={pendingItems}
          announcements={announcements}
          broadcasts={broadcasts}
          siteTheme={siteTheme}
          activeBlock={activeBlock}
          clockStr={clockStr}
          onPlayGame={setActiveGame}
          onApprovePending={handleApprovePending}
          onRejectPending={handleRejectPending}
          onToast={showToast}
        />
      )}

      {/* LIGHTBOX */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[500] bg-black/90 flex items-center justify-center p-5"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-[90vw] max-h-[90vh] text-center"
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute -top-9 right-0 w-7 h-7 rounded-full bg-[var(--red)] text-white text-xs font-black cursor-pointer"
            >
              ✕
            </button>
            <img
              src={lightbox.url}
              alt={lightbox.caption}
              className="max-w-full max-h-[82vh] rounded-xl border-2 border-[var(--pink)]"
            />
            <div className="text-sm font-bold text-[#f0f4ff]/75 mt-2.5">{lightbox.caption}</div>
          </div>
        </div>
      )}

      {/* CHALLENGE MODAL */}
      {challengeModal && (
        <div className="fixed inset-0 z-[500] bg-black/85 flex items-center justify-center p-5">
          <div className="w-full max-w-md bg-gradient-to-br from-[#0d1f42] to-[#1a0a28] border-[3px] border-[var(--red)] rounded-2xl p-7 text-center animate-bounceIn">
            <div className="text-5xl mb-2">{challengeModal.icon}</div>
            <div className="font-display text-3xl text-[var(--yellow)] mb-2">
              {challengeModal.title}
            </div>
            <div className="text-sm text-[#f0f4ff]/85 mb-5">{challengeModal.desc}</div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleAcceptChallenge}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[var(--red)] to-[var(--orange)] text-white font-extrabold text-xs uppercase cursor-pointer"
              >
                ✅ Accept!
              </button>
              <button
                onClick={() => setChallengeModal(null)}
                className="px-6 py-2.5 rounded-full border-2 border-white/25 text-[#f0f4ff]/65 font-bold text-xs cursor-pointer"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GAME MODAL */}
      {activeGame && (
        <div className="fixed inset-0 z-[500] bg-black/90 flex items-center justify-center p-4">
          <div className="w-full max-w-[740px] max-h-[92vh] bg-[var(--navy)] border-[3px] border-[var(--purple)] rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-[#7c3aed]/25 border-b border-[#7c3aed]/30 flex items-center justify-between">
              <div className="font-display text-2xl text-[var(--yellow)]">
                {activeGame.icon} {activeGame.name}
              </div>
              <button
                onClick={() => setActiveGame(null)}
                className="w-7 h-7 rounded-full bg-[var(--red)] text-white text-xs font-black cursor-pointer"
              >
                ✕
              </button>
            </div>
            <iframe
              title={activeGame.name}
              srcDoc={activeGame.code}
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-[520px] border-none bg-[#111]"
            />
          </div>
        </div>
      )}

      {/* PROFILE MODAL */}
      {currentUser && authUser && (
        <ProfileModal
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          user={currentUser}
          email={authUser.email || ''}
          onToast={showToast}
        />
      )}

      {/* FLOATING CHAT & FEEDBACK WIDGET */}
      <ChatWidget
        user={currentUser}
        onToast={showToast}
        onRequireSignIn={() => setPage('signin')}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <UltimateFunApp />
    </ErrorBoundary>
  );
}
