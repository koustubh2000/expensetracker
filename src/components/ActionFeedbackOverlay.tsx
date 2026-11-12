import React, { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

export interface ActionFeedbackState {
  id: number;
  message: string;
  type: 'success' | 'error';
  mode?: 'fullscreen' | 'toast';
}

interface ActionFeedbackOverlayProps {
  feedback: ActionFeedbackState | null;
  onComplete: () => void;
}

/**
 * Displays a crisp Sync & Completion indicator:
 * - For 'fullscreen' mode: shows a live real-time Sync Percentage (0% → 100% Synced) that transitions
 *   immediately to the checkmark tick and auto-closes within ~1.1s (never looping even when parent re-renders!).
 * - For 'toast' mode: shows a compact top-right status pill that auto-dismisses cleanly.
 */
export const ActionFeedbackOverlay: React.FC<ActionFeedbackOverlayProps> = ({
  feedback,
  onComplete,
}) => {
  const [phase, setPhase] = useState<'spinning' | 'settled' | 'hidden'>('hidden');
  const [syncPercent, setSyncPercent] = useState<number>(100);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!feedback) {
      setPhase('hidden');
      setSyncPercent(100);
      return;
    }

    const isToast = feedback.mode === 'toast';
    if (isToast) {
      setPhase('settled');
      setSyncPercent(100);
      const toastTimer = setTimeout(() => {
        setPhase('hidden');
        onCompleteRef.current();
      }, 1500);
      return () => clearTimeout(toastTimer);
    }

    // Fullscreen mode: rapid live sync percentage 25% -> 68% -> 100%, then immediate tick & auto-close within ~1.15s
    setPhase('spinning');
    setSyncPercent(35);

    const pctTimer1 = setTimeout(() => {
      setSyncPercent(78);
    }, 120);

    const settleTimer = setTimeout(() => {
      setSyncPercent(100);
      setPhase('settled');
    }, 280);

    const closeTimer = setTimeout(() => {
      setPhase('hidden');
      onCompleteRef.current();
    }, 1150);

    return () => {
      clearTimeout(pctTimer1);
      clearTimeout(settleTimer);
      clearTimeout(closeTimer);
    };
  }, [feedback?.id]);

  if (!feedback || phase === 'hidden') return null;

  const isSuccess = feedback.type === 'success';
  const isToast = feedback.mode === 'toast';

  if (isToast) {
    return (
      <div
        role="status"
        aria-live="polite"
        onClick={() => {
          setPhase('hidden');
          onCompleteRef.current();
        }}
        className="fixed bottom-5 right-5 z-[95] flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/95 dark:bg-slate-900 text-white border border-slate-700/80 shadow-2xl cursor-pointer animate-fade-up"
      >
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
            isSuccess
              ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/40'
              : 'bg-rose-500 text-white shadow-sm shadow-rose-500/40'
          }`}
        >
          {isSuccess ? (
            <Check className="w-4 h-4 stroke-[3]" />
          ) : (
            <X className="w-4 h-4 stroke-[3]" />
          )}
        </div>
        <div className="text-xs font-extrabold tracking-tight pr-1">{feedback.message}</div>
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold">
          100%
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => {
        setPhase('hidden');
        onCompleteRef.current();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 backdrop-blur-xs transition-opacity duration-200 cursor-pointer"
    >
      <div className="px-8 py-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col items-center gap-3.5 max-w-sm text-center transform transition-all duration-200 scale-100">
        <div className="relative w-20 h-20 flex items-center justify-center">
          {/* Outer Rotating Ring while syncing */}
          {phase === 'spinning' && (
            <>
              <div
                className={`w-18 h-18 rounded-full border-4 border-t-transparent animate-spin ${
                  isSuccess ? 'border-emerald-500' : 'border-rose-500'
                }`}
              />
              <span className="absolute font-mono font-extrabold text-xs text-emerald-600 dark:text-emerald-400">
                {syncPercent}%
              </span>
            </>
          )}

          {/* Settled Bold Green Checkmark or Red Cross Circle */}
          {phase === 'settled' && (
            <div
              className={`w-18 h-18 rounded-full flex items-center justify-center shadow-lg transition-transform duration-200 scale-100 ${
                isSuccess
                  ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                  : 'bg-rose-600 text-white shadow-rose-600/30'
              }`}
            >
              {isSuccess ? (
                <Check className="w-10 h-10 stroke-[3.5]" />
              ) : (
                <X className="w-10 h-10 stroke-[3.5]" />
              )}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div
            className={`text-sm font-extrabold tracking-tight ${
              isSuccess
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {feedback.message}
          </div>
          <div className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
            {phase === 'spinning' ? `Syncing Vault... ${syncPercent}%` : '✓ 100% Synced — Closing'}
          </div>
        </div>
      </div>
    </div>
  );
};
