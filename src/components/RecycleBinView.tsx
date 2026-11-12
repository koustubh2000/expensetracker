import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Landmark,
  ReceiptText,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Users,
  Vault,
  X,
} from 'lucide-react';
import { RecycleBinEntry } from '../types/finance';
import { verifySecretAgainstStoredHash } from '../utils/financeRules';
import { loadProofImageLocally } from '../utils/localVaultStorage';

interface RecycleBinViewProps {
  entries: RecycleBinEntry[];
  currency: string;
  readOnlyMode?: boolean;
  userPasswordHash?: string;
  onRestoreEntry: (recycleId: string) => void;
  onDeleteForever: (recycleId: string) => void;
  onEmptyRecycleBin: () => void;
}

export const RecycleBinView: React.FC<RecycleBinViewProps> = ({
  entries,
  currency,
  readOnlyMode = false,
  userPasswordHash = '',
  onRestoreEntry,
  onDeleteForever,
  onEmptyRecycleBin,
}) => {
  const [pendingPurgeTarget, setPendingPurgeTarget] = useState<{
    mode: 'single' | 'empty_all';
    entry?: RecycleBinEntry;
  } | null>(null);
  const [purgePasswordInput, setPurgePasswordInput] = useState('');
  const [purgePasswordError, setPurgePasswordError] = useState('');
  const getTypeBadge = (itemType: RecycleBinEntry['itemType']) => {
    switch (itemType) {
      case 'transaction':
        return {
          label: 'Ledger Record',
          icon: <ReceiptText className="w-3.5 h-3.5 text-emerald-600" />,
          badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        };
      case 'proof_image':
        return {
          label: 'Proof Image',
          icon: <ImageIcon className="w-3.5 h-3.5 text-sky-600" />,
          badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
        };
      case 'account':
        return {
          label: 'Bank / Wallet',
          icon: <Landmark className="w-3.5 h-3.5 text-indigo-600" />,
          badgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
        };
      case 'person':
      case 'expected_item':
        return {
          label: itemType === 'person' ? 'Person Profile' : 'Pending Bill Item',
          icon: <Users className="w-3.5 h-3.5 text-amber-600" />,
          badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
        };
      case 'dream_vault':
        return {
          label: 'Investment / Dream',
          icon: <Vault className="w-3.5 h-3.5 text-violet-600" />,
          badgeClass: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
        };
      case 'recurring_payment':
        return {
          label: 'Recurring Payment',
          icon: <ReceiptText className="w-3.5 h-3.5 text-amber-600" />,
          badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
        };
      case 'loan':
      default:
        return {
          label: 'Loan & EMI',
          icon: <Landmark className="w-3.5 h-3.5 text-indigo-600" />,
          badgeClass: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
        };
    }
  };

  return (
    <div className="space-y-5">
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-emerald-600" />
            Recycle Bin &amp; Instant Item Recovery ({entries.length})
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Deleted records, proof images, bank accounts, people, and dream vaults are moved here by
            reference without duplicating storage data. Original Record IDs (100, 101, ...) are
            preserved and never reused.
          </p>
        </div>

        {entries.length > 0 && !readOnlyMode && (
          <button
            type="button"
            data-testid="empty-recycle-bin-btn"
            onClick={() => {
              setPendingPurgeTarget({ mode: 'empty_all' });
              setPurgePasswordInput('');
              setPurgePasswordError('');
            }}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-rose-500/40 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Empty Recycle Bin Permanently
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="p-12 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-2">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Recycle Bin is Empty
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Whenever you delete a transaction record, proof receipt image, bank account, person, or
            dream vault, it will appear here so you can restore it anytime with 1 click.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold">Original ID</th>
                <th className="py-3 px-4 font-semibold">Item Details</th>
                <th className="py-3 px-4 font-semibold">Preview / Amount</th>
                <th className="py-3 px-4 font-semibold">Deleted At</th>
                <th className="py-3 px-4 font-semibold text-right">Restore / Purge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {entries.map((entry) => {
                const badge = getTypeBadge(entry.itemType);
                const proofThumb =
                  entry.transaction?.proofImageDataUrl ||
                  loadProofImageLocally(entry.proofId || entry.transaction?.proofId);

                return (
                  <tr
                    key={entry.recycleId}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold ${badge.badgeClass}`}
                      >
                        {badge.icon}
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      #{entry.originalId}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 dark:text-white">{entry.title}</div>
                      {entry.subtitle && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{entry.subtitle}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        {proofThumb && (
                          <img
                            src={proofThumb}
                            alt={entry.title}
                            className="w-9 h-7 object-cover rounded border border-slate-200 dark:border-slate-700"
                          />
                        )}
                        {entry.transaction && (
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {currency}
                            {entry.transaction.amount.toLocaleString()}
                          </span>
                        )}
                        {entry.account && (
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {currency}
                            {entry.account.initialBalance.toLocaleString()}
                          </span>
                        )}
                        {entry.expectedItem && (
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {currency}
                            {entry.expectedItem.amount.toLocaleString()}
                          </span>
                        )}
                        {entry.dreamVault && (
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {currency}
                            {entry.dreamVault.currentAmount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {entry.deletedAt.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={readOnlyMode}
                          onClick={() => onRestoreEntry(entry.recycleId)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={readOnlyMode}
                          onClick={() => {
                            setPendingPurgeTarget({ mode: 'single', entry });
                            setPurgePasswordInput('');
                            setPurgePasswordError('');
                          }}
                          aria-label={`Permanently delete ${entry.title}`}
                          className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Password Confirmation Modal before Permanently Purging from Recycle Bin */}
      {pendingPurgeTarget && (
        <div
          data-testid="recycle-bin-password-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recycle-purge-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="recycle-purge-modal-title"
                    className="text-sm font-extrabold text-slate-900 dark:text-white"
                  >
                    {pendingPurgeTarget.mode === 'empty_all'
                      ? 'Confirm Empty Recycle Bin Permanently'
                      : 'Confirm Permanent Deletion'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Password verification required — this cannot be undone
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingPurgeTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!purgePasswordInput.trim()) {
                  setPurgePasswordError('Please enter your account password to confirm permanent deletion.');
                  return;
                }
                if (
                  userPasswordHash &&
                  userPasswordHash !== 'google-oauth' &&
                  !verifySecretAgainstStoredHash(purgePasswordInput, userPasswordHash)
                ) {
                  setPurgePasswordError('Incorrect password. Permanent deletion cancelled.');
                  return;
                }
                if (pendingPurgeTarget.mode === 'empty_all') {
                  onEmptyRecycleBin();
                } else if (pendingPurgeTarget.entry) {
                  onDeleteForever(pendingPurgeTarget.entry.recycleId);
                }
                setPendingPurgeTarget(null);
                setPurgePasswordInput('');
                setPurgePasswordError('');
              }}
              className="p-5 space-y-4"
            >
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                {pendingPurgeTarget.mode === 'empty_all' ? (
                  <span>
                    Permanently purge all <strong>{entries.length}</strong> items from the Recycle Bin.
                  </span>
                ) : (
                  <span>
                    Permanently delete <strong>{pendingPurgeTarget.entry?.title}</strong> (#
                    {pendingPurgeTarget.entry?.originalId}).
                  </span>
                )}
              </div>

              <div>
                <label
                  htmlFor="recycle-purge-password-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Enter Your Account Password to Confirm
                </label>
                <input
                  id="recycle-purge-password-input"
                  data-testid="recycle-purge-password-input"
                  type="password"
                  value={purgePasswordInput}
                  onChange={(e) => {
                    setPurgePasswordInput(e.target.value);
                    setPurgePasswordError('');
                  }}
                  placeholder="Enter your login password"
                  autoFocus
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              {purgePasswordError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {purgePasswordError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingPurgeTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-recycle-purge-btn"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirm Permanent Delete</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
