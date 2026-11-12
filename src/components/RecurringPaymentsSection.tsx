import React, { useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  Plus,
  Repeat,
  ShieldAlert,
  Trash2,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import {
  PersonProfile,
  RecurringFrequency,
  RecurringPaymentItem,
  RecurringPaymentStatus,
  TransactionRecord,
  WalletAccount,
} from '../types/finance';
import {
  calculateAccountBalance,
  calculateAccountRecurringProjection,
  DEFAULT_CATEGORIES,
  verifySecretAgainstStoredHash,
} from '../utils/financeRules';
import {
  generateBankFallbackSvgDataUrl,
  maskAccountNumber,
  resolveBankLogoFromName,
} from '../utils/bankLogos';
import {
  DropdownListEditButton,
  useEditableDropdownOptions,
} from './DropdownListEditButton';
import { InfoTip } from './InfoTip';

interface RecurringPaymentsSectionProps {
  accounts: WalletAccount[];
  transactions: TransactionRecord[];
  recurringPayments: RecurringPaymentItem[];
  people?: PersonProfile[];
  currency: string;
  readOnlyMode?: boolean;
  viewOnly?: boolean;
  filterAccountId?: string;
  userPasswordHash?: string;
  onNavigateToRecordsRecurring?: () => void;
  onAddOrUpdateRecurring: (
    item: RecurringPaymentItem,
    previousStatus?: RecurringPaymentStatus
  ) => void;
  onToggleRecurringStatus: (
    itemId: string,
    targetStatus: RecurringPaymentStatus
  ) => void;
  onDeleteRecurring: (itemId: string) => void;
  onAutoCreatePerson?: (personInput: Omit<PersonProfile, 'id'>) => PersonProfile;
}

const FREQUENCIES: RecurringFrequency[] = ['Weekly', 'Monthly', 'Quarterly', 'Yearly'];

const PERSON_CONTEXT_ROLES: Array<{
  label: string;
  relationship: PersonProfile['relationship'];
  customRelationship?: string;
}> = [
  { label: 'Maid / Domestic Help', relationship: 'Other', customRelationship: 'Maid / Domestic Help' },
  { label: 'Landlord / Property Owner', relationship: 'Lender', customRelationship: 'Landlord' },
  { label: 'Employee / Staff Member', relationship: 'Colleague', customRelationship: 'Employee / Staff' },
  { label: 'Service Provider / Vendor', relationship: 'Client', customRelationship: 'Service Provider' },
  { label: 'Family Member', relationship: 'Family' },
  { label: 'Friend', relationship: 'Friend' },
  { label: 'Tenant', relationship: 'Tenant' },
  { label: 'Other (Custom Role)', relationship: 'Other' },
];

export const RecurringPaymentsSection: React.FC<RecurringPaymentsSectionProps> = ({
  accounts,
  transactions,
  recurringPayments,
  people = [],
  currency,
  readOnlyMode = false,
  viewOnly = false,
  filterAccountId = 'ALL',
  userPasswordHash = '',
  onNavigateToRecordsRecurring,
  onAddOrUpdateRecurring,
  onToggleRecurringStatus,
  onDeleteRecurring,
  onAutoCreatePerson,
}) => {
  const [isAddingInline, setIsAddingInline] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>(filterAccountId);

  // Password Confirmation before Recurring Item Deletion
  const [recurringPendingDelete, setRecurringPendingDelete] =
    useState<RecurringPaymentItem | null>(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');

  // Inline Row Form State
  const [title, setTitle] = useState('');
  const [flowType, setFlowType] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState('Housing & Rent');
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('Monthly');
  const [dueDayLabel, setDueDayLabel] = useState('5th of Month');
  const [linkedAccountId, setLinkedAccountId] = useState<string>(accounts[0]?.id || '');
  const [status, setStatus] = useState<RecurringPaymentStatus>('will_be_debited');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const {
    options: editableRecCategories,
    allEditableOptions: allEditableRecCategories,
    removedOptions: removedRecCategories,
    saveRemovedOptions: saveRemovedRecCategories,
  } = useEditableDropdownOptions(
    `recurring_category_${flowType}`,
    flowType === 'income' ? DEFAULT_CATEGORIES.income : DEFAULT_CATEGORIES.expense,
    [],
    'Other'
  );

  // Payee Auto-Sync Context Prompt Modal State ("Who is this person?")
  const [pendingRecurringPayload, setPendingRecurringPayload] = useState<{
    item: RecurringPaymentItem;
    previousStatus?: RecurringPaymentStatus;
  } | null>(null);
  const [contextRoleIdx, setContextRoleIdx] = useState<number>(0);
  const [contextCustomRole, setContextCustomRole] = useState<string>('');
  const [contextPhone, setContextPhone] = useState<string>('');
  const [contextNotes, setContextNotes] = useState<string>('');

  const isStrictlyReadOnly = readOnlyMode || viewOnly;

  const formatMoney = (val: number) =>
    `${currency}${val.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const effectiveFilter = filterAccountId !== 'ALL' ? filterAccountId : selectedAccountFilter;

  const filteredItems = (recurringPayments || []).filter((item) => {
    if (effectiveFilter === 'ALL') return true;
    return item.linkedAccountId === effectiveFilter;
  });

  const totalWillBeDebited = filteredItems
    .filter((i) => i.status === 'will_be_debited')
    .reduce((sum, i) => sum + i.amount, 0);

  const totalAlreadyPaid = filteredItems
    .filter((i) => i.status === 'already_paid')
    .reduce((sum, i) => sum + i.amount, 0);

  const startInlineAdd = () => {
    if (isStrictlyReadOnly) return;
    setEditingId(null);
    setTitle('');
    setFlowType('expense');
    setCategory('Housing & Rent');
    setPayeeName('');
    setAmount('');
    setFrequency('Monthly');
    setDueDayLabel('5th of Month');
    setLinkedAccountId(
      effectiveFilter !== 'ALL' ? effectiveFilter : accounts[0]?.id || ''
    );
    setStatus('will_be_debited');
    setNotes('');
    setFormError('');
    setIsAddingInline(true);
  };

  const startInlineEdit = (item: RecurringPaymentItem) => {
    if (isStrictlyReadOnly) return;
    setIsAddingInline(false);
    setEditingId(item.id);
    setTitle(item.title);
    setFlowType(item.flowType || 'expense');
    setCategory(item.category || 'Housing & Rent');
    setPayeeName(item.payeeName || '');
    setAmount(String(item.amount));
    setFrequency(item.frequency);
    setDueDayLabel(item.dueDayLabel || '5th of Month');
    setLinkedAccountId(item.linkedAccountId || accounts[0]?.id || '');
    setStatus(item.status);
    setNotes(item.notes || '');
    setFormError('');
  };

  const cancelInlineRow = () => {
    setIsAddingInline(false);
    setEditingId(null);
    setFormError('');
  };

  const handleSaveInlineRow = () => {
    setFormError('');
    const numAmount = Number(amount);
    if (!title.trim() || Number.isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid payment title and positive amount.');
      return;
    }
    const targetAccId = linkedAccountId || accounts[0]?.id || '';
    if (!targetAccId) {
      setFormError('Please create a Bank Account or Wallet in the Accounts tab first.');
      return;
    }

    const existing = editingId
      ? recurringPayments.find((r) => r.id === editingId)
      : undefined;

    const trimmedPayee = payeeName.trim();
    const matchedPerson = trimmedPayee
      ? people.find((p) => p.name.trim().toLowerCase() === trimmedPayee.toLowerCase())
      : undefined;

    const payload: RecurringPaymentItem = {
      id: editingId || `rec-${Date.now()}`,
      title: title.trim(),
      flowType,
      category: category || 'Utilities & Bills',
      amount: Math.round(numAmount * 100) / 100,
      frequency,
      dueDayLabel: dueDayLabel.trim() || '5th of Month',
      linkedAccountId: targetAccId,
      status,
      payeeName: trimmedPayee || undefined,
      linkedPersonId: matchedPerson?.id || existing?.linkedPersonId,
      lastPaidDate: existing?.lastPaidDate,
      lastPaidTransactionId: existing?.lastPaidTransactionId,
      notes: notes.trim() || undefined,
    };

    // If a person's name was entered and they don't exist in Receivables & Payables yet, prompt "Who is this person?"
    if (trimmedPayee && !matchedPerson && onAutoCreatePerson) {
      setPendingRecurringPayload({
        item: payload,
        previousStatus: existing?.status,
      });
      // Suggest default role based on title/category
      const lowerTitle = payload.title.toLowerCase();
      if (lowerTitle.includes('maid') || lowerTitle.includes('cook') || lowerTitle.includes('driver')) {
        setContextRoleIdx(0);
      } else if (lowerTitle.includes('rent') || lowerTitle.includes('landlord')) {
        setContextRoleIdx(1);
      } else {
        setContextRoleIdx(0);
      }
      setContextCustomRole('');
      setContextPhone('');
      setContextNotes(`Auto-synced from Recurring Payment: ${payload.title} (${currency}${payload.amount}/${payload.frequency})`);
      return;
    }

    onAddOrUpdateRecurring(payload, existing?.status);
    setIsAddingInline(false);
    setEditingId(null);
  };

  const handleConfirmPayeeContextPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingRecurringPayload) return;
    const rolePreset = PERSON_CONTEXT_ROLES[contextRoleIdx] || PERSON_CONTEXT_ROLES[0];
    const customRel =
      rolePreset.label === 'Other (Custom Role)'
        ? contextCustomRole.trim() || 'Recurring Payee'
        : rolePreset.customRelationship;

    let createdPersonId: string | undefined;
    if (onAutoCreatePerson && pendingRecurringPayload.item.payeeName) {
      const created = onAutoCreatePerson({
        name: pendingRecurringPayload.item.payeeName,
        relationship: rolePreset.relationship,
        customRelationship: customRel,
        phone: contextPhone.trim() || undefined,
        notes:
          contextNotes.trim() ||
          `Recurring Payee for ${pendingRecurringPayload.item.title} (${pendingRecurringPayload.item.frequency})`,
      });
      createdPersonId = created.id;
    }

    onAddOrUpdateRecurring(
      {
        ...pendingRecurringPayload.item,
        linkedPersonId: createdPersonId,
      },
      pendingRecurringPayload.previousStatus
    );
    setPendingRecurringPayload(null);
    setIsAddingInline(false);
    setEditingId(null);
  };

  const renderInlineEditorRow = (rowTestId: string) => (
    <tr
      data-testid={rowTestId}
      className="bg-emerald-500/5 dark:bg-emerald-950/30 border-y-2 border-emerald-500/40"
    >
      <td className="p-2.5 align-top space-y-1.5">
        <select
          data-testid="recurring-flow-type-select"
          value={flowType}
          onChange={(e) => {
            const nextFlow = e.target.value as 'expense' | 'income';
            setFlowType(nextFlow);
            setCategory(
              nextFlow === 'income'
                ? DEFAULT_CATEGORIES.income[0]
                : DEFAULT_CATEGORIES.expense[0]
            );
          }}
          className="w-full px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          <option value="expense">Expected Outflow (Expense)</option>
          <option value="income">Recurring Income (Inflow)</option>
        </select>
        <input
          type="text"
          data-testid="recurring-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Apartment Rent / Salary"
          className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        />
        <div className="flex items-center gap-1">
          <select
            data-testid="recurring-category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-2.5 py-1 text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            {editableRecCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <DropdownListEditButton
            listKey={`recurring_category_${flowType}`}
            label="Recurring Categories"
            allEditableOptions={allEditableRecCategories}
            removedOptions={removedRecCategories}
            onSaveRemovedOptions={saveRemovedRecCategories}
            currentSelectedValue={category}
            onOptionDeletedFallback={(nextFirst) => setCategory(nextFirst)}
            userPasswordHash={userPasswordHash}
          />
        </div>
      </td>

      <td className="p-2.5 align-top">
        <input
          type="text"
          data-testid="recurring-payee-name-input"
          value={payeeName}
          onChange={(e) => setPayeeName(e.target.value)}
          placeholder="Optional: Person Name (e.g. Sunita Maid)"
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        />
        <div className="text-[10px] text-slate-500 mt-1">
          Optional — Auto-syncs to Receivables &amp; Payables
        </div>
      </td>

      <td className="p-2.5 align-top">
        <select
          data-testid="recurring-frequency-select"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
          className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          {FREQUENCIES.map((freq) => (
            <option key={freq} value={freq}>
              {freq}
            </option>
          ))}
        </select>
        <input
          type="text"
          data-testid="recurring-due-day-input"
          value={dueDayLabel}
          onChange={(e) => setDueDayLabel(e.target.value)}
          placeholder="e.g. 5th of Month"
          className="w-full mt-1.5 px-2.5 py-1 text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        />
      </td>

      <td className="p-2.5 align-top">
        <select
          data-testid="recurring-account-select"
          value={linkedAccountId}
          onChange={(e) => setLinkedAccountId(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} ({maskAccountNumber(acc.accountNumber)})
            </option>
          ))}
        </select>
      </td>

      <td className="p-2.5 align-top text-right">
        <input
          type="number"
          step="0.01"
          min="0.01"
          data-testid="recurring-amount-input"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums font-bold text-right rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        />
      </td>

      <td className="p-2.5 align-top">
        <select
          data-testid="recurring-inline-status-select"
          value={status}
          onChange={(e) => setStatus(e.target.value as RecurringPaymentStatus)}
          className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
        >
          {flowType === 'income' ? (
            <>
              <option value="will_be_debited">Will Be Credited</option>
              <option value="already_paid">Credited</option>
            </>
          ) : (
            <>
              <option value="will_be_debited">Will Be Debited</option>
              <option value="already_paid">Already Paid</option>
            </>
          )}
        </select>
      </td>

      <td className="p-2.5 align-top text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            data-testid="save-recurring-payment-btn"
            onClick={handleSaveInlineRow}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
          <button
            type="button"
            onClick={cancelInlineRow}
            className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <section
      data-testid="recurring-compulsory-payments-section"
      className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5 shadow-xs"
    >
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Repeat className="w-4 h-4" />
            </div>
            <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center">
              <span>Recurring &amp; Compulsory Payments</span>
              <InfoTip
                title="Recurring Commitments"
                text={
                  viewOnly
                    ? 'Preview of scheduled monthly expenses (Will Be Debited / Already Paid) and recurring income (Will Be Credited / Credited). Manage items in the Records tab.'
                    : 'Track monthly bills and recurring income (e.g. Salary). Toggling to Already Paid or Credited automatically updates your linked bank account and logs a record.'
                }
              />
            </h3>
            {viewOnly && (
              <span
                data-testid="recurring-view-only-badge"
                className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700"
              >
                <Eye className="w-3 h-3" />
                <span>View-Only</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {filterAccountId === 'ALL' && accounts.length > 0 && (
            <select
              aria-label="Filter recurring payments by bank account"
              value={selectedAccountFilter}
              onChange={(e) => setSelectedAccountFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Linked Accounts ({accounts.length})</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({maskAccountNumber(acc.accountNumber)})
                </option>
              ))}
            </select>
          )}

          {viewOnly && onNavigateToRecordsRecurring && (
            <button
              type="button"
              data-testid="dashboard-manage-recurring-in-records-btn"
              onClick={onNavigateToRecordsRecurring}
              className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>Manage in Records</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {!isStrictlyReadOnly && (
            <button
              type="button"
              data-testid="add-recurring-payment-btn"
              onClick={startInlineAdd}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Recurring Item</span>
            </button>
          )}
        </div>
      </div>

      {/* Dual-Status Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/25 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center">
              <span>Upcoming (Will Be Debited / Credited)</span>
              <InfoTip text="Scheduled items for this cycle that have not yet affected your actual bank balance." />
            </div>
            <div
              data-testid="recurring-will-be-debited-total"
              className="text-lg font-extrabold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-0.5"
            >
              {formatMoney(totalWillBeDebited)}
            </div>
          </div>
          <Clock className="w-6 h-6 text-amber-500/60 shrink-0" />
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/25 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center">
              <span>Settled (Already Paid / Credited)</span>
              <InfoTip text="Completed recurring items already reflected in your linked bank account and logged in Records." />
            </div>
            <div
              data-testid="recurring-already-paid-total"
              className="text-lg font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5"
            >
              {formatMoney(totalAlreadyPaid)}
            </div>
          </div>
          <CheckCircle2 className="w-6 h-6 text-emerald-500/60 shrink-0" />
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center">
              <span>Total Recurring Commitments</span>
              <InfoTip text={`${filteredItems.length} scheduled recurring items tracked across your accounts.`} />
            </div>
            <div className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
              {formatMoney(totalWillBeDebited + totalAlreadyPaid)}
            </div>
          </div>
          <CalendarClock className="w-6 h-6 text-slate-400 shrink-0" />
        </div>
      </div>

      {formError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-300">
          {formError}
        </div>
      )}

      {/* Inline Table Layout for Recurring & Compulsory Payments */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <table
          data-testid="recurring-inline-table"
          className="w-full text-left border-collapse text-xs"
        >
          <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-3 px-3.5 font-extrabold uppercase tracking-wider">
                Item &amp; Category
              </th>
              <th className="py-3 px-3.5 font-extrabold uppercase tracking-wider">
                Payee / Source
              </th>
              <th className="py-3 px-3.5 font-extrabold uppercase tracking-wider">
                Schedule
              </th>
              <th className="py-3 px-3.5 font-extrabold uppercase tracking-wider">
                Linked Account &amp; Projection
              </th>
              <th className="py-3 px-3.5 font-extrabold uppercase tracking-wider text-right">
                Amount
              </th>
              <th className="py-3 px-3.5 font-extrabold uppercase tracking-wider text-center">
                Status
              </th>
              {!isStrictlyReadOnly && (
                <th className="py-3 px-3.5 font-extrabold uppercase tracking-wider text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {isAddingInline &&
              !isStrictlyReadOnly &&
              renderInlineEditorRow('recurring-inline-add-row')}

            {filteredItems.length === 0 && !isAddingInline ? (
              <tr>
                <td
                  colSpan={isStrictlyReadOnly ? 6 : 7}
                  className="py-10 px-4 text-center text-slate-500"
                >
                  No recurring or compulsory payments scheduled yet.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                if (editingId === item.id && !isStrictlyReadOnly) {
                  return (
                    <React.Fragment key={item.id}>
                      {renderInlineEditorRow(`recurring-inline-edit-row-${item.id}`)}
                    </React.Fragment>
                  );
                }

                const isIncomeItem = item.flowType === 'income';
                const linkedAccount = accounts.find((a) => a.id === item.linkedAccountId);
                const currentAccountBalance = linkedAccount
                  ? calculateAccountBalance(linkedAccount, transactions)
                  : 0;
                const projectedBalanceAfterThisItem = isIncomeItem
                  ? Math.round((currentAccountBalance + item.amount) * 100) / 100
                  : Math.round((currentAccountBalance - item.amount) * 100) / 100;
                const fullAccountProjection = linkedAccount
                  ? calculateAccountRecurringProjection(
                      linkedAccount,
                      transactions,
                      recurringPayments
                    )
                  : null;
                const isPending = item.status === 'will_be_debited';
                const pendingLabel = isIncomeItem ? 'Will Be Credited' : 'Will Be Debited';
                const settledLabel = isIncomeItem ? 'Credited' : 'Already Paid';
                const logoMeta = linkedAccount
                  ? resolveBankLogoFromName(linkedAccount.name)
                  : undefined;
                const logoSrc =
                  linkedAccount?.bankLogoUrl ||
                  logoMeta?.logoUrl ||
                  generateBankFallbackSvgDataUrl(linkedAccount?.name || 'Bank');

                return (
                  <tr
                    key={item.id}
                    data-testid={`recurring-item-row-${item.id}`}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Column 1: Title & Category */}
                    <td className="py-3.5 px-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                          {item.title}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            isIncomeItem
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          }`}
                        >
                          {isIncomeItem ? 'Income' : 'Expense'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {item.category}
                      </div>
                    </td>

                    {/* Column 2: Payee / Person */}
                    <td className="py-3.5 px-3.5">
                      {item.payeeName ? (
                        <span
                          data-testid={`recurring-payee-badge-${item.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 font-bold text-xs"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>{item.payeeName}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>

                    {/* Column 3: Frequency & Due Day */}
                    <td className="py-3.5 px-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {item.frequency}
                      </span>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Due: {item.dueDayLabel}
                      </div>
                    </td>

                    {/* Column 4: Linked Account & Projected Balance */}
                    <td className="py-3.5 px-3.5">
                      {linkedAccount ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <img
                              src={logoSrc}
                              alt={linkedAccount.name}
                              onError={(e) => {
                                e.currentTarget.src = generateBankFallbackSvgDataUrl(
                                  linkedAccount.name
                                );
                              }}
                              className="w-5 h-5 rounded object-contain bg-white border border-slate-200 p-0.5"
                            />
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {linkedAccount.name}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              ({maskAccountNumber(linkedAccount.accountNumber)})
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="text-slate-500">
                              Bal:{' '}
                              <strong className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                                {formatMoney(currentAccountBalance)}
                              </strong>
                            </span>
                            {isPending ? (
                              <>
                                <ArrowRight className="w-3 h-3 text-amber-500" />
                                <span
                                  data-testid={`projected-balance-preview-${item.id}`}
                                  className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-semibold"
                                >
                                  {isIncomeItem ? 'After Credit:' : 'Projected Balance After Debit:'}{' '}
                                  <strong className="font-mono tabular-nums">
                                    {formatMoney(projectedBalanceAfterThisItem)}
                                  </strong>
                                </span>
                                {!isIncomeItem &&
                                  fullAccountProjection &&
                                  fullAccountProjection.pendingItemsCount > 1 && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      (After all {fullAccountProjection.pendingItemsCount}:{' '}
                                      {formatMoney(
                                        fullAccountProjection.projectedBalanceAfterDebit
                                      )}
                                      )
                                    </span>
                                  )}
                              </>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold">
                                {isIncomeItem ? 'Credited to Account' : 'Settled & Deducted'}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-amber-500 inline-flex items-center gap-1">
                          <Wallet className="w-3.5 h-3.5" />
                          <span>Unlinked Account</span>
                        </span>
                      )}
                    </td>

                    {/* Column 5: Amount */}
                    <td className="py-3.5 px-3.5 text-right font-mono tabular-nums">
                      <div
                        className={`text-sm font-extrabold ${
                          isPending
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {isIncomeItem ? '+' : ''}
                        {formatMoney(item.amount)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">
                        {isPending ? pendingLabel : settledLabel}
                      </div>
                    </td>

                    {/* Column 6: Status */}
                    <td className="py-3.5 px-3.5 text-center">
                      {isStrictlyReadOnly ? (
                        isPending ? (
                          <span
                            data-testid={`readonly-status-${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-extrabold text-[11px]"
                          >
                            <Clock className="w-3 h-3" />
                            <span>{pendingLabel}</span>
                          </span>
                        ) : (
                          <span
                            data-testid={`readonly-status-${item.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-[11px]"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{settledLabel}</span>
                          </span>
                        )
                      ) : (
                        <div className="inline-flex rounded-xl p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            data-testid={`status-will-be-debited-${item.id}`}
                            onClick={() => {
                              if (!isPending) {
                                onToggleRecurringStatus(item.id, 'will_be_debited');
                              }
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition cursor-pointer ${
                              isPending
                                ? 'bg-amber-500 text-slate-950 shadow-xs'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            <span>{pendingLabel}</span>
                          </button>
                          <button
                            type="button"
                            data-testid={`status-already-paid-${item.id}`}
                            onClick={() => {
                              if (isPending) {
                                onToggleRecurringStatus(item.id, 'already_paid');
                              }
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition cursor-pointer ${
                              !isPending
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{settledLabel}</span>
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Column 7: Inline Edit & Delete Actions */}
                    {!isStrictlyReadOnly && (
                      <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            data-testid={`edit-recurring-btn-${item.id}`}
                            onClick={() => startInlineEdit(item)}
                            title="Edit Inline in Table"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 hover:bg-indigo-500/10 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-recurring-btn-${item.id}`}
                            onClick={() => {
                              setRecurringPendingDelete(item);
                              setDeletePasswordInput('');
                              setDeletePasswordError('');
                            }}
                            title="Move Recurring Payment to Recycle Bin (Password Required)"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Payee Auto-Sync Context Modal ("Who is this person?") */}
      {pendingRecurringPayload && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="payee-context-prompt-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Who is &ldquo;{pendingRecurringPayload.item.payeeName}&rdquo;?
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Auto-generating a profile card in Receivables &amp; Payables
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingRecurringPayload(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayeeContextPrompt} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Role / Relationship for {pendingRecurringPayload.item.payeeName}
                </label>
                <select
                  data-testid="payee-context-role-select"
                  value={contextRoleIdx}
                  onChange={(e) => setContextRoleIdx(Number(e.target.value))}
                  className="w-full px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {PERSON_CONTEXT_ROLES.map((r, idx) => (
                    <option key={r.label} value={idx}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {PERSON_CONTEXT_ROLES[contextRoleIdx]?.label === 'Other (Custom Role)' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Custom Role Description
                  </label>
                  <input
                    type="text"
                    data-testid="payee-context-custom-role-input"
                    value={contextCustomRole}
                    onChange={(e) => setContextCustomRole(e.target.value)}
                    placeholder="e.g. Security Guard / Tutor / Gym Trainer"
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Contact / Phone (Optional)
                </label>
                <input
                  type="text"
                  data-testid="payee-context-phone-input"
                  value={contextPhone}
                  onChange={(e) => setContextPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Profile Notes (Optional)
                </label>
                <input
                  type="text"
                  data-testid="payee-context-notes-input"
                  value={contextNotes}
                  onChange={(e) => setContextNotes(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onAddOrUpdateRecurring(
                      pendingRecurringPayload.item,
                      pendingRecurringPayload.previousStatus
                    );
                    setPendingRecurringPayload(null);
                    setIsAddingInline(false);
                    setEditingId(null);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Skip Profile Creation
                </button>
                <button
                  type="submit"
                  data-testid="confirm-payee-context-btn"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Profile &amp; Save Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Confirmation Modal before Deleting a Recurring Payment Item */}
      {recurringPendingDelete && (
        <div
          data-testid="delete-recurring-password-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-recurring-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="delete-recurring-modal-title"
                    className="text-sm font-extrabold text-slate-900 dark:text-white"
                  >
                    Confirm Recurring Payment Deletion
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Password verification required to move to Recycle Bin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecurringPendingDelete(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!deletePasswordInput.trim()) {
                  setDeletePasswordError('Please enter your account password to confirm deletion.');
                  return;
                }
                if (
                  userPasswordHash &&
                  userPasswordHash !== 'google-oauth' &&
                  !verifySecretAgainstStoredHash(deletePasswordInput, userPasswordHash)
                ) {
                  setDeletePasswordError('Incorrect password. Deletion cancelled.');
                  return;
                }
                onDeleteRecurring(recurringPendingDelete.id);
                setRecurringPendingDelete(null);
                setDeletePasswordInput('');
                setDeletePasswordError('');
              }}
              className="p-5 space-y-4"
            >
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  {recurringPendingDelete.title} ({recurringPendingDelete.frequency})
                </div>
                <div className="text-slate-500">
                  Amount:{' '}
                  <strong className="font-mono text-amber-600 dark:text-amber-400">
                    {formatMoney(recurringPendingDelete.amount)}
                  </strong>
                </div>
              </div>

              <div>
                <label
                  htmlFor="delete-recurring-password-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Enter Your Account Password to Confirm Deletion
                </label>
                <input
                  id="delete-recurring-password-input"
                  data-testid="delete-recurring-password-input"
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
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {deletePasswordError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRecurringPendingDelete(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-delete-recurring-btn"
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
    </section>
  );
};
