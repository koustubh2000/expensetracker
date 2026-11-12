import React, { useState } from 'react';
import {
  Sparkles,
  Plus,
  TrendingUp,
  ArrowUpRight,
  Lock,
  Trash2,
  Image as ImageIcon,
  Pencil,
  ShieldAlert,
  X,
  CheckCircle2,
  Landmark,
} from 'lucide-react';
import { DreamVault, WalletAccount } from '../types/finance';
import {
  calculateDreamTargetDateFromMonthly,
  resolveFlexibleLabel,
  verifySecretAgainstStoredHash,
} from '../utils/financeRules';
import { compressImageFileToDataUrl } from '../utils/localVaultStorage';
import {
  DropdownListEditButton,
  useEditableDropdownOptions,
} from './DropdownListEditButton';
import {
  extractImageFileFromDataTransfer,
  useImageDragDropAndPaste,
} from '../utils/imageUploadHelpers';
import { InfoTip } from './InfoTip';

interface DreamVaultsViewProps {
  dreamVaults: DreamVault[];
  accounts: WalletAccount[];
  currency: string;
  isAdminPortal: boolean;
  readOnlyMode?: boolean;
  userPasswordHash?: string;
  onTriggerFeedback?: (
    message: string,
    type?: 'success' | 'error',
    mode?: 'fullscreen' | 'toast'
  ) => void;
  onAddDreamVault: (vault: Omit<DreamVault, 'id'>) => void;
  onUpdateDreamVault?: (vault: DreamVault) => void;
  onDeleteDreamVault: (vaultId: string) => void;
  onContributeToDreamVault: (vaultId: string, amount: number, fromAccountId: string) => void;
}

const STORAGE_TYPES: DreamVault['storageType'][] = [
  'Fixed Deposit (FD)',
  'Gold & Bullion',
  'Mutual Funds & SIP',
  'Equity & Mutual Funds',
  'Emergency Fund',
  'Real Estate Goal',
  'Dream Investment',
  'Other',
];

function generateDefaultDreamThumbnailSvg(name: string, storageType: string): string {
  const title = (name || 'Dream Goal').slice(0, 28);
  const sub = (storageType || 'Investment Vault').slice(0, 26);
  const palette =
    storageType.includes('Gold')
      ? ['#92400e', '#f59e0b']
      : storageType.includes('Fixed Deposit') || storageType.includes('FD')
      ? ['#0f766e', '#14b8a6']
      : storageType.includes('Real Estate')
      ? ['#1e3a8a', '#3b82f6']
      : storageType.includes('Emergency')
      ? ['#065f46', '#10b981']
      : ['#4c1d95', '#8b5cf6'];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="220" viewBox="0 0 480 220">
    <defs>
      <linearGradient id="dg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${palette[0]}" />
        <stop offset="100%" stop-color="${palette[1]}" />
      </linearGradient>
    </defs>
    <rect width="480" height="220" rx="18" fill="url(#dg)" />
    <circle cx="410" cy="45" r="65" fill="rgba(255,255,255,0.08)" />
    <circle cx="65" cy="185" r="85" fill="rgba(255,255,255,0.06)" />
    <rect x="28" y="28" width="96" height="26" rx="8" fill="rgba(255,255,255,0.18)" />
    <text x="76" y="45" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">DREAM VAULT</text>
    <text x="28" y="138" font-family="Inter, sans-serif" font-size="22" font-weight="800" fill="#ffffff">${title.replace(/[<>&"']/g, '')}</text>
    <text x="28" y="166" font-family="Inter, sans-serif" font-size="13" font-weight="600" fill="rgba(255,255,255,0.85)">${sub.replace(/[<>&"']/g, '')}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DreamVaultsView: React.FC<DreamVaultsViewProps> = ({
  dreamVaults,
  accounts,
  currency,
  isAdminPortal,
  readOnlyMode = false,
  userPasswordHash = '',
  onTriggerFeedback,
  onAddDreamVault,
  onUpdateDreamVault,
  onDeleteDreamVault,
  onContributeToDreamVault,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVaultId, setEditingVaultId] = useState<string | null>(null);

  // Filter strictly to Savings / Bank accounts (no Credit Card or Loan Account)
  const savingsOnlyAccounts = accounts.filter(
    (acc) => acc.type !== 'Credit Card' && acc.type !== 'Loan Account'
  );

  const [name, setName] = useState('');
  const [storageType, setStorageType] =
    useState<DreamVault['storageType']>('Dream Investment');
  const [customStorageType, setCustomStorageType] = useState('');
  const [savedInAccountId, setSavedInAccountId] = useState<string>(
    savingsOnlyAccounts[0]?.id || ''
  );
  const [fdBankName, setFdBankName] = useState<string>(
    savingsOnlyAccounts[0]?.name || ''
  );
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('0');
  const [monthlyPlanned, setMonthlyPlanned] = useState('');
  const [targetDateMode, setTargetDateMode] = useState<
    'custom_date' | 'calculated_date' | 'no_date'
  >('custom_date');
  const [targetDate, setTargetDate] = useState('2027-12-31');
  const [notes, setNotes] = useState('');
  const [dreamImageUrl, setDreamImageUrl] = useState<string | undefined>(undefined);
  const [imageUploadError, setImageUploadError] = useState('');

  // Quick contribution state per vault
  const [contributingVaultId, setContributingVaultId] = useState<string | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [contributeAccountId, setContributeAccountId] = useState(accounts[0]?.id || '');

  // Password Confirmation before Deletion Modal State
  const [vaultPendingDelete, setVaultPendingDelete] = useState<DreamVault | null>(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');

  const accentBtnClass = isAdminPortal
    ? 'bg-rose-600 hover:bg-rose-500 text-white'
    : 'bg-emerald-600 hover:bg-emerald-500 text-white';

  const totalDreamSaved = dreamVaults.reduce((s, v) => s + v.currentAmount, 0);
  const totalDreamTarget = dreamVaults.reduce((s, v) => s + v.targetAmount, 0);
  const totalMonthlyPlanned = dreamVaults.reduce((s, v) => s + v.monthlyPlannedContribution, 0);

  const liveCalculatedTarget = calculateDreamTargetDateFromMonthly(
    Number(targetAmount) || 0,
    Number(currentAmount) || 0,
    Number(monthlyPlanned) || 0
  );

  const storageTypeList = useEditableDropdownOptions(
    'dream_storage_type',
    STORAGE_TYPES,
    [],
    'Other'
  );

  const processDreamImageFile = async (file: File) => {
    setImageUploadError('');
    try {
      const compressed = await compressImageFileToDataUrl(file, 700, 0.78);
      setDreamImageUrl(compressed);
      if (editingVaultId) {
        const existing = dreamVaults.find((v) => v.id === editingVaultId);
        if (existing) {
          onUpdateDreamVault?.({
            ...existing,
            imageUrl: compressed,
          });
          onTriggerFeedback?.(
            `Saved New Thumbnail for "${existing.name}"`,
            'success',
            'toast'
          );
        }
      }
    } catch (err: any) {
      setImageUploadError(err?.message || 'Could not process image.');
    }
  };

  const handleDreamImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processDreamImageFile(file);
  };

  const { isDraggingOver: isDraggingDreamThumb, zoneProps: dreamThumbDropProps } =
    useImageDragDropAndPaste(processDreamImageFile, showAddForm, readOnlyMode);

  const processCardQuickThumbnailFile = async (vaultItem: DreamVault, file: File) => {
    if (readOnlyMode) return;
    try {
      const compressed = await compressImageFileToDataUrl(file, 700, 0.78);
      onUpdateDreamVault?.({
        ...vaultItem,
        imageUrl: compressed,
      });
      onTriggerFeedback?.(`Updated Thumbnail for "${vaultItem.name}"`, 'success', 'toast');
    } catch {
      // ignore
    }
  };

  const handleCardQuickThumbnailUpload = async (
    vaultItem: DreamVault,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || readOnlyMode) return;
    await processCardQuickThumbnailFile(vaultItem, file);
  };

  const openCreateForm = () => {
    if (readOnlyMode) return;
    setEditingVaultId(null);
    setName('');
    setStorageType('Dream Investment');
    setCustomStorageType('');
    setSavedInAccountId(savingsOnlyAccounts[0]?.id || '');
    setFdBankName(savingsOnlyAccounts[0]?.name || '');
    setTargetAmount('');
    setCurrentAmount('0');
    setMonthlyPlanned('');
    setTargetDateMode('custom_date');
    setTargetDate('2027-12-31');
    setNotes('');
    setDreamImageUrl(undefined);
    setImageUploadError('');
    setShowAddForm(true);
  };

  const openEditForm = (v: DreamVault) => {
    if (readOnlyMode) return;
    setEditingVaultId(v.id);
    setName(v.name);
    setStorageType(v.storageType);
    setCustomStorageType(v.customStorageType || '');
    setSavedInAccountId(
      v.savedInAccountId || v.linkedAccountId || savingsOnlyAccounts[0]?.id || ''
    );
    setFdBankName(v.fdBankName || '');
    setTargetAmount(String(v.targetAmount));
    setCurrentAmount(String(v.currentAmount));
    setMonthlyPlanned(String(v.monthlyPlannedContribution));
    if (v.targetDateMode) {
      setTargetDateMode(v.targetDateMode);
    } else if (!v.targetDate || v.targetDate === 'No Date') {
      setTargetDateMode('no_date');
    } else {
      setTargetDateMode('custom_date');
    }
    setTargetDate(v.targetDate && v.targetDate !== 'No Date' ? v.targetDate : '2027-12-31');
    setNotes(v.notes || '');
    setDreamImageUrl(v.imageUrl);
    setImageUploadError('');
    setShowAddForm(true);
  };

  const isFdSelected =
    storageType === 'Fixed Deposit (FD)' ||
    (storageType === 'Other' && /\bfd\b|fixed deposit/i.test(customStorageType));

  const handleCreateOrUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnlyMode) return;
    const target = Number(targetAmount);
    const current = Number(currentAmount) || 0;
    const monthly = Number(monthlyPlanned) || 0;
    if (!name.trim() || !Number.isFinite(target) || target <= 0) return;

    const finalImageUrl =
      dreamImageUrl || generateDefaultDreamThumbnailSvg(name.trim(), storageType);

    const resolvedTargetDate =
      targetDateMode === 'no_date'
        ? 'No Date'
        : targetDateMode === 'calculated_date'
        ? calculateDreamTargetDateFromMonthly(target, current, monthly).calculatedDateIso
        : targetDate || 'No Date';

    const matchedSavingsAcc = savingsOnlyAccounts.find((a) => a.id === savedInAccountId);
    const resolvedFdBank = isFdSelected
      ? fdBankName.trim() || matchedSavingsAcc?.name || undefined
      : undefined;

    if (editingVaultId) {
      const updated: DreamVault = {
        id: editingVaultId,
        name: name.trim(),
        storageType,
        customStorageType: storageType === 'Other' ? customStorageType.trim() : undefined,
        savedInAccountId: savedInAccountId || undefined,
        fdBankName: resolvedFdBank,
        targetAmount: target,
        currentAmount: current,
        monthlyPlannedContribution: monthly,
        targetDate: resolvedTargetDate,
        targetDateMode,
        notes: notes.trim() || undefined,
        imageUrl: finalImageUrl,
      };
      onUpdateDreamVault?.(updated);
      onTriggerFeedback?.(`Dream & Investment Card "${updated.name}" Updated`, 'success');
    } else {
      onAddDreamVault({
        name: name.trim(),
        storageType,
        customStorageType: storageType === 'Other' ? customStorageType.trim() : undefined,
        savedInAccountId: savedInAccountId || undefined,
        fdBankName: resolvedFdBank,
        targetAmount: target,
        currentAmount: current,
        monthlyPlannedContribution: monthly,
        targetDate: resolvedTargetDate,
        targetDateMode,
        notes: notes.trim() || undefined,
        imageUrl: finalImageUrl,
      });
      onTriggerFeedback?.('Dream Vault Created Successfully', 'success');
    }

    setName('');
    setTargetAmount('');
    setCurrentAmount('0');
    setMonthlyPlanned('');
    setCustomStorageType('');
    setNotes('');
    setDreamImageUrl(undefined);
    setEditingVaultId(null);
    setShowAddForm(false);
  };

  const handleContributeSubmit = (e: React.FormEvent, vaultId: string) => {
    e.preventDefault();
    if (readOnlyMode) return;
    const amt = Number(contributeAmount);
    if (!Number.isFinite(amt) || amt <= 0 || !contributeAccountId) return;
    onContributeToDreamVault(vaultId, amt, contributeAccountId);
    setContributeAmount('');
    setContributingVaultId(null);
    onTriggerFeedback?.('Dream Fund Allocated Successfully', 'success');
  };

  const openPasswordDeleteModal = (v: DreamVault) => {
    if (readOnlyMode) return;
    setVaultPendingDelete(v);
    setDeletePasswordInput('');
    setDeletePasswordError('');
  };

  const handleConfirmPasswordDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultPendingDelete) return;
    if (!deletePasswordInput.trim()) {
      setDeletePasswordError('Please enter your account password to confirm deletion.');
      return;
    }
    if (
      userPasswordHash &&
      userPasswordHash !== 'google-oauth' &&
      !verifySecretAgainstStoredHash(deletePasswordInput, userPasswordHash)
    ) {
      setDeletePasswordError('Incorrect password. Please enter your valid account password.');
      return;
    }
    onDeleteDreamVault(vaultPendingDelete.id);
    setVaultPendingDelete(null);
    setDeletePasswordInput('');
    setDeletePasswordError('');
  };

  return (
    <div className="space-y-6" data-testid="investments-and-dreams-view">
      {/* Header & Summary KPIs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center">
            <span>Investments &amp; Dreams</span>
            <InfoTip
              title="Portfolio & Goals"
              text="Track Fixed Deposits (FDs), Gold, Mutual Funds, and Dream Goals. Linking a Savings Account records where the investment is held without changing your main Savings Account balance."
            />
          </h2>
        </div>
        <button
          type="button"
          disabled={readOnlyMode}
          data-testid="add-dream-vault-btn"
          onClick={() => {
            if (readOnlyMode) return;
            if (showAddForm) {
              setShowAddForm(false);
              setEditingVaultId(null);
            } else {
              openCreateForm();
            }
          }}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${accentBtnClass}`}
        >
          {readOnlyMode ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showAddForm ? 'Close Form' : 'New Investment / Goal'}
        </button>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center">
            <span>Total Invested &amp; Saved</span>
            <InfoTip text="Sum of current balances across all active investment & dream cards." />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {currency}
            {totalDreamSaved.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
            {dreamVaults.length} active {dreamVaults.length === 1 ? 'card' : 'cards'}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center">
            <span>Target Corpus</span>
            <InfoTip text="Combined target goal across all investment and dream cards." />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {currency}
            {totalDreamTarget.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {totalDreamTarget > 0
              ? `${Math.min(100, Math.round((totalDreamSaved / totalDreamTarget) * 100))}% completion`
              : '0% completion'}
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center">
            <span>Monthly Allocation</span>
            <InfoTip text="Planned monthly contribution toward your investments and goals." />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {currency}
            {totalMonthlyPlanned.toLocaleString()}/mo
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Planned monthly SIP / savings
          </div>
        </div>
      </div>

      {/* Create / Edit Dream Vault Form */}
      {showAddForm && !readOnlyMode && (
        <form
          onSubmit={handleCreateOrUpdateSubmit}
          data-testid="dream-vault-form"
          className="p-5 rounded-xl border-2 border-emerald-500/40 bg-white dark:bg-slate-900 space-y-4 shadow-md"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center">
              <span>
                {editingVaultId
                  ? 'Edit Investment / Dream Card'
                  : 'Create Investment / Dream Card'}
              </span>
              <InfoTip text="Choose an investment type (FD, Gold, Mutual Funds, or Goal) and designate which Savings Account holds it. Main account balance is not altered." />
            </h3>
            {editingVaultId && (
              <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[11px] font-bold">
                Editing Card
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label
                htmlFor="dream-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Goal / Investment Name
              </label>
              <input
                id="dream-name"
                data-testid="dream-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. HDFC Fixed Deposit / Laptop"
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label
                  htmlFor="dream-type"
                  className="flex items-center text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  <span>Investment / Storage Type</span>
                  <InfoTip text="Select Fixed Deposit (FD), Gold, Mutual Funds, or another goal type." />
                </label>
                <DropdownListEditButton
                  listKey="dream_storage_type"
                  label="Storage Type Options"
                  allEditableOptions={storageTypeList.allEditableOptions}
                  removedOptions={storageTypeList.removedOptions}
                  onSaveRemovedOptions={storageTypeList.saveRemovedOptions}
                  currentSelectedValue={storageType}
                  otherLabel="Other"
                  userPasswordHash={userPasswordHash}
                  onOptionDeletedFallback={(val) =>
                    setStorageType(val as DreamVault['storageType'])
                  }
                />
              </div>
              <select
                id="dream-type"
                data-testid="dream-type-select"
                value={storageType}
                onChange={(e) => setStorageType(e.target.value as DreamVault['storageType'])}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {storageTypeList.options.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {/* Right after Storage Type: Saved in Which Account (Savings Accounts ONLY — no Loan or Credit Card) */}
            <div>
              <label
                htmlFor="dream-saved-in-account"
                className="flex items-center text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                <span>Saved in Account (Savings)</span>
                <InfoTip text="Only Savings Accounts are listed (excludes Credit Cards & Loans). Records that this amount is held in this bank without changing your main Savings Account balance." />
              </label>
              <select
                id="dream-saved-in-account"
                data-testid="dream-saved-in-account-select"
                value={savedInAccountId}
                onChange={(e) => {
                  const chosenId = e.target.value;
                  setSavedInAccountId(chosenId);
                  const acc = savingsOnlyAccounts.find((a) => a.id === chosenId);
                  if (acc && !fdBankName.trim()) {
                    setFdBankName(acc.name);
                  }
                }}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">-- External / Unlinked --</option>
                {savingsOnlyAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} (Savings Account)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="dream-target"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Target Amount ({currency})
              </label>
              <input
                id="dream-target"
                data-testid="dream-target-input"
                type="number"
                step="0.01"
                min="1"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="50000"
                required
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {/* If FD is selected: In Which Bank option */}
          {isFdSelected && (
            <div
              data-testid="dream-fd-bank-box"
              className="p-3.5 rounded-xl bg-teal-500/5 border border-teal-500/30 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center"
            >
              <div>
                <label
                  htmlFor="dream-fd-bank-input"
                  className="flex items-center text-xs font-bold text-teal-900 dark:text-teal-200 mb-1"
                >
                  <Landmark className="w-3.5 h-3.5 mr-1.5 text-teal-600" />
                  <span>FD Bank / Institution</span>
                  <InfoTip text="Specify which bank holds this Fixed Deposit. Reflected in the Dashboard Total Investments card under Total FDs without changing your Savings Account balance." />
                </label>
                <input
                  id="dream-fd-bank-input"
                  data-testid="dream-fd-bank-input"
                  type="text"
                  value={fdBankName}
                  onChange={(e) => setFdBankName(e.target.value)}
                  placeholder="e.g. HDFC Bank / SBI / ICICI"
                  className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-teal-500/40 bg-white dark:bg-slate-950"
                />
              </div>
              {savingsOnlyAccounts.length > 0 && (
                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Quick Pick from Savings Accounts:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {savingsOnlyAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          setSavedInAccountId(acc.id);
                          setFdBankName(acc.name);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${
                          fdBankName === acc.name
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {acc.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {storageType === 'Other' && (
            <div>
              <label
                htmlFor="dream-custom-type"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Custom Storage Type Label (Other)
              </label>
              <input
                id="dream-custom-type"
                type="text"
                value={customStorageType}
                onChange={(e) => setCustomStorageType(e.target.value)}
                placeholder="e.g. Sovereign Gold Bonds / Child Education Trust"
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="dream-current"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Current Saved Balance ({currency})
              </label>
              <input
                id="dream-current"
                data-testid="dream-current-input"
                type="number"
                step="0.01"
                min="0"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label
                htmlFor="dream-monthly"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Monthly Planned Addition ({currency})
              </label>
              <input
                id="dream-monthly"
                data-testid="dream-monthly-input"
                type="number"
                step="0.01"
                min="0"
                value={monthlyPlanned}
                onChange={(e) => setMonthlyPlanned(e.target.value)}
                placeholder="1500"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label
                htmlFor="dream-date"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Target Completion Date Option
              </label>
              <div
                data-testid="dream-target-date-mode-selector"
                className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-1.5"
              >
                <button
                  type="button"
                  data-testid="dream-date-mode-custom"
                  onClick={() => setTargetDateMode('custom_date')}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                    targetDateMode === 'custom_date'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Select Date
                </button>
                <button
                  type="button"
                  data-testid="dream-date-mode-calculated"
                  onClick={() => setTargetDateMode('calculated_date')}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                    targetDateMode === 'calculated_date'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  As per Calc
                </button>
                <button
                  type="button"
                  data-testid="dream-date-mode-no-date"
                  onClick={() => setTargetDateMode('no_date')}
                  className={`px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                    targetDateMode === 'no_date'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  No Date
                </button>
              </div>

              {targetDateMode === 'custom_date' && (
                <input
                  id="dream-date"
                  data-testid="dream-custom-date-input"
                  type="date"
                  value={targetDate === 'No Date' ? '2028-12-31' : targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              )}

              {targetDateMode === 'calculated_date' && (
                <div
                  data-testid="dream-calculated-date-badge"
                  className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300 flex items-center justify-between"
                >
                  <span>
                    {liveCalculatedTarget.calculatedDateIso === 'No Date'
                      ? 'Enter Monthly Addition > 0 (or No Date)'
                      : `Auto Target: ${liveCalculatedTarget.calculatedDateIso}`}
                  </span>
                  {liveCalculatedTarget.monthsNeeded !== null && (
                    <span className="text-[10px] font-sans font-semibold text-emerald-600 dark:text-emerald-400">
                      ({liveCalculatedTarget.monthsNeeded} mo)
                    </span>
                  )}
                </div>
              )}

              {targetDateMode === 'no_date' && (
                <div
                  data-testid="dream-no-date-badge"
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-semibold text-slate-600 dark:text-slate-400"
                >
                  No Fixed Completion Date (Open-Ended Goal)
                </div>
              )}
            </div>
          </div>

          {/* Notes & Card Thumbnail Image Upload */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Goal Notes / Strategy (Optional)
              </label>
              <input
                type="text"
                data-testid="dream-notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Monthly SIP on 5th via HDFC Bank"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div {...dreamThumbDropProps}>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Card Thumbnail Image (Click, Drag & Drop, or Paste Ctrl+V)
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <label
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs font-semibold cursor-pointer transition-colors ${
                    isDraggingDreamThumb
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500'
                  }`}
                >
                  <ImageIcon className="w-4 h-4 text-emerald-500" />
                  <span>
                    {dreamImageUrl
                      ? 'Change Thumbnail (Drop/Paste)'
                      : 'Upload / Drop / Paste Photo'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleDreamImageChange}
                    className="hidden"
                  />
                </label>
                {dreamImageUrl && (
                  <div className="flex items-center gap-2">
                    <img
                      src={dreamImageUrl}
                      alt="Dream Thumbnail Preview"
                      className="w-16 h-10 object-cover rounded-lg border border-slate-300 dark:border-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => setDreamImageUrl(undefined)}
                      className="text-xs text-rose-600 hover:underline cursor-pointer"
                    >
                      Reset to Default
                    </button>
                  </div>
                )}
                {imageUploadError && (
                  <span className="text-xs text-rose-600">{imageUploadError}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAddForm(false);
                setEditingVaultId(null);
              }}
              className="px-3.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-dream-vault-btn"
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer ${accentBtnClass}`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {editingVaultId ? 'Save Updated Card' : 'Create Dream Storage'}
            </button>
          </div>
        </form>
      )}

      {/* Vault Cards Grid */}
      {dreamVaults.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              No Dream Vaults or Investment Storage Goals Yet
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Create your first Dream Vault (e.g., Emergency Fund, Real Estate Goal, Equity Portfolio, or Gold Reserve) to track progress and allocate monthly funds.
            </p>
          </div>
          <button
            type="button"
            disabled={readOnlyMode}
            onClick={openCreateForm}
            className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${accentBtnClass}`}
          >
            <Plus className="w-4 h-4" />
            Create First Dream Vault
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dreamVaults.map((v) => {
            const pct =
              v.targetAmount > 0
                ? Math.min(100, Math.round((v.currentAmount / v.targetAmount) * 1000) / 10)
                : 0;
            const remaining = Math.max(0, v.targetAmount - v.currentAmount);
            const monthsToGoal =
              v.monthlyPlannedContribution > 0
                ? Math.ceil(remaining / v.monthlyPlannedContribution)
                : null;
            const typeLabel = resolveFlexibleLabel(v.storageType, v.customStorageType);
            const thumbnailSrc =
              v.imageUrl || generateDefaultDreamThumbnailSvg(v.name, typeLabel);

            return (
              <div
                key={v.id}
                data-testid={`dream-vault-card-${v.id}`}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-4 shadow-xs"
              >
                <div className="space-y-3">
                  {/* Prominent Thumbnail Image Displayed on Every Card */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = extractImageFileFromDataTransfer(e.dataTransfer);
                      if (file) void processCardQuickThumbnailFile(v, file);
                    }}
                    onPaste={(e) => {
                      const file = extractImageFileFromDataTransfer(e.clipboardData);
                      if (file) {
                        e.preventDefault();
                        void processCardQuickThumbnailFile(v, file);
                      }
                    }}
                    tabIndex={0}
                    className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 h-36 bg-slate-900 group outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    <img
                      src={thumbnailSrc}
                      alt={v.name}
                      data-testid={`dream-vault-thumbnail-${v.id}`}
                      onError={(e) => {
                        e.currentTarget.src = generateDefaultDreamThumbnailSvg(v.name, typeLabel);
                      }}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent flex items-end justify-between p-3">
                      <span className="px-2.5 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold uppercase tracking-wider border border-white/15">
                        {typeLabel}
                      </span>
                      {!readOnlyMode && (
                        <label
                          title="Click, drag & drop, or paste image to update thumbnail"
                          className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-emerald-600 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors border border-white/15"
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>Thumbnail</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleCardQuickThumbnailUpload(v, e)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h3
                          data-testid={`dream-vault-title-${v.id}`}
                          className="text-sm font-bold text-slate-900 dark:text-white"
                        >
                          {v.name}
                        </h3>
                        <span
                          data-testid={`dream-vault-target-label-${v.id}`}
                          className="text-[11px] text-slate-500 dark:text-slate-400 block"
                        >
                          {typeLabel} ·{' '}
                          {v.targetDate === 'No Date' || v.targetDateMode === 'no_date'
                            ? 'No Fixed Date'
                            : v.targetDateMode === 'calculated_date'
                            ? `Target by ${v.targetDate} (As per Calculation)`
                            : `Target by ${v.targetDate}`}
                        </span>
                        {(v.fdBankName || v.savedInAccountId) && (
                          <span
                            data-testid={`dream-vault-bank-badge-${v.id}`}
                            className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-teal-500/10 border border-teal-500/30 text-[10px] font-bold text-teal-700 dark:text-teal-300"
                          >
                            <Landmark className="w-2.5 h-2.5" />
                            <span>
                              {v.fdBankName
                                ? `FD Bank: ${v.fdBankName}`
                                : `Saved in: ${
                                    accounts.find((a) => a.id === v.savedInAccountId)?.name ||
                                    'Savings Account'
                                  }`}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {pct}%
                      </span>
                      <button
                        type="button"
                        disabled={readOnlyMode}
                        data-testid={`edit-dream-vault-${v.id}`}
                        onClick={() => openEditForm(v)}
                        aria-label={`Edit dream vault ${v.name}`}
                        title="Edit Card Details & Thumbnail"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={readOnlyMode}
                        data-testid={`delete-dream-vault-${v.id}`}
                        onClick={() => openPasswordDeleteModal(v)}
                        aria-label={`Delete dream vault ${v.name}`}
                        title="Delete Card (Requires Password · Moves to Recycle Bin)"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs font-mono tabular-nums">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {currency}
                        {v.currentAmount.toLocaleString()} saved
                      </span>
                      <span className="text-slate-500">
                        Goal: {currency}
                        {v.targetAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Calculation breakdown */}
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-slate-400 text-[11px]">Remaining to Target</div>
                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {currency}
                        {remaining.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-[11px]">Planned Monthly</div>
                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {currency}
                        {v.monthlyPlannedContribution.toLocaleString()}/mo
                        {monthsToGoal !== null && remaining > 0 ? ` (~${monthsToGoal} mo)` : ''}
                      </div>
                    </div>
                  </div>

                  {v.notes && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                      &ldquo;{v.notes}&rdquo;
                    </div>
                  )}
                </div>

                {/* Contribute action */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                  {contributingVaultId === v.id && !readOnlyMode ? (
                    <form
                      onSubmit={(e) => handleContributeSubmit(e, v.id)}
                      className="space-y-2.5"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={contributeAmount}
                          onChange={(e) => setContributeAmount(e.target.value)}
                          placeholder={`Amount (${currency})`}
                          required
                          className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <select
                          value={contributeAccountId}
                          onChange={(e) => setContributeAccountId(e.target.value)}
                          className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              From: {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setContributingVaultId(null)}
                          className="px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className={`px-3 py-1 text-xs font-semibold rounded ${accentBtnClass}`}
                        >
                          Record Contribution
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        disabled={readOnlyMode}
                        onClick={() => {
                          if (readOnlyMode) return;
                          setContributingVaultId(v.id);
                          setContributeAmount(String(v.monthlyPlannedContribution || ''));
                        }}
                        className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        {readOnlyMode
                          ? 'Account On Hold (Read-Only)'
                          : 'Allocate Funds into Dream Storage'}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>

                      {!readOnlyMode && (
                        <button
                          type="button"
                          onClick={() => openEditForm(v)}
                          className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit Card</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Password Confirmation Modal before Deleting any Dream / Investment Card */}
      {vaultPendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="dream-delete-password-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Password Confirmation Required
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Move &ldquo;{vaultPendingDelete.name}&rdquo; safely to the Recycle Bin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVaultPendingDelete(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              For your security, please enter your account password to confirm deleting this card.
              The deleted card will be safely moved to the <strong>Recycle Bin</strong> where you can
              restore it anytime.
            </p>

            {deletePasswordError && (
              <div
                data-testid="dream-delete-password-error"
                className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-300"
              >
                {deletePasswordError}
              </div>
            )}

            <form onSubmit={handleConfirmPasswordDelete} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Enter Your Account Password
                </label>
                <input
                  type="password"
                  data-testid="dream-delete-password-input"
                  value={deletePasswordInput}
                  onChange={(e) => {
                    setDeletePasswordInput(e.target.value);
                    setDeletePasswordError('');
                  }}
                  placeholder="Enter password to confirm"
                  autoFocus
                  required
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVaultPendingDelete(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-dream-delete-btn"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirm &amp; Move to Recycle Bin</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
