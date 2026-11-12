import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAccountBalance,
  calculateDashboardSummaryCards,
  calculateDreamTargetDateFromMonthly,
  calculateLoanAmortizationSchedule,
  calculateMonthlySummary,
  calculatePersonLedger,
  ensureZeroKnowledgeUsers,
  generateAdminEmailOtpChallenge,
  generateBillStatementText,
  hashSecretIrreversibly,
  isIrreversibleHash,
  resolveFlexibleLabel,
  verifyAdminEmailOtpChallenge,
  verifySecretAgainstStoredHash,
} from './financeRules';
import {
  ExpectedItem,
  LoanRecord,
  PersonProfile,
  TransactionRecord,
  WalletAccount,
} from '../types/finance';

test('resolveFlexibleLabel handles Other with custom tracking label', () => {
  assert.equal(resolveFlexibleLabel('Other', 'Crypto Hardware Staking'), 'Other (Crypto Hardware Staking)');
  assert.equal(resolveFlexibleLabel('Other', '   '), 'Other');
  assert.equal(resolveFlexibleLabel('Groceries & Dining', 'Ignored'), 'Groceries & Dining');
});

test('calculateAccountBalance computes income, expense, dream investment, and transfers accurately', () => {
  const bank: WalletAccount = {
    id: 'acc-1',
    name: 'Primary Checking',
    type: 'Bank Account',
    currency: 'USD',
    initialBalance: 5000,
    color: '#10b981',
    includeInNetWorth: true,
  };

  const txs: TransactionRecord[] = [
    {
      id: 't1',
      date: '2026-11-01',
      title: 'Monthly Salary',
      amount: 4200,
      type: 'income',
      category: 'Salary & Payroll',
      accountId: 'acc-1',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      status: 'completed',
    },
    {
      id: 't2',
      date: '2026-11-02',
      title: 'Apartment Rent',
      amount: 1500,
      type: 'expense',
      category: 'Housing & Rent',
      accountId: 'acc-1',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      status: 'completed',
    },
    {
      id: 't3',
      date: '2026-11-03',
      title: 'Dream Home Deposit',
      amount: 800,
      type: 'dream_investment',
      category: 'Dream Home Corpus',
      accountId: 'acc-1',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      status: 'completed',
    },
    {
      id: 't4',
      date: '2026-11-04',
      title: 'Unpaid Expected Client Invoice',
      amount: 950,
      type: 'expected_incoming',
      category: 'Client Invoice Receivable',
      accountId: 'acc-1',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      status: 'expected',
    },
  ];

  // 5000 + 4200 - 1500 - 800 = 6900 (expected unpaid is not added yet)
  assert.equal(calculateAccountBalance(bank, txs), 6900);
});

test('calculateMonthlySummary aggregates monthly income, expense, dream investment, and Other categories', () => {
  const txs: TransactionRecord[] = [
    {
      id: 't1',
      date: '2026-11-01',
      title: 'Salary',
      amount: 5000,
      type: 'income',
      category: 'Salary & Payroll',
      accountId: 'acc-1',
      paymentMethod: 'Physical Cash',
      status: 'completed',
    },
    {
      id: 't2',
      date: '2026-11-05',
      title: 'Custom Side Project Expense',
      amount: 1000,
      type: 'expense',
      category: 'Other',
      customCategory: '3D Printer Filament',
      accountId: 'acc-1',
      paymentMethod: 'Physical Cash',
      status: 'completed',
    },
    {
      id: 't3',
      date: '2026-11-06',
      title: 'Index ETF Allocation',
      amount: 500,
      type: 'dream_investment',
      category: 'Index Funds & ETFs',
      accountId: 'acc-1',
      paymentMethod: 'Physical Cash',
      status: 'completed',
    },
  ];

  const summary = calculateMonthlySummary(txs, '2026-11');
  assert.equal(summary.totalIncome, 5000);
  assert.equal(summary.totalExpense, 1000);
  assert.equal(summary.dreamInvestedThisMonth, 500);
  assert.equal(summary.netCashflow, 3500);
  assert.equal(summary.savingsRate, 80);
  assert.equal(summary.categoryBreakdown[0].category, 'Other (3D Printer Filament)');
});

test('calculatePersonLedger and generateBillStatementText combine manual expected items and linked transactions', () => {
  const person: PersonProfile = {
    id: 'p1',
    name: 'Rohan Sharma',
    relationship: 'Other',
    customRelationship: 'Design Partner',
    email: 'rohan@example.com',
  };

  const items: ExpectedItem[] = [
    {
      id: 'e1',
      personId: 'p1',
      title: 'UI Prototype Milestone',
      amount: 1200,
      settledAmount: 400,
      direction: 'expecting_from',
      category: 'Other',
      customCategory: 'Product Design Split',
      date: '2026-11-01',
      dueDate: '2026-11-15',
      status: 'partial',
    },
  ];

  const txs: TransactionRecord[] = [
    {
      id: 'tx-99',
      date: '2026-11-03',
      title: 'Emergency Cash Lent',
      amount: 300,
      type: 'lending_out',
      category: 'Personal Loan to Friend',
      accountId: 'acc-1',
      paymentMethod: 'Instant UPI / QR',
      personId: 'p1',
      status: 'completed',
      billable: true,
    },
  ];

  const ledger = calculatePersonLedger(person, items, txs);
  assert.equal(ledger.totalExpectingFromPerson, 1500);
  assert.equal(ledger.totalSettledByPerson, 400);
  assert.equal(ledger.netReceivable, 1100);

  const billText = generateBillStatementText(person, items, txs, '$', 'Admin Vault');
  assert.ok(billText.includes('Rohan Sharma (Other (Design Partner))'));
  assert.ok(billText.includes('NET BALANCE PAYABLE       : $1100.00'));
});

import {
  generateStandaloneDesktopSoftware,
  generateWindowsExeBuilderBatch,
} from './desktopSoftwareGenerator';

test('generateStandaloneDesktopSoftware produces valid Windows HTA and offline HTML with embedded vault data', () => {
  const hta = generateStandaloneDesktopSoftware(
    [
      {
        id: 'u1',
        username: 'admin',
        displayName: 'Admin',
        passwordHash: 'admin',
        role: 'admin',
        createdAt: '2026-11-01',
        currency: '$',
        customCategories: [],
      },
    ],
    {
      userId: 'u1',
      updatedAt: '2026-11-07',
      accounts: [],
      transactions: [],
      people: [],
      expectedItems: [],
      dreamVaults: [],
    },
    'hta'
  );
  assert.ok(hta.includes('<HTA:APPLICATION'));
  assert.ok(hta.includes('PocketLedger Vault'));

  const exeBatch = generateWindowsExeBuilderBatch();
  assert.ok(exeBatch.includes('PocketLedgerVault.exe'));
});

import {
  createInitialAdminVault,
  DEFAULT_PDF_HEADER_CONFIG,
  generateOneTimeTempPassword,
} from './localVaultStorage';
import {
  exportLedgerRecordsToExcel,
  exportPersonBillToExcel,
  formatPdfCurrency,
  generateLedgerRecordsPdf,
  generatePersonBillPdf,
  sanitizePdfText,
} from './pdfExporter';

test('createInitialAdminVault initializes all entries completely empty and generateOneTimeTempPassword formats 1-time code', () => {
  const vault = createInitialAdminVault('user-admin');
  assert.equal(vault.accounts.length, 0);
  assert.equal(vault.transactions.length, 0);
  assert.equal(vault.people.length, 0);
  assert.equal(vault.expectedItems.length, 0);
  assert.equal(vault.dreamVaults.length, 0);

  const tempPass = generateOneTimeTempPassword();
  assert.match(tempPass, /^TMP-\d{4}-[A-Z0-9]{2}$/);
});

test('sanitizePdfText and formatPdfCurrency convert Unicode Rupee and symbols to crisp ASCII for jsPDF', () => {
  assert.equal(
    sanitizePdfText('Expense Tracker — ₹2,450 · Grocery Bill'),
    'Expense Tracker - Rs. 2,450 | Grocery Bill'
  );
  assert.equal(formatPdfCurrency('₹', 2450), 'Rs. 2,450.00');
  assert.equal(formatPdfCurrency('$', 1200.5), '$1,200.50');
});

test('generateLedgerRecordsPdf, generatePersonBillPdf, and Excel exporters create valid files with Admin header image config', () => {
  const samplePngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const txs: TransactionRecord[] = [
    {
      id: 'tx-501',
      date: '2026-11-07',
      title: 'Server Hardware Invoice',
      amount: 1250,
      type: 'expense',
      category: 'Other',
      customCategory: 'Cloud Infrastructure',
      accountId: 'acc-1',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      personId: 'p-1',
      status: 'completed',
      billable: true,
      proofId: 'PRF-9001',
      proofImageName: 'invoice_receipt.png',
      proofImageDataUrl: samplePngDataUrl,
    },
  ];

  const customHeaderConfig = {
    ...DEFAULT_PDF_HEADER_CONFIG,
    imageUrl: samplePngDataUrl,
    width: 64,
    height: 48,
    align: 'right' as const,
  };

  const recordsPdf = generateLedgerRecordsPdf({
    transactions: txs,
    accounts: [],
    people: [],
    currency: '₹',
    issuedBy: 'Administrator Portal',
    role: 'admin',
    periodLabel: '2026-11',
    headerConfig: customHeaderConfig,
    orientation: 'portrait',
    triggerDownload: false,
  });

  assert.equal(recordsPdf.pdfRowCount, 1);
  assert.equal(recordsPdf.screenshotCount, 1);
  assert.ok(recordsPdf.rawPdfHeader.startsWith('%PDF-'));
  assert.ok(recordsPdf.filename.endsWith('_portrait.pdf'));

  const recordsLandscapePdf = generateLedgerRecordsPdf({
    transactions: txs,
    accounts: [],
    people: [],
    currency: '₹',
    issuedBy: 'Administrator Portal',
    role: 'admin',
    periodLabel: '2026-11',
    headerConfig: { ...customHeaderConfig, orientation: 'landscape' },
    orientation: 'landscape',
    triggerDownload: false,
  });
  assert.ok(recordsLandscapePdf.rawPdfHeader.startsWith('%PDF-'));
  assert.ok(recordsLandscapePdf.filename.endsWith('_landscape.pdf'));

  const person: PersonProfile = {
    id: 'p-1',
    name: 'Aarav Mehta',
    relationship: 'Client',
    phone: '+91 9876543210',
  };

  const billPdf = generatePersonBillPdf({
    person,
    expectedItems: [],
    transactions: txs,
    currency: '₹',
    issuedBy: 'Administrator Portal',
    role: 'admin',
    headerConfig: customHeaderConfig,
    triggerDownload: false,
  });

  assert.equal(billPdf.itemCount, 1);
  assert.equal(billPdf.screenshotCount, 1);
  assert.ok(billPdf.rawPdfHeader.startsWith('%PDF-'));

  const xlsRecordsFile = exportLedgerRecordsToExcel({
    transactions: txs,
    accounts: [],
    people: [person],
    currency: '₹',
    issuedBy: 'Administrator Portal',
    periodLabel: '2026-11',
  });
  assert.equal(xlsRecordsFile, 'expensetracker_records_2026-11.xls');

  const xlsBillFile = exportPersonBillToExcel({
    person,
    expectedItems: [],
    transactions: txs,
    currency: '₹',
    issuedBy: 'Administrator Portal',
  });
  assert.equal(xlsBillFile, 'expensetracker_bill_aarav_mehta.xls');
});

import {
  allocateNextRecordId,
  evaluatePasswordSecurity,
  formatStatusDisplayLabel,
  generateAvailableMonthsFromJan2026,
} from './financeRules';

test('allocateNextRecordId starts from 100 and never repeats even after deletion to Recycle Bin', () => {
  const emptyVault = createInitialAdminVault('u-1');
  const first = allocateNextRecordId(emptyVault);
  assert.equal(first.recordId, '100');
  assert.equal(first.nextRecordNumber, 101);

  const afterDeletionVault = {
    ...emptyVault,
    nextRecordNumber: 102,
    transactions: [],
    recycleBin: [
      {
        recycleId: 'bin-1',
        itemType: 'transaction' as const,
        originalId: '101',
        title: '#101 · Deleted Item',
        subtitle: '2026-11-09',
        deletedAt: '2026-11-09T00:00:00Z',
      },
    ],
  };
  const third = allocateNextRecordId(afterDeletionVault);
  assert.equal(third.recordId, '102');
  assert.equal(third.nextRecordNumber, 103);
});

test('evaluatePasswordSecurity validates alphanumeric rules and classifies Weak, Guessable, and Strong', () => {
  const weak = evaluatePasswordSecurity('abc');
  assert.equal(weak.strength, 'weak');
  assert.equal(weak.isAlphanumericValid, false);

  const guessable = evaluatePasswordSecurity('Pass1234');
  assert.equal(guessable.strength, 'guessable');
  assert.equal(guessable.isAlphanumericValid, true);

  const strong = evaluatePasswordSecurity('VaultKey98#');
  assert.equal(strong.strength, 'strong');
  assert.equal(strong.isAlphanumericValid, true);
});

import {
  isUserSessionActiveElsewhere,
  purgeExpiredSupportChats,
} from './localVaultStorage';
import { UserAccount } from '../types/finance';

test('formatStatusDisplayLabel replaces expected with concise PENDING and generateAvailableMonthsFromJan2026 starts at Jan 2026', () => {
  assert.equal(formatStatusDisplayLabel('expected'), 'PENDING');
  assert.equal(formatStatusDisplayLabel('pending'), 'PENDING');
  assert.equal(formatStatusDisplayLabel('partial'), 'PARTIAL');
  assert.equal(formatStatusDisplayLabel('settled'), 'SETTLED');
  assert.equal(formatStatusDisplayLabel('completed'), 'COMPLETED');

  const months = generateAvailableMonthsFromJan2026([], '2026-11');
  assert.ok(months.some((m) => m.key === '2026-01' && m.label === 'Jan 2026'));
  assert.ok(months.some((m) => m.key === '2026-11' && m.label === 'Nov 2026'));
});

test('isUserSessionActiveElsewhere enforces single-session lock within 2-minute window and purgeExpiredSupportChats auto-deletes 24h security login alerts', () => {
  const nowMs = Date.parse('2026-11-10T10:00:00.000Z');
  const activeUser: UserAccount = {
    id: 'u-1',
    username: 'tejashree',
    displayName: 'Tejashree Pradhan',
    passwordHash: 'SecurePass99#',
    role: 'user',
    createdAt: '2026-11-01T00:00:00.000Z',
    currency: '₹',
    customCategories: [],
    activeSessionToken: 'sess-device-A',
    activeSessionLastSeenAt: '2026-11-10T09:59:00.000Z', // 1 minute ago (< 2 mins)
    securityAlertUnread: true,
    supportMessages: [
      {
        id: 'sec-1',
        sender: 'admin',
        senderName: 'Security System',
        text: 'Somebody tried to log in at the same time you logged in. If you think your password leaked, change it immediately here.',
        createdAt: '2026-11-09T09:00:00.000Z',
        messageType: 'security_login_alert',
        expiresAt: '2026-11-10T09:00:00.000Z', // Expired 1 hour ago
      },
    ],
  };

  // Same session token is allowed
  assert.equal(isUserSessionActiveElsewhere(activeUser, 'sess-device-A', nowMs), false);
  // Different session token within 2 minutes is blocked
  assert.equal(isUserSessionActiveElsewhere(activeUser, 'sess-device-B', nowMs), true);
  // After 2+ minutes of inactivity, another session can log in
  const after3Mins = nowMs + 3 * 60 * 1000;
  assert.equal(isUserSessionActiveElsewhere(activeUser, 'sess-device-B', after3Mins), false);

  // 24h security alert is automatically purged after expiresAt
  const purged = purgeExpiredSupportChats([activeUser], nowMs);
  assert.equal(purged.changed, true);
  assert.equal(purged.users[0].supportMessages?.length, 0);
  assert.equal(purged.users[0].securityAlertUnread, false);
});

import { calculateFirebaseFreeTierStorageStats } from './financeRules';
import { resolveBankLogoFromName } from './bankLogos';

test('calculateFirebaseFreeTierStorageStats computes used bytes and free lifetime space remaining accurately and updates when items are deleted', () => {
  const initialStats = calculateFirebaseFreeTierStorageStats({
    usersJson: JSON.stringify([{ id: 'u1', username: 'admin' }]),
    vaultsJson: 'x'.repeat(20480), // 20 KB
    bannersAndPdfJson: 'y'.repeat(10240), // 10 KB
  });

  assert.ok(initialStats.totalUsedBytes > 30720);
  assert.ok(initialStats.freeRemainingBytes < 1024 * 1024 * 1024);
  assert.equal(initialStats.statusLevel, 'healthy');

  const afterDeleteStats = calculateFirebaseFreeTierStorageStats({
    usersJson: JSON.stringify([{ id: 'u1', username: 'admin' }]),
    vaultsJson: '',
    bannersAndPdfJson: '',
  });
  assert.ok(afterDeleteStats.totalUsedBytes < initialStats.totalUsedBytes);
  assert.ok(afterDeleteStats.freeRemainingBytes > initialStats.freeRemainingBytes);
});

test('resolveBankLogoFromName resolves symbols for major, cooperative, small finance, and custom banks with vector SVG emblem', () => {
  const sbi = resolveBankLogoFromName('State Bank of India');
  assert.ok(sbi.logoUrl?.startsWith('data:image/svg+xml'));
  assert.equal(sbi.domain, 'onlinesbi.sbi');
  assert.equal(sbi.suggestedColor, '#1e3a8a');

  const hdfc = resolveBankLogoFromName('HDFC Bank Savings');
  assert.ok(hdfc.logoUrl?.startsWith('data:image/svg+xml'));
  assert.equal(hdfc.domain, 'hdfcbank.com');

  const saraswat = resolveBankLogoFromName('Saraswat Co-op Bank');
  assert.ok(saraswat.logoUrl?.startsWith('data:image/svg+xml'));
  assert.equal(saraswat.suggestedColor, '#ea580c');

  const customRegional = resolveBankLogoFromName('Gramin Vikas Sahakari Bank');
  assert.ok(customRegional.logoUrl?.startsWith('data:image/svg+xml'));
});

import {
  calculateAccountRecurringProjection,
  calculateStandardMonthlyEmi,
  evaluatePasswordLoginAttempt,
  evaluatePinLoginAttempt,
  formatCooldownTimerMMSS,
  PASSWORD_TIER1_COOLDOWN_MS,
  PERMANENT_LOCKOUT_ALERT_MESSAGE,
} from './financeRules';
import { maskAccountNumber } from './bankLogos';
import { RecurringPaymentItem } from '../types/finance';

test('maskAccountNumber masks bank account numbers cleanly', () => {
  assert.equal(maskAccountNumber('004901528491'), '•••• 8491');
  assert.equal(maskAccountNumber('1104'), '•••• 1104');
  assert.equal(maskAccountNumber(''), '•••• 0000');
});

test('Multi-Tier Lockout State Machine: PIN 3 strikes disables PIN and forces Username + Password fallback', () => {
  let user: UserAccount = {
    id: 'u-sec',
    username: 'arjun',
    displayName: 'Arjun Kapoor',
    passwordHash: 'StrongVault#99',
    mobilePin: '4826',
    role: 'user',
    createdAt: '2026-11-01T00:00:00.000Z',
    currency: '₹',
    customCategories: [],
  };

  // Strike 1
  const s1 = evaluatePinLoginAttempt(user, '0000', 1000);
  assert.equal(s1.success, false);
  assert.equal(s1.remainingPinAttempts, 2);
  assert.equal(s1.forcePasswordFallback, false);
  user = s1.updatedUser;

  // Strike 2
  const s2 = evaluatePinLoginAttempt(user, '1111', 2000);
  assert.equal(s2.success, false);
  assert.equal(s2.remainingPinAttempts, 1);
  assert.equal(s2.forcePasswordFallback, false);
  user = s2.updatedUser;

  // Strike 3 -> disables PIN immediately and forces fallback to Username + Password
  const s3 = evaluatePinLoginAttempt(user, '2222', 3000);
  assert.equal(s3.success, false);
  assert.equal(s3.remainingPinAttempts, 0);
  assert.equal(s3.forcePasswordFallback, true);
  assert.equal(s3.updatedUser.pinLockedOut, true);
  user = s3.updatedUser;

  // Even entering the correct PIN after 3 strikes is rejected and forces Password login
  const s4 = evaluatePinLoginAttempt(user, '4826', 4000);
  assert.equal(s4.success, false);
  assert.equal(s4.forcePasswordFallback, true);
});

test('Multi-Tier Lockout State Machine: Password Tier 1 (5 strikes -> 5-min cooldown + intrusion alert) and Tier 2 (3 strikes post-cooldown -> permanent lock)', () => {
  let user: UserAccount = {
    id: 'u-tier',
    username: 'priya',
    displayName: 'Priya Nair',
    passwordHash: 'CorrectPass#2026',
    role: 'user',
    createdAt: '2026-11-01T00:00:00.000Z',
    currency: '₹',
    customCategories: [],
  };

  const t0 = 1_000_000;

  // Strikes 1 to 4: track remaining attempts (4, 3, 2, 1), no intrusion alert yet
  for (let i = 1; i <= 4; i++) {
    const res = evaluatePasswordLoginAttempt(user, 'wrong', t0 + i * 1000);
    assert.equal(res.success, false);
    assert.equal(res.remainingAttempts, 5 - i);
    assert.equal(res.isCooldownActive, false);
    assert.equal(res.triggerIntrusionAlert, false);
    user = res.updatedUser;
  }

  // Strike 5: locks form for 5 minutes (300,000 ms) and triggers intrusion alert
  const res5 = evaluatePasswordLoginAttempt(user, 'wrong', t0 + 5000);
  assert.equal(res5.success, false);
  assert.equal(res5.remainingAttempts, 0);
  assert.equal(res5.isCooldownActive, true);
  assert.equal(res5.cooldownRemainingMs, PASSWORD_TIER1_COOLDOWN_MS);
  assert.equal(formatCooldownTimerMMSS(res5.cooldownRemainingMs), '05:00');
  assert.equal(res5.triggerIntrusionAlert, true);
  assert.equal(res5.lockoutTier, 1);
  user = res5.updatedUser;

  // Attempt during 5-minute cooldown is blocked even with right password
  const duringCooldown = evaluatePasswordLoginAttempt(user, 'CorrectPass#2026', t0 + 65_000);
  assert.equal(duringCooldown.success, false);
  assert.equal(duringCooldown.isCooldownActive, true);
  assert.equal(formatCooldownTimerMMSS(duringCooldown.cooldownRemainingMs), '04:00');

  // After 5-minute timer expires: enters Tier 2 (3 strikes post-cooldown)
  const afterCooldownTime = t0 + 5000 + PASSWORD_TIER1_COOLDOWN_MS + 1000;

  // Post-cooldown Strike 1 (2 attempts remaining)
  const p1 = evaluatePasswordLoginAttempt(user, 'wrong-again-1', afterCooldownTime);
  assert.equal(p1.success, false);
  assert.equal(p1.isCooldownActive, false);
  assert.equal(p1.isPermanentlyLocked, false);
  assert.equal(p1.remainingAttempts, 2);
  user = p1.updatedUser;

  // Post-cooldown Strike 2 (1 attempt remaining)
  const p2 = evaluatePasswordLoginAttempt(user, 'wrong-again-2', afterCooldownTime + 1000);
  assert.equal(p2.success, false);
  assert.equal(p2.isPermanentlyLocked, false);
  assert.equal(p2.remainingAttempts, 1);
  user = p2.updatedUser;

  // Post-cooldown Strike 3 -> Permanently locks account and returns exact required admin lockout message
  const p3 = evaluatePasswordLoginAttempt(user, 'wrong-again-3', afterCooldownTime + 2000);
  assert.equal(p3.success, false);
  assert.equal(p3.isPermanentlyLocked, true);
  assert.equal(p3.remainingAttempts, 0);
  assert.equal(p3.updatedUser.permanentlyLockedByStrikes, true);
  assert.equal(p3.updatedUser.accountStatus, 'disabled');
  assert.equal(p3.errorMessage, PERMANENT_LOCKOUT_ALERT_MESSAGE);
});

test('Recurring & Compulsory Payments Dual-Status Balance Projection and Dashboard Summary Cards', () => {
  const hdfcAccount: WalletAccount = {
    id: 'acc-hdfc',
    name: 'HDFC Bank Salary',
    type: 'Bank Account',
    accountNumber: '501004829104',
    currency: '₹',
    initialBalance: 50000,
    color: '#1e3a8a',
    includeInNetWorth: true,
  };

  const recurringItems: RecurringPaymentItem[] = [
    {
      id: 'rec-rent',
      title: 'Apartment Rent',
      category: 'Housing & Rent',
      amount: 15000,
      frequency: 'Monthly',
      dueDayLabel: '5th of Month',
      linkedAccountId: 'acc-hdfc',
      status: 'will_be_debited',
    },
    {
      id: 'rec-maid',
      title: 'House Maid Salary',
      category: 'Utilities & Bills',
      amount: 3000,
      frequency: 'Monthly',
      dueDayLabel: '1st of Month',
      linkedAccountId: 'acc-hdfc',
      status: 'already_paid',
    },
  ];

  // When 'rec-maid' was marked 'already_paid', a transaction of 3000 was logged in Records
  const transactions: TransactionRecord[] = [
    {
      id: '100',
      date: '2026-11-01',
      title: 'Recurring Payment: House Maid Salary',
      amount: 3000,
      type: 'expense',
      category: 'Utilities & Bills',
      accountId: 'acc-hdfc',
      paymentMethod: 'Instant UPI / QR',
      status: 'completed',
    },
  ];

  const projection = calculateAccountRecurringProjection(
    hdfcAccount,
    transactions,
    recurringItems
  );

  // Actual balance only reflects the 3,000 already paid (50,000 - 3,000 = 47,000)
  assert.equal(projection.actualBalance, 47000);
  // Upcoming "will_be_debited" is 15,000
  assert.equal(projection.willBeDebitedTotal, 15000);
  // Projected balance after debit is 47,000 - 15,000 = 32,000 without corrupting actualBalance
  assert.equal(projection.projectedBalanceAfterDebit, 32000);

  const expectedItems: ExpectedItem[] = [
    {
      id: 'exp-1',
      personId: 'p-1',
      title: 'Client Retainer Receivable',
      amount: 25000,
      settledAmount: 5000,
      direction: 'expecting_from',
      category: 'Client Invoice Receivable',
      date: '2026-11-01',
      dueDate: '2026-11-20',
      status: 'partial',
    },
  ];

  const dashboardCards = calculateDashboardSummaryCards(
    [hdfcAccount],
    transactions,
    expectedItems
  );
  assert.equal(dashboardCards.totalCountedInAllMyAccounts, 47000);
  assert.equal(dashboardCards.expectedMoneyComingIn, 20000);
});

test('Loan & EMI Amortization Schedule generates Excel breakdown and dynamically recalculates on extra payment', () => {
  const emi = calculateStandardMonthlyEmi(120000, 12, 12);
  // For 120,000 at 12% p.a. (1% per month) over 12 months, EMI is ~10,661.85
  assert.equal(emi, 10661.85);

  const baseLoan: LoanRecord = {
    id: 'loan-car',
    name: 'Car Loan - Nexon EV',
    category: 'Car Loan',
    principalAmount: 120000,
    interestRateAnnual: 12,
    tenureMonths: 12,
    startDate: '2026-01-10',
    linkedAccountId: 'acc-hdfc',
    status: 'About to Start',
    payments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const initialSchedule = calculateLoanAmortizationSchedule(baseLoan);
  assert.equal(initialSchedule.rows.length, 12);
  assert.equal(initialSchedule.rows[0].openingBalance, 120000);
  assert.equal(initialSchedule.rows[0].interestComponent, 1200);
  assert.equal(initialSchedule.rows[initialSchedule.rows.length - 1].closingBalance, 0);

  // Now simulate marking Installment #1 as Paid with an extra prepayment (e.g. paying 31,200 instead of 10,661.85)
  // Interest = 1,200, Principal Paid = 30,000 -> Closing balance of Month 1 becomes 90,000!
  const loanWithExtraPayment: LoanRecord = {
    ...baseLoan,
    status: 'In Progress',
    payments: [
      {
        installmentNumber: 1,
        paidDate: '2026-01-10',
        actualAmountPaid: 31200,
        accountId: 'acc-hdfc',
        transactionId: '105',
      },
    ],
  };

  const recalculated = calculateLoanAmortizationSchedule(loanWithExtraPayment);
  assert.equal(recalculated.rows[0].status, 'Paid');
  assert.equal(recalculated.rows[0].closingBalance, 90000);
  assert.equal(recalculated.rows[1].openingBalance, 90000);
  // Month 2 interest is now 1% of 90,000 = 900 (down from 1,105.38)
  assert.equal(recalculated.rows[1].interestComponent, 900);
  // Total tenure shortens automatically and total interest projected decreases
  assert.ok(recalculated.rows.length < 12);
  assert.ok(recalculated.totalInterestProjected < initialSchedule.totalInterestProjected);
  assert.equal(recalculated.remainingBalance, 90000);
  assert.equal(recalculated.isLoanClosed, false);
});

test('In-Progress Loan Editing recalculates schedule from optional currentRemainingAmount, totalAmountAlreadyPaid, customSuggestedEmi, and detects loan closure', () => {
  const inProgressLoan: LoanRecord = {
    id: 'loan-home',
    name: 'Home Loan - SBI',
    category: 'Home Loan',
    principalAmount: 500000,
    interestRateAnnual: 12,
    tenureMonths: 24,
    startDate: '2026-01-10',
    linkedAccountId: 'acc-sbi',
    status: 'In Progress',
    initialPaidEmisCount: 4,
    currentRemainingAmount: 300000,
    totalAmountAlreadyPaid: 225000,
    customSuggestedEmi: 28000,
    payments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const summary = calculateLoanAmortizationSchedule(inProgressLoan);
  // First 4 installments are Paid and end at closingBalance = 300,000
  assert.equal(summary.rows[3].status, 'Paid');
  assert.equal(summary.rows[3].closingBalance, 300000);
  // Installment #5 starts at openingBalance = 300,000 and uses customSuggestedEmi = 28,000
  assert.equal(summary.rows[4].status, 'Upcoming');
  assert.equal(summary.rows[4].openingBalance, 300000);
  assert.equal(summary.rows[4].emiAmount, 28000);
  assert.equal(summary.totalAmountPaidSoFar, 225000);
  assert.equal(summary.remainingBalance, 300000);
  assert.equal(summary.isLoanClosed, false);

  // When currentRemainingAmount is set to 0, isLoanClosed is true for Loan Closure Celebration
  const closedLoan: LoanRecord = {
    ...inProgressLoan,
    currentRemainingAmount: 0,
    totalAmountAlreadyPaid: 540000,
  };
  const closedSummary = calculateLoanAmortizationSchedule(closedLoan);
  assert.equal(closedSummary.remainingBalance, 0);
  assert.equal(closedSummary.isLoanClosed, true);
});

test('Zero-Knowledge Salted SHA-256 Hashing hides plaintext passwords and PINs while verifying accurately', () => {
  const plainPass = 'SuperSecret#2026';
  const hashed = hashSecretIrreversibly(plainPass);
  assert.equal(isIrreversibleHash(hashed), true);
  assert.equal(hashed.includes(plainPass), false);
  // Idempotent if called again on an already-hashed value
  assert.equal(hashSecretIrreversibly(hashed), hashed);

  assert.equal(verifySecretAgainstStoredHash(plainPass, hashed), true);
  assert.equal(verifySecretAgainstStoredHash('WrongPassword123', hashed), false);

  const { users: upgradedUsers, upgraded } = ensureZeroKnowledgeUsers([
    {
      id: 'user-admin',
      username: 'admin',
      displayName: 'Admin',
      passwordHash: 'admin',
      mobilePin: '0718',
      role: 'admin',
      createdAt: '2026-11-01T00:00:00.000Z',
      currency: '₹',
      customCategories: [],
    },
  ]);
  assert.equal(upgraded, true);
  assert.equal(isIrreversibleHash(upgradedUsers[0].passwordHash), true);
  assert.equal(isIrreversibleHash(upgradedUsers[0].mobilePin), true);
  assert.equal(upgradedUsers[0].passwordHash.includes('admin'), false);
  assert.equal(upgradedUsers[0].mobilePin?.includes('0718'), false);
  assert.equal(verifySecretAgainstStoredHash('admin', upgradedUsers[0].passwordHash), true);
  assert.equal(verifySecretAgainstStoredHash('0718', upgradedUsers[0].mobilePin), true);
});

test('Admin-Only Email OTP Verification works strictly for Admins and rejects regular customer accounts', () => {
  const customerUser = {
    id: 'user-cust',
    username: 'rohit',
    displayName: 'Rohit',
    passwordHash: hashSecretIrreversibly('CustPass99#'),
    role: 'user' as const,
    createdAt: '2026-11-01T00:00:00.000Z',
    currency: '₹',
    customCategories: [],
  };

  // Customer accounts MUST be rejected from generating or using Email OTP
  const rejectedCustomerOtp = generateAdminEmailOtpChallenge(customerUser, 'rohit@example.com');
  assert.equal(rejectedCustomerOtp.ok, false);

  const adminUser = {
    id: 'user-admin',
    username: 'admin',
    displayName: 'Administrator Portal',
    passwordHash: hashSecretIrreversibly('admin'),
    role: 'admin' as const,
    email: 'koustubhjuvekar2000@gmail.com',
    createdAt: '2026-11-01T00:00:00.000Z',
    currency: '₹',
    customCategories: [],
    lockoutTier: 1 as const,
    passwordFailedAttempts: 5,
  };

  const nowMs = 1794412000000;
  const challenge = generateAdminEmailOtpChallenge(adminUser, undefined, nowMs);
  assert.equal(challenge.ok, true);
  assert.equal(challenge.otpCode?.length, 6);
  assert.equal(isIrreversibleHash(challenge.otpHash), true);
  assert.equal(challenge.otpHash?.includes(challenge.otpCode!), false);

  // Wrong OTP is rejected
  const wrongOtpRes = verifyAdminEmailOtpChallenge({
    adminUser: challenge.updatedAdmin!,
    enteredOtp: '000000',
    newPasswordPlain: 'NewAdminPass#99',
    nowMs: nowMs + 1000,
  });
  if (challenge.otpCode !== '000000') {
    assert.equal(wrongOtpRes.ok, false);
  }

  // Correct OTP verifies, hashes the new Admin password irreversibly, and clears lockouts
  const validOtpRes = verifyAdminEmailOtpChallenge({
    adminUser: challenge.updatedAdmin!,
    enteredOtp: challenge.otpCode!,
    newPasswordPlain: 'NewAdminPass#99',
    nowMs: nowMs + 5000,
  });
  assert.equal(validOtpRes.ok, true);
  assert.equal(isIrreversibleHash(validOtpRes.updatedAdmin?.passwordHash), true);
  assert.equal(validOtpRes.updatedAdmin?.passwordHash.includes('NewAdminPass#99'), false);
  assert.equal(
    verifySecretAgainstStoredHash('NewAdminPass#99', validOtpRes.updatedAdmin?.passwordHash),
    true
  );
  assert.equal(validOtpRes.updatedAdmin?.lockoutTier, 0);
  assert.equal(validOtpRes.updatedAdmin?.passwordFailedAttempts, 0);
});

test('calculateDreamTargetDateFromMonthly computes target date from monthly addition or returns No Date', () => {
  const resCalc = calculateDreamTargetDateFromMonthly(100000, 20000, 10000, '2026-11-01');
  assert.equal(resCalc.monthsNeeded, 8);
  assert.equal(resCalc.calculatedDateIso, '2027-07-01');

  const resNoMonthly = calculateDreamTargetDateFromMonthly(100000, 0, 0, '2026-11-01');
  assert.equal(resNoMonthly.monthsNeeded, null);
  assert.equal(resNoMonthly.calculatedDateIso, 'No Date');
});

test('Flexible Person/Org Loan (person_org_no_tenure) and 4-Card Dashboard Summary compute accurately', () => {
  const accounts: WalletAccount[] = [
    {
      id: 'acc-1',
      name: 'HDFC Savings',
      type: 'Savings',
      currency: '₹',
      initialBalance: 120000,
      color: '#004c8f',
      includeInNetWorth: true,
    },
  ];
  const expectedItems: ExpectedItem[] = [
    {
      id: 'exp-in-1',
      personId: 'p-1',
      title: 'Client Receivable',
      amount: 15000,
      settledAmount: 5000,
      direction: 'expecting_from',
      category: 'Client Project',
      date: '2026-11-01',
      dueDate: '2026-11-30',
      status: 'partial',
    },
    {
      id: 'exp-owe-1',
      personId: 'p-2',
      title: 'Vendor Payable',
      amount: 8000,
      settledAmount: 2000,
      direction: 'borrowed_from',
      category: 'Other',
      date: '2026-11-02',
      dueDate: '2026-11-30',
      status: 'partial',
    },
  ];

  const properLoan: LoanRecord = {
    id: 'loan-proper-1',
    name: 'Bike Loan',
    loanType: 'proper_emi',
    category: 'Bike Loan',
    principalAmount: 60000,
    interestRateAnnual: 10,
    tenureMonths: 12,
    tenureUnit: 'Months',
    startDate: '2026-01-10',
    linkedAccountId: 'acc-1',
    status: 'In Progress',
    initialPaidEmisCount: 0,
    initialPrepaymentAmount: 0,
    currentRemainingAmount: 45000,
    payments: [],
    createdAt: '2026-01-10',
  };

  const flexiblePersonLoan: LoanRecord = {
    id: 'loan-flex-1',
    name: 'Friendly Loan from Rajesh',
    loanType: 'person_org_no_tenure',
    lenderName: 'Rajesh Sharma',
    category: 'Personal Loan',
    principalAmount: 50000,
    interestRateAnnual: 0,
    tenureMonths: 12,
    tenureUnit: 'Months',
    startDate: '2026-06-01',
    linkedAccountId: 'acc-1',
    status: 'In Progress',
    initialPaidEmisCount: 0,
    initialPrepaymentAmount: 0,
    totalAmountAlreadyPaid: 10000,
    payments: [],
    createdAt: '2026-06-01',
  };

  const archivedClosedLoan: LoanRecord = {
    ...properLoan,
    id: 'loan-archived-1',
    currentRemainingAmount: 0,
    archivedToHistory: true,
    archivedAt: '2026-11-10',
  };

  const flexSched = calculateLoanAmortizationSchedule(flexiblePersonLoan);
  assert.equal(flexSched.remainingBalance, 40000);
  assert.equal(flexSched.totalAmountPaidSoFar, 10000);
  assert.equal(flexSched.isLoanClosed, false);

  const summary = calculateDashboardSummaryCards(
    accounts,
    [],
    expectedItems,
    [properLoan, flexiblePersonLoan, archivedClosedLoan]
  );

  assert.equal(summary.totalCountedInAllMyAccounts, 120000);
  assert.equal(summary.expectedMoneyComingIn, 10000);
  // 6000 (from borrowed_from expected item)
  assert.equal(summary.theMoneyIOwePayablesOnly, 6000);
  // 6000 (from borrowed_from expected item) + 40000 (from flexible person/org loan) = 46000
  assert.equal(summary.theMoneyIOweToPeopleAndOrgs, 46000);
  assert.equal(summary.properEmiLoansBalance, 45000);
  assert.equal(summary.flexiblePersonOrgLoansBalance, 40000);
  // 45000 (proper loan) + 40000 (flexible loan) = 85000 (archived loan excluded)
  assert.equal(summary.theLoansActiveBalance, 85000);
});

test('calculatePersonLedger filters out cleared history group records from live counts & ignores auto-generated settlement rows', () => {
  const person: PersonProfile = {
    id: 'p-ranveer',
    name: 'Ranveer Singh',
    relationship: 'Client',
  };

  const expectedItems: ExpectedItem[] = [
    {
      id: 'exp-live-1',
      personId: 'p-ranveer',
      title: 'Loan of 2000',
      amount: 2000,
      settledAmount: 500,
      direction: 'expecting_from',
      category: 'Client Project',
      date: '2026-11-11',
      dueDate: '2026-11-30',
      status: 'partial',
    },
    {
      id: 'exp-hist-1',
      personId: 'p-ranveer',
      title: 'Old Cleared Batch',
      amount: 5000,
      settledAmount: 5000,
      direction: 'expecting_from',
      category: 'Client Project',
      date: '2026-10-01',
      dueDate: '2026-10-30',
      status: 'settled',
    },
  ];

  const transactions: TransactionRecord[] = [
    // Auto-generated settlement row that should NOT appear as a duplicate row in person ledger
    {
      id: '128',
      date: '2026-11-11',
      title: 'Settlement Received: Loan of 2000',
      amount: 500,
      settledAmount: 500,
      type: 'income',
      category: 'Loan Repayment Expected',
      accountId: 'acc-1',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      personId: 'p-ranveer',
      status: 'settled',
    },
    // Real linked transaction record with partial settlement
    {
      id: '129',
      date: '2026-11-12',
      title: 'Direct Billable Milestone',
      amount: 3000,
      settledAmount: 1000,
      type: 'expected_incoming',
      category: 'Client Invoice Receivable',
      accountId: 'acc-1',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      personId: 'p-ranveer',
      status: 'partial',
    },
  ];

  const groups = [
    {
      id: 'grp-hist-1',
      personId: 'p-ranveer',
      name: 'Oct Cleared Group',
      itemIds: ['exp-hist-1'],
      recordIds: ['exp-hist-1'],
      expectedItemIds: ['exp-hist-1'],
      transactionIds: [],
      isClearedToHistory: true,
      clearedAt: '2026-10-15',
      createdAt: '2026-10-10',
    },
  ];

  const ledger = calculatePersonLedger(
    person,
    expectedItems,
    transactions,
    groups
  );

  // Auto-generated 'Settlement Received: ...' should be ignored in linkedTransactions
  assert.equal(ledger.linkedTransactions.length, 1);
  assert.equal(ledger.linkedTransactions[0].id, '129');

  // Total records = 2 expectedItems + 1 linkedTransaction = 3
  // Live records = 1 live expectedItem ('exp-live-1') + 1 live linkedTransaction ('129') = 2
  assert.equal(ledger.liveRecordsCount, 2);

  // Live net receivable:
  // exp-live-1 remaining: 2000 - 500 = 1500
  // tx 129 remaining: 3000 - 1000 = 2000
  // Total liveNetReceivable = 3500
  assert.equal(ledger.liveNetReceivable, 3500);
});

import { filterDropdownOptionsWithOther } from '../components/DropdownListEditButton';

test('filterDropdownOptionsWithOther removes deleted options while preserving Other at the end and calculates direct main balance reflection', () => {
  const base = ['Groceries & Dining', 'Housing & Rent', 'Utilities & Bills', 'Other'];
  const filtered = filterDropdownOptionsWithOther(
    base,
    ['Custom Fuel'],
    ['Housing & Rent'],
    'Other'
  );
  assert.deepEqual(filtered, [
    'Groceries & Dining',
    'Utilities & Bills',
    'Custom Fuel',
    'Other',
  ]);
  // Even if someone tries to delete 'Other', it stays protected at the end
  const tryDeleteOther = filterDropdownOptionsWithOther(base, [], ['Other'], 'Other');
  assert.equal(tryDeleteOther[tryDeleteOther.length - 1], 'Other');
});

test('calculateDashboardSummaryCards computes Total Investments, Total FDs, and FD Amount while keeping Savings Account balance untouched', () => {
  const savingsAcc: WalletAccount = {
    id: 'acc-sbi-sav',
    name: 'SBI Savings Account',
    type: 'Bank Account',
    currency: '₹',
    initialBalance: 100000,
    color: '#1e3a8a',
    includeInNetWorth: true,
  };

  const summary = calculateDashboardSummaryCards(
    [savingsAcc],
    [],
    [],
    [],
    [
      {
        id: 'dv-fd-1',
        name: 'SBI 5-Year Tax Saver FD',
        storageType: 'Fixed Deposit (FD)',
        fdBankName: 'State Bank of India',
        savedInAccountId: 'acc-sbi-sav',
        targetAmount: 150000,
        currentAmount: 150000,
        monthlyPlannedContribution: 0,
        targetDate: '2029-11-01',
      },
      {
        id: 'dv-fd-2',
        name: 'HDFC Emergency FD',
        storageType: 'Fixed Deposit (FD)',
        fdBankName: 'HDFC Bank',
        savedInAccountId: 'acc-sbi-sav',
        targetAmount: 50000,
        currentAmount: 50000,
        monthlyPlannedContribution: 0,
        targetDate: 'No Date',
      },
      {
        id: 'dv-gold-1',
        name: 'Sovereign Gold Fund',
        storageType: 'Gold & Bullion',
        savedInAccountId: 'acc-sbi-sav',
        targetAmount: 100000,
        currentAmount: 40000,
        monthlyPlannedContribution: 5000,
        targetDate: '2028-01-01',
      },
    ]
  );

  // Main Savings Account balance and Total Counted in All My Accounts remain strictly 100,000
  assert.equal(summary.totalCountedInAllMyAccounts, 100000);
  // Total Investments = 150,000 + 50,000 + 40,000 = 240,000
  assert.equal(summary.totalInvestmentsAmount, 240000);
  assert.equal(summary.totalFdCount, 2);
  assert.equal(summary.totalFdAmount, 200000);
  assert.equal(summary.otherInvestmentsAmount, 40000);
});

import { filterTransactionsByAnalyticsPeriod } from '../components/DashboardAnalyticsCharts';

test('calculatePersonLedger and generatePersonBillPdf sum all linked expense records (including non-billable flag or grouped records) to exact 6960.27 total and preserve split expense amounts', () => {
  const person: PersonProfile = {
    id: 'p-dhananjay',
    name: 'Dhananjay Khandekar',
    relationship: 'Family',
  };

  const expectedItems: ExpectedItem[] = [
    {
      id: 'exp-1794425631754',
      personId: 'p-dhananjay',
      title: 'Carrigrow It Support',
      amount: 3000,
      settledAmount: 3000,
      direction: 'expecting_from',
      category: 'Other',
      date: '2026-11-07',
      dueDate: '2026-11-30',
      status: 'settled',
    },
    // Split bill share linked to a full-amount expense transaction (#200 of 500 where 200 is split)
    {
      id: 'exp-split-200',
      personId: 'p-dhananjay',
      title: 'Split Bill: Dinner',
      amount: 200,
      settledAmount: 200,
      direction: 'expecting_from',
      category: 'Client Invoice Receivable',
      customCategory: 'Split Bill Share',
      date: '2026-11-10',
      dueDate: '2026-11-20',
      status: 'settled',
      linkedTransactionId: '200',
    },
  ];

  const transactions: TransactionRecord[] = [
    // Linked expense with billable: true
    {
      id: '116',
      date: '2026-11-09',
      title: 'Zepto',
      amount: 419,
      settledAmount: 419,
      type: 'expense',
      category: 'Groceries & Dining',
      accountId: 'acc-1',
      paymentMethod: 'Instant UPI / QR',
      personId: 'p-dhananjay',
      status: 'settled',
      billable: true,
    },
    // Linked expense where billable was omitted/false, plus decimal precision (.27)
    {
      id: '117',
      date: '2026-11-09',
      title: 'blinkit + Mobile Reacharge + Petrol',
      amount: 3341.27,
      settledAmount: 3341.27,
      type: 'expense',
      category: 'Groceries & Dining',
      accountId: 'acc-1',
      paymentMethod: 'Instant UPI / QR',
      personId: 'p-dhananjay',
      status: 'settled',
    },
    // Main expense record for split bill (keeps full 500 paid amount in Records, not double-counted in person ledger)
    {
      id: '200',
      date: '2026-11-10',
      title: 'Dinner',
      amount: 500,
      type: 'expense',
      category: 'Groceries & Dining',
      accountId: 'acc-1',
      paymentMethod: 'Instant UPI / QR',
      isSplit: true,
      splitPersonId: 'p-dhananjay',
      splitPersonName: 'Dhananjay Khandekar',
      splitAmount: 200,
      grossAmountPaid: 500,
      status: 'completed',
    },
  ];

  const ledger = calculatePersonLedger(person, expectedItems, transactions);
  // 3000 + 200 + 419 + 3341.27 = 6960.27
  assert.equal(ledger.totalExpectingFromPerson, 6960.27);
  assert.equal(ledger.totalSettledByPerson, 6960.27);
  assert.equal(ledger.netReceivable, 0);

  const pdfRes = generatePersonBillPdf({
    person,
    expectedItems,
    transactions,
    currency: '₹',
    issuedBy: 'Koustubh',
    role: 'admin',
    triggerDownload: false,
  });
  assert.equal(pdfRes.itemCount, 4);
});

test('filterTransactionsByAnalyticsPeriod accurately filters transactions by This Week, This Month, This Year, and All Time', () => {
  const sampleTxs: TransactionRecord[] = [
    {
      id: 'tx-w1',
      date: '2026-11-11',
      title: 'Weekly Grocery',
      amount: 500,
      type: 'expense',
      category: 'Groceries & Dining',
      accountId: 'acc-1',
      paymentMethod: 'Physical Cash',
      status: 'completed',
    },
    {
      id: 'tx-m1',
      date: '2026-11-01',
      title: 'Early Nov Rent',
      amount: 12000,
      type: 'expense',
      category: 'Housing & Rent',
      accountId: 'acc-1',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      status: 'completed',
    },
    {
      id: 'tx-y1',
      date: '2026-04-15',
      title: 'April Insurance',
      amount: 8000,
      type: 'expense',
      category: 'Insurance',
      accountId: 'acc-1',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      status: 'completed',
    },
    {
      id: 'tx-old',
      date: '2025-12-20',
      title: 'Last Year Expense',
      amount: 3000,
      type: 'expense',
      category: 'Other',
      accountId: 'acc-1',
      paymentMethod: 'Physical Cash',
      status: 'completed',
    },
  ];

  const weekFiltered = filterTransactionsByAnalyticsPeriod(sampleTxs, 'week', '2026-11');
  assert.equal(weekFiltered.filtered.length, 1);
  assert.equal(weekFiltered.filtered[0].id, 'tx-w1');

  const monthFiltered = filterTransactionsByAnalyticsPeriod(sampleTxs, 'month', '2026-11');
  assert.equal(monthFiltered.filtered.length, 2);

  const yearFiltered = filterTransactionsByAnalyticsPeriod(sampleTxs, 'year', '2026-11');
  assert.equal(yearFiltered.filtered.length, 3);

  const allFiltered = filterTransactionsByAnalyticsPeriod(sampleTxs, 'all', '2026-11');
  assert.equal(allFiltered.filtered.length, 4);
});

test('calculateDashboardSummaryCards syncs Expected Money Coming In and The Money I Owe 100% with Receivables & Payables', () => {
  const people: PersonProfile[] = [
    {
      id: 'p-ranveer',
      name: 'Ranveer Singh',
      relationship: 'Friend',
    },
    {
      id: 'p-vendor',
      name: 'Quick Payable Contact',
      relationship: 'Other',
    },
  ];

  const expectedItems: ExpectedItem[] = [
    {
      id: 'exp-1',
      personId: 'p-ranveer',
      title: 'Split Bill Share',
      amount: 1200,
      settledAmount: 200,
      direction: 'expecting_from',
      category: 'Shared Expense',
      date: '2026-11-10',
      dueDate: '2026-11-20',
      status: 'partial',
    },
    {
      id: 'pay-1',
      personId: 'p-vendor',
      title: 'Short-term Borrowed Cash',
      amount: 1500,
      settledAmount: 500,
      direction: 'borrowed_from',
      category: 'Short-Term Payable',
      date: '2026-11-11',
      dueDate: '2026-11-18',
      status: 'partial',
    },
  ];

  const transactions: TransactionRecord[] = [
    // Linked expense assigned to Ranveer Singh (e.g. Zepto 419 unpaid)
    {
      id: 'tx-linked-exp',
      date: '2026-11-11',
      title: 'Zepto Order for Ranveer',
      amount: 419,
      type: 'expense',
      category: 'Groceries & Dining',
      accountId: 'acc-1',
      paymentMethod: 'Instant UPI / QR',
      personId: 'p-ranveer',
      status: 'completed',
    },
  ];

  const summary = calculateDashboardSummaryCards(
    [],
    transactions,
    expectedItems,
    [],
    [],
    people,
    []
  );

  // Expected Money Coming In = (1200 - 200) + 419 = 1419
  assert.equal(summary.expectedMoneyComingIn, 1419);
  assert.equal(summary.liveReceivableRecords.length, 2);

  // The Money I Owe = (1500 - 500) = 1000
  assert.equal(summary.theMoneyIOwePayablesOnly, 1000);
  assert.equal(summary.livePayableRecords.length, 1);
  assert.equal(summary.livePayableRecords[0].remainingAmount, 1000);
});

import { isPureInvestmentVault } from './financeRules';

test('isPureInvestmentVault classifies Investment cards vs Dreams cards and links dream_investment records accurately', () => {
  const fdCard = {
    id: 'dv-fd',
    name: 'FD',
    storageType: 'Fixed Deposit (FD)' as const,
    targetAmount: 10000,
    currentAmount: 10000,
    monthlyPlannedContribution: 0,
    targetDate: 'No Date',
  };
  const laptopDreamCard = {
    id: 'dv-laptop',
    name: 'MacBook Pro Laptop',
    storageType: 'Dream Investment' as const,
    targetAmount: 120000,
    currentAmount: 30000,
    monthlyPlannedContribution: 10000,
    targetDate: '2027-08-01',
  };

  assert.equal(isPureInvestmentVault(fdCard), true);
  assert.equal(isPureInvestmentVault(laptopDreamCard), false);

  const bank: WalletAccount = {
    id: 'acc-bob',
    name: 'Bank of Baroda',
    type: 'Bank Account',
    currency: '₹',
    initialBalance: 50000,
    color: '#ea580c',
    includeInNetWorth: true,
  };

  const transferToLaptopTx: TransactionRecord = {
    id: '150',
    date: '2026-11-12',
    title: 'Dream Allocation: MacBook Pro Laptop',
    amount: 15000,
    type: 'dream_investment',
    category: 'Self Account Transfer',
    accountId: 'acc-bob',
    dreamVaultId: 'dv-laptop',
    paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
    status: 'completed',
  };

  // Account balance reflects the debit of 15,000 -> 35,000
  assert.equal(calculateAccountBalance(bank, [transferToLaptopTx]), 35000);
});

test('ensureZeroKnowledgeUsers strips polluted test accounts and preserves canonical real users and password hashes', () => {
  const realKoustubhHash =
    'zk_sha256_v1$63c3f5e334ab41f9$1760054e028cf9507cc6c80bdfc1a533665ccb91e25c55465190e767e3536223';
  const realTejashreeHash =
    'zk_sha256_v1$bafed41034ab425f$c85ba80986c033607280ee78a9fe4dd1645a7a633c70b1059f2f0381ffda0bb9';

  const inputUsers: UserAccount[] = [
    {
      id: 'user-verify-inv',
      username: 'koustubh',
      displayName: 'Koustubh Fake Duplicate',
      passwordHash: 'Pass1234#',
      role: 'user',
      createdAt: '2026-11-12T14:18:47.477Z',
      currency: '₹',
      customCategories: [],
    },
    {
      id: 'user-1794238795911',
      username: 'koustubh',
      displayName: 'Koustubh Juvekar',
      passwordHash: realKoustubhHash,
      role: 'user',
      createdAt: '2026-11-09T15:39:55.911Z',
      currency: '₹',
      customCategories: ['Hotel', 'Petrol'],
    },
    {
      id: 'user-1794219602604',
      username: 'Tejashree',
      displayName: 'Tejashree Pradhan',
      passwordHash: realTejashreeHash,
      role: 'user',
      createdAt: '2026-11-09T10:20:02.604Z',
      currency: '₹',
      customCategories: ['Personal things'],
    },
    {
      id: 'user-1794473621693',
      username: 'koustubh_v_1099',
      displayName: 'Polluted Test',
      passwordHash: 'Pass1234#',
      role: 'user',
      createdAt: '2026-11-12T08:53:41.719Z',
      currency: '₹',
      customCategories: [],
    },
  ];

  const { users: cleaned, upgraded } = ensureZeroKnowledgeUsers(inputUsers);
  assert.equal(upgraded, true);
  assert.equal(cleaned.length, 2);
  const koustubh = cleaned.find((u) => u.username === 'koustubh');
  assert.ok(koustubh);
  assert.equal(koustubh.id, 'user-1794238795911');
  assert.equal(koustubh.passwordHash, realKoustubhHash);
  const tejashree = cleaned.find((u) => u.username === 'Tejashree');
  assert.ok(tejashree);
  assert.equal(tejashree.id, 'user-1794219602604');
  assert.equal(tejashree.passwordHash, realTejashreeHash);
});


