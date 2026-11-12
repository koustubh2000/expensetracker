import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Check,
  ImagePlus,
  Trash2,
  Landmark,
  ArrowRightLeft,
  TrendingDown,
  TrendingUp,
  Repeat,
  ClipboardPaste,
  Split,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import {
  DreamVault,
  LoanRecord,
  PersonProfile,
  RecurringPaymentItem,
  TransactionRecord,
  TransactionType,
  WalletAccount,
} from '../types/finance';
import {
  calculateLoanAmortizationSchedule,
  DEFAULT_CATEGORIES,
  isPureInvestmentVault,
  PAYMENT_METHODS,
} from '../utils/financeRules';
import {
  DropdownListEditButton,
  useEditableDropdownOptions,
} from './DropdownListEditButton';
import { useImageDragDropAndPaste } from '../utils/imageUploadHelpers';
import { InfoTip } from './InfoTip';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: WalletAccount[];
  people: PersonProfile[];
  dreamVaults: DreamVault[];
  loans?: LoanRecord[];
  recurringPayments?: RecurringPaymentItem[];
  currency?: string;
  userPasswordHash?: string;
  initialIsPaidEmi?: boolean;
  customCategories: string[];
  isAdminPortal: boolean;
  editingTransaction?: TransactionRecord | null;
  onSaveTransaction: (
    tx: Omit<TransactionRecord, 'id'>,
    saveCustomCategoryToProfile?: string,
    autoCreateAccountName?: string
  ) => void;
  onExecutePaidEmiFromRecords?: (params: {
    loanId: string;
    destinationLoanAccountId?: string;
    fundingAccountId: string;
    paymentDate: string;
    amount: number;
    title: string;
    notes?: string;
    markAsPaidInLoanSection?: boolean;
  }) => void;
  onUpdateTransaction?: (
    updatedTx: TransactionRecord,
    saveCustomCategoryToProfile?: string
  ) => void;
  onQuickAddPerson: (
    name: string,
    relationship: PersonProfile['relationship'],
    customRel?: string
  ) => PersonProfile;
}

type PrimaryFlowMode = 'expense' | 'income' | 'transfer';
type TransferSubMode = 'self_transfer' | 'external_transfer' | 'emi_paid';
type SelfTransferPurpose = 'bank_to_bank' | 'siding_for_investment';
type ExternalTransferDirection = 'outward' | 'inward';

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  accounts,
  people = [],
  dreamVaults = [],
  loans = [],
  recurringPayments = [],
  currency = '₹',
  userPasswordHash,
  initialIsPaidEmi = false,
  customCategories,
  isAdminPortal,
  editingTransaction = null,
  onSaveTransaction,
  onExecutePaidEmiFromRecords,
  onUpdateTransaction,
}) => {
  // Strictly 3 Primary Flow Options: 'expense' | 'income' | 'transfer'
  const [primaryFlow, setPrimaryFlow] = useState<PrimaryFlowMode>('expense');
  const [transferSubMode, setTransferSubMode] = useState<TransferSubMode>('self_transfer');
  const [selfTransferPurpose, setSelfTransferPurpose] =
    useState<SelfTransferPurpose>('bank_to_bank');
  const [externalDirection, setExternalDirection] =
    useState<ExternalTransferDirection>('outward');
  const [externalRecipient, setExternalRecipient] = useState<string>('');

  const [type, setType] = useState<TransactionType>('expense');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('2026-11-09');
  const [category, setCategory] = useState(DEFAULT_CATEGORIES.expense[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [rememberCustomCategory, setRememberCustomCategory] = useState(true);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [autoAccountName, setAutoAccountName] = useState('Primary Bank Account');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id || accounts[0]?.id || '');
  const [selectedDreamVaultId, setSelectedDreamVaultId] = useState<string>(
    dreamVaults[0]?.id || ''
  );
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [customPaymentMethod, setCustomPaymentMethod] = useState('');
  const [isRegularMonthly, setIsRegularMonthly] = useState(false);
  const [selectedRecurringId, setSelectedRecurringId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Split Expense State
  const [isSplit, setIsSplit] = useState(false);
  const [splitPersonSelection, setSplitPersonSelection] = useState<string>('NEW');
  const [splitNewPersonName, setSplitNewPersonName] = useState('');
  const [splitAmount, setSplitAmount] = useState('');
  const [splitReturnDate, setSplitReturnDate] = useState('');

  // Transfer -> EMI Paid Flow State
  const [isPaidEmi, setIsPaidEmi] = useState<boolean>(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string>('');
  const [destinationLoanAccountId, setDestinationLoanAccountId] = useState<string>('');
  const [fundingBankAccountId, setFundingBankAccountId] = useState<string>(
    accounts[0]?.id || 'CASH_DIRECT'
  );
  const [emiPaymentDate, setEmiPaymentDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [markAsPaidInLoanSection, setMarkAsPaidInLoanSection] = useState<boolean>(true);

  // Proof Image Upload State
  const [proofId, setProofId] = useState('');
  const [proofImageName, setProofImageName] = useState('');
  const [proofImageDataUrl, setProofImageDataUrl] = useState('');

  const activeUnarchivedLoans = loans.filter((l) => !l.archivedToHistory);
  const loanAccounts = accounts.filter((a) => a.type === 'Loan Account');
  const hasExplicitCashAccount = accounts.some(
    (a) => a.type === 'Cash Wallet' || a.name.toLowerCase().includes('cash')
  );
  const hasExplicitWalletAccount = accounts.some((a) => a.type === 'Digital Wallet');

  // Editable Dropdown Options for Category & Payment Method
  const categoryListKey = `tx_category_${primaryFlow}`;
  const baseCategoriesForFlow =
    DEFAULT_CATEGORIES[primaryFlow] || DEFAULT_CATEGORIES.expense;
  const {
    options: editableCategories,
    allEditableOptions: allEditableCategoryOptions,
    removedOptions: removedCategoryOptions,
    saveRemovedOptions: saveRemovedCategoryOptions,
  } = useEditableDropdownOptions(
    categoryListKey,
    baseCategoriesForFlow,
    customCategories,
    'Other'
  );

  const {
    options: editablePaymentMethods,
    allEditableOptions: allEditablePaymentOptions,
    removedOptions: removedPaymentOptions,
    saveRemovedOptions: saveRemovedPaymentOptions,
  } = useEditableDropdownOptions(
    'tx_payment_method',
    PAYMENT_METHODS,
    [],
    'Other'
  );

  const processProofFile = useCallback(
    (file: File) => {
      if (!file) return;
      const generatedProofId = proofId || `PRF-${Date.now().toString().slice(-6)}`;
      const reader = new FileReader();
      reader.onload = () => {
        const rawDataUrl = String(reader.result || '');
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1400;
          let w = img.width || 800;
          let h = img.height || 600;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            let hdUrl = canvas.toDataURL('image/jpeg', 0.9);
            if (hdUrl.length > 650000) {
              hdUrl = canvas.toDataURL('image/jpeg', 0.8);
            }
            setProofImageDataUrl(hdUrl);
          } else {
            setProofImageDataUrl(rawDataUrl);
          }
          setProofId(generatedProofId);
          setProofImageName(file.name || 'pasted_proof.png');
        };
        img.onerror = () => {
          setProofImageDataUrl(rawDataUrl);
          setProofId(generatedProofId);
          setProofImageName(file.name || 'pasted_proof.png');
        };
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    },
    [proofId]
  );

  const { isDraggingOver: isDraggingProof, zoneProps: proofDropZoneProps } =
    useImageDragDropAndPaste(processProofFile, isOpen);

  useEffect(() => {
    if (editingTransaction && isOpen) {
      const txType = editingTransaction.type;
      setType(txType);
      if (editingTransaction.isPaidEmi) {
        setPrimaryFlow('transfer');
        setTransferSubMode('emi_paid');
        setSelfTransferPurpose('bank_to_bank');
        setIsPaidEmi(true);
      } else if (txType === 'dream_investment' || editingTransaction.dreamVaultId) {
        setPrimaryFlow('transfer');
        setTransferSubMode('self_transfer');
        setSelfTransferPurpose('siding_for_investment');
        setIsPaidEmi(false);
        setSelectedDreamVaultId(
          editingTransaction.dreamVaultId || dreamVaults[0]?.id || ''
        );
      } else if (
        editingTransaction.customTypeLabel?.startsWith('External Transfer') ||
        editingTransaction.category === 'External Bank Transfer'
      ) {
        setPrimaryFlow('transfer');
        setTransferSubMode('external_transfer');
        setExternalDirection(txType === 'income' ? 'inward' : 'outward');
        setIsPaidEmi(false);
      } else if (txType === 'transfer') {
        setPrimaryFlow('transfer');
        setTransferSubMode('self_transfer');
        setSelfTransferPurpose('bank_to_bank');
        setIsPaidEmi(false);
      } else if (
        txType === 'income' ||
        txType === 'expected_incoming' ||
        txType === 'borrowing_in'
      ) {
        setPrimaryFlow('income');
        setIsPaidEmi(false);
      } else {
        setPrimaryFlow('expense');
        setIsPaidEmi(false);
      }
      setTitle(editingTransaction.title);
      setAmount(
        String(
          editingTransaction.grossAmountPaid && editingTransaction.isSplit
            ? editingTransaction.grossAmountPaid
            : editingTransaction.amount
        )
      );
      setDate(editingTransaction.date);
      setCategory(editingTransaction.category);
      setCustomCategory(editingTransaction.customCategory || '');
      setAccountId(editingTransaction.accountId || accounts[0]?.id || '');
      setToAccountId(
        editingTransaction.toAccountId ||
          (txType === 'dream_investment'
            ? editingTransaction.accountId || accounts[0]?.id || ''
            : accounts[1]?.id || accounts[0]?.id || '')
      );
      setPaymentMethod(editingTransaction.paymentMethod || PAYMENT_METHODS[0]);
      setCustomPaymentMethod(editingTransaction.customPaymentMethod || '');
      setIsRegularMonthly(Boolean(editingTransaction.isRegularMonthly));
      setSelectedRecurringId(editingTransaction.linkedRecurringId || '');
      setNotes(editingTransaction.notes || '');
      setProofId(editingTransaction.proofId || '');
      setProofImageName(editingTransaction.proofImageName || '');
      setProofImageDataUrl(editingTransaction.proofImageDataUrl || '');
      setIsSplit(Boolean(editingTransaction.isSplit));
      setSplitPersonSelection(editingTransaction.splitPersonId || 'NEW');
      setSplitNewPersonName(editingTransaction.splitPersonName || '');
      setSplitAmount(
        editingTransaction.splitAmount ? String(editingTransaction.splitAmount) : ''
      );
      setSplitReturnDate(editingTransaction.splitReturnDate || '');
      setSelectedLoanId(editingTransaction.linkedLoanId || '');
      setDestinationLoanAccountId(
        editingTransaction.destinationLoanAccountId ||
          loanAccounts[0]?.id ||
          'direct-loan-ledger'
      );
      setFundingBankAccountId(editingTransaction.accountId || accounts[0]?.id || 'CASH_DIRECT');
      setEmiPaymentDate(editingTransaction.date || new Date().toISOString().slice(0, 10));
      setMarkAsPaidInLoanSection(true);
      setExternalRecipient('');
      setError('');
    } else if (isOpen && !editingTransaction) {
      const todayIso = new Date().toISOString().slice(0, 10);
      if (initialIsPaidEmi) {
        setPrimaryFlow('transfer');
        setTransferSubMode('emi_paid');
        setSelfTransferPurpose('bank_to_bank');
        setType('expense');
        setIsPaidEmi(true);
      } else {
        setPrimaryFlow('expense');
        setTransferSubMode('self_transfer');
        setSelfTransferPurpose('bank_to_bank');
        setType('expense');
        setIsPaidEmi(false);
      }
      setExternalDirection('outward');
      setExternalRecipient('');
      setTitle('');
      setAmount('');
      setDate(todayIso);
      setCategory(DEFAULT_CATEGORIES.expense[0]);
      setCustomCategory('');
      setAccountId(accounts[0]?.id || '');
      setToAccountId(accounts[1]?.id || accounts[0]?.id || '');
      setSelectedDreamVaultId(dreamVaults[0]?.id || '');
      setPaymentMethod(PAYMENT_METHODS[0]);
      setCustomPaymentMethod('');
      setIsRegularMonthly(false);
      setSelectedRecurringId('');
      setNotes('');
      setProofId('');
      setProofImageName('');
      setProofImageDataUrl('');
      setIsSplit(false);
      setSplitPersonSelection(people[0]?.id || 'NEW');
      setSplitNewPersonName('');
      setSplitAmount('');
      setSplitReturnDate(todayIso);
      setSelectedLoanId('');
      setDestinationLoanAccountId(loanAccounts[0]?.id || 'direct-loan-ledger');
      setFundingBankAccountId(accounts[0]?.id || 'CASH_DIRECT');
      setEmiPaymentDate(todayIso);
      setMarkAsPaidInLoanSection(true);
      setError('');
    }
  }, [editingTransaction, isOpen, accounts, initialIsPaidEmi, people, dreamVaults]);

  if (!isOpen) return null;

  const accentBtnClass = isAdminPortal
    ? 'bg-rose-600 hover:bg-rose-500 text-white'
    : 'bg-emerald-600 hover:bg-emerald-500 text-white';

  const handleDreamVaultSelectChange = (chosenVaultId: string) => {
    setSelectedDreamVaultId(chosenVaultId);
    const chosenVault = dreamVaults.find((v) => v.id === chosenVaultId);
    if (chosenVault) {
      const isInv = isPureInvestmentVault(chosenVault);
      if (
        !title.trim() ||
        title === 'Self Account Transfer' ||
        title.startsWith('Paid EMI:') ||
        title.startsWith('External Transfer') ||
        title.startsWith('Investment:') ||
        title.startsWith('Dream Allocation:')
      ) {
        setTitle(
          isInv
            ? `Investment: ${chosenVault.name}`
            : `Dream Allocation: ${chosenVault.name}`
        );
      }
      if (chosenVault.savedInAccountId) {
        setToAccountId(chosenVault.savedInAccountId);
      } else if (chosenVault.linkedAccountId) {
        setToAccountId(chosenVault.linkedAccountId);
      }
    }
  };

  const handleSelfTransferPurposeSelect = (purpose: SelfTransferPurpose) => {
    setSelfTransferPurpose(purpose);
    setError('');
    if (purpose === 'bank_to_bank') {
      setType('transfer');
      setIsPaidEmi(false);
      setCategory('Internal Account Transfer');
      if (accountId === toAccountId && accounts.length > 1) {
        const alternate = accounts.find((a) => a.id !== accountId);
        if (alternate) setToAccountId(alternate.id);
      }
      if (
        !title.trim() ||
        title.startsWith('Paid EMI:') ||
        title.startsWith('External Transfer') ||
        title.startsWith('Investment:') ||
        title.startsWith('Dream Allocation:')
      ) {
        setTitle('Self Account Transfer');
      }
    } else {
      setType('dream_investment');
      setIsPaidEmi(false);
      setCategory('Siding for Investment');
      const targetId = selectedDreamVaultId || dreamVaults[0]?.id || '';
      if (targetId) {
        handleDreamVaultSelectChange(targetId);
      } else if (
        !title.trim() ||
        title === 'Self Account Transfer' ||
        title.startsWith('Paid EMI:') ||
        title.startsWith('External Transfer')
      ) {
        setTitle('Investment Allocation');
      }
      if (!toAccountId) {
        setToAccountId(accountId || accounts[0]?.id || '');
      }
    }
  };

  const handlePrimaryFlowSelect = (flow: PrimaryFlowMode) => {
    setPrimaryFlow(flow);
    setSelectedRecurringId('');
    setError('');
    if (flow === 'expense') {
      setType('expense');
      setIsPaidEmi(false);
      setCategory(DEFAULT_CATEGORIES.expense[0]);
    } else if (flow === 'income') {
      setType('income');
      setIsPaidEmi(false);
      setIsSplit(false);
      setCategory(DEFAULT_CATEGORIES.income[0]);
    } else if (flow === 'transfer') {
      setIsSplit(false);
      if (transferSubMode === 'emi_paid') {
        setType('expense');
        setIsPaidEmi(true);
        setCategory('Utilities & Bills');
      } else if (transferSubMode === 'external_transfer') {
        setType(externalDirection === 'inward' ? 'income' : 'expense');
        setIsPaidEmi(false);
        setCategory('External Bank Transfer');
      } else {
        handleSelfTransferPurposeSelect(selfTransferPurpose);
      }
    }
  };

  const handleTransferSubModeSelect = (sub: TransferSubMode) => {
    setTransferSubMode(sub);
    setError('');
    if (sub === 'self_transfer') {
      handleSelfTransferPurposeSelect(selfTransferPurpose);
    } else if (sub === 'external_transfer') {
      setType(externalDirection === 'inward' ? 'income' : 'expense');
      setIsPaidEmi(false);
      setCategory('External Bank Transfer');
      if (
        !title.trim() ||
        title === 'Self Account Transfer' ||
        title.startsWith('Paid EMI:') ||
        title.startsWith('Investment:') ||
        title.startsWith('Dream Allocation:')
      ) {
        setTitle(
          externalRecipient.trim()
            ? `External Transfer: ${externalRecipient.trim()}`
            : 'External Bank Transfer'
        );
      }
    } else {
      setType('expense');
      setIsPaidEmi(true);
      setCategory('Utilities & Bills');
      if (activeUnarchivedLoans.length > 0 && !selectedLoanId) {
        handleLoanSelectChange(activeUnarchivedLoans[0].id);
      }
    }
  };

  const handleLoanSelectChange = (chosenId: string) => {
    setSelectedLoanId(chosenId);
    const chosenLoan = loans.find((l) => l.id === chosenId);
    if (chosenLoan) {
      const sched = calculateLoanAmortizationSchedule(chosenLoan);
      const nextUpcoming = sched.rows.find((r) => r.status === 'Upcoming');
      const suggestedEmiAmt = nextUpcoming
        ? nextUpcoming.emiAmount
        : sched.scheduledMonthlyEmi;
      setAmount(String(suggestedEmiAmt));
      setTitle(`Paid EMI: ${chosenLoan.name} (${chosenLoan.category})`);
      setCategory('Utilities & Bills');
      if (chosenLoan.linkedAccountId) {
        setFundingBankAccountId(chosenLoan.linkedAccountId);
        setAccountId(chosenLoan.linkedAccountId);
      }
      if (loanAccounts.length > 0 && !destinationLoanAccountId) {
        setDestinationLoanAccountId(loanAccounts[0].id);
      } else if (!destinationLoanAccountId) {
        setDestinationLoanAccountId('direct-loan-ledger');
      }
    }
  };

  // Filter saved recurring list based on whether we are saving an Expense (expected outflows) or Income (recurring income)
  const matchingRecurringList = (recurringPayments || []).filter((item) => {
    const itemFlow = item.flowType || 'expense';
    if (primaryFlow === 'income') {
      return itemFlow === 'income';
    }
    return itemFlow === 'expense';
  });

  const handleSelectRecurringItem = (recId: string) => {
    setSelectedRecurringId(recId);
    if (!recId) return;
    const found = recurringPayments.find((r) => r.id === recId);
    if (found) {
      setTitle(found.title);
      setAmount(String(found.amount));
      if (found.category) {
        setCategory(found.category);
      }
      if (found.linkedAccountId) {
        setAccountId(found.linkedAccountId);
      }
    }
  };

  const handleProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processProofFile(file);
    }
  };

  const isEmiPaidFlowActive =
    primaryFlow === 'transfer' && transferSubMode === 'emi_paid';

  const isExternalTransferActive =
    primaryFlow === 'transfer' && transferSubMode === 'external_transfer';

  const isInvestmentTransferActive =
    primaryFlow === 'transfer' &&
    transferSubMode === 'self_transfer' &&
    selfTransferPurpose === 'siding_for_investment';

  const isBankToBankSelfTransferActive =
    primaryFlow === 'transfer' &&
    transferSubMode === 'self_transfer' &&
    selfTransferPurpose === 'bank_to_bank';

  const isSameSelfTransferAccount =
    isBankToBankSelfTransferActive &&
    Boolean(accountId) &&
    accountId === toAccountId;

  const selectedDreamVaultObj = dreamVaults.find(
    (v) => v.id === selectedDreamVaultId
  );

  const grossNumeric = Math.max(0, Number(amount) || 0);
  const splitNumeric = isSplit ? Math.max(0, Number(splitAmount) || 0) : 0;
  const netExpenseNumeric = Math.max(0, Math.round((grossNumeric - splitNumeric) * 100) / 100);

  const renderAccountSelectOptions = () => (
    <>
      {accounts.some((a) => a.type === 'Bank Account' || a.type === 'Credit Card') && (
        <optgroup label="Bank Accounts">
          {accounts
            .filter((a) => a.type === 'Bank Account' || a.type === 'Credit Card')
            .map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.type})
              </option>
            ))}
        </optgroup>
      )}
      {accounts.some((a) => a.type === 'Loan Account') && (
        <optgroup label="Loan Accounts">
          {accounts
            .filter((a) => a.type === 'Loan Account')
            .map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} (Loan Account)
              </option>
            ))}
        </optgroup>
      )}
      <optgroup label="Wallets & Cash">
        {accounts
          .filter(
            (a) =>
              a.type !== 'Bank Account' &&
              a.type !== 'Credit Card' &&
              a.type !== 'Loan Account'
          )
          .map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} ({acc.type})
            </option>
          ))}
        {!hasExplicitWalletAccount && (
          <option value="WALLET_DIRECT">Digital Wallet (UPI / Wallet)</option>
        )}
        {!hasExplicitCashAccount && (
          <option value="CASH_DIRECT">Physical Cash (Hand Cash)</option>
        )}
      </optgroup>
    </>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const numAmount = Number(amount);
    if (!title.trim()) {
      setError('Please enter a record title.');
      return;
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setError('Please enter a valid positive amount.');
      return;
    }
    if (category === 'Other' && !customCategory.trim()) {
      setError('Please specify a custom category label for "Other".');
      return;
    }

    if (isBankToBankSelfTransferActive) {
      if (accountId === toAccountId) {
        setError('Same account selected — transfer between identical accounts is not possible.');
        return;
      }
    }

    if (isInvestmentTransferActive) {
      if (!selectedDreamVaultId) {
        setError('Please select an Investment or Dream card to allocate this transfer to.');
        return;
      }
    }

    let resolvedSplitPersonId: string | undefined;
    let resolvedSplitPersonName: string | undefined;
    const numSplit = Number(splitAmount);

    if (primaryFlow === 'expense' && isSplit) {
      if (!Number.isFinite(numSplit) || numSplit <= 0) {
        setError('Please enter a valid split amount owed to you.');
        return;
      }
      if (numSplit >= numAmount) {
        setError('Split amount owed to you must be less than the total bill amount.');
        return;
      }
      if (splitPersonSelection === 'NEW') {
        if (!splitNewPersonName.trim()) {
          setError('Please enter the name of the person to split with.');
          return;
        }
        resolvedSplitPersonName = splitNewPersonName.trim();
      } else {
        const foundPerson = people.find((p) => p.id === splitPersonSelection);
        resolvedSplitPersonId = foundPerson?.id;
        resolvedSplitPersonName = foundPerson?.name || splitNewPersonName.trim();
      }
    }

    if (isEmiPaidFlowActive && !editingTransaction) {
      if (!selectedLoanId) {
        setError('Please select which loan this EMI payment is for.');
        return;
      }
      if (!fundingBankAccountId) {
        setError('Please select a Debit Account or Cash to pay this EMI from.');
        return;
      }
      if (onExecutePaidEmiFromRecords) {
        onExecutePaidEmiFromRecords({
          loanId: selectedLoanId,
          destinationLoanAccountId: destinationLoanAccountId || undefined,
          fundingAccountId: fundingBankAccountId,
          paymentDate: emiPaymentDate || date,
          amount: numAmount,
          title: title.trim(),
          notes: notes.trim() || undefined,
          markAsPaidInLoanSection,
        });
        onClose();
        return;
      }
    }

    const effectiveAccountId = isEmiPaidFlowActive
      ? fundingBankAccountId || accountId || accounts[0]?.id || 'CASH_DIRECT'
      : accountId || accounts[0]?.id || '';

    const effectiveDate = isEmiPaidFlowActive ? emiPaymentDate || date : date;
    const effectiveType: TransactionType = isInvestmentTransferActive
      ? 'dream_investment'
      : isBankToBankSelfTransferActive
      ? 'transfer'
      : isExternalTransferActive
      ? externalDirection === 'inward'
        ? 'income'
        : 'expense'
      : isEmiPaidFlowActive
      ? 'expense'
      : primaryFlow === 'income'
      ? 'income'
      : 'expense';

    // Always record the full paid amount in Main Records; the split portion is tracked as a Receivable in Receivables & Payables
    const finalRecordAmount = Math.round(numAmount * 100) / 100;

    const payloadWithoutId: Omit<TransactionRecord, 'id'> = {
      date: effectiveDate,
      title: title.trim(),
      amount: finalRecordAmount,
      type: effectiveType,
      customTypeLabel: isExternalTransferActive
        ? externalDirection === 'inward'
          ? 'External Transfer (Inward)'
          : 'External Transfer (Outward)'
        : undefined,
      category,
      customCategory: category === 'Other' ? customCategory.trim() : undefined,
      accountId: effectiveAccountId,
      toAccountId:
        isBankToBankSelfTransferActive || isInvestmentTransferActive
          ? toAccountId || effectiveAccountId
          : undefined,
      dreamVaultId: isInvestmentTransferActive ? selectedDreamVaultId : undefined,
      paymentMethod:
        fundingBankAccountId === 'CASH_DIRECT' && isEmiPaidFlowActive
          ? 'Physical Cash'
          : paymentMethod,
      customPaymentMethod:
        paymentMethod === 'Other' ? customPaymentMethod.trim() : undefined,
      personId: editingTransaction?.personId,
      billable: editingTransaction?.billable,
      settledAmount:
        editingTransaction?.status === 'settled'
          ? finalRecordAmount
          : editingTransaction?.settledAmount,
      isPaidEmi: isEmiPaidFlowActive ? true : undefined,
      linkedLoanId: isEmiPaidFlowActive && selectedLoanId ? selectedLoanId : undefined,
      destinationLoanAccountId:
        isEmiPaidFlowActive && destinationLoanAccountId
          ? destinationLoanAccountId
          : undefined,
      status: editingTransaction?.status || 'completed',
      isRegularMonthly: isRegularMonthly || isEmiPaidFlowActive,
      linkedRecurringId:
        isRegularMonthly && selectedRecurringId ? selectedRecurringId : undefined,
      notes: notes.trim() || undefined,
      proofId: proofId || undefined,
      proofImageName: proofImageName || undefined,
      proofImageDataUrl: proofImageDataUrl || undefined,
      isSplit: effectiveType === 'expense' && isSplit ? true : undefined,
      splitPersonId:
        effectiveType === 'expense' && isSplit ? resolvedSplitPersonId : undefined,
      splitPersonName:
        effectiveType === 'expense' && isSplit ? resolvedSplitPersonName : undefined,
      splitAmount:
        effectiveType === 'expense' && isSplit ? Math.round(numSplit * 100) / 100 : undefined,
      splitReturnDate:
        effectiveType === 'expense' && isSplit
          ? splitReturnDate || effectiveDate
          : undefined,
      grossAmountPaid:
        effectiveType === 'expense' && isSplit ? Math.round(numAmount * 100) / 100 : undefined,
    };

    if (editingTransaction && onUpdateTransaction) {
      onUpdateTransaction(
        {
          ...payloadWithoutId,
          id: editingTransaction.id,
        },
        category === 'Other' && rememberCustomCategory ? customCategory.trim() : undefined
      );
    } else {
      onSaveTransaction(
        payloadWithoutId,
        category === 'Other' && rememberCustomCategory ? customCategory.trim() : undefined,
        accounts.length === 0
          ? autoAccountName.trim() || 'Primary Bank Account'
          : undefined
      );
    }

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
    >
      <div className="w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
          <div className="flex items-center gap-2">
            <h2
              id="tx-modal-title"
              className="text-base font-extrabold text-slate-900 dark:text-white"
            >
              {editingTransaction
                ? `Edit Record (#${editingTransaction.id})`
                : 'Add New Record'}
            </h2>
            <InfoTip
              title="Record Entry"
              text="Log an Expense, Income, or Transfer. You can attach a receipt screenshot, split an expense with a contact, or link to a monthly recurring item."
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Record Modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-6 space-y-5 max-h-[84vh] overflow-y-auto"
        >
          {error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-700 dark:text-rose-300"
            >
              {error}
            </div>
          )}

          {/* 2-Column Split Layout inspired by reference screenshot */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN (7 cols): Flow Type, Core Details, Category, Account, Payment Mode, Regular Commitment at End */}
            <div className="md:col-span-7 space-y-4">
              {/* Strictly 3 Primary Transaction Flow Buttons: Expense, Income, Transfer */}
              <div className="space-y-1.5">
                <span className="flex items-center text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span>Flow Type</span>
                  <InfoTip text="Choose Expense, Income, or Transfer (Self Transfer / External Transfer / EMI Paid)." />
                </span>

                <div
                  data-testid="tx-primary-flow-tabs"
                  className="grid grid-cols-3 gap-2"
                >
                  <button
                    type="button"
                    data-testid="tx-flow-btn-expense"
                    onClick={() => handlePrimaryFlowSelect('expense')}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      primaryFlow === 'expense'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-rose-500/50'
                    }`}
                  >
                    <TrendingDown className="w-4 h-4" />
                    <span>Expense</span>
                  </button>

                  <button
                    type="button"
                    data-testid="tx-flow-btn-income"
                    onClick={() => handlePrimaryFlowSelect('income')}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      primaryFlow === 'income'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-emerald-500/50'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>Income</span>
                  </button>

                  <button
                    type="button"
                    data-testid="tx-flow-btn-transfer"
                    onClick={() => handlePrimaryFlowSelect('transfer')}
                    className={`py-2 px-3 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      primaryFlow === 'transfer'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-500/50'
                    }`}
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    <span>Transfer</span>
                  </button>
                </div>
              </div>

              {/* IF TRANSFER SELECTED: Strictly 3 Sub-Options -> "Self Transfer", "External Transfer", OR "EMI Paid" */}
              {primaryFlow === 'transfer' && (
                <div
                  data-testid="transfer-sub-option-selector"
                  className="p-3.5 rounded-xl border border-indigo-500/40 bg-indigo-500/5 dark:bg-indigo-950/30 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-indigo-900 dark:text-indigo-200 flex items-center">
                      <span>Transfer Mode</span>
                      <InfoTip text="Choose Self Transfer (Bank to Bank or Siding for Investment), External Transfer (to/from a third-party bank account), or EMI Paid." />
                    </span>
                    <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        data-testid="transfer-sub-self-btn"
                        onClick={() => handleTransferSubModeSelect('self_transfer')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
                          transferSubMode === 'self_transfer'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Self Transfer</span>
                      </button>

                      <button
                        type="button"
                        data-testid="transfer-sub-external-btn"
                        onClick={() => handleTransferSubModeSelect('external_transfer')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
                          transferSubMode === 'external_transfer'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>External Transfer</span>
                      </button>

                      <button
                        type="button"
                        data-testid="transfer-sub-emi-paid-btn"
                        onClick={() => handleTransferSubModeSelect('emi_paid')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
                          transferSubMode === 'emi_paid'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 border-indigo-500/40'
                        }`}
                      >
                        <Landmark className="w-3.5 h-3.5" />
                        <span>EMI Paid</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-Option 1: Self Transfer -> Ask "For What?" FIRST: Bank to Bank OR Siding for Investment */}
                  {transferSubMode === 'self_transfer' && (
                    <div
                      data-testid="self-transfer-accounts-box"
                      className="space-y-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-500/30"
                    >
                      {/* Step 1 inside Self Transfer: For What? */}
                      <div className="space-y-1.5 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                        <label className="block text-xs font-extrabold text-slate-800 dark:text-slate-200">
                          For What? (Select Purpose)
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            data-testid="self-transfer-purpose-bank-btn"
                            onClick={() => handleSelfTransferPurposeSelect('bank_to_bank')}
                            className={`px-3 py-2 rounded-lg text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer transition ${
                              selfTransferPurpose === 'bank_to_bank'
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:border-indigo-500/50'
                            }`}
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>Bank to Bank</span>
                          </button>

                          <button
                            type="button"
                            data-testid="self-transfer-purpose-investment-btn"
                            onClick={() =>
                              handleSelfTransferPurposeSelect('siding_for_investment')
                            }
                            className={`px-3 py-2 rounded-lg text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer transition ${
                              selfTransferPurpose === 'siding_for_investment'
                                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                : 'bg-amber-50/60 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border-amber-500/40 hover:border-amber-500'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Siding for Investment</span>
                          </button>
                        </div>
                      </div>

                      {/* Purpose A: Bank to Bank -> Simple From and To Account lists (Bank, Loan, Wallet, Cash) */}
                      {selfTransferPurpose === 'bank_to_bank' && (
                        <div
                          data-testid="self-transfer-bank-to-bank-fields"
                          className="space-y-2.5"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                From Account (Bank / Loan / Wallet / Cash)
                              </label>
                              <select
                                data-testid="transfer-from-account-select"
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              >
                                {renderAccountSelectOptions()}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                To Account (Bank / Loan / Wallet / Cash)
                              </label>
                              <select
                                data-testid="transfer-to-account-select"
                                value={toAccountId}
                                onChange={(e) => setToAccountId(e.target.value)}
                                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              >
                                {renderAccountSelectOptions()}
                              </select>
                            </div>
                          </div>

                          {isSameSelfTransferAccount && (
                            <div
                              data-testid="self-transfer-same-account-warning"
                              className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2"
                            >
                              <AlertTriangle className="w-4 h-4 shrink-0" />
                              <span>Same account selected — no transfer possible</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Purpose B: Siding for Investment -> 1. From Bank, 2. To Bank, 3. Investments & Dreams List */}
                      {selfTransferPurpose === 'siding_for_investment' && (
                        <div
                          data-testid="transfer-investment-box"
                          className="space-y-3 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-500/40"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                1. From Bank / Account (Debit From)
                              </label>
                              <select
                                data-testid="transfer-investment-from-account-select"
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              >
                                {renderAccountSelectOptions()}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                2. To Bank / Account (Hold / Deposit In)
                              </label>
                              <select
                                data-testid="transfer-investment-to-account-select"
                                value={toAccountId || accountId}
                                onChange={(e) => setToAccountId(e.target.value)}
                                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                              >
                                {renderAccountSelectOptions()}
                              </select>
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-amber-900 dark:text-amber-200 mb-1">
                              3. Select Investment or Dream
                            </label>
                            <select
                              data-testid="transfer-investment-vault-select"
                              value={selectedDreamVaultId}
                              onChange={(e) => handleDreamVaultSelectChange(e.target.value)}
                              className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-amber-500/50 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                            >
                              {dreamVaults.length === 0 ? (
                                <option value="">-- No Investment or Dream Cards Found --</option>
                              ) : (
                                <>
                                  <option value="">-- Select Investment or Dream Card --</option>
                                  {dreamVaults.some((d) => isPureInvestmentVault(d)) && (
                                    <optgroup label="Investments (FD, Gold, Mutual Funds)">
                                      {dreamVaults
                                        .filter((d) => isPureInvestmentVault(d))
                                        .map((dv) => (
                                          <option key={dv.id} value={dv.id}>
                                            {dv.name} ({dv.storageType}) — Saved: {currency}
                                            {dv.currentAmount.toLocaleString()}
                                          </option>
                                        ))}
                                    </optgroup>
                                  )}
                                  {dreamVaults.some((d) => !isPureInvestmentVault(d)) && (
                                    <optgroup label="Dreams & Goals (Laptop, Emergency, Goals)">
                                      {dreamVaults
                                        .filter((d) => !isPureInvestmentVault(d))
                                        .map((dv) => (
                                          <option key={dv.id} value={dv.id}>
                                            {dv.name} ({dv.storageType}) — Saved: {currency}
                                            {dv.currentAmount.toLocaleString()} / Target:{' '}
                                            {currency}
                                            {dv.targetAmount.toLocaleString()}
                                          </option>
                                        ))}
                                    </optgroup>
                                  )}
                                </>
                              )}
                            </select>
                          </div>

                          {selectedDreamVaultObj && (
                            <div
                              data-testid="transfer-investment-preview"
                              className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs"
                            >
                              <div>
                                <span className="font-extrabold text-amber-800 dark:text-amber-300">
                                  {selectedDreamVaultObj.name}
                                </span>
                                <span className="ml-1.5 text-[11px] text-slate-500">
                                  (
                                  {isPureInvestmentVault(selectedDreamVaultObj)
                                    ? 'Investment'
                                    : 'Dream'}{' '}
                                  · {selectedDreamVaultObj.storageType})
                                </span>
                              </div>
                              <div className="flex items-center gap-3 font-mono text-[11px]">
                                <span className="text-slate-600 dark:text-slate-400">
                                  Current:{' '}
                                  <strong>
                                    {currency}
                                    {selectedDreamVaultObj.currentAmount.toLocaleString()}
                                  </strong>
                                </span>
                                {grossNumeric > 0 && (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    New Total: {currency}
                                    {(
                                      selectedDreamVaultObj.currentAmount + grossNumeric
                                    ).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-Option 2: External Transfer -> Third-Party / Beneficiary Bank Transfer */}
                  {transferSubMode === 'external_transfer' && (
                    <div
                      data-testid="external-transfer-box"
                      className="space-y-3 p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-500/30"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          data-testid="external-transfer-outward-btn"
                          onClick={() => {
                            setExternalDirection('outward');
                            setType('expense');
                            if (
                              !title.trim() ||
                              title.startsWith('External Transfer')
                            ) {
                              setTitle(
                                externalRecipient.trim()
                                  ? `External Transfer to ${externalRecipient.trim()}`
                                  : 'External Bank Transfer'
                              );
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
                            externalDirection === 'outward'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          <TrendingDown className="w-3.5 h-3.5" />
                          <span>Send Outward (Debit)</span>
                        </button>

                        <button
                          type="button"
                          data-testid="external-transfer-inward-btn"
                          onClick={() => {
                            setExternalDirection('inward');
                            setType('income');
                            if (
                              !title.trim() ||
                              title.startsWith('External Transfer')
                            ) {
                              setTitle(
                                externalRecipient.trim()
                                  ? `External Transfer from ${externalRecipient.trim()}`
                                  : 'External Bank Transfer Received'
                              );
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer ${
                            externalDirection === 'inward'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>Receive Inward (Credit)</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {externalDirection === 'inward'
                              ? 'Credit To My Account'
                              : 'Debit From My Account'}
                          </label>
                          <select
                            data-testid="external-transfer-account-select"
                            value={accountId}
                            onChange={(e) => setAccountId(e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            {renderAccountSelectOptions()}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            External Beneficiary / Bank Name
                          </label>
                          <input
                            type="text"
                            data-testid="external-transfer-recipient-input"
                            value={externalRecipient}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExternalRecipient(val);
                              if (
                                !title.trim() ||
                                title === 'External Bank Transfer' ||
                                title === 'External Bank Transfer Received' ||
                                title.startsWith('External Transfer')
                              ) {
                                setTitle(
                                  val.trim()
                                    ? externalDirection === 'inward'
                                      ? `External Transfer from ${val.trim()}`
                                      : `External Transfer to ${val.trim()}`
                                    : externalDirection === 'inward'
                                    ? 'External Bank Transfer Received'
                                    : 'External Bank Transfer'
                                );
                              }
                            }}
                            placeholder="e.g. Beneficiary Name / External Bank"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* EMI Paid Details Box */}
              {isEmiPaidFlowActive && (
                <div
                  data-testid="tx-modal-paid-emi-section"
                  className="p-3.5 rounded-xl border border-indigo-500 bg-indigo-500/10 dark:bg-indigo-950/40 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <Landmark className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center">
                      <span>Loan EMI Payment</span>
                      <InfoTip text="Select the loan, funding account, and whether to mark the installment as paid in the Loans & EMI schedule." />
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-200 mb-1">
                      Select Loan
                    </label>
                    <select
                      data-testid="tx-modal-loan-select"
                      value={selectedLoanId}
                      onChange={(e) => handleLoanSelectChange(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-indigo-500/40 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                    >
                      <option value="">-- Choose Loan --</option>
                      {activeUnarchivedLoans.map((loan) => {
                        const sched = calculateLoanAmortizationSchedule(loan);
                        return (
                          <option key={loan.id} value={loan.id}>
                            {loan.name} ({loan.category}) — EMI:{' '}
                            {sched.scheduledMonthlyEmi.toLocaleString()} · Rem:{' '}
                            {sched.remainingBalance.toLocaleString()}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {selectedLoanId && (
                    <div
                      data-testid="tx-modal-dynamic-emi-fields"
                      className="space-y-3 p-3 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-indigo-500/30"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Debit From
                          </label>
                          <select
                            data-testid="tx-modal-funding-bank-account"
                            value={fundingBankAccountId}
                            onChange={(e) => {
                              setFundingBankAccountId(e.target.value);
                              setAccountId(e.target.value);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            {accounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name} ({acc.type})
                              </option>
                            ))}
                            <option value="CASH_DIRECT">Physical Cash</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            To Loan Account
                          </label>
                          <select
                            data-testid="tx-modal-destination-loan-account"
                            value={destinationLoanAccountId}
                            onChange={(e) => setDestinationLoanAccountId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <option value="direct-loan-ledger">
                              Direct ({loans.find((l) => l.id === selectedLoanId)?.name})
                            </option>
                            {accounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name} ({acc.type})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Payment Date
                          </label>
                          <input
                            type="date"
                            data-testid="tx-modal-emi-payment-date"
                            value={emiPaymentDate}
                            onChange={(e) => {
                              setEmiPaymentDate(e.target.value);
                              setDate(e.target.value);
                            }}
                            required
                            className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                      </div>

                      <label
                        data-testid="tx-modal-sync-loan-paid-prompt"
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            data-testid="tx-modal-sync-loan-paid-checkbox"
                            checked={markAsPaidInLoanSection}
                            onChange={(e) => setMarkAsPaidInLoanSection(e.target.checked)}
                            className="w-4 h-4 rounded border-emerald-500 text-emerald-600"
                          />
                          <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center">
                            <span>Mark EMI as Paid in Loans &amp; EMI</span>
                            <InfoTip text="Automatically marks the next upcoming installment as Paid in the loan amortization schedule." />
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold uppercase shrink-0">
                          {markAsPaidInLoanSection ? 'Sync On' : 'Record Only'}
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Title, Amount, Date */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                <div className="sm:col-span-5">
                  <label
                    htmlFor="tx-title"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Title
                  </label>
                  <input
                    id="tx-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Groceries, Salary, Dinner"
                    required
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-4">
                  <label
                    htmlFor="tx-amount"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Amount ({currency})
                  </label>
                  <input
                    id="tx-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label
                    htmlFor="tx-date"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Date
                  </label>
                  <input
                    id="tx-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full px-2.5 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Category & Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <label
                      htmlFor="tx-category"
                      className="flex items-center text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      <span>Category</span>
                      <InfoTip text="Choose a category or select 'Other' to enter a custom category. Click the pencil icon to remove unused options." />
                    </label>
                    <DropdownListEditButton
                      listKey={categoryListKey}
                      label="Category Options"
                      allEditableOptions={allEditableCategoryOptions}
                      removedOptions={removedCategoryOptions}
                      onSaveRemovedOptions={saveRemovedCategoryOptions}
                      currentSelectedValue={category}
                      onOptionDeletedFallback={(nextFirst) => setCategory(nextFirst)}
                      userPasswordHash={userPasswordHash}
                    />
                  </div>
                  <select
                    id="tx-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {editableCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                {primaryFlow !== 'transfer' && !isEmiPaidFlowActive && (
                  <div>
                    {accounts.length > 0 ? (
                      <>
                        <label
                          htmlFor="tx-account"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                        >
                          {primaryFlow === 'income' ? 'Credit Account' : 'Debit Account'}
                        </label>
                        <select
                          id="tx-account"
                          value={accountId || accounts[0]?.id || ''}
                          onChange={(e) => setAccountId(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        >
                          {accounts.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} ({acc.type})
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <>
                        <label
                          htmlFor="tx-auto-account"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                        >
                          New Account Name
                        </label>
                        <input
                          id="tx-auto-account"
                          type="text"
                          value={autoAccountName}
                          onChange={(e) => setAutoAccountName(e.target.value)}
                          placeholder="Primary Bank Account"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                      </>
                    )}
                  </div>
                )}
              </div>

              {category === 'Other' && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-2">
                  <label
                    htmlFor="tx-custom-category"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Custom Category
                  </label>
                  <input
                    id="tx-custom-category"
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="Enter custom category name"
                    required
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberCustomCategory}
                      onChange={(e) => setRememberCustomCategory(e.target.checked)}
                    />
                    <span>Save to category list</span>
                  </label>
                </div>
              )}

              {/* Payment Method */}
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <label
                    htmlFor="tx-payment-method"
                    className="flex items-center text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    <span>Payment Mode</span>
                    <InfoTip text="Method used for this transaction (UPI, Bank Transfer, Cash, Card, or Other)." />
                  </label>
                  <DropdownListEditButton
                    listKey="tx_payment_method"
                    label="Payment Method Options"
                    allEditableOptions={allEditablePaymentOptions}
                    removedOptions={removedPaymentOptions}
                    onSaveRemovedOptions={saveRemovedPaymentOptions}
                    currentSelectedValue={paymentMethod}
                    onOptionDeletedFallback={(nextFirst) => setPaymentMethod(nextFirst)}
                    userPasswordHash={userPasswordHash}
                  />
                </div>
                <select
                  id="tx-payment-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  {editablePaymentMethods.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>

              {paymentMethod === 'Other' && (
                <div>
                  <label
                    htmlFor="tx-custom-payment"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Custom Payment Mode
                  </label>
                  <input
                    id="tx-custom-payment"
                    type="text"
                    value={customPaymentMethod}
                    onChange={(e) => setCustomPaymentMethod(e.target.value)}
                    placeholder="e.g. Gift Card, Wallet"
                    className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>
              )}
            </div>

            {/* RIGHT COLUMN (5 cols): Compact Proof Upload, Split Expense Option, Notes, Regular Basis at End */}
            <div className="md:col-span-5 space-y-4">
              {/* Compact Proof Upload (No Instant Stamp button) */}
              <div
                {...proofDropZoneProps}
                tabIndex={0}
                data-testid="tx-proof-drop-paste-zone"
                className={`p-3.5 rounded-xl border-2 border-dashed transition-colors space-y-2.5 outline-none ${
                  isDraggingProof
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 focus:border-emerald-500/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Receipt Proof
                    </span>
                    <InfoTip
                      align="right"
                      text="Click Upload, Drag & Drop an image, or press Ctrl+V to paste a screenshot directly."
                    />
                  </div>
                  <label
                    htmlFor="tx-proof-upload"
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 ${accentBtnClass}`}
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>Upload Image</span>
                    <input
                      id="tx-proof-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleProofFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <ClipboardPaste className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Drag &amp; Drop or Paste (Ctrl+V) image here</span>
                </div>

                {proofImageDataUrl && (
                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={proofImageDataUrl}
                        alt="Uploaded transaction proof"
                        className="w-12 h-10 object-cover rounded border border-slate-300 dark:border-slate-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold font-mono text-slate-900 dark:text-white truncate">
                          {proofId}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {proofImageName || 'proof.png'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProofId('');
                        setProofImageName('');
                        setProofImageDataUrl('');
                      }}
                      aria-label="Remove uploaded proof image"
                      className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Split Bill / Expense Option (Shown for Expense records) */}
              {primaryFlow === 'expense' && (
                <div
                  data-testid="tx-split-expense-container"
                  className="p-3.5 rounded-xl bg-indigo-500/5 dark:bg-indigo-950/30 border border-indigo-500/30 space-y-3"
                >
                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="flex items-center gap-2 text-xs font-extrabold text-indigo-950 dark:text-indigo-200">
                      <input
                        type="checkbox"
                        data-testid="tx-split-expense-checkbox"
                        checked={isSplit}
                        onChange={(e) => setIsSplit(e.target.checked)}
                        className="rounded border-indigo-400 text-indigo-600"
                      />
                      <Split className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Split Bill / Expense</span>
                    </span>
                    <InfoTip
                      align="right"
                      title="Split Expense"
                      text="Records the full amount you paid in Records, and adds the split share owed to you under that person in Receivables & Payables. When marked Paid there, the recovery is credited to your Records."
                    />
                  </label>

                  {isSplit && (
                    <div
                      data-testid="tx-split-expense-fields"
                      className="pt-2.5 border-t border-indigo-500/20 space-y-2.5"
                    >
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Split With Person
                        </label>
                        <select
                          data-testid="tx-split-person-select"
                          value={splitPersonSelection}
                          onChange={(e) => setSplitPersonSelection(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        >
                          <option value="NEW">+ Enter New Person Name</option>
                          {people.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                              {p.relationship ? ` (${p.relationship})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {splitPersonSelection === 'NEW' && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Person Name
                          </label>
                          <input
                            type="text"
                            data-testid="tx-split-new-person-input"
                            value={splitNewPersonName}
                            onChange={(e) => setSplitNewPersonName(e.target.value)}
                            placeholder="e.g. Rahul Sharma"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Amount Owed to You ({currency})
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            data-testid="tx-split-amount-input"
                            value={splitAmount}
                            onChange={(e) => setSplitAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Return Date
                          </label>
                          <input
                            type="date"
                            data-testid="tx-split-return-date-input"
                            value={splitReturnDate}
                            onChange={(e) => setSplitReturnDate(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                          />
                        </div>
                      </div>

                      {grossNumeric > 0 && splitNumeric > 0 && (
                        <div
                          data-testid="tx-split-summary-preview"
                          className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-indigo-500/30 text-[11px] space-y-0.5"
                        >
                          <div className="flex justify-between text-rose-600 dark:text-rose-400 font-bold">
                            <span>Recorded in Main Expense (Paid):</span>
                            <span className="font-mono">
                              -{currency}
                              {grossNumeric.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                            <span>Receivable Added for Person:</span>
                            <span className="font-mono font-bold">
                              +{currency}
                              {splitNumeric.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-0.5">
                            <span>Your Net Share After Recovery:</span>
                            <span className="font-mono font-bold">
                              {currency}
                              {netExpenseNumeric.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label
                  htmlFor="tx-notes"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Notes (Optional)
                </label>
                <input
                  id="tx-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reference or memo"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Placed at the VERY END: Regular Basis for This Month */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <label className="flex items-center justify-between gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid="tx-regular-monthly-checkbox"
                      checked={isRegularMonthly}
                      onChange={(e) => {
                        setIsRegularMonthly(e.target.checked);
                        if (!e.target.checked) {
                          setSelectedRecurringId('');
                        }
                      }}
                      className="rounded border-slate-300"
                    />
                    <span>Count under Regular Basis for This Month</span>
                  </span>
                  <InfoTip
                    align="right"
                    title="Monthly Commitment"
                    text="Mark this transaction as part of your regular monthly commitments and optionally link it to a saved Recurring Payment item."
                  />
                </label>

                {isRegularMonthly && (
                  <div
                    data-testid="tx-regular-recurring-list-box"
                    className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5"
                  >
                    <label
                      htmlFor="tx-regular-recurring-select"
                      className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-700 dark:text-indigo-300"
                    >
                      <Repeat className="w-3 h-3" />
                      <span>
                        {primaryFlow === 'income'
                          ? 'Saved Recurring Income List'
                          : 'Saved Expected Outflows List'}
                      </span>
                    </label>
                    <select
                      id="tx-regular-recurring-select"
                      data-testid="tx-regular-recurring-select"
                      value={selectedRecurringId}
                      onChange={(e) => handleSelectRecurringItem(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-indigo-500/40 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">
                        -- Custom Monthly Item (Or Select Below) --
                      </option>
                      {matchingRecurringList.map((rec) => (
                        <option key={rec.id} value={rec.id}>
                          {rec.title} — {currency}
                          {rec.amount.toLocaleString()} ({rec.frequency})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSameSelfTransferAccount}
              className={`px-5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${accentBtnClass}`}
            >
              <Check className="w-4 h-4" />
              {editingTransaction
                ? `Update Record #${editingTransaction.id}`
                : 'Save Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
