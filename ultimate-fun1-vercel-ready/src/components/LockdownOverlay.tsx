import React from 'react';
import type { ScheduleBlock } from '../types';
import { formatEndLocal } from '../utils/schedule';

interface LockdownOverlayProps {
  activeBlock: ScheduleBlock | null;
  isOwner: boolean;
  clockStr: string;
}

export const LockdownOverlay: React.FC<LockdownOverlayProps> = ({
  activeBlock,
  isOwner,
  clockStr,
}) => {
  if (!activeBlock || isOwner) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center text-center p-8 bg-[radial-gradient(ellipse_at_center,#0a0010_0%,#000_100%)]">
      <div className="text-[110px] animate-lockPulse mb-2 select-none">🔒</div>
      <div className="font-display text-5xl sm:text-7xl text-[#e63946] tracking-[4px] leading-none mb-3 drop-shadow-[0_0_30px_rgba(230,57,70,0.7)]">
        CLASS TIME
      </div>
      <div className="font-display text-2xl sm:text-4xl text-[#f0f4ff]/50 tracking-[3px] mb-8">
        Go to class
      </div>
      <div className="font-mono text-3xl sm:text-5xl text-[#ffd60a] font-bold bg-black/50 border-2 border-[#e63946]/30 rounded-2xl px-8 py-4 mb-7 tracking-[4px] animate-clockTick">
        {clockStr}
      </div>
      <div className="text-sm text-[#f0f4ff]/40 font-semibold tracking-wide">
        Class ends at:{' '}
        <span className="text-[#00b4d8]">
          {formatEndLocal(activeBlock)} · {activeBlock.label}
        </span>
      </div>
    </div>
  );
};
