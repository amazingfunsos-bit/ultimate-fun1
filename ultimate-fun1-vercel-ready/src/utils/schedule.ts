import emailjs from '@emailjs/browser';
import type { PendingContentType, ScheduleBlock, UserPublic } from '../types';

export const EMAILJS_SERVICE_ID = 'service_xzquxm8';
export const EMAILJS_TEMPLATE_ID = 'template_ulezzgn';
export const EMAILJS_PUBLIC_KEY = 'iI4Qo7umIXMFoW-Xt';
export const APPROVAL_EMAIL = 'rabbi@chabadguatemala.com';

emailjs.init(EMAILJS_PUBLIC_KEY);

export function getTimeInTz(date: Date, tz: string): { hhmm: string; dow: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    let h = get('hour');
    if (h === '24') h = '00';
    const m = get('minute');
    const hhmm = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = dowMap[get('weekday')] ?? date.getDay();
    return { hhmm, dow };
  } catch {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return { hhmm: `${h}:${m}`, dow: date.getDay() };
  }
}

export function isInBlock(block: ScheduleBlock, now: Date): boolean {
  const { hhmm, dow } = getTimeInTz(now, block.tz || 'Etc/UTC');
  if (!block.days.includes(dow)) return false;
  return hhmm >= block.start && hhmm < block.end;
}

export function getCurrentBlock(schedules: ScheduleBlock[], now: Date): ScheduleBlock | null {
  return schedules.find((s) => isInBlock(s, now)) || null;
}

export function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function formatEndLocal(block: ScheduleBlock): string {
  try {
    const tzDate = new Date().toLocaleDateString('en-CA', { timeZone: block.tz });
    const endDate = new Date(`${tzDate}T${block.end}:00`);
    return endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    return fmt12(block.end);
  }
}

export function formatTzOption(tz: string): string {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
      hour: 'numeric',
    }).formatToParts(now);
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value || '';
    const short =
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'short',
        hour: 'numeric',
      })
        .formatToParts(now)
        .find((p) => p.type === 'timeZoneName')?.value || '';
    const label = tz.replace(/_/g, ' ');
    return `${label} (${offset}${short && short !== offset ? `, ${short}` : ''})`;
  } catch {
    return tz;
  }
}

export function isUserBanned(user: UserPublic | null): boolean {
  if (!user || !user.bannedUntil) return false;
  if (user.bannedUntil === 'permanent') return true;
  const ts = Number(user.bannedUntil);
  return Number.isFinite(ts) && Date.now() < ts;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export async function fileToBoundedDataUrl(file: File, maxStringLen: number): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

  if (rawDataUrl.length <= maxStringLen) {
    return rawDataUrl;
  }

  // GIFs cannot be re-encoded through canvas without losing animation
  if (file.type === 'image/gif') {
    throw new Error('GIF is too large for database storage (keep under ~600KB or paste a GIF URL).');
  }

  // Compress PNG/JPEG/WEBP down so it fits comfortably inside Firestore's 1MB doc cap
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to decode image.'));
    image.src = rawDataUrl;
  });

  let scale = 0.85;
  let quality = 0.82;
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(64, Math.round(img.width * scale));
    canvas.height = Math.max(64, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const compressed = canvas.toDataURL('image/jpeg', quality);
    if (compressed.length <= maxStringLen) {
      return compressed;
    }
    scale *= 0.75;
    quality = Math.max(0.45, quality - 0.1);
  }
  throw new Error('Image is still too large after compression.');
}

export const ITEM_TYPE_META: Record<PendingContentType, { icon: string; label: string }> = {
  jokes: { icon: '😂', label: 'Joke' },
  riddles: { icon: '🧠', label: 'Riddle' },
  facts: { icon: '💡', label: 'Fact' },
  challenges: { icon: '🔥', label: 'Challenge' },
  media: { icon: '🖼️', label: 'Meme/GIF' },
  games: { icon: '🎮', label: 'Game' },
};

export function buildItemSummary(type: PendingContentType, item: Record<string, unknown>): string {
  if (type === 'jokes') return `Setup: "${item.setup}"\nPunchline: "${item.punch}"`;
  if (type === 'riddles') return `Question: "${item.q}"\nAnswer: "${item.a}"`;
  if (type === 'facts') return `Fact: "${item.txt}"`;
  if (type === 'challenges') return `Title: "${item.title}"\nDifficulty: ${item.difficulty}\nDescription: "${item.desc}"`;
  if (type === 'media') return `Caption: "${item.caption}"\nType: ${item.type}`;
  if (type === 'games') return `Name: "${item.name}"\nDescription: "${item.desc || ''}"`;
  return JSON.stringify(item);
}

export async function sendApprovalEmail(
  type: PendingContentType,
  item: Record<string, unknown>,
  adder: string,
  token: string
): Promise<boolean> {
  const meta = ITEM_TYPE_META[type];
  const siteUrl = window.location.href.split('?')[0];
  try {
    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: APPROVAL_EMAIL,
      item_type: meta.label,
      item_icon: meta.icon,
      item_summary: buildItemSummary(type, item),
      added_by: adder,
      approve_url: `${siteUrl}?approve=${token}`,
      reject_url: `${siteUrl}?reject=${token}`,
      token,
    });
    return true;
  } catch (err) {
    console.warn('EmailJS notification failed:', err);
    return false;
  }
}
