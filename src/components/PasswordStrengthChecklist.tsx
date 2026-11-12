import React from 'react';
import { CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import { evaluatePasswordSecurity } from '../utils/financeRules';

interface PasswordStrengthChecklistProps {
  password: string;
  compact?: boolean;
}

export const PasswordStrengthChecklist: React.FC<PasswordStrengthChecklistProps> = ({
  password,
  compact = false,
}) => {
  const evaluation = evaluatePasswordSecurity(password);
  const isTyped = password.length > 0;

  const badgeColors =
    evaluation.strength === 'strong'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
      : evaluation.strength === 'guessable'
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40'
      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40';

  const barColor =
    evaluation.strength === 'strong'
      ? 'bg-emerald-500'
      : evaluation.strength === 'guessable'
      ? 'bg-amber-500'
      : 'bg-rose-500';

  const widthPct = !isTyped ? 8 : Math.max(18, Math.round((evaluation.score / 5) * 100));

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 ${
        compact ? 'p-3 space-y-2' : 'p-3.5 space-y-2.5'
      } text-xs`}
    >
      {/* Top Row: Live Strength Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
          {evaluation.strength === 'strong' ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
          )}
          <span>Alphanumeric Password Security</span>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-md border text-[11px] font-extrabold uppercase tracking-wide ${badgeColors}`}
        >
          {isTyped ? `Password: ${evaluation.strengthLabel}` : 'Type Password'}
        </span>
      </div>

      {/* Live Strength Bar */}
      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${barColor}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>

      {/* Security Reason Explanation */}
      <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
        {evaluation.securityReason}
      </p>

      {/* Live Red / Green Condition Checklist */}
      <div className="space-y-1 pt-0.5">
        {evaluation.conditions.map((cond) => (
          <div
            key={cond.id}
            className={`flex items-center gap-2 text-[11px] font-semibold transition-colors ${
              cond.fulfilled
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {cond.fulfilled ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-500 dark:text-rose-400" />
            )}
            <span>{cond.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
