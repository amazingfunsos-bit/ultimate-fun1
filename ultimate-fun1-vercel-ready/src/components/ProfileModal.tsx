import React, { useEffect, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { clampStr, LIMITS } from '../constants/validation';
import type { UserPublic } from '../types';
import { fileToBoundedDataUrl } from '../utils/schedule';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  user: UserPublic;
  email: string;
  onToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  open,
  onClose,
  user,
  email,
  onToast,
}) => {
  const [username, setUsername] = useState(user.username);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [hasRecoveryCode, setHasRecoveryCode] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingRecovery, setSavingRecovery] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open || !auth.currentUser) return;
    setUsername(user.username);
    setAvatarUrl(user.avatarUrl || '');
    setErrorMsg('');
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const res = await fetch('/api/auth/has-recovery-code', {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { hasRecoveryCode?: boolean };
          setHasRecoveryCode(Boolean(data.hasRecoveryCode));
        } else {
          setHasRecoveryCode(null);
        }
      } catch {
        setHasRecoveryCode(null);
      }
    })();
  }, [open, user.username, user.avatarUrl]);

  if (!open) return null;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bounded = await fileToBoundedDataUrl(file, LIMITS.AVATAR_MAX);
      setAvatarUrl(bounded);
      onToast('Photo ready — click Save Profile to apply!', 'info');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Invalid image file.', 'error');
    }
  };

  const handleSaveProfile = async () => {
    setErrorMsg('');
    const nextName = clampStr(username, LIMITS.USERNAME_MAX);
    if (!nextName) {
      setErrorMsg('Username cannot be empty.');
      return;
    }
    setSaving(true);
    const path = `users_public/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users_public', user.uid), {
        username: nextName,
        avatarUrl: avatarUrl.slice(0, LIMITS.AVATAR_MAX),
        updatedAt: serverTimestamp(),
      });
      onToast('Profile saved to database! ✅');
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    setErrorMsg('');
    if (!auth.currentUser) return;
    if (newPassword.length < LIMITS.PASSWORD_MIN) {
      setErrorMsg(`New password must be at least ${LIMITS.PASSWORD_MIN} characters.`);
      return;
    }
    setSavingPassword(true);
    try {
      if (currentPassword) {
        const cred = EmailAuthProvider.credential(email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, cred);
      }
      await updatePassword(auth.currentUser, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      onToast('Password updated! 🔑');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/requires-recent-login') {
        setErrorMsg('Enter your Current Password above to confirm this password reset.');
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErrorMsg('Current password is incorrect.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Could not reset password.');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveRecoveryCode = async () => {
    setErrorMsg('');
    const code = recoveryCode.trim();
    if (code.length < LIMITS.RECOVERY_CODE_MIN) {
      setErrorMsg(`Recovery code must be at least ${LIMITS.RECOVERY_CODE_MIN} characters.`);
      return;
    }
    if (!auth.currentUser) return;
    setSavingRecovery(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/auth/set-recovery-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ recoveryCode: code }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not save recovery code.');
        return;
      }
      setRecoveryCode('');
      setHasRecoveryCode(true);
      onToast('Recovery code saved! You can use it to reset your password without email 🔐');
    } catch {
      setErrorMsg('Network error saving recovery code.');
    } finally {
      setSavingRecovery(false);
    }
  };

  const roleText =
    user.role === 'head_admin'
      ? '⭐ Head Admin'
      : user.role === 'owner'
        ? '👑 Owner'
        : '👤 Member';

  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center bg-black/75 p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[440px] max-h-[90vh] overflow-y-auto rounded-[20px] border-[3px] border-[var(--cyan)] bg-gradient-to-br from-[#0d1f42] to-[#1a0a28] p-7 animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full bg-[var(--red)] text-white text-xs font-black flex items-center justify-center cursor-pointer"
        >
          ✕
        </button>
        <div className="font-display text-3xl text-[var(--yellow)] tracking-widest mb-1">
          My Profile
        </div>
        <div className="text-xs text-[#f0f4ff]/45 mb-5">
          Edit your profile, password, or recovery code (no email required)
        </div>

        <div className="flex items-center gap-4 mb-5">
          <div>
            <div
              onClick={() => fileRef.current?.click()}
              className="w-[70px] h-[70px] rounded-full border-[3px] border-[var(--cyan)] bg-gradient-to-br from-[#00b4d8]/30 to-[#7c3aed]/30 flex items-center justify-center text-2xl font-extrabold text-white uppercase overflow-hidden cursor-pointer"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                user.username.slice(0, 2)
              )}
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-[11px] text-[#f0f4ff]/50 hover:text-[var(--cyan)] mt-1.5 block cursor-pointer"
            >
              📷 Change photo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold text-white truncate">{user.username}</div>
            <div className="text-xs text-[#f0f4ff]/45 truncate mt-0.5">{email}</div>
            <div className="text-[11px] text-[var(--cyan)] font-bold mt-1">{roleText}</div>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 rounded-lg bg-[#e63946]/15 border border-[#e63946]/40 text-[#f8a5aa] text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <div className="mb-5">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-[var(--cyan)] mb-1.5">
            Username
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={LIMITS.USERNAME_MAX}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a display name"
              className="flex-1 bg-white/5 border-2 border-[#00b4d8]/25 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2 text-sm text-white outline-none"
            />
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-[var(--orange)] to-[#ffb347] px-4 py-2 text-white font-extrabold text-xs uppercase cursor-pointer disabled:opacity-60"
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>
        </div>

        <div className="border-t border-white/10 pt-4 mb-5 space-y-2.5">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--yellow)]">
            🔑 Reset Password (No Email)
          </div>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password (if asked)"
            className="w-full bg-white/5 border-2 border-[#00b4d8]/20 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2 text-sm text-white outline-none"
          />
          <input
            type="password"
            minLength={LIMITS.PASSWORD_MIN}
            maxLength={LIMITS.PASSWORD_MAX}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (6+ characters)"
            className="w-full bg-white/5 border-2 border-[#00b4d8]/20 focus:border-[var(--cyan)] rounded-xl px-3.5 py-2 text-sm text-white outline-none"
          />
          <button
            type="button"
            onClick={handleResetPassword}
            disabled={savingPassword}
            className="w-full rounded-xl border-2 border-[var(--cyan)] text-[var(--cyan)] hover:bg-[var(--cyan)] hover:text-[var(--navy)] py-2 font-extrabold text-xs uppercase tracking-wider cursor-pointer transition disabled:opacity-60"
          >
            {savingPassword ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>

        <div className="border-t border-white/10 pt-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--green)]">
              🛡️ Secret Recovery Code
            </span>
            {hasRecoveryCode !== null && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  hasRecoveryCode
                    ? 'bg-[#06d6a0]/15 text-[var(--green)]'
                    : 'bg-[#ffd60a]/15 text-[var(--yellow)]'
                }`}
              >
                {hasRecoveryCode ? 'Set' : 'Not Set'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-[#f0f4ff]/45">
            Lets you reset a forgotten password from the Sign-In screen without any email.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              minLength={LIMITS.RECOVERY_CODE_MIN}
              maxLength={LIMITS.RECOVERY_CODE_MAX}
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder={hasRecoveryCode ? 'Enter new recovery code' : 'Set a 4+ char code'}
              className="flex-1 bg-white/5 border-2 border-[#06d6a0]/25 focus:border-[var(--green)] rounded-xl px-3.5 py-2 text-sm text-white outline-none"
            />
            <button
              type="button"
              onClick={handleSaveRecoveryCode}
              disabled={savingRecovery}
              className="rounded-xl bg-[var(--green)] text-[#0a2010] px-4 py-2 font-extrabold text-xs uppercase cursor-pointer disabled:opacity-60"
            >
              {savingRecovery ? '...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
