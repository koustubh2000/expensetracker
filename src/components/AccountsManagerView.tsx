import React, { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import {
  AccountType,
  RecurringPaymentItem,
  TransactionRecord,
  WalletAccount,
} from '../types/finance';
import {
  CARD_COLOR_SWATCHES,
  generateBankFallbackSvgDataUrl,
  maskAccountNumber,
  resolveBankLogoFromName,
} from '../utils/bankLogos';
import {
  calculateAccountBalance,
  calculateAccountRecurringProjection,
  resolveFlexibleLabel,
  verifySecretAgainstStoredHash,
} from '../utils/financeRules';
import { compressImageFileToDataUrl } from '../utils/localVaultStorage';
import { CardColorMixerButton } from './CardColorMixerPopover';
import {
  DropdownListEditButton,
  useEditableDropdownOptions,
} from './DropdownListEditButton';
import { useImageDragDropAndPaste } from '../utils/imageUploadHelpers';

interface AccountsManagerViewProps {
  accounts: WalletAccount[];
  transactions: TransactionRecord[];
  recurringPayments: RecurringPaymentItem[];
  currency: string;
  readOnlyMode?: boolean;
  userPasswordHash?: string;
  onSaveAccount: (account: WalletAccount, isEdit: boolean) => void;
  onDeleteAccount: (accountId: string) => void;
}

const ACCOUNT_TYPES: AccountType[] = [
  'Savings Account',
  'Credit Card',
  'Loan Account',
  'Bank Account',
  'Cash Wallet',
  'Savings Vault',
  'Investment Account',
  'Digital Wallet',
  'Other',
];

const POPULAR_BANKS_QUICK_PICK = [
  'State Bank of India (SBI)',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Bank of Baroda',
  'Punjab National Bank (PNB)',
  'Canara Bank',
  'IDFC First Bank',
  'IndusInd Bank',
  'Yes Bank',
  'JPMorgan Chase',
  'Citibank',
  'HSBC Bank',
  'Paytm Wallet',
  'PhonePe UPI',
  'Google Pay (GPay)',
];

export const AccountsManagerView: React.FC<AccountsManagerViewProps> = ({
  accounts,
  transactions,
  recurringPayments,
  currency,
  readOnlyMode = false,
  userPasswordHash = '',
  onSaveAccount,
  onDeleteAccount,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [revealedNumbers, setRevealedNumbers] = useState<Record<string, boolean>>({});
  const [useRemoteFavicon, setUseRemoteFavicon] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Password Confirmation before Account Card Deletion
  const [accountPendingDelete, setAccountPendingDelete] = useState<WalletAccount | null>(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');

  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<AccountType>('Savings Account');
  const [accCustomType, setAccCustomType] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accBranchName, setAccBranchName] = useState('');
  const [accBankDetails, setAccBankDetails] = useState('');
  const [accBankLogoUrl, setAccBankLogoUrl] = useState('');
  const [accInitialBalance, setAccInitialBalance] = useState('0');
  const [accColor, setAccColor] = useState(CARD_COLOR_SWATCHES[0].hex);
  const [accIncludeInNetWorth, setAccIncludeInNetWorth] = useState(true);

  const formatMoney = (val: number) =>
    `${currency}${val.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const openAddAccountModal = () => {
    if (readOnlyMode) return;
    setEditingAccountId(null);
    setAccName('');
    setAccType('Savings Account');
    setAccCustomType('');
    setAccNumber('');
    setAccBranchName('');
    setAccBankDetails('');
    setAccBankLogoUrl('');
    setAccInitialBalance('0');
    setAccColor(CARD_COLOR_SWATCHES[1].hex);
    setAccIncludeInNetWorth(true);
    setUseRemoteFavicon(false);
    setShowModal(true);
  };

  const openEditAccountModal = (acc: WalletAccount) => {
    if (readOnlyMode) return;
    setEditingAccountId(acc.id);
    setAccName(acc.name);
    setAccType(acc.type);
    setAccCustomType(acc.customType || '');
    setAccNumber(acc.accountNumber || '');
    setAccBranchName(acc.branchName || '');
    setAccBankDetails(acc.bankDetails || '');
    setAccBankLogoUrl(acc.bankLogoUrl || '');
    setAccInitialBalance(String(acc.initialBalance));
    setAccColor(acc.color || CARD_COLOR_SWATCHES[1].hex);
    setAccIncludeInNetWorth(acc.includeInNetWorth !== false);
    setUseRemoteFavicon(Boolean(acc.bankLogoUrl?.startsWith('http')));
    setShowModal(true);
  };

  const handleBankNameChange = (newName: string) => {
    setAccName(newName);
    const synced = resolveBankLogoFromName(newName);
    if (synced.logoUrl) {
      setAccBankLogoUrl(
        useRemoteFavicon && synced.remoteFaviconUrl
          ? synced.remoteFaviconUrl
          : synced.logoUrl
      );
    }
    if (synced.suggestedColor) {
      setAccColor(synced.suggestedColor);
    }
  };

  const handleSyncLogoClick = () => {
    const synced = resolveBankLogoFromName(accName || 'Bank');
    if (synced.logoUrl) {
      setAccBankLogoUrl(
        useRemoteFavicon && synced.remoteFaviconUrl
          ? synced.remoteFaviconUrl
          : synced.logoUrl
      );
    }
    if (synced.suggestedColor) {
      setAccColor(synced.suggestedColor);
    }
  };

  const {
    options: editableAccountTypes,
    allEditableOptions: allEditableAccountTypes,
    removedOptions: removedAccountTypes,
    saveRemovedOptions: saveRemovedAccountTypes,
  } = useEditableDropdownOptions('account_type', ACCOUNT_TYPES, [], 'Other');

  const processCustomLogoFile = async (file: File) => {
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 160, 0.9, true);
      setAccBankLogoUrl(dataUrl);
      if (editingAccountId) {
        const existing = accounts.find((a) => a.id === editingAccountId);
        if (existing) {
          onSaveAccount(
            {
              ...existing,
              name: accName.trim() || existing.name,
              bankLogoUrl: dataUrl,
            },
            true
          );
        }
      }
    } catch {
      // ignore
    }
  };

  const { zoneProps: logoDropPasteProps } = useImageDragDropAndPaste(
    processCustomLogoFile,
    showModal
  );

  const handleCustomLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processCustomLogoFile(file);
    }
  };

  const handleConfirmDeleteAccountWithPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountPendingDelete) return;
    if (!deletePasswordInput.trim()) {
      setDeletePasswordError('Please enter your account password to confirm deletion.');
      return;
    }
    if (
      userPasswordHash &&
      userPasswordHash !== 'google-oauth' &&
      !verifySecretAgainstStoredHash(deletePasswordInput, userPasswordHash)
    ) {
      setDeletePasswordError('Incorrect password. Account deletion cancelled.');
      return;
    }
    onDeleteAccount(accountPendingDelete.id);
    setAccountPendingDelete(null);
    setDeletePasswordInput('');
    setDeletePasswordError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    const synced = resolveBankLogoFromName(accName.trim());
    const finalLogo =
      accBankLogoUrl.trim() ||
      synced.logoUrl ||
      generateBankFallbackSvgDataUrl(accName.trim(), accColor);

    const payload: WalletAccount = {
      id: editingAccountId || `acc-${Date.now()}`,
      name: accName.trim(),
      type: accType,
      customType: accType === 'Other' ? accCustomType.trim() : undefined,
      accountNumber: accNumber.trim() || undefined,
      branchName: accBranchName.trim() || undefined,
      bankDetails: accBankDetails.trim() || undefined,
      bankLogoUrl: finalLogo,
      currency,
      initialBalance: Number(accInitialBalance) || 0,
      color: accColor || synced.suggestedColor || '#1e3a8a',
      includeInNetWorth: accIncludeInNetWorth,
    };

    onSaveAccount(payload, Boolean(editingAccountId));
    setShowModal(false);
    setEditingAccountId(null);
  };

  const totalActiveBalance = accounts
    .filter((a) => a.includeInNetWorth !== false)
    .reduce((sum, a) => sum + calculateAccountBalance(a, transactions), 0);

  const liveLogoMeta = resolveBankLogoFromName(accName || 'Bank');
  const previewLogoSrc =
    accBankLogoUrl ||
    liveLogoMeta.logoUrl ||
    generateBankFallbackSvgDataUrl(accName || 'Bank', accColor);

  return (
    <div data-testid="accounts-manager-view" className="space-y-6">
      {/* Top Header Banner */}
      <div className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Bank Accounts &amp; Wallets Manager
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add, edit, and manage bank accounts and wallets with real-time official bank logo
                syncing and projected balance tracking.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Total Counted Balance
            </div>
            <div className="text-sm font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatMoney(totalActiveBalance)}
            </div>
          </div>

          {!readOnlyMode && (
            <button
              type="button"
              data-testid="accounts-tab-add-account-btn"
              onClick={openAddAccountModal}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Bank Account / Wallet</span>
            </button>
          )}
        </div>
      </div>

      {/* Add / Edit Bank Account Modal / Card */}
      {showModal && !readOnlyMode && (
        <form
          onSubmit={handleSubmit}
          data-testid="account-manager-form"
          className="p-5 sm:p-6 rounded-2xl border-2 border-emerald-500/50 bg-white dark:bg-slate-900 space-y-5 shadow-xl"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <img
                src={previewLogoSrc}
                alt="Synced Bank Logo Preview"
                data-testid="live-synced-bank-logo-preview"
                onError={(e) => {
                  e.currentTarget.src = generateBankFallbackSvgDataUrl(
                    accName || 'Bank',
                    accColor
                  );
                }}
                className="w-12 h-12 rounded-xl object-contain border border-slate-200 dark:border-slate-700 bg-white p-1 shadow-xs"
              />
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {editingAccountId ? 'Edit Bank Account / Wallet' : 'Add New Bank Account / Wallet'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {liveLogoMeta.domain
                    ? `Official Bank Logo Synced (${liveLogoMeta.domain})`
                    : 'Type a bank name below (e.g., SBI, HDFC, ICICI, Axis, Kotak) to auto-sync its official logo'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncLogoClick}
                className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sync Official Logo</span>
              </button>
              <label
                {...logoDropPasteProps}
                title="Click, Drag & Drop, or Paste (Ctrl+V) custom logo image"
                className="px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload / Drop / Paste Logo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCustomLogoUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Quick Pick Popular Indian & Global Banks */}
          <div>
            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
              Quick Select Official Bank Brand (Auto-Syncs Logo &amp; Brand Color):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_BANKS_QUICK_PICK.map((bankLabel) => (
                <button
                  key={bankLabel}
                  type="button"
                  onClick={() => handleBankNameChange(bankLabel)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-400 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                >
                  {bankLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Bank / Wallet Name
              </label>
              <input
                type="text"
                data-testid="account-name-input"
                value={accName}
                onChange={(e) => handleBankNameChange(e.target.value)}
                placeholder="e.g. HDFC Bank Savings / SBI"
                required
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Account Category / Type (Includes Other)
                </label>
                <DropdownListEditButton
                  listKey="account_type"
                  label="Account Category / Type"
                  allEditableOptions={allEditableAccountTypes}
                  removedOptions={removedAccountTypes}
                  onSaveRemovedOptions={saveRemovedAccountTypes}
                  currentSelectedValue={accType}
                  onOptionDeletedFallback={(nextFirst) => setAccType(nextFirst as AccountType)}
                  userPasswordHash={userPasswordHash}
                />
              </div>
              <select
                data-testid="account-type-select"
                value={accType}
                onChange={(e) => setAccType(e.target.value as AccountType)}
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {editableAccountTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {accType === 'Other' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Custom Account Type Label
                </label>
                <input
                  type="text"
                  value={accCustomType}
                  onChange={(e) => setAccCustomType(e.target.value)}
                  placeholder="e.g. Gold Bullion Vault"
                  required
                  className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Account / Card Number (Masked on Dashboard)
              </label>
              <input
                type="text"
                data-testid="account-number-input"
                value={accNumber}
                onChange={(e) => setAccNumber(e.target.value)}
                placeholder="e.g. 501004821104"
                className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Opening / Initial Balance ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                data-testid="account-initial-balance-input"
                value={accInitialBalance}
                onChange={(e) => setAccInitialBalance(e.target.value)}
                required
                className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Branch Name / IFSC (Optional)
              </label>
              <input
                type="text"
                value={accBranchName}
                onChange={(e) => setAccBranchName(e.target.value)}
                placeholder="e.g. Nariman Point · HDFC000001"
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Notes / UPI ID (Optional)
              </label>
              <input
                type="text"
                value={accBankDetails}
                onChange={(e) => setAccBankDetails(e.target.value)}
                placeholder="e.g. Primary Salary & Auto-Debit Account"
                className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {/* Card Color Swatches & Net Worth Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Card Accent Color:
              </span>
              {CARD_COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  onClick={() => setAccColor(swatch.hex)}
                  title={swatch.label}
                  style={{ backgroundColor: swatch.hex }}
                  className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                    accColor === swatch.hex
                      ? 'ring-2 ring-offset-2 ring-emerald-500 scale-110'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={accIncludeInNetWorth}
                onChange={(e) => setAccIncludeInNetWorth(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Count in "Total Counted in All My Accounts" on Dashboard</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowModal(false);
                setEditingAccountId(null);
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-account-submit-btn"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{editingAccountId ? 'Update Account' : 'Save Bank Account'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Account Category / Type Filter Bar */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="account-type-filter-bar">
          <button
            type="button"
            onClick={() => setTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
              typeFilter === 'ALL'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            All Accounts ({accounts.length})
          </button>
          {ACCOUNT_TYPES.map((t) => {
            const count = accounts.filter((a) => a.type === t).length;
            if (count === 0 && t !== 'Savings Account' && t !== 'Credit Card' && t !== 'Loan Account') {
              return null;
            }
            return (
              <button
                key={t}
                type="button"
                data-testid={`filter-account-type-${t.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                  typeFilter === t
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                {t} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Bank & Wallet Cards Grid */}
      {accounts.length === 0 ? (
        <div className="p-10 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3">
          <Wallet className="w-10 h-10 text-emerald-500 mx-auto" />
          <div className="text-base font-extrabold text-slate-900 dark:text-white">
            No Bank Accounts or Wallets Added Yet
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Click &ldquo;Add Bank Account / Wallet&rdquo; above to add your bank accounts (SBI,
            HDFC, ICICI, Axis, Kotak, etc.) or cash wallets. Official logos sync automatically!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts
            .filter((acc) => (typeFilter === 'ALL' ? true : acc.type === typeFilter))
            .map((acc) => {
            const projection = calculateAccountRecurringProjection(
              acc,
              transactions,
              recurringPayments
            );
            const syncedLogo = resolveBankLogoFromName(acc.name);
            const logoSrc =
              acc.bankLogoUrl ||
              syncedLogo.logoUrl ||
              generateBankFallbackSvgDataUrl(acc.name, acc.color);
            const isRevealed = Boolean(revealedNumbers[acc.id]);

            return (
              <div
                key={acc.id}
                data-testid={`account-card-${acc.id}`}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs flex flex-col justify-between"
              >
                <div
                  className="p-5 text-white relative"
                  style={{
                    background: `linear-gradient(135deg, ${acc.color || '#1e3a8a'} 0%, #0f172a 100%)`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={logoSrc}
                        alt={acc.name}
                        data-testid={`account-logo-${acc.id}`}
                        onError={(e) => {
                          e.currentTarget.src = generateBankFallbackSvgDataUrl(
                            acc.name,
                            acc.color
                          );
                        }}
                        className="w-11 h-11 rounded-xl object-contain bg-white p-1 shadow-md shrink-0"
                      />
                      <div>
                        <h3 className="text-sm font-extrabold tracking-tight text-white">
                          {acc.name}
                        </h3>
                        <span className="text-[11px] text-white/80 font-medium">
                          {resolveFlexibleLabel(acc.type, acc.customType)}
                        </span>
                      </div>
                    </div>

                    {!readOnlyMode && (
                      <div className="flex items-center gap-1">
                        <CardColorMixerButton
                          currentColor={acc.color || '#1e3a8a'}
                          defaultColor={syncedLogo.suggestedColor || '#1e3a8a'}
                          cardLabel={acc.name}
                          testId={`accounts-card-color-mixer-btn-${acc.id}`}
                          onChangeColor={(newHex) =>
                            onSaveAccount({ ...acc, color: newHex }, true)
                          }
                        />
                        <button
                          type="button"
                          onClick={() => openEditAccountModal(acc)}
                          title="Edit Account"
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          data-testid={`delete-account-btn-${acc.id}`}
                          onClick={() => {
                            setAccountPendingDelete(acc);
                            setDeletePasswordInput('');
                            setDeletePasswordError('');
                          }}
                          title="Move Account to Recycle Bin (Password Required)"
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-rose-500/40 text-white cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Masked Account Number Row */}
                  <div className="mt-4 flex items-center justify-between text-xs text-white/85 font-mono tabular-nums">
                    <span>
                      A/C:{' '}
                      <strong>
                        {isRevealed
                          ? acc.accountNumber || 'Not Provided'
                          : maskAccountNumber(acc.accountNumber)}
                      </strong>
                    </span>
                    {acc.accountNumber && (
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedNumbers((prev) => ({
                            ...prev,
                            [acc.id]: !prev[acc.id],
                          }))
                        }
                        className="text-[11px] text-white/80 hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        {isRevealed ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Mask</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Show</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Current Actual Balance */}
                  <div className="mt-4 pt-3 border-t border-white/15 flex items-baseline justify-between">
                    <span className="text-[11px] uppercase tracking-wider text-white/75 font-bold">
                      Current Balance
                    </span>
                    <span
                      data-testid={`account-actual-balance-${acc.id}`}
                      className="text-xl font-extrabold font-mono tabular-nums text-white"
                    >
                      {formatMoney(projection.actualBalance)}
                    </span>
                  </div>
                </div>

                {/* Bottom Projection & Metadata Footer */}
                <div className="p-4 bg-slate-50/70 dark:bg-slate-950/60 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                    <span>Upcoming Recurring Debits ({projection.pendingItemsCount}):</span>
                    <span className="font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                      -{formatMoney(projection.willBeDebitedTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80 dark:border-slate-800">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Projected Balance After Debit:
                    </span>
                    <span
                      data-testid={`account-projected-balance-${acc.id}`}
                      className="font-mono tabular-nums font-extrabold text-emerald-600 dark:text-emerald-400"
                    >
                      {formatMoney(projection.projectedBalanceAfterDebit)}
                    </span>
                  </div>
                  {(acc.branchName || acc.bankDetails) && (
                    <div className="pt-1 text-[11px] text-slate-400 truncate">
                      {acc.branchName} {acc.bankDetails ? `· ${acc.bankDetails}` : ''}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Password Confirmation Modal before Deleting a Bank Account / Wallet Card */}
      {accountPendingDelete && (
        <div
          data-testid="delete-account-password-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="delete-account-modal-title"
                    className="text-sm font-extrabold text-slate-900 dark:text-white"
                  >
                    Confirm Account Card Deletion
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Password verification required to move to Recycle Bin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAccountPendingDelete(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDeleteAccountWithPassword} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  {accountPendingDelete.name}
                </div>
                <div className="text-slate-500">
                  Type: {accountPendingDelete.type} · Opening Balance:{' '}
                  <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                    {formatMoney(accountPendingDelete.initialBalance)}
                  </strong>
                </div>
              </div>

              <div>
                <label
                  htmlFor="delete-account-password-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Enter Your Account Password to Confirm Deletion
                </label>
                <input
                  id="delete-account-password-input"
                  data-testid="delete-account-password-input"
                  type="password"
                  value={deletePasswordInput}
                  onChange={(e) => {
                    setDeletePasswordInput(e.target.value);
                    setDeletePasswordError('');
                  }}
                  placeholder="Enter your login password"
                  autoFocus
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              {deletePasswordError && (
                <div
                  data-testid="delete-account-password-error"
                  className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-400"
                >
                  {deletePasswordError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAccountPendingDelete(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-delete-account-btn"
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
