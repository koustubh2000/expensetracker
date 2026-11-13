import React, { useMemo, useState } from 'react';
import {
  UserPlus,
  FileText,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Link2,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Ban,
  History,
  RotateCcw,
  X,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Layers,
  Archive,
  Eye,
  FolderMinus,
  ShieldAlert,
  BarChart3,
  Wallet,
  Upload,
} from 'lucide-react';
import {
  ExpectedItem,
  PdfHeaderImageConfig,
  PersonProfile,
  PersonRecordGroup,
  PersonRecordGroupItemSnapshot,
  TransactionRecord,
  WalletAccount,
} from '../types/finance';
import {
  calculateGlobalReceivablesAndPayables,
  calculatePersonLedger,
  DEFAULT_CATEGORIES,
  resolveFlexibleLabel,
  verifySecretAgainstStoredHash,
} from '../utils/financeRules';
import { exportPersonBillToExcel, generatePersonBillPdf } from '../utils/pdfExporter';
import { PdfPreviewModal } from './PdfPreviewModal';
import {
  DropdownListEditButton,
  useEditableDropdownOptions,
} from './DropdownListEditButton';
import { useImageDragDropAndPaste } from '../utils/imageUploadHelpers';

const PERSON_RELATIONSHIP_OPTIONS = [
  'Client',
  'Friend',
  'Family',
  'Colleague',
  'Tenant',
  'Borrower',
  'Lender',
  'Other',
];

export interface RecordSettlementAdjustmentPayload {
  recordId: string;
  sourceType: 'expected_item' | 'linked_transaction';
  targetStatus: 'pending' | 'partial' | 'settled';
  totalAmount: number;
  newSettledAmount: number;
  previousSettledAmount: number;
  selectedAccountId?: string;
  personId: string;
  title: string;
  isPayable: boolean;
}

interface PeopleAndBillsViewProps {
  people: PersonProfile[];
  expectedItems: ExpectedItem[];
  transactions: TransactionRecord[];
  accounts: WalletAccount[];
  personRecordGroups?: PersonRecordGroup[];
  currency: string;
  issuedByName: string;
  isAdminPortal: boolean;
  pdfHeaderConfig: PdfHeaderImageConfig;
  readOnlyMode?: boolean;
  userPasswordHash?: string;
  onTriggerFeedback?: (
    message: string,
    type?: 'success' | 'error',
    mode?: 'fullscreen' | 'toast'
  ) => void;
  onAddPerson: (person: Omit<PersonProfile, 'id'>) => PersonProfile;
  onDeletePerson: (personId: string) => void;
  onBlockPerson?: (personId: string, reason: string) => void;
  onUnblockPerson?: (personId: string) => void;
  onAddExpectedManual: (item: Omit<ExpectedItem, 'id'>) => void;
  onUpdateExpectedItem?: (item: ExpectedItem) => void;
  onDeleteExpectedItem: (itemId: string) => void;
  onDeleteTransaction: (txId: string) => void;
  onUnlinkTransactionFromPerson?: (txId: string) => void;
  initialSelectedPersonId?: string;
  onEditTransaction?: (tx: TransactionRecord) => void;
  onLinkTransactionToPerson: (
    txId: string,
    personId: string,
    dueDate: string,
    direction?: ExpectedItem['direction']
  ) => void;
  onSettleExpectedItem: (itemId: string, amountPaid: number, depositAccountId?: string) => void;
  onAdjustRecordSettlementStatus?: (payload: RecordSettlementAdjustmentPayload) => void;
  onAttachProofToRecord?: (
    recordId: string,
    sourceType: 'expected_item' | 'linked_transaction',
    file: File
  ) => void;
  onUpdatePersonRecordGroups?: (
    groups: PersonRecordGroup[],
    bulkStatusUpdates?: {
      expectedItemIds: string[];
      transactionIds: string[];
      markPaid: boolean;
    }
  ) => void;
}

interface UnifiedPersonRecordRow {
  id: string;
  displayRecordId: string;
  sourceType: 'expected_item' | 'linked_transaction';
  title: string;
  date: string;
  dueDateLabel: string;
  categoryLabel: string;
  directionLabel: string;
  isPayable: boolean;
  amount: number;
  settledAmount: number;
  dueAmount: number;
  status: 'pending' | 'partial' | 'settled';
  proofId?: string;
  proofImageName?: string;
  proofImageDataUrl?: string;
  rawExpectedItem?: ExpectedItem;
  rawTransaction?: TransactionRecord;
}

export const PeopleAndBillsView: React.FC<PeopleAndBillsViewProps> = ({
  people,
  expectedItems,
  transactions,
  accounts,
  personRecordGroups = [],
  currency,
  issuedByName,
  isAdminPortal,
  pdfHeaderConfig,
  readOnlyMode = false,
  userPasswordHash,
  onTriggerFeedback,
  onAddPerson,
  onDeletePerson,
  onBlockPerson,
  onUnblockPerson,
  onAddExpectedManual,
  onUpdateExpectedItem,
  onDeleteExpectedItem,
  onDeleteTransaction,
  onUnlinkTransactionFromPerson,
  initialSelectedPersonId,
  onEditTransaction,
  onLinkTransactionToPerson,
  onSettleExpectedItem,
  onAdjustRecordSettlementStatus,
  onAttachProofToRecord,
  onUpdatePersonRecordGroups,
}) => {
  const activePeople = people.filter((p) => !p.isBlocked);
  const blockedPeople = people.filter((p) => p.isBlocked);

  const [selectedPersonId, setSelectedPersonId] = useState<string>(
    initialSelectedPersonId || activePeople[0]?.id || people[0]?.id || ''
  );

  React.useEffect(() => {
    if (initialSelectedPersonId && people.some((p) => p.id === initialSelectedPersonId)) {
      setSelectedPersonId(initialSelectedPersonId);
      setPersonLedgerTab('live');
    }
  }, [initialSelectedPersonId, people]);

  const [billModalPerson, setBillModalPerson] = useState<PersonProfile | null>(null);

  // Active Person View Tab: 'live' vs 'history'
  const [personLedgerTab, setPersonLedgerTab] = useState<'live' | 'history'>('live');

  // Expandable Add Expected Money / Quick Payable Form (Initially Closed so records show directly)
  const [showAddExpectedForm, setShowAddExpectedForm] = useState<boolean>(false);

  // Tickable Checkboxes & Record Grouping State
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [customGroupTitle, setCustomGroupTitle] = useState<string>('');

  // Expand / Collapse state for groups (multiple groups support)
  // By default, groups show their Group Name + Enclosed Chart, and can be expanded/collapsed
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<string[]>([]);

  // Blocked Payee Past History Expanded Rows State
  const [expandedBlockedPersonIds, setExpandedBlockedPersonIds] = useState<string[]>([]);

  // Block & Archive Payee Modal State
  const [blockingPerson, setBlockingPerson] = useState<PersonProfile | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [blockError, setBlockError] = useState('');

  // Password Confirmation Modal for Deleting a Person Card
  const [personPendingDelete, setPersonPendingDelete] = useState<PersonProfile | null>(null);
  const [deletePersonPassword, setDeletePersonPassword] = useState('');
  const [deletePersonError, setDeletePersonError] = useState('');

  // Password Confirmation Modal for Deleting a Receivable / Payable Record
  const [recordPendingDelete, setRecordPendingDelete] = useState<{
    row: UnifiedPersonRecordRow;
    fromGroupId?: string;
  } | null>(null);
  const [deleteRecordPassword, setDeleteRecordPassword] = useState('');
  const [deleteRecordError, setDeleteRecordError] = useState('');

  // Password Confirmation Modal for Reverting from History (Whole Group OR Single Record)
  const [revertModalTarget, setRevertModalTarget] = useState<{
    mode: 'whole_group' | 'single_record';
    group: PersonRecordGroup;
    recordId?: string;
    recordTitle?: string;
  } | null>(null);
  const [revertPassword, setRevertPassword] = useState('');
  const [revertPasswordError, setRevertPasswordError] = useState('');

  // Interactive Status Settlement Modal (Pending / Partially Paid / Paid + Amount + Account)
  const [settlementModalRow, setSettlementModalRow] = useState<UnifiedPersonRecordRow | null>(null);
  const [settlementTargetStatus, setSettlementTargetStatus] = useState<
    'pending' | 'partial' | 'settled'
  >('settled');
  const [settlementAmountInput, setSettlementAmountInput] = useState<string>('');
  const [settlementAccountId, setSettlementAccountId] = useState<string>(accounts[0]?.id || '');
  const [settlementModalError, setSettlementModalError] = useState<string>('');

  // Edit Expected Item Modal (for editing expected items both in Live Records and inside a Group)
  const [editingExpectedItem, setEditingExpectedItem] = useState<ExpectedItem | null>(null);
  const [editExpTitle, setEditExpTitle] = useState('');
  const [editExpAmount, setEditExpAmount] = useState('');
  const [editExpDirection, setEditExpDirection] =
    useState<ExpectedItem['direction']>('expecting_from');
  const [editExpCategory, setEditExpCategory] = useState('');
  const [editExpDueDate, setEditExpDueDate] = useState('');

  const relationshipList = useEditableDropdownOptions(
    'person_relationship',
    PERSON_RELATIONSHIP_OPTIONS,
    [],
    'Other'
  );
  const expectedCategoryList = useEditableDropdownOptions(
    'expected_category',
    DEFAULT_CATEGORIES.expected_incoming,
    [],
    'Other'
  );

  // Clickable View / Attach Proof Modal for any record (ungrouped, in group, or in history)
  const [proofModalRecord, setProofModalRecord] = useState<{
    id: string;
    displayId: string;
    sourceType: 'expected_item' | 'linked_transaction';
    title: string;
    date: string;
    amount: number;
    settledAmount: number;
    categoryLabel: string;
    statusLabel: string;
    proofId?: string;
    proofImageName?: string;
    proofImageDataUrl?: string;
  } | null>(null);

  // Add Person Form State
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [personName, setPersonName] = useState('');
  const [personRel, setPersonRel] = useState<PersonProfile['relationship']>('Client');
  const [personCustomRel, setPersonCustomRel] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [personPhone, setPersonPhone] = useState('');
  const [personNotes, setPersonNotes] = useState('');

  // Add Expected / Quick Payable Entry Mode ('manual' vs 'from_record')
  const [entryMode, setEntryMode] = useState<'manual' | 'from_record'>('manual');
  const [expTitle, setExpTitle] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expSettled, setExpSettled] = useState('0');
  const [expDirection, setExpDirection] = useState<ExpectedItem['direction']>('expecting_from');
  const [expCustomDirection, setExpCustomDirection] = useState('');
  const [expCategory, setExpCategory] = useState(DEFAULT_CATEGORIES.expected_incoming[0]);
  const [expCustomCategory, setExpCustomCategory] = useState('');
  const [expDueDate, setExpDueDate] = useState('2026-11-30');
  const [selectedRecordTxId, setSelectedRecordTxId] = useState(transactions[0]?.id || '');
  const [feedback, setFeedback] = useState('');

  const activePerson =
    people.find((p) => p.id === selectedPersonId) || activePeople[0] || people[0] || null;

  const accentBtnClass = isAdminPortal
    ? 'bg-rose-600 hover:bg-rose-500 text-white'
    : 'bg-emerald-600 hover:bg-emerald-500 text-white';

  const accentBorderSelected = isAdminPortal
    ? 'border-rose-500 bg-rose-500/5 dark:bg-rose-500/10'
    : 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10';

  const toggleGroupExpand = (groupId: string) => {
    setCollapsedGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const toggleBlockedPersonExpand = (personId: string) => {
    setExpandedBlockedPersonIds((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    );
  };

  const handleSelectPersonCard = (personId: string) => {
    setSelectedPersonId(personId);
    setSelectedRecordIds([]);
    setPersonLedgerTab('live');
    setShowAddExpectedForm(false);
  };

  // Password-Protected Person Deletion
  const handleInitiateDeletePerson = (person: PersonProfile) => {
    if (readOnlyMode) return;
    setPersonPendingDelete(person);
    setDeletePersonPassword('');
    setDeletePersonError('');
  };

  const handleConfirmDeletePersonWithPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personPendingDelete) return;
    if (!deletePersonPassword.trim()) {
      setDeletePersonError('Please enter your account password to confirm deletion.');
      return;
    }
    if (
      userPasswordHash &&
      userPasswordHash !== 'google-oauth' &&
      !verifySecretAgainstStoredHash(deletePersonPassword, userPasswordHash)
    ) {
      setDeletePersonError('Incorrect password. Person profile deletion cancelled.');
      return;
    }

    const deletedName = personPendingDelete.name;
    const deletedId = personPendingDelete.id;
    onDeletePerson(deletedId);
    setPersonPendingDelete(null);
    setDeletePersonPassword('');
    setDeletePersonError('');
    const nextActive = activePeople.find((p) => p.id !== deletedId);
    if (selectedPersonId === deletedId && nextActive) {
      setSelectedPersonId(nextActive.id);
    }
    setFeedback(`Verified password and moved "${deletedName}" to the Recycle Bin.`);
  };

  const handleConfirmBlockPerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockingPerson) return;
    if (!blockReason.trim()) {
      setBlockError('Please enter a reason for blocking/archiving this profile.');
      return;
    }
    onBlockPerson?.(blockingPerson.id, blockReason.trim());
    setFeedback(
      `Blocked "${blockingPerson.name}" (${blockReason.trim()}) and archived profile & records to Past History.`
    );
    onTriggerFeedback?.(`Blocked & Archived ${blockingPerson.name}`, 'success');
    const nextActive = activePeople.find((p) => p.id !== blockingPerson.id);
    if (selectedPersonId === blockingPerson.id && nextActive) {
      setSelectedPersonId(nextActive.id);
    }
    setBlockingPerson(null);
    setBlockReason('');
    setBlockError('');
  };

  const handleCreatePerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnlyMode) return;
    if (!personName.trim()) return;
    const created = onAddPerson({
      name: personName.trim(),
      relationship: personRel,
      customRelationship: personRel === 'Other' ? personCustomRel.trim() : undefined,
      email: personEmail.trim() || undefined,
      phone: personPhone.trim() || undefined,
      notes: personNotes.trim() || undefined,
    });
    setSelectedPersonId(created.id);
    setPersonName('');
    setPersonCustomRel('');
    setPersonEmail('');
    setPersonPhone('');
    setPersonNotes('');
    setShowAddPerson(false);
    setFeedback(`Added ${created.name} to your People & Billing directory.`);
    onTriggerFeedback?.(`Saved ${created.name} Successfully`, 'success');
  };

  const handleAddManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnlyMode || !activePerson) return;
    const amt = Number(expAmount);
    const settled = Number(expSettled) || 0;
    if (!expTitle.trim() || !Number.isFinite(amt) || amt <= 0) return;

    const status: ExpectedItem['status'] =
      settled >= amt ? 'settled' : settled > 0 ? 'partial' : 'pending';

    onAddExpectedManual({
      personId: activePerson.id,
      title: expTitle.trim(),
      amount: amt,
      settledAmount: settled,
      direction: expDirection,
      customDirection: expDirection === 'other' ? expCustomDirection.trim() : undefined,
      category: expCategory,
      customCategory: expCategory === 'Other' ? expCustomCategory.trim() : undefined,
      date: '2026-11-07',
      dueDate: expDueDate,
      status,
    });

    setExpTitle('');
    setExpAmount('');
    setExpSettled('0');
    setShowAddExpectedForm(false);
    setFeedback(`Added "${expTitle.trim()}" to ${activePerson.name}'s ledger.`);
    onTriggerFeedback?.('Bill Item Saved Successfully', 'success');
  };

  const handleLinkRecordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnlyMode) return;
    const txIdToUse = selectedRecordTxId || transactions[0]?.id;
    if (!activePerson || !txIdToUse) return;
    onLinkTransactionToPerson(txIdToUse, activePerson.id, expDueDate, expDirection);
    setShowAddExpectedForm(false);
    setFeedback(`Linked transaction record to ${activePerson.name} for billing & tracking.`);
    onTriggerFeedback?.('Record Linked to Bill Successfully', 'success');
  };

  const handleDirectDownloadPdfBill = (
    person: PersonProfile,
    orientation?: 'portrait' | 'landscape'
  ) => {
    if (readOnlyMode) return;
    const res = generatePersonBillPdf({
      person,
      expectedItems,
      transactions,
      personRecordGroups,
      currency,
      issuedBy: issuedByName,
      role: isAdminPortal ? 'admin' : 'user',
      headerConfig: pdfHeaderConfig,
      orientation,
      triggerDownload: true,
    });
    setFeedback(
      `Downloaded HD A4 PDF "${res.filename}" (${res.itemCount} records, ${res.screenshotCount} proof screenshots).`
    );
    onTriggerFeedback?.('PDF Bill Generated Successfully', 'success', 'fullscreen');
  };

  const handleDirectDownloadExcelBill = (person: PersonProfile) => {
    if (readOnlyMode) return;
    const filename = exportPersonBillToExcel({
      person,
      expectedItems,
      transactions,
      personRecordGroups,
      currency,
      issuedBy: issuedByName,
    });
    setFeedback(`Exported Excel spreadsheet "${filename}" for ${person.name}.`);
    onTriggerFeedback?.('Excel Bill Exported Successfully', 'success');
  };

  // Convert an ExpectedItem or Linked TransactionRecord into a unified row structure
  const buildUnifiedRecordRow = (
    itemOrTx: ExpectedItem | TransactionRecord,
    sourceType: 'expected_item' | 'linked_transaction'
  ): UnifiedPersonRecordRow => {
    if (sourceType === 'expected_item') {
      const item = itemOrTx as ExpectedItem;
      const linkedTx = item.linkedTransactionId
        ? transactions.find((t) => t.id === item.linkedTransactionId)
        : undefined;
      const due = Math.max(0, Math.round((item.amount - item.settledAmount) * 100) / 100);
      const status: 'pending' | 'partial' | 'settled' =
        due <= 0.01 ? 'settled' : item.settledAmount > 0 ? 'partial' : 'pending';
      const isPayable = item.direction === 'borrowed_from';
      const directionLabel =
        item.direction === 'borrowed_from'
          ? 'Quick Payable (Need to Pay)'
          : item.direction === 'lent_to'
          ? 'Money Lent (Receivable)'
          : item.direction === 'expecting_from'
          ? 'Expected Income (Receivable)'
          : `Other (${item.customDirection || 'Custom'})`;

      return {
        id: item.id,
        displayRecordId: item.linkedTransactionId || item.id,
        sourceType: 'expected_item',
        title: item.title,
        date: item.date,
        dueDateLabel: `Due ${item.dueDate}`,
        categoryLabel: resolveFlexibleLabel(item.category, item.customCategory),
        directionLabel,
        isPayable,
        amount: item.amount,
        settledAmount: item.settledAmount,
        dueAmount: due,
        status,
        proofId: item.proofId || linkedTx?.proofId,
        proofImageName: item.proofImageName || linkedTx?.proofImageName,
        proofImageDataUrl: item.proofImageDataUrl || linkedTx?.proofImageDataUrl,
        rawExpectedItem: item,
        rawTransaction: linkedTx,
      };
    }

    const tx = itemOrTx as TransactionRecord;
    const settledAmt =
      tx.status === 'settled'
        ? tx.amount
        : tx.status === 'partial' || (tx.settledAmount && tx.settledAmount > 0)
        ? Math.min(tx.amount, Math.max(0, Number(tx.settledAmount) || 0))
        : 0;
    const due = Math.max(0, Math.round((tx.amount - settledAmt) * 100) / 100);
    const status: 'pending' | 'partial' | 'settled' =
      due <= 0.01 ? 'settled' : settledAmt > 0 ? 'partial' : 'pending';
    const isPayable = tx.type === 'borrowing_in';

    return {
      id: tx.id,
      displayRecordId: tx.id,
      sourceType: 'linked_transaction',
      title: tx.title,
      date: tx.date,
      dueDateLabel: 'Ledger Record',
      categoryLabel: resolveFlexibleLabel(tx.category, tx.customCategory),
      directionLabel:
        tx.type === 'borrowing_in'
          ? 'Quick Payable / Borrowed'
          : `Linked ${tx.type.replace('_', ' ')}`,
      isPayable,
      amount: tx.amount,
      settledAmount: settledAmt,
      dueAmount: due,
      status,
      proofId: tx.proofId,
      proofImageName: tx.proofImageName,
      proofImageDataUrl: tx.proofImageDataUrl,
      rawTransaction: tx,
    };
  };

  // Groups for the currently selected person
  const activePersonGroups = useMemo(() => {
    if (!activePerson) return [];
    return personRecordGroups.filter((g) => g.personId === activePerson.id);
  }, [personRecordGroups, activePerson]);

  const livePersonGroups = useMemo(
    () => activePersonGroups.filter((g) => !g.isClearedToHistory),
    [activePersonGroups]
  );

  const historyPersonGroups = useMemo(
    () => activePersonGroups.filter((g) => Boolean(g.isClearedToHistory)),
    [activePersonGroups]
  );

  // Set of all record IDs already inside any group (live or history) for this person
  const groupedRecordIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const grp of activePersonGroups) {
      const ids = grp.itemIds || grp.recordIds || [];
      for (const id of ids) {
        set.add(id);
      }
    }
    return set;
  }, [activePersonGroups]);

  // Resolve live rows inside a group so edits, partial payments, and proof attachments stay live
  const resolveGroupRows = (group: PersonRecordGroup): UnifiedPersonRecordRow[] => {
    const ids = group.itemIds || group.recordIds || [];
    const rows: UnifiedPersonRecordRow[] = [];

    for (const id of ids) {
      const foundExp = expectedItems.find((e) => e.id === id);
      if (foundExp) {
        rows.push(buildUnifiedRecordRow(foundExp, 'expected_item'));
        continue;
      }
      const foundTx = transactions.find((t) => t.id === id);
      if (foundTx) {
        rows.push(buildUnifiedRecordRow(foundTx, 'linked_transaction'));
        continue;
      }
      // Fallback to snapshot if underlying item was removed
      const snap = (group.itemsSnapshot || []).find((s) => s.id === id);
      if (snap) {
        const settled = snap.isPaid ? snap.amount : snap.settledAmount || 0;
        const due = Math.max(0, snap.amount - settled);
        rows.push({
          id: snap.id,
          displayRecordId: snap.id,
          sourceType:
            snap.sourceType === 'linked_transaction' || snap.sourceType === 'transaction'
              ? 'linked_transaction'
              : 'expected_item',
          title: snap.title,
          date: snap.date,
          dueDateLabel: snap.dueDate ? `Due ${snap.dueDate}` : 'Grouped Record',
          categoryLabel: snap.category || snap.categoryLabel || 'General',
          directionLabel: snap.directionLabel || 'Receivable',
          isPayable: (snap.directionLabel || '').toLowerCase().includes('payable'),
          amount: snap.amount,
          settledAmount: settled,
          dueAmount: due,
          status: due <= 0.01 ? 'settled' : settled > 0 ? 'partial' : 'pending',
          proofId: snap.proofId,
          proofImageName: snap.proofImageName,
          proofImageDataUrl: snap.proofImageDataUrl,
        });
      }
    }
    return rows;
  };

  const toggleRecordCheckbox = (recordId: string) => {
    setSelectedRecordIds((prev) =>
      prev.includes(recordId) ? prev.filter((id) => id !== recordId) : [...prev, recordId]
    );
  };

  const handleCreateRecordGroup = () => {
    if (!activePerson || selectedRecordIds.length === 0) return;
    const ledger = calculatePersonLedger(
      activePerson,
      expectedItems,
      transactions,
      personRecordGroups
    );

    const snapshots: PersonRecordGroupItemSnapshot[] = [];
    for (const item of ledger.items) {
      if (selectedRecordIds.includes(item.id)) {
        const row = buildUnifiedRecordRow(item, 'expected_item');
        snapshots.push({
          id: row.id,
          sourceType: 'expected_item',
          title: row.title,
          date: row.date,
          dueDate: item.dueDate,
          category: row.categoryLabel,
          amount: row.amount,
          settledAmount: row.settledAmount,
          directionLabel: row.directionLabel,
          isPaid: row.status === 'settled',
          status: row.status,
          proofId: row.proofId,
          proofImageName: row.proofImageName,
          proofImageDataUrl: row.proofImageDataUrl,
        });
      }
    }
    for (const tx of ledger.linkedTransactions) {
      if (selectedRecordIds.includes(tx.id)) {
        const row = buildUnifiedRecordRow(tx, 'linked_transaction');
        snapshots.push({
          id: row.id,
          sourceType: 'linked_transaction',
          title: row.title,
          date: row.date,
          category: row.categoryLabel,
          amount: row.amount,
          settledAmount: row.settledAmount,
          directionLabel: row.directionLabel,
          isPaid: row.status === 'settled',
          status: row.status,
          proofId: row.proofId,
          proofImageName: row.proofImageName,
          proofImageDataUrl: row.proofImageDataUrl,
        });
      }
    }

    if (snapshots.length === 0) return;

    const groupTitle =
      customGroupTitle.trim() ||
      `Record Group #${activePersonGroups.length + 1} (${snapshots.length} items)`;

    const newGroup: PersonRecordGroup = {
      id: `pgrp-${Date.now()}`,
      personId: activePerson.id,
      title: groupTitle,
      name: groupTitle,
      itemIds: snapshots.map((s) => s.id),
      recordIds: snapshots.map((s) => s.id),
      itemsSnapshot: snapshots,
      allPaid: snapshots.every((s) => s.isPaid),
      isClearedToHistory: false,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    const nextGroups = [...personRecordGroups, newGroup];
    onUpdatePersonRecordGroups?.(nextGroups);
    setSelectedRecordIds([]);
    setCustomGroupTitle('');
    setFeedback(`Created "${newGroup.title}" with ${snapshots.length} selected records.`);
  };

  // Ungroup an entire group back to ungrouped Live Records
  const handleUngroupWholeGroup = (group: PersonRecordGroup) => {
    if (readOnlyMode) return;
    const nextGroups = personRecordGroups.filter((g) => g.id !== group.id);
    onUpdatePersonRecordGroups?.(nextGroups);
    setFeedback(
      `Ungrouped "${group.title || group.name}". All records returned to ungrouped Live Records.`
    );
  };

  // Remove / Ungroup a single record from a group back to ungrouped Live Records
  const handleRemoveSingleRecordFromGroup = (group: PersonRecordGroup, recordId: string) => {
    if (readOnlyMode) return;
    const currentIds = group.itemIds || group.recordIds || [];
    const remainingIds = currentIds.filter((id) => id !== recordId);
    const remainingSnaps = (group.itemsSnapshot || []).filter((s) => s.id !== recordId);

    if (remainingIds.length === 0) {
      const nextGroups = personRecordGroups.filter((g) => g.id !== group.id);
      onUpdatePersonRecordGroups?.(nextGroups);
      setFeedback(`Removed last record from "${group.title || group.name}" and dissolved empty group.`);
      return;
    }

    const nextGroups = personRecordGroups.map((g) =>
      g.id === group.id
        ? {
            ...g,
            itemIds: remainingIds,
            recordIds: remainingIds,
            itemsSnapshot: remainingSnaps,
            allPaid: remainingSnaps.every((s) => s.isPaid),
          }
        : g
    );
    onUpdatePersonRecordGroups?.(nextGroups);
    setFeedback(`Removed record #${recordId} from "${group.title || group.name}" back to Live Records.`);
  };

  const handleToggleGroupPaidAll = (group: PersonRecordGroup) => {
    const resolvedRows = resolveGroupRows(group);
    const currentlyAllPaid = resolvedRows.every((r) => r.status === 'settled');
    const nextMarkPaid = !currentlyAllPaid;

    const expIds = resolvedRows
      .filter((r) => r.sourceType === 'expected_item')
      .map((r) => r.id);
    const txIds = resolvedRows
      .filter((r) => r.sourceType === 'linked_transaction')
      .map((r) => r.id);

    const updatedGroups = personRecordGroups.map((g) =>
      g.id === group.id
        ? {
            ...g,
            allPaid: nextMarkPaid,
            itemsSnapshot: (g.itemsSnapshot || []).map((s) => ({
              ...s,
              isPaid: nextMarkPaid,
              status: nextMarkPaid ? ('settled' as const) : ('pending' as const),
              settledAmount: nextMarkPaid ? s.amount : 0,
            })),
          }
        : g
    );

    onUpdatePersonRecordGroups?.(updatedGroups, {
      expectedItemIds: expIds,
      transactionIds: txIds,
      markPaid: nextMarkPaid,
    });
    setFeedback(
      `Marked all ${resolvedRows.length} records in "${group.title || group.name}" as ${
        nextMarkPaid ? 'PAID' : 'UNPAID'
      }.`
    );
  };

  const handleClearGroupToHistory = (group: PersonRecordGroup) => {
    const resolvedRows = resolveGroupRows(group);
    const expIds = resolvedRows
      .filter((r) => r.sourceType === 'expected_item')
      .map((r) => r.id);
    const txIds = resolvedRows
      .filter((r) => r.sourceType === 'linked_transaction')
      .map((r) => r.id);

    const updatedGroups = personRecordGroups.map((g) =>
      g.id === group.id
        ? {
            ...g,
            allPaid: true,
            isClearedToHistory: true,
            clearedAt: new Date().toISOString().slice(0, 10),
            itemsSnapshot: (g.itemsSnapshot || []).map((s) => ({
              ...s,
              isPaid: true,
              status: 'settled' as const,
              settledAmount: s.amount,
            })),
          }
        : g
    );

    onUpdatePersonRecordGroups?.(updatedGroups, {
      expectedItemIds: expIds,
      transactionIds: txIds,
      markPaid: true,
    });
    setFeedback(
      `Cleared "${group.title || group.name}" and moved group to ${activePerson?.name}'s History tab.`
    );
  };

  // Password-Protected Revert from History (Whole Group OR Single Record)
  const handleOpenRevertHistoryModal = (
    mode: 'whole_group' | 'single_record',
    group: PersonRecordGroup,
    recordId?: string,
    recordTitle?: string
  ) => {
    if (readOnlyMode) return;
    setRevertModalTarget({ mode, group, recordId, recordTitle });
    setRevertPassword('');
    setRevertPasswordError('');
  };

  const handleConfirmRevertFromHistory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!revertModalTarget) return;
    if (!revertPassword.trim()) {
      setRevertPasswordError('Please enter your account password to revert from History.');
      return;
    }
    if (
      userPasswordHash &&
      userPasswordHash !== 'google-oauth' &&
      !verifySecretAgainstStoredHash(revertPassword, userPasswordHash)
    ) {
      setRevertPasswordError('Incorrect password. Revert cancelled.');
      return;
    }

    const { mode, group, recordId, recordTitle } = revertModalTarget;

    if (mode === 'whole_group') {
      const updatedGroups = personRecordGroups.map((g) =>
        g.id === group.id
          ? {
              ...g,
              isClearedToHistory: false,
              clearedAt: undefined,
            }
          : g
      );
      onUpdatePersonRecordGroups?.(updatedGroups);
      setFeedback(
        `Verified password and reverted whole group "${group.title || group.name}" back to Live Records.`
      );
      setPersonLedgerTab('live');
    } else if (mode === 'single_record' && recordId) {
      const currentIds = group.itemIds || group.recordIds || [];
      const remainingIds = currentIds.filter((id) => id !== recordId);
      const remainingSnaps = (group.itemsSnapshot || []).filter((s) => s.id !== recordId);

      const updatedGroups =
        remainingIds.length === 0
          ? personRecordGroups.filter((g) => g.id !== group.id)
          : personRecordGroups.map((g) =>
              g.id === group.id
                ? {
                    ...g,
                    itemIds: remainingIds,
                    recordIds: remainingIds,
                    itemsSnapshot: remainingSnaps,
                  }
                : g
            );

      const isExpItem = expectedItems.some((e) => e.id === recordId);
      onUpdatePersonRecordGroups?.(updatedGroups, {
        expectedItemIds: isExpItem ? [recordId] : [],
        transactionIds: isExpItem ? [] : [recordId],
        markPaid: false,
      });
      setFeedback(
        `Verified password and reverted record "${recordTitle || recordId}" from History back to Live Records.`
      );
      setPersonLedgerTab('live');
    }

    setRevertModalTarget(null);
    setRevertPassword('');
    setRevertPasswordError('');
  };

  // Open Interactive Settlement Status Modal (Pending / Partially Paid / Paid)
  const handleOpenStatusSettlementModal = (
    row: UnifiedPersonRecordRow,
    initialStatus?: 'pending' | 'partial' | 'settled'
  ) => {
    if (readOnlyMode) return;
    const defaultStatus =
      initialStatus || (row.status === 'settled' ? 'settled' : 'settled');
    setSettlementModalRow(row);
    setSettlementTargetStatus(defaultStatus);
    if (defaultStatus === 'settled') {
      setSettlementAmountInput(String(row.amount));
    } else if (defaultStatus === 'partial') {
      const suggestedPartial =
        row.settledAmount > 0 && row.settledAmount < row.amount
          ? row.settledAmount
          : Math.round((row.amount / 2) * 100) / 100;
      setSettlementAmountInput(String(suggestedPartial));
    } else {
      setSettlementAmountInput('0');
    }
    setSettlementAccountId(
      row.rawTransaction?.accountId || accounts[0]?.id || ''
    );
    setSettlementModalError('');
  };

  const handleSaveStatusSettlementModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlementModalRow || !activePerson) return;

    let newSettled = 0;
    if (settlementTargetStatus === 'settled') {
      newSettled = settlementModalRow.amount;
    } else if (settlementTargetStatus === 'partial') {
      const parsed = Number(settlementAmountInput);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= settlementModalRow.amount) {
        setSettlementModalError(
          `For Partially Paid, enter an amount greater than 0 and less than ${currency}${settlementModalRow.amount.toLocaleString()}.`
        );
        return;
      }
      newSettled = Math.round(parsed * 100) / 100;
    } else {
      newSettled = 0;
    }

    if (onAdjustRecordSettlementStatus) {
      onAdjustRecordSettlementStatus({
        recordId: settlementModalRow.id,
        sourceType: settlementModalRow.sourceType,
        targetStatus: settlementTargetStatus,
        totalAmount: settlementModalRow.amount,
        newSettledAmount: newSettled,
        previousSettledAmount: settlementModalRow.settledAmount,
        selectedAccountId: settlementAccountId || accounts[0]?.id,
        personId: activePerson.id,
        title: settlementModalRow.title,
        isPayable: settlementModalRow.isPayable,
      });
    } else if (
      settlementModalRow.sourceType === 'expected_item' &&
      newSettled > settlementModalRow.settledAmount
    ) {
      onSettleExpectedItem(
        settlementModalRow.id,
        newSettled - settlementModalRow.settledAmount,
        settlementAccountId || accounts[0]?.id
      );
    }

    const selectedAcc = accounts.find((a) => a.id === settlementAccountId);
    const statusText =
      settlementTargetStatus === 'settled'
        ? 'PAID (Settled)'
        : settlementTargetStatus === 'partial'
        ? `PARTIALLY PAID (${currency}${newSettled.toLocaleString()} paid, ${currency}${(
            settlementModalRow.amount - newSettled
          ).toLocaleString()} remaining)`
        : 'PENDING (Unpaid)';

    setFeedback(
      `Updated "${settlementModalRow.title}" to ${statusText}${
        selectedAcc ? ` · Account adjusted: ${selectedAcc.name}` : ''
      }.`
    );
    setSettlementModalRow(null);
  };

  // Open Edit Modal for ExpectedItem or Linked Transaction
  const handleEditUnifiedRecord = (row: UnifiedPersonRecordRow) => {
    if (readOnlyMode) return;
    if (row.sourceType === 'linked_transaction' && row.rawTransaction && onEditTransaction) {
      onEditTransaction(row.rawTransaction);
      return;
    }
    if (row.sourceType === 'expected_item' && row.rawExpectedItem) {
      const item = row.rawExpectedItem;
      setEditingExpectedItem(item);
      setEditExpTitle(item.title);
      setEditExpAmount(String(item.amount));
      setEditExpDirection(item.direction);
      setEditExpCategory(item.category);
      setEditExpDueDate(item.dueDate);
    }
  };

  const handleSaveEditedExpectedItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpectedItem) return;
    const amt = Number(editExpAmount);
    if (!editExpTitle.trim() || !Number.isFinite(amt) || amt <= 0) return;

    const clampedSettled = Math.min(amt, editingExpectedItem.settledAmount);
    const nextStatus: ExpectedItem['status'] =
      clampedSettled >= amt ? 'settled' : clampedSettled > 0 ? 'partial' : 'pending';

    const updated: ExpectedItem = {
      ...editingExpectedItem,
      title: editExpTitle.trim(),
      amount: amt,
      settledAmount: clampedSettled,
      direction: editExpDirection,
      category: editExpCategory,
      dueDate: editExpDueDate,
      status: nextStatus,
    };

    onUpdateExpectedItem?.(updated);

    // Also update snapshot inside any group if present
    const nextGroups = personRecordGroups.map((g) => ({
      ...g,
      itemsSnapshot: (g.itemsSnapshot || []).map((s) =>
        s.id === updated.id
          ? {
              ...s,
              title: updated.title,
              amount: updated.amount,
              settledAmount: updated.settledAmount,
              category: updated.category,
              dueDate: updated.dueDate,
              isPaid: updated.status === 'settled',
              status: updated.status,
            }
          : s
      ),
    }));
    onUpdatePersonRecordGroups?.(nextGroups);

    setEditingExpectedItem(null);
    setFeedback(`Updated record "${updated.title}" successfully.`);
  };

  // Delete a unified record (whether ungrouped or inside a group) — requires password confirmation
  const handleDeleteUnifiedRecord = (row: UnifiedPersonRecordRow, fromGroupId?: string) => {
    if (readOnlyMode) return;
    setRecordPendingDelete({ row, fromGroupId });
    setDeleteRecordPassword('');
    setDeleteRecordError('');
  };

  const handleConfirmDeleteRecordWithPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordPendingDelete) return;
    if (!deleteRecordPassword.trim()) {
      setDeleteRecordError('Please enter your account password to confirm record deletion.');
      return;
    }
    if (
      userPasswordHash &&
      userPasswordHash !== 'google-oauth' &&
      !verifySecretAgainstStoredHash(deleteRecordPassword, userPasswordHash)
    ) {
      setDeleteRecordError('Incorrect password. Record deletion cancelled.');
      return;
    }

    const { row, fromGroupId } = recordPendingDelete;
    if (fromGroupId) {
      const targetGroup = personRecordGroups.find((g) => g.id === fromGroupId);
      if (targetGroup) {
        handleRemoveSingleRecordFromGroup(targetGroup, row.id);
      }
    }
    if (row.sourceType === 'expected_item') {
      onDeleteExpectedItem(row.id);
      setFeedback(
        `Verified password and removed "${row.title}" from ${activePerson?.name || 'Counterparty'}'s ledger.`
      );
    } else if (onUnlinkTransactionFromPerson) {
      onUnlinkTransactionFromPerson(row.id);
      setFeedback(
        `Verified password and removed "${row.title}" from ${activePerson?.name || 'Counterparty'}'s ledger (Main Record #${row.id} remains intact in Records).`
      );
    } else {
      onDeleteTransaction(row.id);
      setFeedback(`Verified password and moved "${row.title}" to the Recycle Bin.`);
    }
    setRecordPendingDelete(null);
    setDeleteRecordPassword('');
    setDeleteRecordError('');
  };

  // Open Clickable View / Upload Proof Modal
  const handleOpenProofModal = (row: UnifiedPersonRecordRow) => {
    setProofModalRecord({
      id: row.id,
      displayId: row.displayRecordId,
      sourceType: row.sourceType,
      title: row.title,
      date: row.date,
      amount: row.amount,
      settledAmount: row.settledAmount,
      categoryLabel: row.categoryLabel,
      statusLabel:
        row.status === 'settled'
          ? 'PAID'
          : row.status === 'partial'
          ? 'PARTIALLY PAID'
          : 'PENDING',
      proofId: row.proofId,
      proofImageName: row.proofImageName,
      proofImageDataUrl: row.proofImageDataUrl,
    });
  };

  // Calculate global Receivables ("Expected Income / Money Owed to Me") and Quick Payables ("People I Need to Pay")
  // using the shared single-source-of-truth helper so Dashboard & Receivables/Payables always match 100%.
  const globalReceivablesPayables = calculateGlobalReceivablesAndPayables(
    people,
    expectedItems,
    transactions,
    personRecordGroups
  );
  const totalReceivablesOwedToMe = globalReceivablesPayables.totalExpectedMoneyComingIn;
  const totalPayablesPeopleINeedToPay = globalReceivablesPayables.totalMoneyIOwePayablesOnly;

  // Reusable renderer for a Record Row (used both in Ungrouped Live Table and inside Expanded Live Groups)
  const renderInteractiveRecordRow = (
    row: UnifiedPersonRecordRow,
    options: {
      inGroup?: PersonRecordGroup;
      showCheckbox?: boolean;
    }
  ) => {
    const isChecked = selectedRecordIds.includes(row.id);
    const statusBadgeClass =
      row.status === 'settled'
        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-600 hover:text-white'
        : row.status === 'partial'
        ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 hover:bg-sky-600 hover:text-white'
        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500 hover:text-slate-950';

    const statusLabelText =
      row.status === 'settled'
        ? 'PAID'
        : row.status === 'partial'
        ? 'PARTIALLY PAID'
        : 'PENDING';

    return (
      <tr
        key={row.id}
        data-testid={
          options.inGroup
            ? `group-record-row-${options.inGroup.id}-${row.id}`
            : `person-live-record-row-${row.id}`
        }
        className={`transition-colors ${
          isChecked
            ? 'bg-indigo-500/10'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
        }`}
      >
        {options.showCheckbox && (
          <td className="py-3 pr-2 text-center">
            <input
              type="checkbox"
              data-testid={`person-record-checkbox-${row.id}`}
              checked={isChecked}
              onChange={() => toggleRecordCheckbox(row.id)}
              aria-label={`Select record ${row.title}`}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </td>
        )}
        <td className="py-3 pr-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
          <div>{row.displayRecordId}</div>
        </td>
        <td className="py-3 px-3 font-mono whitespace-nowrap">
          <div>{row.date}</div>
          <div className="text-[11px] text-slate-400">{row.dueDateLabel}</div>
        </td>
        <td className="py-3 px-3">
          <div className="font-medium text-slate-900 dark:text-slate-100">{row.title}</div>
          <div
            className={`text-[11px] ${
              row.isPayable
                ? 'text-rose-600 dark:text-rose-400 font-semibold'
                : 'text-slate-500'
            }`}
          >
            {row.directionLabel}
          </div>
        </td>
        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{row.categoryLabel}</td>
        <td className="py-3 px-3 font-mono tabular-nums text-right">
          <div>
            {currency}
            {row.amount.toLocaleString()}
          </div>
          {row.settledAmount > 0 && row.settledAmount < row.amount && (
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
              Paid: {currency}
              {row.settledAmount.toLocaleString()}
            </div>
          )}
        </td>
        <td className="py-3 px-3 font-mono tabular-nums text-right font-semibold">
          {currency}
          {row.dueAmount.toLocaleString()}
        </td>
        <td className="py-3 pl-3 text-right">
          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
            {/* Clickable Status Option: Pending / Partially Paid / Paid */}
            <button
              type="button"
              disabled={readOnlyMode}
              data-testid={
                options.inGroup
                  ? `group-record-status-btn-${options.inGroup.id}-${row.id}`
                  : `record-status-trigger-${row.id}`
              }
              onClick={() => handleOpenStatusSettlementModal(row)}
              title="Click to set Pending, Partially Paid, or Paid and adjust Bank Account"
              className={`px-2.5 py-1 rounded-md border text-[10px] font-extrabold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 ${statusBadgeClass}`}
            >
              <span>{statusLabelText}</span>
              <ChevronDown className="w-3 h-3 opacity-75" />
            </button>

            {/* Clickable View Proof Option */}
            <button
              type="button"
              data-testid={
                options.inGroup
                  ? `group-record-proof-btn-${options.inGroup.id}-${row.id}`
                  : `record-view-proof-btn-${row.id}`
              }
              onClick={() => handleOpenProofModal(row)}
              title="View or Attach HD Transaction Proof"
              className={`px-2 py-1 rounded-md border text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                row.proofImageDataUrl
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-500/50'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{row.proofImageDataUrl ? 'View Proof' : 'Proof'}</span>
            </button>

            {/* Edit Record Option */}
            <button
              type="button"
              disabled={readOnlyMode}
              data-testid={
                options.inGroup
                  ? `group-record-edit-btn-${options.inGroup.id}-${row.id}`
                  : `record-edit-btn-${row.id}`
              }
              onClick={() => handleEditUnifiedRecord(row)}
              aria-label={`Edit record ${row.title}`}
              title="Edit Record"
              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-500/10 cursor-pointer disabled:opacity-40"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>

            {/* If inside a group: Ungroup single item button */}
            {options.inGroup && (
              <button
                type="button"
                disabled={readOnlyMode}
                data-testid={`group-record-ungroup-item-btn-${options.inGroup.id}-${row.id}`}
                onClick={() =>
                  handleRemoveSingleRecordFromGroup(options.inGroup!, row.id)
                }
                aria-label={`Ungroup record ${row.title}`}
                title="Remove from Group (Ungroup this item)"
                className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-500/10 cursor-pointer disabled:opacity-40"
              >
                <FolderMinus className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Delete Record Option */}
            <button
              type="button"
              disabled={readOnlyMode}
              data-testid={
                options.inGroup
                  ? `group-record-delete-btn-${options.inGroup.id}-${row.id}`
                  : `record-delete-btn-${row.id}`
              }
              onClick={() => handleDeleteUnifiedRecord(row, options.inGroup?.id)}
              aria-label={`Delete record ${row.title}`}
              title="Move Record to Recycle Bin"
              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-4" data-testid="receivables-payables-view">
      {/* IMAGE 5: Single Compact Header Bar with Add Person / Entity Button */}
      <div className="px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div>
          <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
            Receivables and Payables — Expected Income &amp; People I Need to Pay
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Select any person to inspect live records, update Pending / Partially Paid / Paid status with bank sync, manage record groups with enclosed charts, or export HD PDF bills.
          </p>
        </div>
        <button
          type="button"
          disabled={readOnlyMode}
          data-testid="toggle-add-person-btn"
          onClick={() => !readOnlyMode && setShowAddPerson(!showAddPerson)}
          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${accentBtnClass}`}
        >
          {readOnlyMode ? <Lock className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {showAddPerson ? 'Close Add Person Form' : 'Add Person / Entity'}
        </button>
      </div>

      {/* Top Receivables & Quick Payables Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div
          data-testid="receivables-summary-strip-card"
          className="p-3.5 rounded-xl border-2 border-emerald-500/30 bg-white dark:bg-slate-900 flex items-center justify-between gap-4"
        >
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Expected Income / Money Owed to Me (Receivables)
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Total pending expected income &amp; money lent across all people/entities
            </p>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            +{currency}
            {totalReceivablesOwedToMe.toLocaleString()}
          </div>
        </div>

        <div
          data-testid="payables-summary-strip-card"
          className="p-3.5 rounded-xl border-2 border-rose-500/30 bg-white dark:bg-slate-900 flex items-center justify-between gap-4"
        >
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              People I Need to Pay (Quick Payables &amp; Short-Term Dues)
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Short-term dues, split bills &amp; quick payables to settle (synced to Dashboard &ldquo;The Money I Owe&rdquo;)
            </p>
          </div>
          <div
            data-testid="payables-summary-strip-value"
            className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-rose-600 dark:text-rose-400"
          >
            -{currency}
            {totalPayablesPeopleINeedToPay.toLocaleString()}
          </div>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback('')}
            aria-label="Dismiss notification"
            className="font-semibold hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Collapsible New Person Form */}
      {showAddPerson && !readOnlyMode && (
        <form
          onSubmit={handleCreatePerson}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
        >
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Create New Person / Counterparty Profile
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label
                htmlFor="person-name-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Full Name
              </label>
              <input
                id="person-name-input"
                type="text"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="e.g. Siddharth Verma"
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-1 mb-1">
                <label
                  htmlFor="person-rel-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Relationship (Includes Other)
                </label>
                <DropdownListEditButton
                  listKey="person_relationship"
                  label="Relationship Options"
                  allEditableOptions={relationshipList.allEditableOptions}
                  removedOptions={relationshipList.removedOptions}
                  onSaveRemovedOptions={relationshipList.saveRemovedOptions}
                  currentSelectedValue={personRel}
                  otherLabel="Other"
                  userPasswordHash={userPasswordHash}
                  onOptionDeletedFallback={(val) =>
                    setPersonRel(val as PersonProfile['relationship'])
                  }
                />
              </div>
              <select
                id="person-rel-select"
                value={personRel}
                onChange={(e) => setPersonRel(e.target.value as PersonProfile['relationship'])}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                {relationshipList.options.map((rel) => (
                  <option key={rel} value={rel}>
                    {rel}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="person-email-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Email (For Bill Header)
              </label>
              <input
                id="person-email-input"
                type="email"
                value={personEmail}
                onChange={(e) => setPersonEmail(e.target.value)}
                placeholder="person@example.com"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label
                htmlFor="person-phone-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Phone / Contact
              </label>
              <input
                id="person-phone-input"
                type="text"
                value={personPhone}
                onChange={(e) => setPersonPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>

          {personRel === 'Other' && (
            <div>
              <label
                htmlFor="person-custom-rel"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                Custom Relationship Label (Other)
              </label>
              <input
                id="person-custom-rel"
                type="text"
                value={personCustomRel}
                onChange={(e) => setPersonCustomRel(e.target.value)}
                placeholder="e.g. Subcontractor, Vendor, Syndicate Member"
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddPerson(false)}
              className="px-3.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg ${accentBtnClass}`}
            >
              Save Person Profile
            </button>
          </div>
        </form>
      )}

      {/* People Summary Grid + Active Person Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: People Cards (Shows LIVE Records Count Only, Excluding Cleared History Groups) */}
        <div className="lg:col-span-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Active Directory ({activePeople.length} People)
            </h3>
            {blockedPeople.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                {blockedPeople.length} in Past History
              </span>
            )}
          </div>
          {activePeople.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No active people in directory. Add a person to track expected money, quick payables, and export HD PDF bills.
              </p>
              <button
                type="button"
                disabled={readOnlyMode}
                onClick={() => !readOnlyMode && setShowAddPerson(true)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${accentBtnClass}`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Add First Person
              </button>
            </div>
          ) : (
            activePeople.map((p) => {
              const summary = calculatePersonLedger(
                p,
                expectedItems,
                transactions,
                personRecordGroups
              );
              const isSelected = activePerson?.id === p.id;
              const relLabel = resolveFlexibleLabel(p.relationship, p.customRelationship);

              return (
                <div
                  key={p.id}
                  data-testid={`person-card-${p.id}`}
                  onClick={() => handleSelectPersonCard(p.id)}
                  className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
                    isSelected
                      ? accentBorderSelected
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectPersonCard(p.id);
                        }}
                        className="text-sm font-bold text-slate-900 dark:text-white hover:underline text-left cursor-pointer"
                      >
                        {p.name}
                      </button>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {relLabel} {p.phone ? `· ${p.phone}` : ''}
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <div className="text-right font-mono tabular-nums">
                        <div className="text-[10px] text-slate-400">
                          {summary.liveNetReceivable >= 0 ? 'Net Expecting' : 'Quick Payable'}
                        </div>
                        <div
                          data-testid={`person-card-live-net-${p.id}`}
                          className={`text-sm font-bold ${
                            summary.liveNetReceivable >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {currency}
                          {summary.liveNetReceivable.toLocaleString()}
                        </div>
                      </div>
                      {onBlockPerson && (
                        <button
                          type="button"
                          disabled={readOnlyMode}
                          data-testid={`block-person-btn-${p.id}`}
                          onClick={() => {
                            if (readOnlyMode) return;
                            setBlockingPerson(p);
                            setBlockReason('');
                            setBlockError('');
                          }}
                          title={`Block & Archive ${p.name} to Past History`}
                          aria-label={`Block person ${p.name}`}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500 hover:text-slate-950 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Ban className="w-3 h-3" />
                          Block
                        </button>
                      )}
                      {/* Password-Protected Person Card Delete Button */}
                      <button
                        type="button"
                        disabled={readOnlyMode}
                        data-testid={`delete-person-btn-${p.id}`}
                        onClick={() => handleInitiateDeletePerson(p)}
                        aria-label={`Delete person ${p.name}`}
                        title="Delete Person Profile (Requires Password)"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div
                    className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Live Records Count Only (Excludes Records in Cleared History Groups) */}
                    <button
                      type="button"
                      data-testid={`person-card-live-records-count-${p.id}`}
                      onClick={() => handleSelectPersonCard(p.id)}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                    >
                      Live Records ({summary.liveRecordsCount})
                    </button>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={readOnlyMode}
                        onClick={() => !readOnlyMode && setBillModalPerson(p)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${accentBtnClass}`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Preview &amp; PDF
                      </button>
                      <button
                        type="button"
                        disabled={readOnlyMode}
                        onClick={() => !readOnlyMode && handleDirectDownloadExcelBill(p)}
                        className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Excel
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Active Person Direct Records View + Expandable Add Form + Tickable Grouping & History Tab */}
        <div className="lg:col-span-8 space-y-4">
          {activePerson ? (
            (() => {
              const ledger = calculatePersonLedger(
                activePerson,
                expectedItems,
                transactions,
                personRecordGroups
              );
              // Ungrouped live items (exclude any item that belongs to a group)
              const ungroupedLiveRows: UnifiedPersonRecordRow[] = [
                ...ledger.liveItems
                  .filter((item) => !groupedRecordIdSet.has(item.id))
                  .map((item) => buildUnifiedRecordRow(item, 'expected_item')),
                ...ledger.liveLinkedTransactions
                  .filter((tx) => !groupedRecordIdSet.has(tx.id))
                  .map((tx) => buildUnifiedRecordRow(tx, 'linked_transaction')),
              ];

              return (
                <>
                  {/* Direct Records & Ledger Card (Shown First Immediately Upon Clicking Person Card!) */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-xs">
                    {/* Top Header of Selected Person Ledger + Expandable Add Expected Money / Quick Payable Button + Live vs History Tabs */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                          {activePerson.name} — Transaction Records &amp; Groups
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Total Billed/Lent:{' '}
                          <span className="font-mono font-bold">
                            {currency}
                            {ledger.totalExpectingFromPerson.toLocaleString()}
                          </span>{' '}
                          · Settled:{' '}
                          <span className="font-mono font-bold">
                            {currency}
                            {ledger.totalSettledByPerson.toLocaleString()}
                          </span>{' '}
                          · Quick Payable Owed:{' '}
                          <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                            {currency}
                            {ledger.totalBorrowedFromPerson.toLocaleString()}
                          </span>{' '}
                          · Live Net:{' '}
                          <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                            {currency}
                            {ledger.liveNetReceivable.toLocaleString()}
                          </strong>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Live Records vs History Tab Switcher for Active Person */}
                        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            data-testid="person-live-records-tab"
                            onClick={() => setPersonLedgerTab('live')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                              personLedgerTab === 'live'
                                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                          >
                            Live Records ({ledger.liveRecordsCount})
                          </button>
                          <button
                            type="button"
                            data-testid="person-history-groups-tab"
                            onClick={() => setPersonLedgerTab('history')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-colors cursor-pointer ${
                              personLedgerTab === 'history'
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>History ({historyPersonGroups.length})</span>
                          </button>
                        </div>

                        {/* Expandable Button for Add Expected Money / Quick Payable (Initially Closed) */}
                        <button
                          type="button"
                          disabled={readOnlyMode}
                          data-testid="toggle-add-expected-item-form-btn"
                          onClick={() => setShowAddExpectedForm((prev) => !prev)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
                            showAddExpectedForm
                              ? 'bg-slate-800 text-white'
                              : accentBtnClass
                          }`}
                        >
                          {showAddExpectedForm ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <Plus className="w-3.5 h-3.5" />
                          )}
                          <span>
                            Add Expected Money / Quick Payable for {activePerson.name}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Add Expected Money / Quick Payable Form (Initially Closed) */}
                    {showAddExpectedForm && !readOnlyMode && (
                      <div
                        data-testid="expandable-add-expected-form"
                        className="p-4 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                              New Entry for {activePerson.name}:
                            </span>
                            <button
                              type="button"
                              data-testid="quick-preset-receivable-btn"
                              onClick={() => {
                                setExpDirection('expecting_from');
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer ${
                                expDirection !== 'borrowed_from'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              + Expected Money (Receivable)
                            </button>
                            <button
                              type="button"
                              data-testid="quick-preset-payable-btn"
                              onClick={() => {
                                setExpDirection('borrowed_from');
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border cursor-pointer ${
                                expDirection === 'borrowed_from'
                                  ? 'bg-rose-600 text-white border-rose-600'
                                  : 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 border-rose-500/40'
                              }`}
                            >
                              + Quick Payable (People I Need to Pay)
                            </button>
                          </div>
                          <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => setEntryMode('manual')}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1 cursor-pointer ${
                                entryMode === 'manual'
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <Plus className="w-3 h-3" />
                              Add Manually
                            </button>
                            <button
                              type="button"
                              onClick={() => setEntryMode('from_record')}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1 cursor-pointer ${
                                entryMode === 'from_record'
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              <Link2 className="w-3 h-3" />
                              Link from Records
                            </button>
                          </div>
                        </div>

                        {entryMode === 'manual' ? (
                          <form onSubmit={handleAddManualSubmit} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                              <div className="sm:col-span-5">
                                <label
                                  htmlFor="exp-title"
                                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                >
                                  Description / Bill Line Item
                                </label>
                                <input
                                  id="exp-title"
                                  type="text"
                                  value={expTitle}
                                  onChange={(e) => setExpTitle(e.target.value)}
                                  placeholder="e.g. Consulting Deliverable / Quick Split Due"
                                  required
                                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                                />
                              </div>
                              <div className="sm:col-span-3">
                                <label
                                  htmlFor="exp-amount"
                                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                >
                                  Total Amount ({currency})
                                </label>
                                <input
                                  id="exp-amount"
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  value={expAmount}
                                  onChange={(e) => setExpAmount(e.target.value)}
                                  placeholder="0.00"
                                  required
                                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                                />
                              </div>
                              <div className="sm:col-span-4">
                                <label
                                  htmlFor="exp-direction"
                                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                >
                                  Tracking Type (Receivable vs Quick Payable)
                                </label>
                                <select
                                  id="exp-direction"
                                  value={expDirection}
                                  onChange={(e) =>
                                    setExpDirection(e.target.value as ExpectedItem['direction'])
                                  }
                                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                                >
                                  <option value="expecting_from">
                                    Expected Income / Money Owed to Me (Receivable)
                                  </option>
                                  <option value="lent_to">
                                    Money Lent To Person (Receivable)
                                  </option>
                                  <option value="borrowed_from">
                                    Quick Payable / Short-Term Due (People I Need to Pay)
                                  </option>
                                  <option value="other">Other (Custom Tracking)</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                              <div>
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <label
                                    htmlFor="exp-category"
                                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                                  >
                                    Category
                                  </label>
                                  <DropdownListEditButton
                                    listKey="expected_category"
                                    label="Expected / Payable Category Options"
                                    allEditableOptions={expectedCategoryList.allEditableOptions}
                                    removedOptions={expectedCategoryList.removedOptions}
                                    onSaveRemovedOptions={expectedCategoryList.saveRemovedOptions}
                                    currentSelectedValue={expCategory}
                                    otherLabel="Other"
                                    userPasswordHash={userPasswordHash}
                                    onOptionDeletedFallback={(val) => setExpCategory(val)}
                                  />
                                </div>
                                <select
                                  id="exp-category"
                                  value={expCategory}
                                  onChange={(e) => setExpCategory(e.target.value)}
                                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                                >
                                  {expectedCategoryList.options.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label
                                  htmlFor="exp-due"
                                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                >
                                  Expected / Payable Due Date
                                </label>
                                <input
                                  id="exp-due"
                                  type="date"
                                  value={expDueDate}
                                  onChange={(e) => setExpDueDate(e.target.value)}
                                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                                />
                              </div>
                              <button
                                type="submit"
                                className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                                  expDirection === 'borrowed_from'
                                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                    : accentBtnClass
                                }`}
                              >
                                {expDirection === 'borrowed_from'
                                  ? 'Save Quick Payable Item'
                                  : 'Add Expected Item to Bill'}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <form onSubmit={handleLinkRecordSubmit} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                              <div className="sm:col-span-5">
                                <label
                                  htmlFor="select-existing-tx"
                                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                >
                                  Choose Transaction from Your Ledger Records
                                </label>
                                <select
                                  id="select-existing-tx"
                                  value={selectedRecordTxId || transactions[0]?.id || ''}
                                  onChange={(e) => setSelectedRecordTxId(e.target.value)}
                                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                                >
                                  {transactions.length === 0 ? (
                                    <option value="">-- No transaction records created yet --</option>
                                  ) : (
                                    transactions.map((tx) => (
                                      <option key={tx.id} value={tx.id}>
                                        [{tx.id}] {tx.date} · {tx.title} — {currency}
                                        {tx.amount.toLocaleString()}
                                      </option>
                                    ))
                                  )}
                                </select>
                              </div>
                              <div className="sm:col-span-3">
                                <label
                                  htmlFor="link-direction-select"
                                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                >
                                  Tracking Type
                                </label>
                                <select
                                  id="link-direction-select"
                                  value={expDirection}
                                  onChange={(e) =>
                                    setExpDirection(e.target.value as ExpectedItem['direction'])
                                  }
                                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                                >
                                  <option value="expecting_from">
                                    Expected Receivable (Owed to Me)
                                  </option>
                                  <option value="lent_to">
                                    Money Lent (Receivable)
                                  </option>
                                  <option value="borrowed_from">
                                    Quick Payable (People I Need to Pay)
                                  </option>
                                </select>
                              </div>
                              <div className="sm:col-span-2">
                                <label
                                  htmlFor="link-due-date"
                                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                                >
                                  Due Date
                                </label>
                                <input
                                  id="link-due-date"
                                  type="date"
                                  value={expDueDate}
                                  onChange={(e) => setExpDueDate(e.target.value)}
                                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <button
                                  type="submit"
                                  disabled={transactions.length === 0}
                                  className={`w-full px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                                    expDirection === 'borrowed_from'
                                      ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                      : accentBtnClass
                                  }`}
                                >
                                  {expDirection === 'borrowed_from'
                                    ? 'Link Payable'
                                    : 'Link Record'}
                                </button>
                              </div>
                            </div>
                          </form>
                        )}
                      </div>
                    )}

                    {/* TAB 1: LIVE RECORDS (Shows Active Groups with Enclosed Charts & Expand/Collapse + Remaining Ungrouped Live Records Below) */}
                    {personLedgerTab === 'live' && (
                      <div className="space-y-4">
                        {/* Action Bar when 1 or more records are checked: "Create a Group" */}
                        {selectedRecordIds.length > 0 && !readOnlyMode && (
                          <div
                            data-testid="create-record-group-bar"
                            className="p-3.5 rounded-xl bg-indigo-600/10 border-2 border-indigo-500/40 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-extrabold">
                                {selectedRecordIds.length} Selected
                              </span>
                              <input
                                type="text"
                                data-testid="record-group-title-input"
                                value={customGroupTitle}
                                onChange={(e) => setCustomGroupTitle(e.target.value)}
                                placeholder={`Group Name (e.g. Nov Batch #${
                                  activePersonGroups.length + 1
                                })`}
                                className="px-3 py-1.5 text-xs rounded-lg border border-indigo-500/40 bg-white dark:bg-slate-950"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedRecordIds([])}
                                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                              >
                                Clear Selection
                              </button>
                              <button
                                type="button"
                                data-testid="create-record-group-btn"
                                onClick={handleCreateRecordGroup}
                                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <FolderPlus className="w-4 h-4" />
                                <span>Create a Group</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Live Created Groups (Multiple Groups with Group Name, Enclosed Chart, Expand/Collapse, Ungroup, Edit/Delete/Proof) */}
                        {livePersonGroups.length > 0 && (
                          <div className="space-y-3" data-testid="live-person-groups-list">
                            {livePersonGroups.map((group) => {
                              const groupRows = resolveGroupRows(group);
                              const groupTotal =
                                Math.round(
                                  groupRows.reduce((s, r) => s + r.amount, 0) * 100
                                ) / 100;
                              const groupPaidTotal =
                                Math.round(
                                  groupRows.reduce((s, r) => s + r.settledAmount, 0) * 100
                                ) / 100;
                              const groupPendingTotal =
                                Math.round(Math.max(0, groupTotal - groupPaidTotal) * 100) /
                                100;
                              const paidPct =
                                groupTotal > 0
                                  ? Math.min(100, Math.round((groupPaidTotal / groupTotal) * 100))
                                  : 0;
                              const isAllPaid =
                                groupRows.length > 0 &&
                                groupRows.every((r) => r.status === 'settled');
                              const isExpanded = !collapsedGroupIds.includes(group.id);

                              return (
                                <div
                                  key={group.id}
                                  data-testid={`person-record-group-box-${group.id}`}
                                  className="rounded-xl border-2 border-indigo-500/40 bg-indigo-500/5 overflow-hidden"
                                >
                                  {/* Group Header + Enclosed Chart + Expand/Ungroup/Clear Controls */}
                                  <div className="px-4 py-3 bg-indigo-500/10 border-b border-indigo-500/20 space-y-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          data-testid={`toggle-expand-group-btn-${group.id}`}
                                          onClick={() => toggleGroupExpand(group.id)}
                                          className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                                        >
                                          {isExpanded ? (
                                            <ChevronUp className="w-3.5 h-3.5" />
                                          ) : (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                          )}
                                          <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
                                        </button>
                                        <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                                          {group.title || group.name}
                                        </span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600/15 text-indigo-700 dark:text-indigo-300">
                                          {groupRows.length} Records · {currency}
                                          {groupTotal.toLocaleString()}
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                            isAllPaid
                                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                              : groupPaidTotal > 0
                                              ? 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
                                              : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                          }`}
                                        >
                                          {isAllPaid
                                            ? 'All Paid'
                                            : groupPaidTotal > 0
                                            ? `Partially Paid (${paidPct}%)`
                                            : 'Pending / Unpaid'}
                                        </span>
                                      </div>

                                      {!readOnlyMode && (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <button
                                            type="button"
                                            data-testid={`group-toggle-paid-all-btn-${group.id}`}
                                            onClick={() => handleToggleGroupPaidAll(group)}
                                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-indigo-500/40 hover:bg-indigo-600 hover:text-white text-indigo-700 dark:text-indigo-300 text-xs font-extrabold cursor-pointer transition-colors"
                                          >
                                            {isAllPaid ? 'Mark Unpaid All' : 'Mark Paid All'}
                                          </button>

                                          <button
                                            type="button"
                                            data-testid={`group-ungroup-btn-${group.id}`}
                                            onClick={() => handleUngroupWholeGroup(group)}
                                            title="Ungroup all records back to Live Records"
                                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-500/40 hover:bg-amber-500 hover:text-slate-950 text-amber-700 dark:text-amber-300 text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                                          >
                                            <FolderMinus className="w-3.5 h-3.5" />
                                            <span>Ungroup</span>
                                          </button>

                                          <button
                                            type="button"
                                            data-testid={`group-clear-to-history-btn-${group.id}`}
                                            onClick={() => handleClearGroupToHistory(group)}
                                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                                          >
                                            <Archive className="w-3.5 h-3.5" />
                                            <span>Mark as Cleared &amp; Send to History</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Enclosed Group Breakdown Chart (Visible on Group Box) */}
                                    <div
                                      data-testid={`group-enclosed-chart-${group.id}`}
                                      className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-indigo-500/20 space-y-2"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                        <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                          <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                                          Enclosed Group Settlement Chart ({paidPct}% Settled)
                                        </span>
                                        <div className="flex flex-wrap items-center gap-3 font-mono">
                                          <span className="text-slate-600 dark:text-slate-300">
                                            Total:{' '}
                                            <strong>
                                              {currency}
                                              {groupTotal.toLocaleString()}
                                            </strong>
                                          </span>
                                          <span className="text-emerald-600 dark:text-emerald-400">
                                            Paid:{' '}
                                            <strong>
                                              {currency}
                                              {groupPaidTotal.toLocaleString()}
                                            </strong>
                                          </span>
                                          <span className="text-amber-600 dark:text-amber-400">
                                            Due:{' '}
                                            <strong>
                                              {currency}
                                              {groupPendingTotal.toLocaleString()}
                                            </strong>
                                          </span>
                                        </div>
                                      </div>
                                      <div className="w-full h-2.5 rounded-full bg-amber-500/25 overflow-hidden flex">
                                        <div
                                          style={{ width: `${paidPct}%` }}
                                          className="h-full bg-emerald-500 transition-all duration-300"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Expanded Group Table (Shows Edit, Delete, View Proof, Status, Ungroup Item) */}
                                  {isExpanded && (
                                    <div className="p-3 overflow-x-auto">
                                      <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                          <tr className="border-b border-indigo-500/20 text-slate-500 dark:text-slate-400">
                                            <th className="py-2 pr-3 font-semibold">Record ID</th>
                                            <th className="py-2 px-3 font-semibold">Date / Due</th>
                                            <th className="py-2 px-3 font-semibold">Item Description</th>
                                            <th className="py-2 px-3 font-semibold">Category</th>
                                            <th className="py-2 px-3 font-semibold text-right">Total</th>
                                            <th className="py-2 px-3 font-semibold text-right">
                                              Balance Due
                                            </th>
                                            <th className="py-2 pl-3 font-semibold text-right">
                                              Status, Proof &amp; Actions
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-indigo-500/15">
                                          {groupRows.map((row) =>
                                            renderInteractiveRecordRow(row, {
                                              inGroup: group,
                                              showCheckbox: false,
                                            })
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Remaining Ungrouped Live Records Table with Tickable Checkboxes */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                                <th className="py-2.5 pr-2 w-8 text-center">Tick</th>
                                <th className="py-2.5 pr-3 font-semibold">Record ID</th>
                                <th className="py-2.5 px-3 font-semibold">Date / Due</th>
                                <th className="py-2.5 px-3 font-semibold">Item Description</th>
                                <th className="py-2.5 px-3 font-semibold">Category</th>
                                <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                                <th className="py-2.5 px-3 font-semibold text-right">Balance Due</th>
                                <th className="py-2.5 pl-3 font-semibold text-right">
                                  Status, Proof &amp; Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                              {ungroupedLiveRows.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="py-6 text-center text-slate-500">
                                    No ungrouped live records remaining for {activePerson.name}.
                                  </td>
                                </tr>
                              ) : (
                                ungroupedLiveRows.map((row) =>
                                  renderInteractiveRecordRow(row, {
                                    showCheckbox: true,
                                  })
                                )
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: CLEARED GROUPS HISTORY FOR ACTIVE PERSON (Enclosed Chart + Expand/Collapse + Password Revert for Whole Group or Single Record) */}
                    {personLedgerTab === 'history' && (
                      <div
                        data-testid="person-history-groups-section"
                        className="space-y-3"
                      >
                        {historyPersonGroups.length === 0 ? (
                          <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                            No cleared record groups in {activePerson.name}&apos;s history yet. Select records in Live Records, click &ldquo;Create a Group&rdquo;, and then click &ldquo;Mark as Cleared &amp; Send to History&rdquo;.
                          </div>
                        ) : (
                          historyPersonGroups.map((group) => {
                            const groupRows = resolveGroupRows(group);
                            const groupTotal =
                              Math.round(groupRows.reduce((s, r) => s + r.amount, 0) * 100) /
                              100;
                            const isExpanded = !collapsedGroupIds.includes(group.id);

                            return (
                              <div
                                key={group.id}
                                data-testid={`person-history-group-box-${group.id}`}
                                className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 overflow-hidden"
                              >
                                <div className="px-4 py-3 bg-emerald-500/10 border-b border-emerald-500/20 space-y-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        data-testid={`toggle-expand-history-group-btn-${group.id}`}
                                        onClick={() => toggleGroupExpand(group.id)}
                                        className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                                      >
                                        {isExpanded ? (
                                          <ChevronUp className="w-3.5 h-3.5" />
                                        ) : (
                                          <ChevronDown className="w-3.5 h-3.5" />
                                        )}
                                        <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
                                      </button>
                                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                                        {group.title || group.name}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                                        CLEARED · {groupRows.length} Records · {currency}
                                        {groupTotal.toLocaleString()}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-[11px] font-mono text-slate-500">
                                        Cleared on {group.clearedAt || group.createdAt}
                                      </span>
                                      {!readOnlyMode && (
                                        <button
                                          type="button"
                                          data-testid={`revert-history-group-btn-${group.id}`}
                                          onClick={() =>
                                            handleOpenRevertHistoryModal('whole_group', group)
                                          }
                                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                          <span>Revert Whole Group (Password)</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* Enclosed Chart for Cleared History Group */}
                                  <div
                                    data-testid={`history-group-enclosed-chart-${group.id}`}
                                    className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-emerald-500/20 space-y-1.5"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                      <span className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                        <BarChart3 className="w-3.5 h-3.5" />
                                        Enclosed History Group Summary (100% Cleared)
                                      </span>
                                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                                        Cleared Total: {currency}
                                        {groupTotal.toLocaleString()} ({groupRows.length} items)
                                      </span>
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-emerald-500/25 overflow-hidden">
                                      <div className="w-full h-full bg-emerald-500" />
                                    </div>
                                  </div>
                                </div>

                                {isExpanded && (
                                  <div className="p-3 overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                      <thead>
                                        <tr className="border-b border-emerald-500/20 text-slate-500 dark:text-slate-400">
                                          <th className="py-1.5 pr-2 font-semibold">Record ID</th>
                                          <th className="py-1.5 px-2 font-semibold">Date</th>
                                          <th className="py-1.5 px-2 font-semibold">Title</th>
                                          <th className="py-1.5 px-2 font-semibold">Category</th>
                                          <th className="py-1.5 px-2 font-semibold text-right">
                                            Amount
                                          </th>
                                          <th className="py-1.5 pl-2 font-semibold text-right">
                                            Proof &amp; Revert Actions
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-emerald-500/15">
                                        {groupRows.map((row) => (
                                          <tr key={row.id}>
                                            <td className="py-2 pr-2 font-mono text-[11px] text-slate-500">
                                              {row.displayRecordId}
                                            </td>
                                            <td className="py-2 px-2 font-mono text-[11px]">
                                              {row.date}
                                            </td>
                                            <td className="py-2 px-2 font-semibold text-slate-900 dark:text-white">
                                              {row.title}
                                            </td>
                                            <td className="py-2 px-2 text-slate-500">
                                              {row.categoryLabel}
                                            </td>
                                            <td className="py-2 px-2 font-mono text-right font-bold">
                                              {currency}
                                              {row.amount.toLocaleString()}
                                            </td>
                                            <td className="py-2 pl-2 text-right">
                                              <div className="inline-flex items-center justify-end gap-1.5">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                                  Cleared
                                                </span>
                                                <button
                                                  type="button"
                                                  data-testid={`history-record-proof-btn-${group.id}-${row.id}`}
                                                  onClick={() => handleOpenProofModal(row)}
                                                  className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                                >
                                                  <Eye className="w-3 h-3" />
                                                  <span>Proof</span>
                                                </button>
                                                {!readOnlyMode && (
                                                  <button
                                                    type="button"
                                                    data-testid={`revert-history-single-record-btn-${group.id}-${row.id}`}
                                                    onClick={() =>
                                                      handleOpenRevertHistoryModal(
                                                        'single_record',
                                                        group,
                                                        row.id,
                                                        row.title
                                                      )
                                                    }
                                                    title="Revert this single record back to Live Records (Requires Password)"
                                                    className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500 text-amber-800 dark:text-amber-300 hover:text-slate-950 border border-amber-500/30 text-[10px] font-extrabold flex items-center gap-1 cursor-pointer"
                                                  >
                                                    <RotateCcw className="w-3 h-3" />
                                                    <span>Revert Record</span>
                                                  </button>
                                                )}
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}

                    {/* Export Footer Bar */}
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={readOnlyMode}
                        onClick={() => !readOnlyMode && setBillModalPerson(activePerson)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-45 ${accentBtnClass}`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Preview &amp; Export HD PDF
                      </button>
                      <button
                        type="button"
                        disabled={readOnlyMode}
                        onClick={() => !readOnlyMode && handleDirectDownloadPdfBill(activePerson)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Direct PDF
                      </button>
                      <button
                        type="button"
                        disabled={readOnlyMode}
                        onClick={() =>
                          !readOnlyMode && handleDirectDownloadExcelBill(activePerson)
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Export Excel (.xls)
                      </button>
                    </div>
                  </div>
                </>
              );
            })()
          ) : (
            <div className="p-8 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                No Person Selected
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add a person using the &ldquo;Add Person / Entity&rdquo; button above to manage expected money and export HD PDF bills.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Past History — Blocked & Archived Profiles Section (Short Entry Row + Expandable Past Transactions View) */}
      <div
        data-testid="past-history-blocked-profiles-section"
        className="p-4 sm:p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                Past History — Blocked &amp; Archived Payee Profiles
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {blockedPeople.length} Archived
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Short summary entries for blocked profiles. Click any row or expand icon to inspect all saved past transactions.
              </p>
            </div>
          </div>
        </div>

        {blockedPeople.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40 text-xs text-slate-500 dark:text-slate-400 text-center">
            No blocked or archived profiles in Past History yet. Click &ldquo;Block&rdquo; on any active profile card above to archive them with a reason.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
            {blockedPeople.map((p) => {
              const summary = calculatePersonLedger(
                p,
                expectedItems,
                transactions,
                personRecordGroups
              );
              const relLabel = resolveFlexibleLabel(p.relationship, p.customRelationship);
              const isExpanded = expandedBlockedPersonIds.includes(p.id);
              const totalRecordsCount =
                summary.items.length + summary.linkedTransactions.length;

              return (
                <div
                  key={p.id}
                  data-testid={`blocked-person-card-${p.id}`}
                  className="p-3.5 space-y-3"
                >
                  {/* Compact Short Entry Row */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        data-testid={`expand-blocked-person-tx-btn-${p.id}`}
                        onClick={() => toggleBlockedPersonExpand(p.id)}
                        className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </button>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {p.name}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            Blocked
                          </span>
                          <span className="text-xs text-slate-500">({relLabel})</span>
                          <span
                            data-testid={`blocked-person-reason-${p.id}`}
                            className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-800 dark:text-amber-300 text-[11px] font-medium"
                          >
                            Reason: {p.blockReason || 'Archived by user'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid={`view-blocked-person-records-${p.id}`}
                        onClick={() => toggleBlockedPersonExpand(p.id)}
                        className="px-2.5 py-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span>Hide Past Transactions ({totalRecordsCount})</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>View Past Transactions ({totalRecordsCount})</span>
                          </>
                        )}
                      </button>

                      {onUnblockPerson && (
                        <button
                          type="button"
                          disabled={readOnlyMode}
                          data-testid={`unblock-person-btn-${p.id}`}
                          onClick={() => {
                            if (readOnlyMode) return;
                            onUnblockPerson(p.id);
                            setFeedback(`Restored ${p.name} back to Active Directory.`);
                            onTriggerFeedback?.(`Unblocked ${p.name}`, 'success');
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Unblock
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded Past Transactions List when Clicked */}
                  {isExpanded && (
                    <div
                      data-testid={`blocked-person-expanded-tx-${p.id}`}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                    >
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        Saved Past Transactions for {p.name} ({totalRecordsCount})
                      </div>
                      {totalRecordsCount === 0 ? (
                        <div className="text-xs text-slate-500 py-2">
                          No past transaction records were logged for this profile prior to blocking.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                                <th className="py-1.5 pr-2 font-semibold">Record ID</th>
                                <th className="py-1.5 px-2 font-semibold">Date</th>
                                <th className="py-1.5 px-2 font-semibold">Description</th>
                                <th className="py-1.5 px-2 font-semibold">Category</th>
                                <th className="py-1.5 pl-2 font-semibold text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                              {summary.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="py-1.5 pr-2 font-mono text-[11px] text-slate-500">
                                    {item.id}
                                  </td>
                                  <td className="py-1.5 px-2 font-mono text-[11px]">
                                    {item.date}
                                  </td>
                                  <td className="py-1.5 px-2 font-semibold text-slate-900 dark:text-white">
                                    {item.title}
                                  </td>
                                  <td className="py-1.5 px-2 text-slate-500">{item.category}</td>
                                  <td className="py-1.5 pl-2 font-mono text-right font-bold">
                                    {currency}
                                    {item.amount.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                              {summary.linkedTransactions.map((tx) => (
                                <tr key={tx.id}>
                                  <td className="py-1.5 pr-2 font-mono text-[11px] text-slate-500">
                                    {tx.id}
                                  </td>
                                  <td className="py-1.5 px-2 font-mono text-[11px]">{tx.date}</td>
                                  <td className="py-1.5 px-2 font-semibold text-slate-900 dark:text-white">
                                    {tx.title}
                                  </td>
                                  <td className="py-1.5 px-2 text-slate-500">{tx.category}</td>
                                  <td className="py-1.5 pl-2 font-mono text-right font-bold">
                                    {currency}
                                    {tx.amount.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL 1: Interactive Status Settlement Modal (Pending / Partially Paid / Paid + Amount + Account) */}
      {settlementModalRow && (
        <div
          data-testid="record-status-settlement-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settlement-status-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3
                    id="settlement-status-modal-title"
                    className="text-sm font-extrabold text-slate-900 dark:text-white"
                  >
                    Update Record Payment Status &amp; Account
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {settlementModalRow.title} · Total: {currency}
                    {settlementModalRow.amount.toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettlementModalRow(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStatusSettlementModal} className="p-5 space-y-4">
              {/* 3 Status Options: Pending / Partially Paid / Paid */}
              <div>
                <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-2">
                  1. Select Payment Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    data-testid="status-option-pending"
                    onClick={() => {
                      setSettlementTargetStatus('pending');
                      setSettlementAmountInput('0');
                      setSettlementModalError('');
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-extrabold border cursor-pointer transition-colors ${
                      settlementTargetStatus === 'pending'
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    data-testid="status-option-partial"
                    onClick={() => {
                      setSettlementTargetStatus('partial');
                      const defaultPart =
                        settlementModalRow.settledAmount > 0 &&
                        settlementModalRow.settledAmount < settlementModalRow.amount
                          ? settlementModalRow.settledAmount
                          : Math.round((settlementModalRow.amount / 2) * 100) / 100;
                      setSettlementAmountInput(String(defaultPart));
                      setSettlementModalError('');
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-extrabold border cursor-pointer transition-colors ${
                      settlementTargetStatus === 'partial'
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    Partially Paid
                  </button>
                  <button
                    type="button"
                    data-testid="status-option-paid"
                    onClick={() => {
                      setSettlementTargetStatus('settled');
                      setSettlementAmountInput(String(settlementModalRow.amount));
                      setSettlementModalError('');
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-extrabold border cursor-pointer transition-colors ${
                      settlementTargetStatus === 'settled'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    Paid (Full)
                  </button>
                </div>
              </div>

              {/* Amount Input & Account Selection when Paid or Partially Paid */}
              {settlementTargetStatus !== 'pending' && (
                <>
                  <div>
                    <label
                      htmlFor="status-settlement-amount-input"
                      className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      2. {settlementModalRow.isPayable ? 'Amount Paid Out' : 'Amount Received'} ({currency})
                    </label>
                    <input
                      id="status-settlement-amount-input"
                      data-testid="status-settlement-amount-input"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={settlementModalRow.amount}
                      value={settlementAmountInput}
                      disabled={settlementTargetStatus === 'settled'}
                      onChange={(e) => {
                        setSettlementAmountInput(e.target.value);
                        setSettlementModalError('');
                      }}
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 disabled:opacity-75"
                    />
                    <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-slate-500">
                      <span>
                        Total Record: {currency}
                        {settlementModalRow.amount.toLocaleString()}
                      </span>
                      <span className="text-amber-600 dark:text-amber-400 font-bold">
                        Remaining Due After Save: {currency}
                        {Math.max(
                          0,
                          Math.round(
                            (settlementModalRow.amount - (Number(settlementAmountInput) || 0)) *
                              100
                          ) / 100
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="status-settlement-account-select"
                      className="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      3. {settlementModalRow.isPayable
                        ? 'In Which Account to Debit Payment?'
                        : 'In Which Account to Credit Income?'}
                    </label>
                    <select
                      id="status-settlement-account-select"
                      data-testid="status-settlement-account-select"
                      value={settlementAccountId}
                      onChange={(e) => setSettlementAccountId(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {settlementModalError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {settlementModalError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettlementModalRow(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="status-settlement-save-btn"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer"
                >
                  Save &amp; Adjust Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Password Confirmation Modal for Deleting a Person Card */}
      {personPendingDelete && (
        <div
          data-testid="delete-person-password-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-person-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="delete-person-modal-title"
                    className="text-sm font-extrabold text-slate-900 dark:text-white"
                  >
                    Password Required to Delete Person Card
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Confirm password to move &ldquo;{personPendingDelete.name}&rdquo; to the Recycle Bin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPersonPendingDelete(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDeletePersonWithPassword} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="delete-person-password-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Enter Your Account Password
                </label>
                <input
                  id="delete-person-password-input"
                  data-testid="delete-person-password-input"
                  type="password"
                  value={deletePersonPassword}
                  onChange={(e) => {
                    setDeletePersonPassword(e.target.value);
                    setDeletePersonError('');
                  }}
                  placeholder="Enter password to confirm deletion..."
                  autoFocus
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              {deletePersonError && (
                <div
                  data-testid="delete-person-password-error"
                  className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-400"
                >
                  {deletePersonError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPersonPendingDelete(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-delete-person-btn"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold cursor-pointer"
                >
                  Verify &amp; Move to Recycle Bin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Password Confirmation Modal for Reverting from History (Whole Group OR Single Record) */}
      {revertModalTarget && (
        <div
          data-testid="revert-history-password-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revert-history-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="revert-history-modal-title"
                    className="text-sm font-extrabold text-slate-900 dark:text-white"
                  >
                    Password Required to Revert from History
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {revertModalTarget.mode === 'whole_group'
                      ? `Revert entire group "${revertModalTarget.group.title || revertModalTarget.group.name}" back to Live Records`
                      : `Revert record "${revertModalTarget.recordTitle || revertModalTarget.recordId}" back to Live Records`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRevertModalTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmRevertFromHistory} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="revert-history-password-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Enter Your Account Password to Confirm Revert
                </label>
                <input
                  id="revert-history-password-input"
                  data-testid="revert-history-password-input"
                  type="password"
                  value={revertPassword}
                  onChange={(e) => {
                    setRevertPassword(e.target.value);
                    setRevertPasswordError('');
                  }}
                  placeholder="Enter password to revert to Live Records..."
                  autoFocus
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              {revertPasswordError && (
                <div
                  data-testid="revert-history-password-error"
                  className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-400"
                >
                  {revertPasswordError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRevertModalTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-revert-history-btn"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer"
                >
                  Verify &amp; Revert to Live Records
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Edit Expected Item Modal (Works for ungrouped items and items inside a group) */}
      {editingExpectedItem && (
        <div
          data-testid="edit-expected-item-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-expected-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between gap-2">
              <h3
                id="edit-expected-modal-title"
                className="text-sm font-extrabold text-slate-900 dark:text-white"
              >
                Edit Record Details
              </h3>
              <button
                type="button"
                onClick={() => setEditingExpectedItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedExpectedItem} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Description / Title
                </label>
                <input
                  type="text"
                  data-testid="edit-expected-title-input"
                  value={editExpTitle}
                  onChange={(e) => setEditExpTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Total Amount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    data-testid="edit-expected-amount-input"
                    value={editExpAmount}
                    onChange={(e) => setEditExpAmount(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={editExpDueDate}
                    onChange={(e) => setEditExpDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tracking Type
                </label>
                <select
                  value={editExpDirection}
                  onChange={(e) =>
                    setEditExpDirection(e.target.value as ExpectedItem['direction'])
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="expecting_from">
                    Expected Income / Money Owed to Me (Receivable)
                  </option>
                  <option value="lent_to">Money Lent To Person (Receivable)</option>
                  <option value="borrowed_from">
                    Quick Payable / Short-Term Due (People I Need to Pay)
                  </option>
                  <option value="other">Other (Custom Tracking)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingExpectedItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-edited-expected-item-btn"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: Clickable View / Upload Proof Modal for Records (Live, Grouped, or History) */}
      {proofModalRecord && (
        <div
          data-testid="person-record-proof-modal"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="person-proof-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div>
                <h3
                  id="person-proof-modal-title"
                  className="text-sm font-extrabold text-slate-900 dark:text-white"
                >
                  Transaction Proof &amp; Receipt Voucher — {proofModalRecord.title}
                </h3>
                <p className="text-xs font-mono text-slate-500">
                  Record ID: #{proofModalRecord.displayId} · Proof ID:{' '}
                  {proofModalRecord.proofId || `VCH-${proofModalRecord.displayId}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProofModalRecord(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {proofModalRecord.proofImageDataUrl ? (
                <div className="space-y-2">
                  <img
                    src={proofModalRecord.proofImageDataUrl}
                    alt={`Proof for ${proofModalRecord.title}`}
                    className="w-full max-h-80 object-contain rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950"
                  />
                  <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                    Attached Proof Image: {proofModalRecord.proofImageName || 'HD Receipt Screenshot'}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                      Digital Record Voucher
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                      {proofModalRecord.statusLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Counterparty</span>
                      <strong className="text-slate-900 dark:text-white">
                        {activePerson?.name}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Date</span>
                      <strong className="font-mono text-slate-900 dark:text-white">
                        {proofModalRecord.date}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Total Amount</span>
                      <strong className="font-mono text-slate-900 dark:text-white">
                        {currency}
                        {proofModalRecord.amount.toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Settled / Paid</span>
                      <strong className="font-mono text-emerald-600 dark:text-emerald-400">
                        {currency}
                        {proofModalRecord.settledAmount.toLocaleString()}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const f = e.dataTransfer?.files?.[0];
                  if (f && f.type.startsWith('image/') && !readOnlyMode && onAttachProofToRecord) {
                    onAttachProofToRecord(
                      proofModalRecord.id,
                      proofModalRecord.sourceType,
                      f
                    );
                    setProofModalRecord(null);
                  }
                }}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (items && !readOnlyMode && onAttachProofToRecord) {
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.startsWith('image/')) {
                        const f = items[i].getAsFile();
                        if (f) {
                          e.preventDefault();
                          onAttachProofToRecord(
                            proofModalRecord.id,
                            proofModalRecord.sourceType,
                            f
                          );
                          setProofModalRecord(null);
                          break;
                        }
                      }
                    }
                  }
                }}
                tabIndex={0}
                className="flex flex-wrap items-center justify-between gap-2 pt-2 outline-none"
              >
                {!readOnlyMode && onAttachProofToRecord && (
                  <label className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {proofModalRecord.proofImageDataUrl
                        ? 'Replace HD Proof (Click / Drop / Paste)'
                        : 'Upload / Drop / Paste HD Proof Screenshot'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          onAttachProofToRecord(
                            proofModalRecord.id,
                            proofModalRecord.sourceType,
                            f
                          );
                          setProofModalRecord(null);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                )}
                <button
                  type="button"
                  data-testid="close-person-proof-modal-btn"
                  onClick={() => setProofModalRecord(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer ml-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Block & Archive Payee Modal (Prompts for Reason before saving to Past History) */}
      {blockingPerson && (
        <div
          data-testid="block-person-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-person-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="block-person-modal-title"
                    className="text-sm font-extrabold text-slate-900 dark:text-white"
                  >
                    Block &amp; Archive Profile — {blockingPerson.name}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Moves profile and all associated records to the Past History section
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBlockingPerson(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmBlockPerson} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="block-person-reason-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Reason for Blocking / Archiving (Required)
                </label>
                <input
                  id="block-person-reason-input"
                  data-testid="block-person-reason-input"
                  type="text"
                  value={blockReason}
                  onChange={(e) => {
                    setBlockReason(e.target.value);
                    setBlockError('');
                  }}
                  placeholder="e.g. Maid left the job / Contract completed / Vendor discontinued"
                  autoFocus
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Their profile and historical records will be preserved safely in the Past History section below.
                </p>
              </div>

              {blockError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {blockError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBlockingPerson(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-block-person-btn"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Block &amp; Save to Past History</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Interactive HD A4 PDF Bill Preview & Draggable Header Customizer Modal */}
      {billModalPerson && !readOnlyMode && (
        <PdfPreviewModal
          isOpen={Boolean(billModalPerson)}
          onClose={() => setBillModalPerson(null)}
          mode="person_bill"
          currency={currency}
          issuedBy={issuedByName}
          role={isAdminPortal ? 'admin' : 'user'}
          headerConfig={pdfHeaderConfig}
          person={billModalPerson}
          expectedItems={expectedItems}
          transactions={transactions}
          personRecordGroups={personRecordGroups}
          onDownloadPdf={(orientation) =>
            handleDirectDownloadPdfBill(billModalPerson, orientation)
          }
          onDownloadExcel={() => handleDirectDownloadExcelBill(billModalPerson)}
        />
      )}

      {/* Password Confirmation Modal for Deleting a Receivable / Payable Record */}
      {recordPendingDelete && (
        <div
          data-testid="delete-person-record-password-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-person-record-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="delete-person-record-modal-title"
                    className="text-sm font-extrabold text-slate-900 dark:text-white"
                  >
                    Confirm Record Deletion
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Password verification required to move record to Recycle Bin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecordPendingDelete(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDeleteRecordWithPassword} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  {recordPendingDelete.row.title} (#{recordPendingDelete.row.displayRecordId})
                </div>
                <div className="text-slate-500">
                  Amount:{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {currency}
                    {recordPendingDelete.row.amount.toLocaleString()}
                  </strong>{' '}
                  · Balance Due:{' '}
                  <strong className="font-mono text-amber-600 dark:text-amber-400">
                    {currency}
                    {recordPendingDelete.row.dueAmount.toLocaleString()}
                  </strong>
                </div>
              </div>

              <div>
                <label
                  htmlFor="delete-person-record-password-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Enter Your Account Password to Confirm Deletion
                </label>
                <input
                  id="delete-person-record-password-input"
                  data-testid="delete-person-record-password-input"
                  type="password"
                  value={deleteRecordPassword}
                  onChange={(e) => {
                    setDeleteRecordPassword(e.target.value);
                    setDeleteRecordError('');
                  }}
                  placeholder="Enter your login password"
                  autoFocus
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              {deleteRecordError && (
                <div
                  data-testid="delete-person-record-password-error"
                  className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-400"
                >
                  {deleteRecordError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRecordPendingDelete(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-delete-person-record-btn"
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
