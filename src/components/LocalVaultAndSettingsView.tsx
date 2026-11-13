import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Cloud,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import { UserAccount, UserVaultData } from '../types/finance';
import {
  compressImageFileToDataUrl,
  downloadLocalFile,
  generateTransactionsCSV,
} from '../utils/localVaultStorage';
import {
  evaluatePasswordSecurity,
  verifySecretAgainstStoredHash,
} from '../utils/financeRules';
import { PasswordStrengthChecklist } from './PasswordStrengthChecklist';
import {
  DropdownListEditButton,
  useEditableDropdownOptions,
} from './DropdownListEditButton';
import { useImageDragDropAndPaste } from '../utils/imageUploadHelpers';

interface LocalVaultAndSettingsViewProps {
  currentUser: UserAccount;
  vault: UserVaultData;
  isCloudConnected: boolean;
  cloudEmail?: string | null;
  readOnlyMode?: boolean;
  onTriggerFeedback?: (
    message: string,
    type?: 'success' | 'error',
    mode?: 'fullscreen' | 'toast'
  ) => void;
  onConnectGoogleCloud: () => Promise<void>;
  onUpdateOwnProfile: (
    displayName: string,
    newPassword: string,
    currency: string,
    avatarThumbnailDataUrl?: string
  ) => void;
  onUpdateMobileSecurity?: (mobilePin: string | undefined) => void;
  onDeleteOwnAccountPermanently: (passwordAttempt: string) => { ok: boolean; error?: string };
  onImportVaultBackup: (importedVault: UserVaultData) => void;
}

const CURRENCY_CHOICES = [
  { label: 'Indian Rupee (₹)', value: '₹' },
  { label: 'US Dollar ($)', value: '$' },
  { label: 'Euro (€)', value: '€' },
  { label: 'British Pound (£)', value: '£' },
  { label: 'Other (Custom Symbol)', value: 'Other' },
];

export const LocalVaultAndSettingsView: React.FC<LocalVaultAndSettingsViewProps> = ({
  currentUser,
  vault,
  isCloudConnected,
  cloudEmail,
  readOnlyMode = false,
  onTriggerFeedback,
  onConnectGoogleCloud,
  onUpdateOwnProfile,
  onUpdateMobileSecurity,
  onDeleteOwnAccountPermanently,
  onImportVaultBackup,
}) => {
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Own profile & thumbnail state (never pre-fill stored password in plain text)
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  // Mobile App PIN Login state
  const [pinDraft, setPinDraft] = useState('');
  const [confirmPinDraft, setConfirmPinDraft] = useState('');

  const isStandardCurrency = ['$', '₹', '€', '£'].includes(currentUser.currency);
  const [currencyChoice, setCurrencyChoice] = useState<string>(
    isStandardCurrency ? currentUser.currency : 'Other'
  );
  const [customCurrency, setCustomCurrency] = useState<string>(
    isStandardCurrency ? '' : currentUser.currency
  );
  const [avatarThumb, setAvatarThumb] = useState<string | undefined>(
    currentUser.avatarThumbnailDataUrl
  );

  // Permanent Self-Deletion state
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const currencyList = useEditableDropdownOptions(
    'settings_currency',
    CURRENCY_CHOICES.map((c) => c.value),
    [],
    'Other'
  );

  const processProfilePhotoFile = async (file: File) => {
    if (readOnlyMode) return;
    try {
      const compressedDataUrl = await compressImageFileToDataUrl(file, 128, 0.78);
      setAvatarThumb(compressedDataUrl);
      onUpdateOwnProfile(
        displayName.trim() || currentUser.displayName,
        currentUser.passwordHash,
        currencyChoice === 'Other' ? customCurrency.trim() || '₹' : currencyChoice,
        compressedDataUrl
      );
      const approxKb = Math.max(1, Math.round((compressedDataUrl.length * 0.75) / 1024));
      setStatusMessage(
        `Profile photo converted to compact thumbnail (~${approxKb} KB) and saved.`
      );
      onTriggerFeedback?.('File Uploaded Successfully', 'success');
    } catch {
      setErrorMessage('Could not process profile photo.');
      onTriggerFeedback?.('Could Not Upload Profile Photo', 'error');
    }
  };

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnlyMode) return;
    const file = e.target.files?.[0];
    if (!file) return;
    await processProfilePhotoFile(file);
  };

  const { isDraggingOver: isDraggingAvatar, zoneProps: avatarDropZoneProps } =
    useImageDragDropAndPaste(processProfilePhotoFile, false, readOnlyMode);

  const handleSaveOwnProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);

    const requiresCurrentPasswordVerification =
      !currentUser.mustChangePassword &&
      Boolean(currentUser.passwordHash && currentUser.passwordHash !== 'google-oauth');

    if (readOnlyMode) {
      // When account is On Hold, ONLY password changes are permitted!
      if (!newPassword.trim()) {
        setErrorMessage('Your account is On Hold. Only password updates are permitted.');
        onTriggerFeedback?.('Please Enter a New Password', 'error', 'toast');
        return;
      }
      if (requiresCurrentPasswordVerification) {
        if (!currentPassword.trim()) {
          setErrorMessage('Please enter your Current Password to verify your identity.');
          onTriggerFeedback?.('Please Enter Current Password', 'error', 'toast');
          return;
        }
        if (!verifySecretAgainstStoredHash(currentPassword, currentUser.passwordHash)) {
          setErrorMessage('Incorrect Current Password. Password change cancelled.');
          onTriggerFeedback?.('Incorrect Current Password', 'error', 'toast');
          return;
        }
      }
      const pwSec = evaluatePasswordSecurity(newPassword.trim());
      if (!pwSec.isAlphanumericValid) {
        setErrorMessage(
          'Please fulfill all green password security conditions (minimum 8 characters, uppercase, lowercase, and a number).'
        );
        onTriggerFeedback?.('Password Must Be Alphanumeric (8+ Chars)', 'error', 'toast');
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setErrorMessage('New Password and Confirm Password do not match.');
        onTriggerFeedback?.('Passwords Do Not Match', 'error', 'toast');
        return;
      }
      onUpdateOwnProfile(
        currentUser.displayName,
        newPassword.trim(),
        currentUser.currency,
        currentUser.avatarThumbnailDataUrl
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setStatusMessage('Password changed successfully.');
      onTriggerFeedback?.('Password Changed Successfully', 'success', 'fullscreen');
      return;
    }

    if (currentUser.mustChangePassword && !newPassword.trim()) {
      setErrorMessage(
        'Because you signed in with a 1-time temporary password, please enter and confirm a new permanent password.'
      );
      onTriggerFeedback?.('New Permanent Password Required', 'error', 'toast');
      return;
    }

    const isPasswordBeingChanged = Boolean(newPassword.trim() || confirmNewPassword.trim());
    if (isPasswordBeingChanged) {
      if (requiresCurrentPasswordVerification) {
        if (!currentPassword.trim()) {
          setErrorMessage('Please enter your Current Password before setting a new password.');
          onTriggerFeedback?.('Please Enter Current Password', 'error', 'toast');
          return;
        }
        if (!verifySecretAgainstStoredHash(currentPassword, currentUser.passwordHash)) {
          setErrorMessage('Incorrect Current Password. Password change cancelled.');
          onTriggerFeedback?.('Incorrect Current Password', 'error', 'toast');
          return;
        }
      }
      const pwSec = evaluatePasswordSecurity(newPassword.trim());
      if (!pwSec.isAlphanumericValid) {
        setErrorMessage(
          'Please fulfill all green password security conditions (minimum 8 characters, uppercase, lowercase, and a number).'
        );
        onTriggerFeedback?.('Password Must Be Alphanumeric (8+ Chars)', 'error', 'toast');
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setErrorMessage('New Password and Confirm Password do not match.');
        onTriggerFeedback?.('Passwords Do Not Match', 'error', 'toast');
        return;
      }
    }

    const passwordToSave = newPassword.trim()
      ? newPassword.trim()
      : currentUser.passwordHash;

    const finalCurr =
      currencyChoice === 'Other' ? customCurrency.trim() || '₹' : currencyChoice;

    onUpdateOwnProfile(
      displayName.trim() || currentUser.displayName,
      passwordToSave,
      finalCurr,
      avatarThumb
    );
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setStatusMessage('Your personal account profile, password, and currency have been saved.');
    onTriggerFeedback?.(
      isPasswordBeingChanged ? 'Password Changed Successfully' : 'Profile Saved Successfully',
      'success',
      isPasswordBeingChanged ? 'fullscreen' : 'toast'
    );
  };

  const handleConfirmPermanentDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnlyMode) return;
    setDeleteError('');
    setShowDeletePassword(false);
    if (!deletePasswordInput) {
      setDeleteError('Please enter your password to confirm permanent deletion.');
      return;
    }
    const res = onDeleteOwnAccountPermanently(deletePasswordInput);
    if (!res.ok) {
      setDeleteError(res.error || 'Incorrect password. Account deletion cancelled.');
      onTriggerFeedback?.(res.error || 'Incorrect Password', 'error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnlyMode) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
          onImportVaultBackup({
            ...parsed,
            userId: currentUser.id,
          });
          setStatusMessage(`Restored ${parsed.transactions.length} records into your account.`);
          onTriggerFeedback?.('File Uploaded Successfully', 'success');
        } else {
          setErrorMessage('Selected file is not a valid ExpenseTracker JSON backup.');
          onTriggerFeedback?.('Invalid Backup File', 'error');
        }
      } catch {
        setErrorMessage('Could not parse JSON backup file.');
        onTriggerFeedback?.('Could Not Parse Backup File', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          My Account Settings &amp; Private Profile (@{currentUser.username})
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {readOnlyMode
            ? 'Your account is currently On Hold. All settings are read-only except changing your password.'
            : 'Manage your profile photo thumbnail, password, currency preferences, personal data backup, and account ownership.'}
        </p>
      </div>

      {/* Mandatory Password Change Alert if user logged in with a 1-time Temporary Password */}
      {currentUser.mustChangePassword && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-500/15 border-2 border-amber-500 text-amber-800 dark:text-amber-200 text-xs space-y-1"
        >
          <div className="font-extrabold text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            You Signed In Using a 1st-Login Temporary Password
          </div>
          <p>
            Your temporary password has now been invalidated and cannot be used again. Please set and
            confirm a new permanent password below and click{' '}
            <strong>Save My Profile &amp; Password</strong>.
          </p>
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage('')}
            className="text-xs underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center justify-between gap-4"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            className="text-xs underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Personal Profile Photo Thumbnail, Password & Confirm Password, Currency */}
        <form
          onSubmit={handleSaveOwnProfile}
          autoComplete="off"
          className="lg:col-span-6 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5"
        >
          <div
            {...avatarDropZoneProps}
            className={`flex items-center justify-between gap-4 pb-4 border-b transition-colors ${
              isDraggingAvatar
                ? 'border-emerald-500 bg-emerald-500/10 p-3 rounded-xl'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center gap-4">
              {avatarThumb ? (
                <img
                  src={avatarThumb}
                  alt={currentUser.displayName}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-500 shadow-sm shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-xl shrink-0">
                  {currentUser.displayName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {currentUser.displayName}
                </h3>
                <p className="text-xs text-slate-500 font-mono">@{currentUser.username}</p>
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                  Click, Drag &amp; Drop, or Paste (Ctrl+V) photo — auto-converts to 128×128 thumbnail
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <label
                htmlFor="user-avatar-upload"
                className={`px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${
                  readOnlyMode
                    ? 'opacity-45 cursor-not-allowed'
                    : 'hover:bg-emerald-500 cursor-pointer'
                }`}
              >
                {readOnlyMode ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
                Upload / Drop / Paste Photo
                <input
                  id="user-avatar-upload"
                  type="file"
                  disabled={readOnlyMode}
                  accept="image/*"
                  onChange={handleProfilePhotoUpload}
                  className="hidden"
                />
              </label>
              {avatarThumb && (
                <button
                  type="button"
                  disabled={readOnlyMode}
                  onClick={() => {
                    if (readOnlyMode) return;
                    setAvatarThumb(undefined);
                    onUpdateOwnProfile(
                      displayName,
                      currentUser.passwordHash,
                      currentUser.currency,
                      undefined
                    );
                    setStatusMessage('Removed profile photo thumbnail.');
                  }}
                  className="p-2 rounded-xl border border-slate-300 dark:border-slate-700 text-rose-500 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Remove Profile Photo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-500" />
              Personal Credentials &amp; Password
            </h4>

            <div>
              <label
                htmlFor="settings-display-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                My Full Name / Bill Issuer Name
              </label>
              <input
                id="settings-display-name"
                type="text"
                disabled={readOnlyMode}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
              />
            </div>

            {/* Password inputs remain ENABLED even in readOnlyMode! */}
            {!currentUser.mustChangePassword &&
              currentUser.passwordHash &&
              currentUser.passwordHash !== 'google-oauth' && (
                <div>
                  <label
                    htmlFor="settings-current-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Current Password (Required only when changing password)
                  </label>
                  <div className="relative">
                    <input
                      id="settings-current-password"
                      data-testid="settings-current-password-input"
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter your current password to change password"
                      autoComplete="current-password"
                      className="w-full pl-3 pr-9 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      aria-label={
                        showCurrentPassword ? 'Hide current password' : 'Show current password'
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="settings-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  New Password{' '}
                  {currentUser.mustChangePassword || readOnlyMode ? '(Enabled)' : '(Optional)'}
                </label>
                <div className="relative">
                  <input
                    id="settings-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Type new password"
                    autoComplete="new-password"
                    className="w-full pl-3 pr-9 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                    title={showNewPassword ? 'Hide typed password' : 'Show typed password while typing'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="settings-confirm-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="settings-confirm-password"
                    type={showConfirmNewPassword ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    className={`w-full pl-3 pr-9 py-2 text-xs rounded-lg border bg-white dark:bg-slate-950 ${
                      confirmNewPassword.length > 0 && newPassword !== confirmNewPassword
                        ? 'border-rose-500'
                        : confirmNewPassword.length > 0 &&
                          newPassword.length > 0 &&
                          newPassword === confirmNewPassword
                        ? 'border-emerald-500'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmNewPassword((prev) => !prev)}
                    aria-label={
                      showConfirmNewPassword ? 'Hide confirm password' : 'Show confirm password'
                    }
                    title={
                      showConfirmNewPassword
                        ? 'Hide confirm password'
                        : 'Show confirm password while typing'
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showConfirmNewPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && (
                  <p
                    role="alert"
                    data-testid="settings-password-mismatch-msg"
                    className="mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Passwords do not match</span>
                  </p>
                )}
                {confirmNewPassword.length > 0 &&
                  newPassword.length > 0 &&
                  newPassword === confirmNewPassword && (
                    <p
                      data-testid="settings-password-match-msg"
                      className="mt-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Passwords match</span>
                    </p>
                  )}
              </div>
            </div>

            {newPassword.length > 0 && <PasswordStrengthChecklist password={newPassword} compact />}

            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label
                  htmlFor="settings-currency"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  My Currency (Includes Other)
                </label>
                {!readOnlyMode && (
                  <DropdownListEditButton
                    listKey="settings_currency"
                    label="Currency Options"
                    allEditableOptions={currencyList.allEditableOptions}
                    removedOptions={currencyList.removedOptions}
                    onSaveRemovedOptions={currencyList.saveRemovedOptions}
                    currentSelectedValue={currencyChoice}
                    otherLabel="Other"
                    userPasswordHash={currentUser.passwordHash}
                    onOptionDeletedFallback={(val) => setCurrencyChoice(val)}
                  />
                )}
              </div>
              <select
                id="settings-currency"
                disabled={readOnlyMode}
                value={currencyChoice}
                onChange={(e) => setCurrencyChoice(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
              >
                {currencyList.options.map((val) => {
                  const found = CURRENCY_CHOICES.find((c) => c.value === val);
                  return (
                    <option key={val} value={val}>
                      {found ? found.label : val}
                    </option>
                  );
                })}
              </select>
            </div>

            {currencyChoice === 'Other' && (
              <div>
                <label
                  htmlFor="settings-custom-curr"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Custom Currency Symbol (Other)
                </label>
                <input
                  id="settings-custom-curr"
                  type="text"
                  disabled={readOnlyMode}
                  value={customCurrency}
                  onChange={(e) => setCustomCurrency(e.target.value)}
                  placeholder="e.g. AED, ¥, CAD"
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-50"
                />
              </div>
            )}

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
            >
              {readOnlyMode ? 'Update My Password' : 'Save My Profile & Password'}
            </button>

            {/* Mobile App PIN (4-6 Digits) Setup Box */}
            <div
              data-testid="mobile-pin-settings-card"
              className="pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-500" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Mobile App PIN Login (3-Strike Protected)
                  </h4>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                    currentUser.mobilePin
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {currentUser.mobilePin ? 'PIN Active' : 'Not Set Yet (Password Only)'}
                </span>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Set a 4–6 digit numeric PIN for keypad login. For security, 3 failed PIN attempts
                automatically disable PIN access and require full Username + Password login.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="settings-mobile-pin"
                    className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    New Mobile PIN (4–6 Digits)
                  </label>
                  <input
                    id="settings-mobile-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={pinDraft}
                    onChange={(e) => setPinDraft(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder={currentUser.mobilePin ? '•••• (Update PIN)' : 'Enter 4–6 digits'}
                    className="w-full px-3 py-2 text-xs font-mono tracking-widest rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label
                    htmlFor="settings-confirm-mobile-pin"
                    className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Confirm Mobile PIN
                  </label>
                  <input
                    id="settings-confirm-mobile-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={confirmPinDraft}
                    onChange={(e) => setConfirmPinDraft(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Re-enter 4–6 digits"
                    className={`w-full px-3 py-2 text-xs font-mono tracking-widest rounded-lg border bg-white dark:bg-slate-950 ${
                      confirmPinDraft.length > 0 && pinDraft !== confirmPinDraft
                        ? 'border-rose-500'
                        : confirmPinDraft.length > 0 &&
                          pinDraft.length >= 4 &&
                          pinDraft === confirmPinDraft
                        ? 'border-emerald-500'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                  {confirmPinDraft.length > 0 && pinDraft !== confirmPinDraft && (
                    <p className="mt-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>PINs do not match</span>
                    </p>
                  )}
                  {confirmPinDraft.length > 0 &&
                    pinDraft.length >= 4 &&
                    pinDraft === confirmPinDraft && (
                      <p className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span>PINs match</span>
                      </p>
                    )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const effectivePin = pinDraft.trim() || currentUser.mobilePin;
                    if (!effectivePin || effectivePin.length < 4) {
                      setErrorMessage('Please enter a 4 to 6 digit numeric Mobile PIN.');
                      onTriggerFeedback?.('Enter 4–6 Digit Mobile PIN', 'error', 'toast');
                      return;
                    }
                    if (pinDraft.trim() && pinDraft.trim() !== confirmPinDraft.trim()) {
                      setErrorMessage('Mobile PIN and Confirm Mobile PIN do not match.');
                      onTriggerFeedback?.('Mobile PINs Do Not Match', 'error', 'toast');
                      return;
                    }
                    onUpdateMobileSecurity?.(effectivePin);
                    setPinDraft('');
                    setConfirmPinDraft('');
                    setStatusMessage(
                      'Mobile App PIN saved! You can now sign in with your 4–6 digit numeric PIN pad.'
                    );
                    onTriggerFeedback?.('Mobile PIN Saved', 'success', 'toast');
                  }}
                  data-testid="save-mobile-pin-settings-btn"
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Save Mobile PIN</span>
                </button>

                {currentUser.mobilePin && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateMobileSecurity?.(undefined);
                      setPinDraft('');
                      setConfirmPinDraft('');
                      setStatusMessage('Removed Mobile PIN.');
                      onTriggerFeedback?.('Mobile PIN Removed', 'success', 'toast');
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-rose-600 dark:text-rose-400 cursor-pointer"
                  >
                    Remove PIN
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>

        {/* Right: Personal Cloud Sync & Backup */}
        <div className="lg:col-span-6 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-emerald-500" />
                  Automatic Cross-Device Cloud Sync &amp; Data Backup
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isCloudConnected
                    ? `Connected to Google Cloud Firestore (${cloudEmail || currentUser.displayName})`
                    : 'Your account, password, wallets, proof images, and records automatically sync across Desktop & Mobile via Cloud Firestore.'}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                <ShieldCheck className="w-4 h-4" />
                Auto-Sync Active
              </span>
            </div>

            {!isCloudConnected && !readOnlyMode && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-slate-500">
                  Optional: Link Google Account for OAuth Sign-In
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    setErrorMessage('');
                    try {
                      await onConnectGoogleCloud();
                    } catch (err: any) {
                      const rawMsg = String(err?.code || err?.message || '');
                      if (rawMsg.includes('unauthorized-domain')) {
                        const host =
                          typeof window !== 'undefined' && window.location.hostname
                            ? window.location.hostname
                            : 'koustubhjuvekar.in';
                        setErrorMessage(
                          `To use Google OAuth Popup on "${host}", add "${host}" in Firebase Console → Authentication → Settings → Authorized domains. Automatic Cloud Firestore Sync is already active for your account!`
                        );
                      } else {
                        setErrorMessage(
                          err?.message || 'Google Sign-In popup was closed or blocked.'
                        );
                      }
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  Link Google OAuth
                </button>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
              <div>
                <strong>My Wallet Accounts:</strong> {vault.accounts.length} ·{' '}
                <strong>My Ledger Records:</strong> {vault.transactions.length}
              </div>
              <div>
                <strong>My People &amp; Bills:</strong> {vault.people.length} ·{' '}
                <strong>My Dream Vaults:</strong> {vault.dreamVaults.length}
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={readOnlyMode}
              onClick={() => {
                if (readOnlyMode) return;
                downloadLocalFile(
                  `expensetracker_${currentUser.username}.csv`,
                  generateTransactionsCSV(vault),
                  'text/csv'
                );
                onTriggerFeedback?.('CSV Exported Successfully', 'success');
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              Export My CSV
            </button>

            <button
              type="button"
              disabled={readOnlyMode}
              onClick={() => {
                if (readOnlyMode) return;
                downloadLocalFile(
                  `expensetracker_backup_${currentUser.username}.json`,
                  JSON.stringify(vault, null, 2),
                  'application/json'
                );
                onTriggerFeedback?.('JSON Backup Exported Successfully', 'success');
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              Export My Backup (.json)
            </button>

            <label
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-slate-800 text-white flex items-center gap-1.5 ${
                readOnlyMode
                  ? 'opacity-45 cursor-not-allowed'
                  : 'hover:bg-slate-700 cursor-pointer'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Import Backup (.json)
              <input
                type="file"
                disabled={readOnlyMode}
                accept=".json,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* PERMANENT ACCOUNT & DATA DELETION */}
      <div className="p-6 rounded-2xl border-2 border-rose-500/40 bg-rose-500/5 dark:bg-rose-950/20 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-extrabold text-rose-600 dark:text-rose-400 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Delete My Account &amp; All Data Permanently
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
              Deleting your account permanently erases your wallet accounts, transaction records,
              proof images, people bills, and dream vaults.
            </p>
          </div>

          {!showDeletePrompt && (
            <button
              type="button"
              disabled={readOnlyMode}
              onClick={() => {
                if (readOnlyMode) return;
                setShowDeletePrompt(true);
                setDeletePasswordInput('');
                setShowDeletePassword(false);
                setDeleteError('');
              }}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Delete My Account Permanently
            </button>
          )}
        </div>

        {showDeletePrompt && !readOnlyMode && (
          <form
            onSubmit={handleConfirmPermanentDelete}
            autoComplete="off"
            className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-rose-500/40 space-y-3 max-w-lg"
          >
            <div className="text-xs font-bold text-rose-600 dark:text-rose-400">
              Confirm Permanent Deletion: Enter your current password for @{currentUser.username}
            </div>

            {deleteError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-300">
                {deleteError}
              </div>
            )}

            <div className="relative">
              <input
                type={showDeletePassword ? 'text' : 'password'}
                value={deletePasswordInput}
                onChange={(e) => setDeletePasswordInput(e.target.value)}
                placeholder="Enter your password to confirm permanent deletion"
                aria-label="Password to confirm permanent account deletion"
                required
                autoComplete="off"
                className="w-full pl-3.5 pr-10 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
              <button
                type="button"
                onClick={() => setShowDeletePassword((prev) => !prev)}
                aria-label={showDeletePassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                {showDeletePassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Yes, Permanently Delete My Account &amp; Data
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeletePrompt(false);
                  setDeletePasswordInput('');
                  setShowDeletePassword(false);
                  setDeleteError('');
                }}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
