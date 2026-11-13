import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  AmortizationRow,
  LoanCategory,
  LoanRecord,
  LoanStatus,
  LoanStructureType,
  TransactionRecord,
  WalletAccount,
} from '../types/finance';
import {
  calculateAccountBalance,
  calculateLoanAmortizationSchedule,
  calculateStandardMonthlyEmi,
  calculateUnifiedLoansOverview,
  LOAN_CATEGORIES,
  verifySecretAgainstStoredHash,
} from '../utils/financeRules';
import { maskAccountNumber } from '../utils/bankLogos';
import { downloadLocalFile } from '../utils/localVaultStorage';
import {
  DropdownListEditButton,
  useEditableDropdownOptions,
} from './DropdownListEditButton';
import {
  Archive,
  Award,
  Building2,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Landmark,
  PartyPopper,
  Pencil,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingDown,
  Wallet,
  X,
} from 'lucide-react';

interface LoansAndEmiViewProps {
  loans: LoanRecord[];
  accounts: WalletAccount[];
  transactions: TransactionRecord[];
  currency: string;
  readOnlyMode?: boolean;
  userPasswordHash?: string;
  onSaveLoan: (loan: LoanRecord, isEdit: boolean) => void;
  onDeleteLoan: (loanId: string) => void;
  onExecuteEmiPayment: (params: {
    loanId: string;
    installmentNumber: number;
    monthYear: string;
    accountId: string;
    actualAmountPaid: number;
  }) => void;
}

export const LoansAndEmiView: React.FC<LoansAndEmiViewProps> = ({
  loans,
  accounts,
  transactions,
  currency,
  readOnlyMode = false,
  userPasswordHash = '',
  onSaveLoan,
  onDeleteLoan,
  onExecuteEmiPayment,
}) => {
  // Split loans into Active Main Screen Loans vs Archived Closed History Loans
  const activeMainLoans = useMemo(
    () => loans.filter((l) => !l.archivedToHistory),
    [loans]
  );
  const archivedHistoryLoans = useMemo(
    () => loans.filter((l) => Boolean(l.archivedToHistory)),
    [loans]
  );

  const [viewTab, setViewTab] = useState<'active' | 'history'>('active');
  const [selectedLoanId, setSelectedLoanId] = useState<string>(
    activeMainLoans[0]?.id || ''
  );
  const [expandedHistoryLoanId, setExpandedHistoryLoanId] = useState<string | null>(
    null
  );
  const [showCreateForm, setShowCreateForm] = useState<boolean>(
    activeMainLoans.length === 0 && archivedHistoryLoans.length === 0
  );
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);

  // Two Sections in Add Loan: 'proper_emi' vs 'person_org_no_tenure'
  const [loanType, setLoanType] = useState<LoanStructureType>('proper_emi');
  const [lenderName, setLenderName] = useState<string>('');

  // Loan Setup / Edit Form State
  const loanCategoryList = useEditableDropdownOptions(
    'loan_category',
    LOAN_CATEGORIES,
    [],
    'Others'
  );
  const [category, setCategory] = useState<LoanCategory>('Home Loan');
  const [customCategory, setCustomCategory] = useState('');
  const [loanName, setLoanName] = useState('');
  const [principalAmount, setPrincipalAmount] = useState('500000');
  const [interestRateAnnual, setInterestRateAnnual] = useState('9.5');
  const [tenureValue, setTenureValue] = useState('24');
  const [tenureUnit, setTenureUnit] = useState<'Months' | 'Years'>('Months');
  const [startDate, setStartDate] = useState('2026-01-10');
  const [linkedAccountId, setLinkedAccountId] = useState<string>(accounts[0]?.id || '');
  const [connectedLoanAccountId, setConnectedLoanAccountId] = useState<string>('');
  const [loanStatus, setLoanStatus] = useState<LoanStatus>('About to Start');
  const [initialPaidEmisCount, setInitialPaidEmisCount] = useState('0');
  const [initialPrepaymentAmount, setInitialPrepaymentAmount] = useState('0');

  // Non-Mandatory In-Progress Loan Editing Fields
  const [currentRemainingAmountInput, setCurrentRemainingAmountInput] = useState<string>('');
  const [totalAmountAlreadyPaidInput, setTotalAmountAlreadyPaidInput] = useState<string>('');
  const [customSuggestedEmiInput, setCustomSuggestedEmiInput] = useState<string>('');

  const [formError, setFormError] = useState('');

  // Loan Account cards created in the Accounts section that can be connected to this Amortization schedule
  const loanAccountCards = useMemo(
    () => accounts.filter((a) => a.type === 'Loan Account'),
    [accounts]
  );

  // Unified Loans Overview synced 100% with Dashboard Top Loan Section and Dashboard "THE LOANS" Card
  const unifiedLoansOverview = useMemo(
    () => calculateUnifiedLoansOverview(accounts, loans, transactions),
    [accounts, loans, transactions]
  );

  // Account-Linked EMI Payment Confirmation Modal State
  const [payingRow, setPayingRow] = useState<AmortizationRow | null>(null);
  const [paymentAccountId, setPaymentAccountId] = useState<string>('');
  const [actualAmountInput, setActualAmountInput] = useState<string>('');
  const [paymentError, setPaymentError] = useState<string>('');

  // Secure Deletion & Export Modal State (Required for both Active and History deletion)
  const [loanPendingDelete, setLoanPendingDelete] = useState<LoanRecord | null>(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deletePasswordError, setDeletePasswordError] = useState('');
  const [hasExportedBeforeDelete, setHasExportedBeforeDelete] = useState(false);

  const formatMoney = (val: number) =>
    `${currency}${val.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const handleConnectLoanAccountSelect = (loanAccId: string) => {
    setConnectedLoanAccountId(loanAccId);
    if (!loanAccId) return;
    const loanAcc = accounts.find((a) => a.id === loanAccId);
    if (!loanAcc) return;

    if (!loanName.trim() || loanCategoryList.options.includes(loanName.trim() as LoanCategory)) {
      setLoanName(loanAcc.name);
    }
    const statusFromAcc: LoanStatus = loanAcc.loanStatus || 'In Progress';
    setLoanStatus(statusFromAcc);

    const sanctioned =
      loanAcc.sanctionedLoanAmount && loanAcc.sanctionedLoanAmount > 0
        ? loanAcc.sanctionedLoanAmount
        : loanAcc.currentRemainingLoanAmount && loanAcc.currentRemainingLoanAmount > 0
        ? loanAcc.currentRemainingLoanAmount
        : Math.abs(loanAcc.initialBalance || 0);
    if (sanctioned > 0) {
      setPrincipalAmount(String(sanctioned));
    }

    const rem =
      loanAcc.currentRemainingLoanAmount !== undefined
        ? loanAcc.currentRemainingLoanAmount
        : Math.abs(loanAcc.initialBalance || 0);
    if (statusFromAcc === 'In Progress' && rem >= 0) {
      setCurrentRemainingAmountInput(String(rem));
    } else if (statusFromAcc === 'About to Start') {
      setCurrentRemainingAmountInput('');
    }

    if (loanAcc.bankGivenEmi !== undefined && loanAcc.bankGivenEmi > 0) {
      setCustomSuggestedEmiInput(String(loanAcc.bankGivenEmi));
    }
    if (loanAcc.loanInterestRate !== undefined && loanAcc.loanInterestRate >= 0) {
      setInterestRateAnnual(String(loanAcc.loanInterestRate));
    }
    if (loanAcc.loanTenureMonths !== undefined && loanAcc.loanTenureMonths > 0) {
      setTenureUnit('Months');
      setTenureValue(String(loanAcc.loanTenureMonths));
    }
  };

  const activeLoan = useMemo(() => {
    return (
      activeMainLoans.find((l) => l.id === selectedLoanId) ||
      activeMainLoans[0] ||
      null
    );
  }, [activeMainLoans, selectedLoanId]);

  const activeSchedule = useMemo(() => {
    if (!activeLoan) return null;
    return calculateLoanAmortizationSchedule(activeLoan);
  }, [activeLoan]);

  // Also detect any closed loan on the main screen so the top banner is always visible
  const closedMainLoanCandidate = useMemo(() => {
    if (
      activeLoan &&
      activeSchedule &&
      (activeSchedule.isLoanClosed || activeSchedule.remainingBalance <= 0.01)
    ) {
      return { loan: activeLoan, schedule: activeSchedule };
    }
    for (const ln of activeMainLoans) {
      const sch = calculateLoanAmortizationSchedule(ln);
      if (sch.isLoanClosed || sch.remainingBalance <= 0.01) {
        return { loan: ln, schedule: sch };
      }
    }
    return null;
  }, [activeLoan, activeSchedule, activeMainLoans]);

  // Live preview EMI while filling the form
  const formTenureMonths = useMemo(() => {
    if (loanType === 'person_org_no_tenure') {
      return 12;
    }
    const raw = Math.max(1, Number(tenureValue) || 1);
    return tenureUnit === 'Years' ? Math.round(raw * 12) : Math.round(raw);
  }, [loanType, tenureValue, tenureUnit]);

  const liveFormulaSuggestedEmi = useMemo(() => {
    if (loanType === 'person_org_no_tenure') {
      const p = Number(principalAmount) || 0;
      const paid = Number(totalAmountAlreadyPaidInput) || 0;
      const rem =
        currentRemainingAmountInput.trim() !== ''
          ? Math.max(0, Number(currentRemainingAmountInput) || 0)
          : Math.max(0, p - paid);
      return customSuggestedEmiInput.trim() !== '' && Number(customSuggestedEmiInput) > 0
        ? Math.round(Number(customSuggestedEmiInput) * 100) / 100
        : rem;
    }

    const basePrincipal =
      loanStatus === 'In Progress' &&
      currentRemainingAmountInput.trim() !== '' &&
      Number(currentRemainingAmountInput) >= 0
        ? Number(currentRemainingAmountInput)
        : Number(principalAmount) || 0;
    const paidCount =
      loanStatus === 'In Progress' ? Math.max(0, Number(initialPaidEmisCount) || 0) : 0;
    const remTenure =
      loanStatus === 'In Progress' && currentRemainingAmountInput.trim() !== ''
        ? Math.max(1, formTenureMonths - paidCount)
        : formTenureMonths;

    return calculateStandardMonthlyEmi(
      basePrincipal,
      Number(interestRateAnnual) || 0,
      remTenure
    );
  }, [
    loanType,
    principalAmount,
    interestRateAnnual,
    formTenureMonths,
    loanStatus,
    currentRemainingAmountInput,
    totalAmountAlreadyPaidInput,
    customSuggestedEmiInput,
    initialPaidEmisCount,
  ]);

  const liveFormEmiPreview = useMemo(() => {
    if (
      customSuggestedEmiInput.trim() !== '' &&
      Number(customSuggestedEmiInput) > 0
    ) {
      return Math.round(Number(customSuggestedEmiInput) * 100) / 100;
    }
    return liveFormulaSuggestedEmi;
  }, [customSuggestedEmiInput, liveFormulaSuggestedEmi]);

  const openNewLoanForm = (initialType: LoanStructureType = 'proper_emi') => {
    if (readOnlyMode) return;
    setEditingLoanId(null);
    setLoanType(initialType);
    setLenderName('');
    setCategory(initialType === 'person_org_no_tenure' ? 'Personal Loan' : 'Home Loan');
    setCustomCategory('');
    setLoanName('');
    setPrincipalAmount(initialType === 'person_org_no_tenure' ? '50000' : '500000');
    setInterestRateAnnual(initialType === 'person_org_no_tenure' ? '0' : '9.5');
    setTenureValue('24');
    setTenureUnit('Months');
    setStartDate('2026-01-10');
    const defaultDebitAcc = accounts.find((a) => a.type !== 'Loan Account') || accounts[0];
    setLinkedAccountId(defaultDebitAcc?.id || '');
    setConnectedLoanAccountId('');
    setLoanStatus(initialType === 'person_org_no_tenure' ? 'In Progress' : 'About to Start');
    setInitialPaidEmisCount('0');
    setInitialPrepaymentAmount('0');
    setCurrentRemainingAmountInput('');
    setTotalAmountAlreadyPaidInput('');
    setCustomSuggestedEmiInput('');
    setFormError('');
    setViewTab('active');
    setShowCreateForm(true);
  };

  const openEditLoanForm = (loan: LoanRecord) => {
    if (readOnlyMode) return;
    setEditingLoanId(loan.id);
    setLoanType(loan.loanType || 'proper_emi');
    setLenderName(loan.lenderName || '');
    setCategory(loan.category);
    setCustomCategory(loan.customCategory || '');
    setLoanName(loan.name);
    setPrincipalAmount(String(loan.principalAmount));
    setInterestRateAnnual(String(loan.interestRateAnnual));
    setTenureUnit(loan.tenureUnit || 'Months');
    setTenureValue(
      loan.tenureUnit === 'Years'
        ? String(Math.max(1, Math.round(loan.tenureMonths / 12)))
        : String(loan.tenureMonths)
    );
    setStartDate(loan.startDate || '2026-01-10');
    setLinkedAccountId(loan.linkedAccountId || accounts[0]?.id || '');
    setConnectedLoanAccountId(loan.connectedLoanAccountId || '');
    setLoanStatus(loan.status);
    setInitialPaidEmisCount(String(loan.initialPaidEmisCount || 0));
    setInitialPrepaymentAmount(String(loan.initialPrepaymentAmount || 0));
    setCurrentRemainingAmountInput(
      loan.currentRemainingAmount !== undefined ? String(loan.currentRemainingAmount) : ''
    );
    setTotalAmountAlreadyPaidInput(
      loan.totalAmountAlreadyPaid !== undefined ? String(loan.totalAmountAlreadyPaid) : ''
    );
    setCustomSuggestedEmiInput(
      loan.customSuggestedEmi !== undefined ? String(loan.customSuggestedEmi) : ''
    );
    setFormError('');
    setShowCreateForm(true);
  };

  const handleSaveClosedLoanToHistory = (loanToArchive: LoanRecord) => {
    const archivedLoan: LoanRecord = {
      ...loanToArchive,
      archivedToHistory: true,
      archivedAt: new Date().toISOString().slice(0, 10),
    };
    onSaveLoan(archivedLoan, true);
    const remainingMain = activeMainLoans.filter((l) => l.id !== loanToArchive.id);
    if (remainingMain.length > 0) {
      setSelectedLoanId(remainingMain[0].id);
    } else {
      setSelectedLoanId('');
      setViewTab('history');
      setExpandedHistoryLoanId(archivedLoan.id);
    }
  };

  const handleCreateOrUpdateLoanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const p = Number(principalAmount);
    const r = loanType === 'person_org_no_tenure' ? Number(interestRateAnnual) || 0 : Number(interestRateAnnual);
    if (!loanName.trim() || Number.isNaN(p) || p <= 0) {
      setFormError('Please enter a valid Loan Name and positive Principal Amount.');
      return;
    }
    if (Number.isNaN(r) || r < 0) {
      setFormError('Please enter a valid annual interest rate.');
      return;
    }

    const existingLoan = editingLoanId ? loans.find((l) => l.id === editingLoanId) : undefined;
    const isFlexibleNoTenure = loanType === 'person_org_no_tenure';
    const effectiveStatus: LoanStatus = isFlexibleNoTenure ? 'In Progress' : loanStatus;

    const parsedRemaining =
      (effectiveStatus === 'In Progress' || isFlexibleNoTenure) &&
      currentRemainingAmountInput.trim() !== ''
        ? Math.max(0, Number(currentRemainingAmountInput))
        : undefined;
    const parsedTotalPaid =
      (effectiveStatus === 'In Progress' || isFlexibleNoTenure) &&
      totalAmountAlreadyPaidInput.trim() !== ''
        ? Math.max(0, Number(totalAmountAlreadyPaidInput))
        : undefined;
    const parsedCustomEmi =
      customSuggestedEmiInput.trim() !== '' &&
      Number(customSuggestedEmiInput) > 0
        ? Math.max(0, Number(customSuggestedEmiInput))
        : undefined;

    const savedLoan: LoanRecord = {
      id: existingLoan ? existingLoan.id : `loan-${Date.now()}`,
      name: loanName.trim(),
      loanType,
      lenderName: isFlexibleNoTenure ? lenderName.trim() || loanName.trim() : undefined,
      category: isFlexibleNoTenure ? 'Personal Loan' : category,
      customCategory:
        category === 'Others' || category === 'Customize Loan'
          ? customCategory.trim() || undefined
          : undefined,
      principalAmount: Math.round(p * 100) / 100,
      interestRateAnnual: r,
      tenureMonths: isFlexibleNoTenure ? 12 : formTenureMonths,
      tenureUnit: isFlexibleNoTenure ? 'Months' : tenureUnit,
      startDate: startDate || '2026-01-10',
      linkedAccountId: linkedAccountId || accounts[0]?.id || '',
      connectedLoanAccountId: connectedLoanAccountId || undefined,
      status: effectiveStatus,
      initialPaidEmisCount:
        !isFlexibleNoTenure && effectiveStatus === 'In Progress'
          ? Math.max(0, Math.min(formTenureMonths, Math.round(Number(initialPaidEmisCount) || 0)))
          : 0,
      initialPrepaymentAmount:
        !isFlexibleNoTenure && effectiveStatus === 'In Progress'
          ? Math.max(0, Number(initialPrepaymentAmount) || 0)
          : 0,
      currentRemainingAmount:
        parsedRemaining !== undefined && !Number.isNaN(parsedRemaining)
          ? Math.round(parsedRemaining * 100) / 100
          : undefined,
      totalAmountAlreadyPaid:
        parsedTotalPaid !== undefined && !Number.isNaN(parsedTotalPaid)
          ? Math.round(parsedTotalPaid * 100) / 100
          : undefined,
      customSuggestedEmi:
        parsedCustomEmi !== undefined && !Number.isNaN(parsedCustomEmi)
          ? Math.round(parsedCustomEmi * 100) / 100
          : undefined,
      payments: existingLoan ? existingLoan.payments : [],
      archivedToHistory: existingLoan?.archivedToHistory || false,
      archivedAt: existingLoan?.archivedAt,
      createdAt: existingLoan ? existingLoan.createdAt : new Date().toISOString(),
    };

    onSaveLoan(savedLoan, Boolean(existingLoan));
    setSelectedLoanId(savedLoan.id);
    setShowCreateForm(false);
    setEditingLoanId(null);
  };

  const openMarkAsPaidModal = (row: AmortizationRow) => {
    if (!activeLoan || readOnlyMode) return;
    setPayingRow(row);
    setPaymentAccountId(activeLoan.linkedAccountId || accounts[0]?.id || '');
    setActualAmountInput(String(row.emiAmount));
    setPaymentError('');
  };

  const handleConfirmMarkAsPaid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLoan || !payingRow) return;
    setPaymentError('');

    const amt = Number(actualAmountInput);
    if (Number.isNaN(amt) || amt <= 0) {
      setPaymentError('Please enter a valid positive payment amount.');
      return;
    }
    if (!paymentAccountId) {
      setPaymentError(
        'Please select a Bank Account or Wallet to debit this EMI payment from.'
      );
      return;
    }

    onExecuteEmiPayment({
      loanId: activeLoan.id,
      installmentNumber: payingRow.installmentNumber,
      monthYear: payingRow.monthYear,
      accountId: paymentAccountId,
      actualAmountPaid: Math.round(amt * 100) / 100,
    });

    setPayingRow(null);
  };

  const exportLoanScheduleToCsv = (targetLoan: LoanRecord) => {
    const sched = calculateLoanAmortizationSchedule(targetLoan);
    const headers = [
      'Installment #',
      'Month and Year',
      'Opening Balance',
      'EMI Amount',
      'Principal Component',
      'Interest Component',
      'Closing Balance',
      'Status',
    ];
    const csvRows = sched.rows.map((r) =>
      [
        r.installmentNumber,
        `"${r.monthYear}"`,
        r.openingBalance.toFixed(2),
        r.emiAmount.toFixed(2),
        r.principalComponent.toFixed(2),
        r.interestComponent.toFixed(2),
        r.closingBalance.toFixed(2),
        r.status,
      ].join(',')
    );
    const summaryHeader = [
      `"Loan Name","${targetLoan.name}"`,
      `"Category","${targetLoan.category}"`,
      `"Principal Amount","${targetLoan.principalAmount.toFixed(2)}"`,
      `"Interest Rate (% p.a.)","${targetLoan.interestRateAnnual}%"`,
      `"Remaining Principal Balance","${sched.remainingBalance.toFixed(2)}"`,
      `"Total Paid So Far","${sched.totalAmountPaidSoFar.toFixed(2)}"`,
      '',
    ];
    const csvContent = [...summaryHeader, headers.join(','), ...csvRows].join('\n');
    const safeName = targetLoan.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    downloadLocalFile(`loan_amortization_${safeName}.csv`, csvContent, 'text/csv');
  };

  const exportLoanDetailsToPdf = (targetLoan: LoanRecord) => {
    const sched = calculateLoanAmortizationSchedule(targetLoan);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageW, 74, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`LOAN & EMI AMORTIZATION STATEMENT`, 36, 34);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${targetLoan.name} (${targetLoan.category}) · Status: ${targetLoan.status}`,
      36,
      54
    );

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Principal: ${currency}${targetLoan.principalAmount.toLocaleString()}   |   Rate: ${targetLoan.interestRateAnnual}% p.a.   |   Monthly EMI: ${currency}${sched.scheduledMonthlyEmi.toLocaleString()}`,
      36,
      98
    );
    doc.text(
      `Remaining Balance: ${currency}${sched.remainingBalance.toLocaleString()}   |   Total Paid: ${currency}${sched.totalAmountPaidSoFar.toLocaleString()}   |   Installments: ${sched.paidInstallmentsCount}/${sched.rows.length}`,
      36,
      116
    );

    let y = 144;
    doc.setFillColor(241, 245, 249);
    doc.rect(36, y - 12, pageW - 72, 20, 'F');
    doc.setFontSize(8.5);
    doc.text('#', 42, y);
    doc.text('Month/Year', 70, y);
    doc.text('Opening Bal', 150, y);
    doc.text('EMI Amount', 235, y);
    doc.text('Principal', 315, y);
    doc.text('Interest', 390, y);
    doc.text('Closing Bal', 455, y);
    doc.text('Status', 525, y);

    y += 18;
    doc.setFont('helvetica', 'normal');
    for (const r of sched.rows) {
      if (y > 780) {
        doc.addPage();
        y = 48;
      }
      doc.text(`#${r.installmentNumber}`, 42, y);
      doc.text(r.monthYear, 70, y);
      doc.text(`${r.openingBalance.toFixed(2)}`, 150, y);
      doc.text(`${r.emiAmount.toFixed(2)}`, 235, y);
      doc.text(`${r.principalComponent.toFixed(2)}`, 315, y);
      doc.text(`${r.interestComponent.toFixed(2)}`, 390, y);
      doc.text(`${r.closingBalance.toFixed(2)}`, 455, y);
      doc.text(r.status, 525, y);
      y += 15;
    }

    const safeName = targetLoan.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    doc.save(`loan_report_${safeName}.pdf`);
  };

  const openSecureDeleteLoanModal = (loan: LoanRecord) => {
    if (readOnlyMode) return;
    setLoanPendingDelete(loan);
    setDeletePasswordInput('');
    setDeletePasswordError('');
    setHasExportedBeforeDelete(false);
  };

  const handleConfirmSecureLoanDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanPendingDelete) return;
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
    const deletedId = loanPendingDelete.id;
    onDeleteLoan(deletedId);
    setLoanPendingDelete(null);
    setDeletePasswordInput('');
    setDeletePasswordError('');
    if (selectedLoanId === deletedId) {
      const remaining = activeMainLoans.filter((l) => l.id !== deletedId);
      setSelectedLoanId(remaining[0]?.id || '');
    }
  };

  // Reusable Chart & Schedule Renderer (Supports interactive mode for Active Loans and View-Only mode for History)
  const renderChartsAndAmortization = (
    targetLoan: LoanRecord,
    targetSchedule: ReturnType<typeof calculateLoanAmortizationSchedule>,
    isViewOnlyHistory: boolean
  ) => {
    const isFlexibleLoan = targetLoan.loanType === 'person_org_no_tenure';
    const totalPayable = Math.max(1, targetSchedule.totalPayableProjected);
    const principalPct =
      Math.round((targetSchedule.totalPrincipal / totalPayable) * 1000) / 10;
    const interestPct = Math.round((100 - principalPct) * 10) / 10;

    const pts = targetSchedule.rows;
    const maxVal = Math.max(1, targetSchedule.totalPrincipal);
    const width = 560;
    const height = 150;
    const padX = 24;
    const padY = 16;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;

    const allPoints = [
      { x: padX, y: padY, label: 'Start', bal: targetSchedule.totalPrincipal },
      ...pts.map((r, idx) => {
        const x = padX + ((idx + 1) / Math.max(1, pts.length)) * usableW;
        const y = padY + usableH - (r.closingBalance / maxVal) * usableH;
        return { x, y, label: r.monthYear, bal: r.closingBalance, status: r.status };
      }),
    ];

    const polylinePoints = allPoints
      .map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
      .join(' ');
    const areaPath = `M ${allPoints[0].x.toFixed(1)} ${(padY + usableH).toFixed(
      1
    )} L ${allPoints
      .map((pt) => `${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' L ')} L ${allPoints[allPoints.length - 1].x.toFixed(1)} ${(
      padY + usableH
    ).toFixed(1)} Z`;

    return (
      <div className="space-y-5">
        {/* Visual Transaction Charts: Principal vs Interest Breakdown & Remaining Balance Curve */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div
            data-testid={
              isViewOnlyHistory
                ? `history-loan-chart-${targetLoan.id}`
                : 'loan-principal-vs-interest-chart'
            }
            className="lg:col-span-5 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-3"
          >
            <div>
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                Principal vs. Interest Breakdown
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isFlexibleLoan
                  ? `Flexible Repayment Ledger (${targetLoan.lenderName || targetLoan.name})`
                  : 'Complete loan principal and interest ratio across tenure.'}
              </p>
            </div>

            <div className="space-y-3">
              <div className="h-4 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex p-0.5 border border-slate-200 dark:border-slate-700">
                <div
                  style={{ width: `${principalPct}%` }}
                  className="h-full bg-indigo-600 rounded-l-full transition-all duration-300"
                  title={`Principal: ${principalPct}%`}
                />
                <div
                  style={{ width: `${interestPct}%` }}
                  className="h-full bg-amber-500 rounded-r-full transition-all duration-300"
                  title={`Interest: ${interestPct}%`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-600 dark:text-indigo-400">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
                    <span>Principal ({principalPct}%)</span>
                  </div>
                  <div className="font-mono tabular-nums font-extrabold text-sm text-slate-900 dark:text-white mt-0.5">
                    {formatMoney(targetSchedule.totalPrincipal)}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Paid: {formatMoney(targetSchedule.totalPrincipalPaidSoFar)}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    <span>Interest ({interestPct}%)</span>
                  </div>
                  <div className="font-mono tabular-nums font-extrabold text-sm text-slate-900 dark:text-white mt-0.5">
                    {formatMoney(targetSchedule.totalInterestProjected)}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Paid: {formatMoney(targetSchedule.totalInterestPaidSoFar)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            data-testid={
              isViewOnlyHistory
                ? `history-loan-curve-${targetLoan.id}`
                : 'loan-remaining-balance-curve-chart'
            }
            className="lg:col-span-7 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4 text-emerald-500" />
                  <span>Whole Amortization Transaction Chart</span>
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Trajectory from {targetSchedule.rows[0]?.monthYear || 'Start'} to{' '}
                  {targetSchedule.rows[targetSchedule.rows.length - 1]?.monthYear || 'Closure'}
                </p>
              </div>
              <span className="text-[11px] font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                {targetSchedule.paidInstallmentsCount}/{targetSchedule.rows.length} Settled
              </span>
            </div>

            <div className="w-full overflow-hidden">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-32 overflow-visible"
                role="img"
                aria-label="Remaining loan balance curve over time"
              >
                <defs>
                  <linearGradient
                    id={`loanCurveGrad-${targetLoan.id}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.03" />
                  </linearGradient>
                </defs>
                {[0, 0.5, 1].map((ratio) => {
                  const y = padY + ratio * usableH;
                  return (
                    <line
                      key={ratio}
                      x1={padX}
                      y1={y}
                      x2={width - padX}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                  );
                })}
                <path d={areaPath} fill={`url(#loanCurveGrad-${targetLoan.id})`} />
                <polyline
                  fill="none"
                  stroke="#4f46e5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
                {allPoints.map((pt, idx) => {
                  if (
                    pts.length > 24 &&
                    idx !== 0 &&
                    idx !== allPoints.length - 1 &&
                    idx % Math.ceil(pts.length / 12) !== 0
                  ) {
                    return null;
                  }
                  return (
                    <circle
                      key={idx}
                      cx={pt.x}
                      cy={pt.y}
                      r={idx === 0 || idx === allPoints.length - 1 ? 4 : 3}
                      fill={(pt as any).status === 'Paid' ? '#10b981' : '#4f46e5'}
                    />
                  );
                })}
              </svg>
              <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-slate-400 px-2">
                <span>Start: {formatMoney(targetSchedule.totalPrincipal)}</span>
                <span>Paid So Far: {formatMoney(targetSchedule.totalAmountPaidSoFar)}</span>
                <span>Remaining: {formatMoney(targetSchedule.remainingBalance)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Amortization Schedule Table */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                <span>
                  {isViewOnlyHistory
                    ? `View-Only Full Amortization & Transaction Record — ${targetLoan.name}`
                    : `Amortization Schedule — ${targetLoan.name} (${
                        isFlexibleLoan
                          ? `Person/Org: ${targetLoan.lenderName || 'No Fixed Tenure'}`
                          : targetLoan.category
                      })`}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isViewOnlyHistory
                  ? 'Archived closed loan schedule (read-only historical record).'
                  : 'Click "Mark as Paid" on any row to debit the linked bank account and update remaining balance.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => exportLoanScheduleToCsv(targetLoan)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Excel (.CSV)</span>
              </button>
              <button
                type="button"
                onClick={() => exportLoanDetailsToPdf(targetLoan)}
                className="px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export PDF</span>
              </button>
              {!readOnlyMode && !isViewOnlyHistory && (
                <button
                  type="button"
                  data-testid="delete-active-loan-btn"
                  onClick={() => openSecureDeleteLoanModal(targetLoan)}
                  className="px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Loan</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto max-h-[480px]">
            <table
              data-testid={
                isViewOnlyHistory
                  ? `history-loan-amortization-table-${targetLoan.id}`
                  : 'loan-amortization-excel-table'
              }
              className="w-full text-left border-collapse text-xs"
            >
              <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-300 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3 font-extrabold uppercase tracking-wider border-r border-slate-200/70 dark:border-slate-800">
                    #
                  </th>
                  <th className="py-2.5 px-3 font-extrabold uppercase tracking-wider border-r border-slate-200/70 dark:border-slate-800">
                    Month / Date
                  </th>
                  <th className="py-2.5 px-3 font-extrabold uppercase tracking-wider text-right border-r border-slate-200/70 dark:border-slate-800">
                    Opening Bal
                  </th>
                  <th className="py-2.5 px-3 font-extrabold uppercase tracking-wider text-right border-r border-slate-200/70 dark:border-slate-800">
                    EMI / Payment
                  </th>
                  <th className="py-2.5 px-3 font-extrabold uppercase tracking-wider text-right border-r border-slate-200/70 dark:border-slate-800">
                    Principal
                  </th>
                  <th className="py-2.5 px-3 font-extrabold uppercase tracking-wider text-right border-r border-slate-200/70 dark:border-slate-800">
                    Interest
                  </th>
                  <th className="py-2.5 px-3 font-extrabold uppercase tracking-wider text-right border-r border-slate-200/70 dark:border-slate-800">
                    Closing Bal
                  </th>
                  <th className="py-2.5 px-3 font-extrabold uppercase tracking-wider text-center border-r border-slate-200/70 dark:border-slate-800">
                    Status
                  </th>
                  {!isViewOnlyHistory && (
                    <th className="py-2.5 px-3 font-extrabold uppercase tracking-wider text-right">
                      Action
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {targetSchedule.rows.map((row) => {
                  const isPaid = row.status === 'Paid';
                  const paidAcc = row.paidAccountId
                    ? accounts.find((a) => a.id === row.paidAccountId)
                    : undefined;

                  return (
                    <tr
                      key={row.installmentNumber}
                      data-testid={
                        isViewOnlyHistory
                          ? `history-amortization-row-${targetLoan.id}-${row.installmentNumber}`
                          : `amortization-row-${row.installmentNumber}`
                      }
                      className={`transition-colors ${
                        isPaid
                          ? 'bg-emerald-500/5 dark:bg-emerald-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2 px-3 font-extrabold text-slate-900 dark:text-white border-r border-slate-200/60 dark:border-slate-800/70">
                        #{row.installmentNumber}
                      </td>
                      <td className="py-2 px-3 font-sans font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-200/60 dark:border-slate-800/70">
                        {row.monthYear}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-300 border-r border-slate-200/60 dark:border-slate-800/70">
                        {formatMoney(row.openingBalance)}
                      </td>
                      <td className="py-2 px-3 text-right font-extrabold text-slate-900 dark:text-white border-r border-slate-200/60 dark:border-slate-800/70">
                        <div>{formatMoney(row.emiAmount)}</div>
                        {row.isExtraPayment && (
                          <span className="text-[10px] font-sans font-bold text-emerald-600 dark:text-emerald-400">
                            +Extra Prepayment
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-indigo-600 dark:text-indigo-400 font-bold border-r border-slate-200/60 dark:border-slate-800/70">
                        {formatMoney(row.principalComponent)}
                      </td>
                      <td className="py-2 px-3 text-right text-amber-600 dark:text-amber-400 font-bold border-r border-slate-200/60 dark:border-slate-800/70">
                        {formatMoney(row.interestComponent)}
                      </td>
                      <td
                        data-testid={
                          isViewOnlyHistory
                            ? undefined
                            : `amortization-closing-balance-${row.installmentNumber}`
                        }
                        className="py-2 px-3 text-right font-extrabold text-slate-900 dark:text-white border-r border-slate-200/60 dark:border-slate-800/70"
                      >
                        {formatMoney(row.closingBalance)}
                      </td>
                      <td className="py-2 px-3 text-center font-sans border-r border-slate-200/60 dark:border-slate-800/70">
                        {isPaid ? (
                          <span
                            data-testid={
                              isViewOnlyHistory
                                ? undefined
                                : `amortization-status-${row.installmentNumber}`
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-[11px]"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Paid
                          </span>
                        ) : (
                          <span
                            data-testid={
                              isViewOnlyHistory
                                ? undefined
                                : `amortization-status-${row.installmentNumber}`
                            }
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-extrabold text-[11px]"
                          >
                            <Clock className="w-3 h-3" />
                            Upcoming
                          </span>
                        )}
                      </td>
                      {!isViewOnlyHistory && (
                        <td className="py-2 px-3 text-right font-sans">
                          {isPaid ? (
                            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              {paidAcc ? `Debited: ${paidAcc.name}` : 'Settled'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={readOnlyMode}
                              data-testid={`mark-emi-paid-btn-${row.installmentNumber}`}
                              onClick={() => openMarkAsPaidModal(row)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-white font-extrabold text-[11px] cursor-pointer transition-colors"
                            >
                              {isFlexibleLoan ? 'Record Repayment' : 'Mark as Paid'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div data-testid="loans-and-emi-view" className="space-y-4">
      {/* IMAGE 2: Loan Closed Banner at the VERY TOP with "Save Loan in History" button */}
      {closedMainLoanCandidate && (
        <div
          data-testid="loan-closure-celebration-banner"
          className="p-4 sm:p-5 rounded-2xl border-2 border-emerald-500 bg-gradient-to-r from-emerald-950 via-teal-900 to-indigo-950 text-white shadow-xl relative overflow-hidden"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-300 shrink-0 shadow-lg">
                <PartyPopper className="w-6 h-6" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 border border-emerald-300/40 text-emerald-200 text-[10px] font-extrabold uppercase tracking-wider mb-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Loan 100% Paid Off &amp; Closed!</span>
                </div>
                <h3 className="text-base sm:text-lg font-extrabold tracking-tight text-white">
                  Congratulations! &ldquo;{closedMainLoanCandidate.loan.name}&rdquo; is Officially Debt-Free!
                </h3>
                <p className="text-xs text-emerald-100/90 mt-0.5">
                  Remaining Principal Balance is {formatMoney(0)}. All obligations on this{' '}
                  {closedMainLoanCandidate.loan.category} have been settled in full.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <div className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/20 text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                  Closure Status
                </div>
                <div className="text-xs font-extrabold font-mono text-emerald-300 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5" />
                  <span>CLOSED · ZERO DUES</span>
                </div>
              </div>

              {!readOnlyMode && (
                <button
                  type="button"
                  data-testid="save-closed-loan-to-history-btn"
                  onClick={() => handleSaveClosedLoanToHistory(closedMainLoanCandidate.loan)}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-lg transition-colors"
                >
                  <Archive className="w-4 h-4" />
                  <span>Save Loan in History</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IMAGE 3: Single Compact Merged Header — Zero Wasted Vertical Space */}
      <div className="px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Calculator className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
              Loans and EMI — Amortization Schedule &amp; Repayment Tracker
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Track Proper Bank/EMI Loans &amp; Flexible Person/Organization Loans with live amortization and history archive.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Active Loans vs History Switcher */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              data-testid="loans-active-tab"
              onClick={() => setViewTab('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                viewTab === 'active'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Active Loans ({unifiedLoansOverview.totalActiveLoansCount})
            </button>
            <button
              type="button"
              data-testid="loans-history-tab"
              onClick={() => setViewTab('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-colors cursor-pointer ${
                viewTab === 'history'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History ({archivedHistoryLoans.length})</span>
            </button>
          </div>

          {viewTab === 'active' && activeLoan && !readOnlyMode && (
            <button
              type="button"
              data-testid="edit-active-loan-btn"
              onClick={() => openEditLoanForm(activeLoan)}
              className="px-3 py-2 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Loan</span>
            </button>
          )}

          {!readOnlyMode && (
            <button
              type="button"
              data-testid="toggle-new-loan-form-btn"
              onClick={() => {
                if (showCreateForm && !editingLoanId) {
                  setShowCreateForm(false);
                } else {
                  openNewLoanForm('proper_emi');
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>
                {showCreateForm && !editingLoanId
                  ? 'Close Form'
                  : 'Add New Loan / Calculate'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* UNIFIED LOANS SYNC STRIP (100% Matched with Dashboard Loan Section & "THE LOANS" Card) */}
      <div
        data-testid="loans-unified-sync-strip"
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        <div className="p-3.5 rounded-2xl border border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-950/30 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              Total Active Loans (Synced with Dashboard)
            </div>
            <div
              data-testid="loans-tab-total-active-balance"
              className="text-xl font-extrabold font-mono tabular-nums text-indigo-950 dark:text-white mt-0.5"
            >
              {formatMoney(unifiedLoansOverview.theLoansActiveBalance)}
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-extrabold">
            {unifiedLoansOverview.totalActiveLoansCount} Active
          </span>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              1. Legal &amp; Bank Agreement Loans ({unifiedLoansOverview.legalAgreementCount})
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Bank, Credit Card &amp; Company Signed Loans
            </div>
          </div>
          <div
            data-testid="loans-tab-legal-balance"
            className="text-base font-extrabold font-mono tabular-nums text-slate-900 dark:text-white"
          >
            {formatMoney(unifiedLoansOverview.properEmiLoansBalance)}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl border border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              2. Personal &amp; Market Loans ({unifiedLoansOverview.personalMarketCount})
            </div>
            <div className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
              Person / Market Open-Tenure Loans
            </div>
          </div>
          <div
            data-testid="loans-tab-personal-market-balance"
            className="text-base font-extrabold font-mono tabular-nums text-amber-800 dark:text-amber-300"
          >
            {formatMoney(unifiedLoansOverview.flexiblePersonOrgLoansBalance)}
          </div>
        </div>
      </div>

      {/* UNLINKED LOAN ACCOUNT CARDS FROM ACCOUNTS TAB (Ready to Connect or Track) */}
      {unifiedLoansOverview.unlinkedLoanAccounts.length > 0 && (
        <div
          data-testid="unlinked-loan-accounts-banner"
          className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 dark:bg-indigo-950/20 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                Loan Account Cards from Accounts Section ({unifiedLoansOverview.unlinkedLoanAccounts.length})
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Included in total loan calculations. Click &ldquo;Connect Amortization Schedule&rdquo; to generate full monthly EMI rows.
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {unifiedLoansOverview.unlinkedLoanAccounts.map((acc) => {
              const matchedItem = unifiedLoansOverview.allActiveLoans.find((i) => i.id === acc.id);
              const remBal = matchedItem ? matchedItem.remainingBalance : Math.abs(calculateAccountBalance(acc, transactions));
              return (
                <div
                  key={acc.id}
                  data-testid={`loans-tab-unlinked-acc-${acc.id}`}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                      {acc.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      Remaining: {formatMoney(remBal)}
                      {acc.bankGivenEmi ? ` · Bank EMI: ${formatMoney(acc.bankGivenEmi)}/mo` : ''}
                    </div>
                  </div>
                  {!readOnlyMode && (
                    <button
                      type="button"
                      data-testid={`connect-loan-acc-schedule-btn-${acc.id}`}
                      onClick={() => {
                        openNewLoanForm('proper_emi');
                        handleConnectLoanAccountSelect(acc.id);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                    >
                      Connect Schedule
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loan Setup & Calculator / Edit Form with 2 Sections: 1. Proper Loan vs 2. Person/Org Flexible Loan */}
      {showCreateForm && !readOnlyMode && (
        <form
          onSubmit={handleCreateOrUpdateLoanSubmit}
          data-testid="loan-setup-form"
          className="p-5 rounded-2xl border-2 border-indigo-500/40 bg-white dark:bg-slate-900 space-y-4 shadow-md"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                {editingLoanId
                  ? `Edit Loan Details — ${loanName}`
                  : 'Add New Loan / Calculate Schedule'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose between a Proper Fixed-Tenure EMI Loan or a Flexible Person/Organization Loan (No Time Limit to Repay).
              </p>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                {loanType === 'person_org_no_tenure'
                  ? 'Remaining Payable / Planned Installment'
                  : 'Live Active / Suggested Monthly EMI'}
              </div>
              <div
                data-testid="live-calculated-emi-preview"
                className="text-base font-extrabold font-mono tabular-nums text-indigo-700 dark:text-indigo-300"
              >
                {formatMoney(liveFormEmiPreview)}
                {loanType === 'proper_emi' ? ' / mo' : ''}
              </div>
            </div>
          </div>

          {/* TWO LOAN SECTIONS SWITCHER */}
          <div
            data-testid="loan-type-section-switcher"
            className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700"
          >
            <button
              type="button"
              data-testid="loan-type-proper-emi-btn"
              onClick={() => {
                setLoanType('proper_emi');
                if (interestRateAnnual === '0') setInterestRateAnnual('9.5');
              }}
              className={`p-3 rounded-xl text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                loanType === 'proper_emi'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white/60 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900'
              }`}
            >
              <Landmark className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-extrabold">
                  1. Proper Loan (Fixed EMI &amp; Amortization)
                </div>
                <div
                  className={`text-[11px] ${
                    loanType === 'proper_emi' ? 'text-indigo-100' : 'text-slate-500'
                  }`}
                >
                  Standard Bank / NBFC Loan with interest rate, tenure, and monthly EMI schedule.
                </div>
              </div>
            </button>

            <button
              type="button"
              data-testid="loan-type-person-org-btn"
              onClick={() => {
                setLoanType('person_org_no_tenure');
                setInterestRateAnnual('0');
                setLoanStatus('In Progress');
              }}
              className={`p-3 rounded-xl text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                loanType === 'person_org_no_tenure'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-white/60 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-extrabold">
                  2. Loan — Person / Organization (No Time Limit to Repay)
                </div>
                <div
                  className={`text-[11px] ${
                    loanType === 'person_org_no_tenure'
                      ? 'text-slate-900/80 font-medium'
                      : 'text-slate-500'
                  }`}
                >
                  Borrowed from a person or organization with no fixed deadline, &ldquo;but I will repay&rdquo; (reflects on Dashboard).
                </div>
              </div>
            </button>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-300">
              {formError}
            </div>
          )}

          {loanType === 'proper_emi' ? (
            <>
              {/* Connect Loan Account from Accounts Section */}
              <div
                data-testid="connect-loan-account-box"
                className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/30 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label
                      htmlFor="connect-loan-account-select"
                      className="block text-xs font-extrabold text-indigo-800 dark:text-indigo-300"
                    >
                      Connect Loan Account from Accounts Section (Optional — Auto-Syncs Balance &amp; Bank EMI)
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Select any Loan Account card from your Accounts tab to auto-fill its status, remaining balance, and Bank EMI, and keep both synced automatically.
                    </p>
                  </div>
                  {connectedLoanAccountId && (
                    <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold">
                      Connected to Accounts Card
                    </span>
                  )}
                </div>

                <select
                  id="connect-loan-account-select"
                  data-testid="connect-loan-account-select"
                  value={connectedLoanAccountId}
                  onChange={(e) => handleConnectLoanAccountSelect(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs font-semibold rounded-lg border border-indigo-500/40 bg-white dark:bg-slate-950"
                >
                  <option value="">
                    -- Not Connected / Standalone Loan Amortization Schedule --
                  </option>
                  {loanAccountCards.map((loanAcc) => {
                    const remVal =
                      loanAcc.currentRemainingLoanAmount !== undefined
                        ? loanAcc.currentRemainingLoanAmount
                        : Math.abs(calculateAccountBalance(loanAcc, transactions));
                    const statusBadge = loanAcc.loanStatus || 'In Progress';
                    const emiLabel =
                      loanAcc.bankGivenEmi && loanAcc.bankGivenEmi > 0
                        ? ` · Bank EMI: ${formatMoney(loanAcc.bankGivenEmi)}/mo`
                        : '';
                    return (
                      <option key={loanAcc.id} value={loanAcc.id}>
                        {loanAcc.name} ({maskAccountNumber(loanAcc.accountNumber)}) — [{statusBadge}] Remaining: {formatMoney(remVal)}{emiLabel}
                      </option>
                    );
                  })}
                </select>
                {loanAccountCards.length === 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    Tip: You can add a &ldquo;Loan Account&rdquo; card in the Accounts tab (with Current Status, Remaining Loan Balance &amp; Bank EMI) and connect it here anytime.
                  </p>
                )}
              </div>

              {/* Loan Category Selector Pills */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Select Loan Category
                  </label>
                  <DropdownListEditButton
                    listKey="loan_category"
                    label="Loan Category Options"
                    allEditableOptions={loanCategoryList.allEditableOptions}
                    removedOptions={loanCategoryList.removedOptions}
                    onSaveRemovedOptions={loanCategoryList.saveRemovedOptions}
                    currentSelectedValue={category}
                    otherLabel="Others"
                    userPasswordHash={userPasswordHash}
                    onOptionDeletedFallback={(val) => setCategory(val as LoanCategory)}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {loanCategoryList.options.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      data-testid={`loan-category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                      onClick={() => {
                        setCategory(cat as LoanCategory);
                        if (!loanName.trim() && cat !== 'Customize Loan' && cat !== 'Others') {
                          setLoanName(cat);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition cursor-pointer ${
                        category === cat
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-indigo-500/50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Loan Name / Title
                  </label>
                  <input
                    type="text"
                    data-testid="loan-name-input"
                    value={loanName}
                    onChange={(e) => setLoanName(e.target.value)}
                    placeholder="e.g. HDFC Home Loan / Car Loan"
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                {(category === 'Customize Loan' || category === 'Others') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Custom Loan Category Name
                    </label>
                    <input
                      type="text"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      placeholder="e.g. Solar Roof Financing"
                      className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Principal Loan Amount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    data-testid="loan-principal-input"
                    value={principalAmount}
                    onChange={(e) => setPrincipalAmount(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Interest Rate (% p.a.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="loan-rate-input"
                    value={interestRateAnnual}
                    onChange={(e) => setInterestRateAnnual(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Loan Tenure ({formTenureMonths} Months Total)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="600"
                      data-testid="loan-tenure-input"
                      value={tenureValue}
                      onChange={(e) => setTenureValue(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                    <select
                      data-testid="loan-tenure-unit-select"
                      value={tenureUnit}
                      onChange={(e) => setTenureUnit(e.target.value as 'Months' | 'Years')}
                      className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                    >
                      <option value="Months">Months</option>
                      <option value="Years">Years</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    EMI Given by Bank ({currency} — Optional Override)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="loan-bank-emi-override-input"
                    value={customSuggestedEmiInput}
                    onChange={(e) => setCustomSuggestedEmiInput(e.target.value)}
                    placeholder={`Auto-Calculated: ${liveFormulaSuggestedEmi}`}
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    First EMI / Loan Start Date
                  </label>
                  <input
                    type="date"
                    data-testid="loan-start-date-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Linked Bank Account for EMI Auto-Debit
                  </label>
                  <select
                    data-testid="loan-linked-account-select"
                    value={linkedAccountId}
                    onChange={(e) => setLinkedAccountId(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {accounts.length === 0 ? (
                      <option value="">No Bank Account Added Yet</option>
                    ) : (
                      accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({maskAccountNumber(acc.accountNumber)}) — Bal:{' '}
                          {formatMoney(calculateAccountBalance(acc, transactions))}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Current Loan Status
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="loan-status-about-to-start"
                      onClick={() => setLoanStatus('About to Start')}
                      className={`py-2 px-3 rounded-lg text-xs font-extrabold border cursor-pointer ${
                        loanStatus === 'About to Start'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      About to Start
                    </button>
                    <button
                      type="button"
                      data-testid="loan-status-in-progress"
                      onClick={() => setLoanStatus('In Progress')}
                      className={`py-2 px-3 rounded-lg text-xs font-extrabold border cursor-pointer ${
                        loanStatus === 'In Progress'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      In Progress
                    </button>
                  </div>
                </div>
              </div>

              {/* Dynamic In-Progress Fields */}
              {loanStatus === 'In Progress' && (
                <div
                  data-testid="loan-in-progress-options"
                  className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/30 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        In-Progress Loan Adjustments (All Fields Optional / Non-Mandatory)
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Edit any of these fields to dynamically recalculate the remaining amortization schedule.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomSuggestedEmiInput(String(liveFormulaSuggestedEmi))}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold cursor-pointer"
                    >
                      Apply Suggested EMI ({formatMoney(liveFormulaSuggestedEmi)})
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                        Current Remaining Amount ({currency}){' '}
                        <span className="font-normal opacity-75">(Optional)</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        data-testid="loan-current-remaining-input"
                        value={currentRemainingAmountInput}
                        onChange={(e) => setCurrentRemainingAmountInput(e.target.value)}
                        placeholder="Leave blank for auto-calculation"
                        className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-emerald-500/40 bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                        Total Amount Already Paid ({currency}){' '}
                        <span className="font-normal opacity-75">(Optional)</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        data-testid="loan-total-already-paid-input"
                        value={totalAmountAlreadyPaidInput}
                        onChange={(e) => setTotalAmountAlreadyPaidInput(e.target.value)}
                        placeholder="e.g. 180000 (Optional)"
                        className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-emerald-500/40 bg-white dark:bg-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                        Current or Suggested EMI ({currency}){' '}
                        <span className="font-normal opacity-75">(Optional)</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        data-testid="loan-custom-suggested-emi-input"
                        value={customSuggestedEmiInput}
                        onChange={(e) => setCustomSuggestedEmiInput(e.target.value)}
                        placeholder={`Suggested: ${liveFormulaSuggestedEmi}`}
                        className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-emerald-500/40 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-emerald-500/20">
                    <div>
                      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                        Already-Paid EMIs Count (Installments Settled So Far — Optional)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={formTenureMonths}
                        data-testid="loan-initial-paid-emis-input"
                        value={initialPaidEmisCount}
                        onChange={(e) => setInitialPaidEmisCount(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-emerald-500/40 bg-white dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                        Custom Partial / Extra Prepayment Already Made ({currency} — Optional)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        data-testid="loan-initial-prepayment-input"
                        value={initialPrepaymentAmount}
                        onChange={(e) => setInitialPrepaymentAmount(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-emerald-500/40 bg-white dark:bg-slate-900"
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* SECTION 2: Flexible Person / Organization Loan (No Time Limit to Repay) */
            <div
              data-testid="loan-person-org-section"
              className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/30 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Loan / Obligation Title
                  </label>
                  <input
                    type="text"
                    data-testid="loan-name-input"
                    value={loanName}
                    onChange={(e) => {
                      setLoanName(e.target.value);
                      if (!lenderName.trim()) setLenderName(e.target.value);
                    }}
                    placeholder="e.g. Friendly Loan from Uncle / Family Support"
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Person or Organization Name (Who I Owe)
                  </label>
                  <input
                    type="text"
                    data-testid="loan-lender-name-input"
                    value={lenderName}
                    onChange={(e) => setLenderName(e.target.value)}
                    placeholder="e.g. Rajesh Sharma / ABC Society"
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Total Borrowed Amount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    data-testid="loan-principal-input"
                    value={principalAmount}
                    onChange={(e) => setPrincipalAmount(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Amount Already Repaid ({currency} — Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="loan-total-already-paid-input"
                    value={totalAmountAlreadyPaidInput}
                    onChange={(e) => setTotalAmountAlreadyPaidInput(e.target.value)}
                    placeholder="0"
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Current Remaining to Repay ({currency} — Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="loan-current-remaining-input"
                    value={currentRemainingAmountInput}
                    onChange={(e) => setCurrentRemainingAmountInput(e.target.value)}
                    placeholder="Auto: Borrowed - Paid"
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Planned Repayment Tranche ({currency} — Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    data-testid="loan-custom-suggested-emi-input"
                    value={customSuggestedEmiInput}
                    onChange={(e) => setCustomSuggestedEmiInput(e.target.value)}
                    placeholder="No Fixed EMI (Pay When Ready)"
                    className="w-full px-3.5 py-2 text-xs font-mono tabular-nums rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Date Borrowed
                  </label>
                  <input
                    type="date"
                    data-testid="loan-start-date-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Default Account for Repayment
                  </label>
                  <select
                    data-testid="loan-linked-account-select"
                    value={linkedAccountId}
                    onChange={(e) => setLinkedAccountId(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({maskAccountNumber(acc.accountNumber)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                This flexible loan has no fixed deadline or compulsory monthly EMI, and its remaining balance automatically reflects in the Dashboard under &ldquo;The Money I Owe to (Person / Org)&rdquo; and &ldquo;The Loans&rdquo;.
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setEditingLoanId(null);
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="save-loan-submit-btn"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>
                {editingLoanId
                  ? 'Update Loan & Recalculate'
                  : loanType === 'person_org_no_tenure'
                  ? 'Save Person / Org Flexible Loan'
                  : 'Save Loan & Generate Schedule'}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* VIEW TAB 1: ACTIVE LOANS SCREEN */}
      {viewTab === 'active' && (
        <>
          {activeMainLoans.length > 0 ? (
            <>
              {/* Active Loan Selector Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {activeMainLoans.map((loan) => {
                  const isSelected = activeLoan?.id === loan.id;
                  const loanSched = calculateLoanAmortizationSchedule(loan);
                  const closed =
                    loanSched.isLoanClosed || loanSched.remainingBalance <= 0.01;
                  const isFlex = loan.loanType === 'person_org_no_tenure';
                  return (
                    <div
                      key={loan.id}
                      className={`inline-flex items-center rounded-xl border transition ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedLoanId(loan.id)}
                        className="px-3.5 py-2 text-xs font-extrabold flex items-center gap-2 cursor-pointer"
                      >
                        {isFlex ? (
                          <Building2 className="w-3.5 h-3.5" />
                        ) : (
                          <Landmark className="w-3.5 h-3.5" />
                        )}
                        <span>{loan.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {closed
                            ? 'CLOSED 🎉'
                            : isFlex
                            ? 'Person/Org (No Tenure)'
                            : loan.category}
                        </span>
                      </button>
                      {!readOnlyMode && (
                        <div className="flex items-center pr-2">
                          <button
                            type="button"
                            data-testid={`edit-loan-tab-btn-${loan.id}`}
                            onClick={() => openEditLoanForm(loan)}
                            title="Edit Loan & In-Progress Balances"
                            className={`p-1.5 text-xs hover:text-amber-300 cursor-pointer ${
                              isSelected ? 'text-white/80' : 'text-slate-400'
                            }`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-loan-btn-${loan.id}`}
                            onClick={() => openSecureDeleteLoanModal(loan)}
                            title="Export & Delete Loan (Requires Password)"
                            className={`p-1.5 text-xs hover:text-rose-400 cursor-pointer ${
                              isSelected ? 'text-white/80' : 'text-slate-400'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Active Loan KPI Summary + Charts + Schedule */}
              {activeLoan && activeSchedule && (
                <div className="space-y-4">
                  {activeLoan.connectedLoanAccountId && (() => {
                    const connAcc = accounts.find(
                      (a) => a.id === activeLoan.connectedLoanAccountId
                    );
                    if (!connAcc) return null;
                    return (
                      <div
                        data-testid="active-loan-connected-account-badge"
                        className="px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 text-xs font-extrabold text-indigo-800 dark:text-indigo-200">
                          <Landmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span>
                            Connected to Accounts Card: {connAcc.name} ({maskAccountNumber(connAcc.accountNumber)})
                          </span>
                          <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] uppercase">
                            {activeLoan.status}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-indigo-700 dark:text-indigo-300">
                          Synced Remaining Balance: {formatMoney(activeSchedule.remainingBalance)} · Bank EMI: {formatMoney(activeSchedule.scheduledMonthlyEmi)}/mo
                        </span>
                      </div>
                    );
                  })()}
                  {/* 4 KPI Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {activeLoan.loanType === 'person_org_no_tenure'
                          ? 'Repayment Mode'
                          : 'Scheduled Monthly EMI'}
                      </div>
                      <div
                        data-testid="active-loan-scheduled-emi"
                        className="text-xl font-extrabold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 mt-1"
                      >
                        {formatMoney(activeSchedule.scheduledMonthlyEmi)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        {activeLoan.loanType === 'person_org_no_tenure'
                          ? `Lender: ${activeLoan.lenderName || activeLoan.name} · No Fixed Deadline`
                          : `Rate: ${activeLoan.interestRateAnnual}% p.a. · ${activeSchedule.rows.length} Installments`}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Remaining Principal Balance
                      </div>
                      <div
                        data-testid="active-loan-remaining-balance"
                        className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white mt-1"
                      >
                        {formatMoney(activeSchedule.remainingBalance)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Of {formatMoney(activeSchedule.totalPrincipal)} original principal
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Total Projected Interest
                      </div>
                      <div
                        data-testid="active-loan-total-interest"
                        className="text-xl font-extrabold font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1"
                      >
                        {formatMoney(activeSchedule.totalInterestProjected)}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Total Payable: {formatMoney(activeSchedule.totalPayableProjected)}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Repayment Progress
                      </div>
                      <div
                        data-testid="active-loan-paid-count"
                        className="text-xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1"
                      >
                        {activeSchedule.paidInstallmentsCount} / {activeSchedule.rows.length}{' '}
                        {activeLoan.loanType === 'person_org_no_tenure' ? 'Tranches' : 'EMIs'} Paid
                      </div>
                      <div
                        data-testid="active-loan-total-paid-so-far"
                        className="text-[11px] text-slate-500 mt-1"
                      >
                        Paid So Far: {formatMoney(activeSchedule.totalAmountPaidSoFar)}
                      </div>
                    </div>
                  </div>

                  {renderChartsAndAmortization(activeLoan, activeSchedule, false)}
                </div>
              )}
            </>
          ) : (
            <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3">
              <Landmark className="w-8 h-8 text-indigo-500 mx-auto" />
              <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                No Active Loans on Main Screen
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                All closed loans saved to history can be viewed in the History tab, or click &ldquo;Add New Loan / Calculate&rdquo; above to add a Proper Loan or Person/Org Loan.
              </p>
              {archivedHistoryLoans.length > 0 && (
                <button
                  type="button"
                  onClick={() => setViewTab('history')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>View Closed Loan History ({archivedHistoryLoans.length})</span>
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* VIEW TAB 2: CLOSED LOAN HISTORY TAB (Compact Row + Expandable View-Only Chart & Schedule + Password Required to Remove) */}
      {viewTab === 'history' && (
        <div
          data-testid="loans-history-section"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs"
        >
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-500" />
                <span>Closed &amp; Archived Loan History ({archivedHistoryLoans.length})</span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Click the expand arrow on any row to view its complete transaction chart and full amortization schedule (view-only). Password is required to remove from history.
              </p>
            </div>
          </div>

          {archivedHistoryLoans.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No closed loans saved in history yet. When a loan is 100% paid off, click &ldquo;Save Loan in History&rdquo; on the top celebration banner.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {archivedHistoryLoans.map((hLoan) => {
                const hSched = calculateLoanAmortizationSchedule(hLoan);
                const isExpanded = expandedHistoryLoanId === hLoan.id;
                return (
                  <div
                    key={hLoan.id}
                    data-testid={`history-loan-row-${hLoan.id}`}
                    className="p-4 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          data-testid={`expand-history-loan-btn-${hLoan.id}`}
                          onClick={() =>
                            setExpandedHistoryLoanId(isExpanded ? null : hLoan.id)
                          }
                          title="View & Expand Whole Amortization Chart"
                          className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:border-indigo-500 cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                              {hLoan.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold uppercase">
                              Closed &amp; Settled
                            </span>
                            <span className="text-[11px] text-slate-500">
                              ({hLoan.category})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            Principal: {formatMoney(hLoan.principalAmount)} · Total Paid:{' '}
                            {formatMoney(hSched.totalAmountPaidSoFar)} · Archived:{' '}
                            {hLoan.archivedAt || 'Closed'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedHistoryLoanId(isExpanded ? null : hLoan.id)
                          }
                          className="px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              <span>Hide Chart &amp; Schedule</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              <span>View Chart &amp; Amortization</span>
                            </>
                          )}
                        </button>
                        {!readOnlyMode && (
                          <button
                            type="button"
                            data-testid={`delete-history-loan-btn-${hLoan.id}`}
                            onClick={() => openSecureDeleteLoanModal(hLoan)}
                            className="px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div
                        data-testid={`history-loan-expanded-view-${hLoan.id}`}
                        className="pt-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3 rounded-xl"
                      >
                        {renderChartsAndAmortization(hLoan, hSched, true)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Account-Linked EMI Payment Execution Modal */}
      {payingRow && activeLoan && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="emi-mark-as-paid-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Confirm Payment — Installment #{payingRow.installmentNumber}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {activeLoan.name} · Scheduled for {payingRow.monthYear}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayingRow(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {paymentError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-300">
                {paymentError}
              </div>
            )}

            <form onSubmit={handleConfirmMarkAsPaid} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Opening Balance:</span>
                  <strong className="font-mono tabular-nums">
                    {formatMoney(payingRow.openingBalance)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Scheduled Amount:</span>
                  <strong className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                    {formatMoney(payingRow.scheduledEmi)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Interest Component:</span>
                  <strong className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                    {formatMoney(payingRow.interestComponent)}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  1. Which account to debit from?
                </label>
                <select
                  data-testid="emi-modal-account-select"
                  value={paymentAccountId}
                  onChange={(e) => setPaymentAccountId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  {accounts.length === 0 ? (
                    <option value="">No Bank Accounts Available</option>
                  ) : (
                    accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({maskAccountNumber(acc.accountNumber)}) — Balance:{' '}
                        {formatMoney(calculateAccountBalance(acc, transactions))}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  2. Actual Amount Paid ({currency}) — Editable for Extra Prepayment
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  data-testid="emi-modal-actual-amount-input"
                  value={actualAmountInput}
                  onChange={(e) => setActualAmountInput(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums font-extrabold rounded-xl border border-emerald-500/60 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPayingRow(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="emi-modal-confirm-pay-btn"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Wallet className="w-4 h-4" />
                  <span>Confirm &amp; Debit Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Secure Loan Deletion & Export Prompt Modal (Used for both Main Screen and History Tab Removal) */}
      {loanPendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="loan-delete-security-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Export &amp; Password Confirmation to Remove Loan
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {loanPendingDelete.name} ({loanPendingDelete.category})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLoanPendingDelete(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
              <div className="text-xs font-extrabold text-amber-800 dark:text-amber-300">
                Step 1: Download a Backup of Your Loan &amp; Amortization Schedule First
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  data-testid="loan-delete-export-excel-btn"
                  onClick={() => {
                    exportLoanScheduleToCsv(loanPendingDelete);
                    setHasExportedBeforeDelete(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Download Excel (.CSV) Schedule</span>
                </button>
                <button
                  type="button"
                  data-testid="loan-delete-export-pdf-btn"
                  onClick={() => {
                    exportLoanDetailsToPdf(loanPendingDelete);
                    setHasExportedBeforeDelete(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>Download PDF Loan Report</span>
                </button>
              </div>
              {hasExportedBeforeDelete && (
                <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Loan export downloaded! You can now confirm deletion below.</span>
                </div>
              )}
            </div>

            {deletePasswordError && (
              <div
                data-testid="loan-delete-password-error"
                className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-600 dark:text-rose-300"
              >
                {deletePasswordError}
              </div>
            )}

            <form onSubmit={handleConfirmSecureLoanDelete} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Step 2: Enter Account Password to Finalize Removal (Moves to Recycle Bin)
                </label>
                <input
                  type="password"
                  data-testid="loan-delete-password-input"
                  value={deletePasswordInput}
                  onChange={(e) => {
                    setDeletePasswordInput(e.target.value);
                    setDeletePasswordError('');
                  }}
                  placeholder="Enter your account password"
                  required
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setLoanPendingDelete(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="loan-delete-confirm-btn"
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Confirm &amp; Move Loan to Recycle Bin</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
