import React, { useEffect, useState } from 'react';
import { Check, Pencil, RotateCcw, ShieldAlert, Trash2, X } from 'lucide-react';
import { verifySecretAgainstStoredHash } from '../utils/financeRules';
import {
  loadActiveSessionUserId,
  loadUsersFromLocal,
} from '../utils/localVaultStorage';

const DROPDOWN_REMOVED_STORAGE_KEY = 'pocketledger_dropdown_removed_options_v1';
const DROPDOWN_UPDATE_EVENT = 'pocketledger-dropdown-lists-updated';

export function loadRemovedDropdownOptionsMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(DROPDOWN_REMOVED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveRemovedDropdownOptionsForList(
  listKey: string,
  removedOptions: string[]
): void {
  try {
    const map = loadRemovedDropdownOptionsMap();
    map[listKey] = Array.from(new Set(removedOptions));
    localStorage.setItem(DROPDOWN_REMOVED_STORAGE_KEY, JSON.stringify(map));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(DROPDOWN_UPDATE_EVENT, { detail: { listKey } }));
    }
  } catch {
    // ignore storage errors
  }
}

/**
 * Pure helper (also testable in unit tests) that computes the active dropdown options
 * after removing deleted options while preserving "Other" / "Others" at the end.
 */
export function filterDropdownOptionsWithOther(
  baseOptions: string[],
  customOptions: string[] = [],
  removedOptions: string[] = [],
  otherLabel = 'Other'
): string[] {
  const removedSet = new Set(removedOptions);
  const mergedWithoutOther = Array.from(
    new Set([
      ...baseOptions.filter((o) => o !== otherLabel && o !== 'Other' && o !== 'Others'),
      ...customOptions.filter((o) => o !== otherLabel && o !== 'Other' && o !== 'Others'),
    ])
  ).filter((opt) => !removedSet.has(opt));

  return [...mergedWithoutOther, otherLabel];
}

export function useEditableDropdownOptions(
  listKey: string,
  baseOptions: string[],
  customOptions: string[] = [],
  otherLabel = 'Other'
): {
  options: string[];
  allEditableOptions: string[];
  removedOptions: string[];
  saveRemovedOptions: (nextRemoved: string[]) => void;
} {
  const [removedOptions, setRemovedOptions] = useState<string[]>(() => {
    const map = loadRemovedDropdownOptionsMap();
    return map[listKey] || [];
  });

  useEffect(() => {
    const syncFromStorage = () => {
      const map = loadRemovedDropdownOptionsMap();
      setRemovedOptions(map[listKey] || []);
    };
    syncFromStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener(DROPDOWN_UPDATE_EVENT, syncFromStorage);
      return () => window.removeEventListener(DROPDOWN_UPDATE_EVENT, syncFromStorage);
    }
  }, [listKey]);

  const allEditableOptions = Array.from(
    new Set([
      ...baseOptions.filter((o) => o !== otherLabel && o !== 'Other' && o !== 'Others'),
      ...customOptions.filter((o) => o !== otherLabel && o !== 'Other' && o !== 'Others'),
    ])
  );

  const options = filterDropdownOptionsWithOther(
    baseOptions,
    customOptions,
    removedOptions,
    otherLabel
  );

  const saveRemovedOptions = (nextRemoved: string[]) => {
    saveRemovedDropdownOptionsForList(listKey, nextRemoved);
    setRemovedOptions(nextRemoved);
  };

  return {
    options,
    allEditableOptions,
    removedOptions,
    saveRemovedOptions,
  };
}

interface DropdownListEditButtonProps {
  listKey: string;
  label?: string;
  allEditableOptions: string[];
  removedOptions: string[];
  onSaveRemovedOptions: (nextRemoved: string[]) => void;
  onOptionDeletedFallback?: (remainingFirstOption: string) => void;
  currentSelectedValue?: string;
  otherLabel?: string;
  userPasswordHash?: string;
}

export const DropdownListEditButton: React.FC<DropdownListEditButtonProps> = ({
  listKey,
  label = 'Dropdown Options',
  allEditableOptions,
  removedOptions,
  onSaveRemovedOptions,
  onOptionDeletedFallback,
  currentSelectedValue,
  otherLabel = 'Other',
  userPasswordHash,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stagedRemoved, setStagedRemoved] = useState<string[]>([]);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const openEditor = () => {
    setStagedRemoved([...removedOptions]);
    setShowPasswordPrompt(false);
    setPasswordInput('');
    setPasswordError('');
    setIsOpen(true);
  };

  const activeInStage = allEditableOptions.filter((opt) => !stagedRemoved.includes(opt));

  const handleToggleRemoveOption = (opt: string) => {
    if (stagedRemoved.includes(opt)) {
      setStagedRemoved(stagedRemoved.filter((r) => r !== opt));
    } else {
      setStagedRemoved([...stagedRemoved, opt]);
    }
  };

  const handleClickDone = () => {
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordPrompt(true);
  };

  const resolvePasswordHash = (): string => {
    if (userPasswordHash) return userPasswordHash;
    const activeUserId = loadActiveSessionUserId();
    const users = loadUsersFromLocal();
    const found = users.find((u) => u.id === activeUserId) || users[0];
    return found?.passwordHash || '';
  };

  const handleConfirmPasswordAndSave = () => {
    if (!passwordInput.trim()) {
      setPasswordError('Please enter your account password to save dropdown list changes.');
      return;
    }
    const targetHash = resolvePasswordHash();
    if (
      targetHash &&
      targetHash !== 'google-oauth' &&
      !verifySecretAgainstStoredHash(passwordInput, targetHash)
    ) {
      setPasswordError('Incorrect password. Changes were not saved.');
      return;
    }

    onSaveRemovedOptions(stagedRemoved);
    if (
      currentSelectedValue &&
      stagedRemoved.includes(currentSelectedValue) &&
      onOptionDeletedFallback
    ) {
      const nextRemaining = allEditableOptions.filter((o) => !stagedRemoved.includes(o));
      onOptionDeletedFallback(nextRemaining[0] || otherLabel);
    }
    setShowPasswordPrompt(false);
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        data-testid={`edit-dropdown-list-btn-${listKey}`}
        onClick={openEditor}
        title={`Edit ${label} options`}
        aria-label={`Edit ${label} options`}
        className="inline-flex items-center justify-center w-6 h-6 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/30 cursor-pointer transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          data-testid={`dropdown-list-editor-modal-${listKey}`}
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`dropdown-editor-title-${listKey}`}
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div>
                <h3
                  id={`dropdown-editor-title-${listKey}`}
                  className="text-sm font-extrabold text-slate-900 dark:text-white"
                >
                  Edit {label}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Delete unwanted options from the list, then click Done and enter your password to save.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!showPasswordPrompt ? (
              <div className="p-4 space-y-3">
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/50">
                  {activeInStage.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      All standard options deleted. Only &ldquo;{otherLabel}&rdquo; remains active.
                    </div>
                  ) : (
                    activeInStage.map((opt) => (
                      <div
                        key={opt}
                        className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {opt}
                        </span>
                        <button
                          type="button"
                          data-testid={`delete-dropdown-option-btn-${opt}`}
                          onClick={() => handleToggleRemoveOption(opt)}
                          title={`Delete "${opt}" from dropdown list`}
                          className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-600 text-rose-600 hover:text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {stagedRemoved.length > 0 && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>{stagedRemoved.length} option(s) marked for removal</span>
                    <button
                      type="button"
                      onClick={() => setStagedRemoved([])}
                      className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore Default List</span>
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid={`dropdown-edit-done-btn-${listKey}`}
                    onClick={handleClickDone}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Done</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      Password Required to Save Dropdown List
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      Enter your account password to confirm saving changes to {label}.
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={`dropdown-pwd-${listKey}`}
                    className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Account Password
                  </label>
                  <input
                    id={`dropdown-pwd-${listKey}`}
                    data-testid={`dropdown-list-password-input-${listKey}`}
                    type="password"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConfirmPasswordAndSave();
                      }
                    }}
                    placeholder="Enter your login password"
                    autoFocus
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                {passwordError && (
                  <div
                    data-testid={`dropdown-list-password-error-${listKey}`}
                    className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-400"
                  >
                    {passwordError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasswordPrompt(false)}
                    className="px-3.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    data-testid={`confirm-save-dropdown-list-btn-${listKey}`}
                    onClick={handleConfirmPasswordAndSave}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Verify &amp; Save List</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
