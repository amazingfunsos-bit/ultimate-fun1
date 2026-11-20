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
import { db, handleFirestoreError, OperationType } from '../firebase';
import { clampStr, LIMITS } from '../constants/validation';
import type { ChatMessage, UserPublic } from '../types';

interface ChatWidgetProps {
  user: UserPublic | null;
  onToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  onRequireSignIn: () => void;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({
  user,
  onToast,
  onRequireSignIn,
}) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'feedback'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const isOwner = user?.role === 'owner' || user?.role === 'head_admin';

  useEffect(() => {
    if (!user || isOwner) {
      setMessages([]);
      return;
    }
    const path = `chatThreads/${user.uid}/messages`;
    const q = query(collection(db, 'chatThreads', user.uid, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ChatMessage[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ChatMessage, 'id'>),
        }));
        setMessages(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [user, isOwner]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  if (isOwner) return null;

  const handleToggle = () => {
    if (!user) {
      onRequireSignIn();
      return;
    }
    setOpen((prev) => !prev);
  };

  const handleSendChat = async () => {
    if (!user) return;
    const text = clampStr(input, LIMITS.CHAT_TEXT_MAX);
    if (!text) return;

    setSending(true);
    setInput('');
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const threadPath = `chatThreads/${user.uid}`;
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'chatThreads', user.uid),
        {
          userId: user.uid,
          username: clampStr(user.username, LIMITS.USERNAME_MAX),
          lastMessage: clampStr(text, LIMITS.CHAT_LAST_MSG_MAX),
          unreadForOwner: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      batch.set(doc(db, 'chatThreads', user.uid, 'messages', msgId), {
        from: 'user',
        senderUid: user.uid,
        senderName: clampStr(`👤 ${user.username}`, LIMITS.CHAT_SENDER_NAME_MAX),
        text,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, threadPath);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMsg = async (msgId: string) => {
    if (!user) return;
    const path = `chatThreads/${user.uid}/messages/${msgId}`;
    try {
      await deleteDoc(doc(db, 'chatThreads', user.uid, 'messages', msgId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!user) return;
    if (rating < 1 || rating > 5) {
      onToast('Pick a star rating first!', 'error');
      return;
    }
    const text = clampStr(feedbackText, LIMITS.FEEDBACK_TEXT_MAX);
    const fbId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const path = `feedback/${fbId}`;
    setSending(true);
    try {
      await setDoc(doc(db, 'feedback', fbId), {
        uid: user.uid,
        name: clampStr(user.username, LIMITS.USERNAME_MAX),
        rating,
        text,
        createdAt: serverTimestamp(),
      });
      onToast(`${'⭐'.repeat(rating)} Thanks for your feedback!`, 'success');
      setFeedbackText('');
      setRating(0);
      setOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={handleToggle}
        title="Chat with owner / Leave feedback"
        className="fixed bottom-14 right-3.5 z-[301] w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--purple)] flex items-center justify-center text-2xl shadow-[0_4px_18px_rgba(0,180,216,0.35)] hover:scale-110 transition cursor-pointer"
      >
        💬
      </button>

      {open && user && (
        <div className="fixed bottom-[120px] right-3.5 z-[400] w-[330px] max-w-[calc(100vw-28px)] bg-[var(--navy)] border-2 border-[var(--cyan)] rounded-[18px] shadow-[0_12px_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-[#00b4d8]/20 to-[#7c3aed]/15 px-4 py-3 flex items-center justify-between border-b border-[#00b4d8]/20">
            <div className="font-display text-xl text-[var(--yellow)] tracking-wider">
              💬 Private Chat &amp; Feedback
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-full bg-[var(--red)] text-white text-xs font-black flex items-center justify-center cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="flex border-b border-[#00b4d8]/15">
            <button
              onClick={() => setTab('chat')}
              className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition ${
                tab === 'chat'
                  ? 'text-[var(--cyan)] border-b-2 border-[var(--cyan)] bg-[#00b4d8]/10'
                  : 'text-[#f0f4ff]/50'
              }`}
            >
              💬 Chat
            </button>
            <button
              onClick={() => setTab('feedback')}
              className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider cursor-pointer transition ${
                tab === 'feedback'
                  ? 'text-[var(--cyan)] border-b-2 border-[var(--cyan)] bg-[#00b4d8]/10'
                  : 'text-[#f0f4ff]/50'
              }`}
            >
              ⭐ Feedback
            </button>
          </div>

          {tab === 'chat' ? (
            <div>
              <div ref={listRef} className="h-[220px] overflow-y-auto p-3 flex flex-col gap-2">
                {messages.length === 0 ? (
                  <div className="self-start max-w-[88%] px-3 py-2 rounded-xl text-xs bg-[#00b4d8]/12 border border-[#00b4d8]/20 text-[var(--cyan)]">
                    <div className="text-[10px] font-extrabold uppercase opacity-70 mb-0.5">
                      👑 Owner
                    </div>
                    Hey! Feel free to ask us anything or leave feedback 😊
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.from === 'user';
                    return (
                      <div
                        key={m.id}
                        className={`group relative max-w-[88%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                          isMe
                            ? 'self-end bg-[#f77f00]/15 border border-[#f77f00]/25 text-[#ffb347]'
                            : 'self-start bg-[#00b4d8]/12 border border-[#00b4d8]/20 text-[var(--cyan)]'
                        }`}
                      >
                        {isMe && (
                          <button
                            onClick={() => handleDeleteMsg(m.id)}
                            title="Delete"
                            className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 w-4 h-4 rounded-full bg-[#e63946]/80 text-white text-[9px] font-black flex items-center justify-center cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                        <div className="text-[10px] font-extrabold uppercase opacity-70 mb-0.5">
                          {m.senderName}
                        </div>
                        {m.text}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2 p-2.5 border-t border-[#00b4d8]/15">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendChat();
                  }}
                  maxLength={LIMITS.CHAT_TEXT_MAX}
                  placeholder="Type a message…"
                  className="flex-1 bg-white/5 border-2 border-[#00b4d8]/20 focus:border-[var(--cyan)] rounded-xl px-2.5 py-1.5 text-xs text-white outline-none"
                />
                <button
                  onClick={handleSendChat}
                  disabled={sending}
                  className="bg-[var(--cyan)] text-[var(--navy)] rounded-lg px-3 py-1.5 text-xs font-extrabold cursor-pointer disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3.5">
              <p className="text-xs text-[#f0f4ff]/55 mb-3">
                Share your thoughts about the site with the owners!
              </p>
              <div className="flex gap-2 justify-center text-2xl mb-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className={`cursor-pointer transition ${
                      n <= rating ? 'opacity-100 scale-110' : 'opacity-30'
                    }`}
                  >
                    ⭐
                  </button>
                ))}
              </div>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                maxLength={LIMITS.FEEDBACK_TEXT_MAX}
                placeholder="Tell us what you think…"
                className="w-full h-20 bg-white/5 border-2 border-[#00b4d8]/20 focus:border-[var(--cyan)] rounded-xl p-2.5 text-xs text-white outline-none resize-none mb-2"
              />
              <button
                onClick={handleSubmitFeedback}
                disabled={sending}
                className="w-full bg-[var(--cyan)] text-[var(--navy)] rounded-lg py-2 text-xs font-extrabold cursor-pointer disabled:opacity-60"
              >
                ⭐ Send Feedback
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};
