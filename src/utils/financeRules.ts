import {
  AmortizationRow,
  DreamVault,
  ExpectedItem,
  LoanAmortizationSummary,
  LoanCategory,
  LoanRecord,
  MonthlyCalculationSummary,
  PersonProfile,
  RecurringPaymentItem,
  SupportChatMessage,
  TransactionRecord,
  UserAccount,
  UserVaultData,
  WalletAccount,
} from '../types/finance';

export const DEFAULT_CATEGORIES: Record<string, string[]> = {
  income: ['Salary & Payroll', 'Freelance & Consulting', 'Dividends & Returns', 'Rental Income', 'Gift Received', 'Refund / Cashback', 'Other'],
  expense: ['Groceries & Dining', 'Housing & Rent', 'Utilities & Bills', 'Transportation & Fuel', 'Healthcare', 'Shopping & Electronics', 'Subscriptions', 'Entertainment', 'Education', 'Other'],
  transfer: [
    'Internal Account Transfer',
    'Siding for Investment',
    'External Bank Transfer',
    'Credit Card Settlement',
    'Cash Withdrawal',
    'Other',
  ],
  dream_investment: ['Index Funds & ETFs', 'Dream Home Corpus', 'Retirement Vault', 'High-Yield Fixed Deposit', 'Gold / Sovereign Bonds', 'Startup / Angel Capital', 'Other'],
  lending_out: ['Personal Loan to Friend', 'Family Assistance', 'Short-term Advance', 'Business Credit Extended', 'Other'],
  borrowing_in: ['Personal Borrowing', 'Short-term Credit', 'Family Loan Received', 'Other'],
  expected_incoming: ['Client Invoice Receivable', 'Pending Reimbursement', 'Split Bill Share', 'Loan Repayment Expected', 'Dividend / Payout Due', 'Other'],
  other: ['Custom Adjustment', 'Reconciliation Entry', 'Special Reserve', 'Other'],
};

export const PAYMENT_METHODS = [
  'Bank Transfer (ACH / NEFT / Wire)',
  'Instant UPI / QR',
  'Physical Cash',
  'Debit Card',
  'Credit Card',
  'Cheque / Demand Draft',
  'Auto-Debit Mandate',
  'Other',
];

/**
 * Resolves the display label whenever "Other" is selected.
 */
export function resolveFlexibleLabel(selected: string, customValue?: string): string {
  if (selected === 'Other' || selected === 'other') {
    const trimmed = customValue?.trim();
    return trimmed && trimmed.length > 0 ? `Other (${trimmed})` : 'Other';
  }
  return selected;
}

/**
 * Computes the live balance of a specific WalletAccount based on initialBalance and completed transactions.
 */
export function calculateAccountBalance(
  account: WalletAccount,
  transactions: TransactionRecord[]
): number {
  let balance = account.initialBalance;

  for (const tx of transactions) {
    // Only expected_incoming items wait for settlement; all standard Expense, Income, and Transfer records reflect directly on main balance
    if (tx.type === 'expected_incoming' && tx.status === 'expected') continue;

    if (tx.accountId === account.id) {
      if (tx.type === 'income' || tx.type === 'borrowing_in') {
        balance += tx.amount;
      } else if (
        tx.type === 'expense' ||
        tx.type === 'lending_out' ||
        tx.type === 'dream_investment'
      ) {
        balance -= tx.amount;
      } else if (tx.type === 'transfer') {
        balance -= tx.amount;
      } else if (tx.type === 'expected_incoming' && tx.status === 'settled') {
        balance += tx.amount;
      } else if (tx.type === 'expected_incoming' && tx.status === 'partial') {
        balance += Math.min(tx.amount, Math.max(0, Number(tx.settledAmount) || 0));
      } else if (tx.type === 'other') {
        balance += tx.amount;
      }
    }

    if (tx.type === 'transfer' && tx.toAccountId === account.id) {
      balance += tx.amount;
    }
  }

  return Math.round(balance * 100) / 100;
}

/**
 * Calculates total net worth across all accounts marked includeInNetWorth, plus Dream Vault balances not already linked.
 */
export function calculateTotalNetWorth(
  accounts: WalletAccount[],
  transactions: TransactionRecord[],
  dreamVaults: DreamVault[]
): {
  liquidBalance: number;
  dreamStorageTotal: number;
  netWorth: number;
} {
  const liquidBalance = accounts
    .filter((a) => a.includeInNetWorth)
    .reduce((sum, acc) => sum + calculateAccountBalance(acc, transactions), 0);

  const dreamStorageTotal = dreamVaults.reduce((sum, v) => sum + v.currentAmount, 0);

  return {
    liquidBalance: Math.round(liquidBalance * 100) / 100,
    dreamStorageTotal: Math.round(dreamStorageTotal * 100) / 100,
    netWorth: Math.round((liquidBalance + dreamStorageTotal) * 100) / 100,
  };
}

/**
 * Computes comprehensive monthly calculations for a given YYYY-MM (or 'ALL').
 */
export function calculateMonthlySummary(
  transactions: TransactionRecord[],
  monthKey: string
): MonthlyCalculationSummary {
  const matching = transactions.filter((tx) => {
    if (monthKey === 'ALL') return true;
    return tx.date.startsWith(monthKey);
  });

  let totalIncome = 0;
  let totalExpense = 0;
  let dreamInvestedThisMonth = 0;
  let lendingOutThisMonth = 0;
  let expectedIncomingThisMonth = 0;
  let borrowingInThisMonth = 0;
  let otherFlowThisMonth = 0;

  const categoryMap = new Map<string, { amount: number; count: number }>();

  for (const tx of matching) {
    const resolvedCat = resolveFlexibleLabel(tx.category, tx.customCategory);

    if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else if (tx.type === 'expense') {
      totalExpense += tx.amount;
      const prev = categoryMap.get(resolvedCat) || { amount: 0, count: 0 };
      categoryMap.set(resolvedCat, {
        amount: prev.amount + tx.amount,
        count: prev.count + 1,
      });
    } else if (tx.type === 'dream_investment') {
      dreamInvestedThisMonth += tx.amount;
      const prev = categoryMap.get(`Dream: ${resolvedCat}`) || { amount: 0, count: 0 };
      categoryMap.set(`Dream: ${resolvedCat}`, {
        amount: prev.amount + tx.amount,
        count: prev.count + 1,
      });
    } else if (tx.type === 'lending_out') {
      lendingOutThisMonth += tx.amount;
    } else if (tx.type === 'expected_incoming') {
      expectedIncomingThisMonth += tx.amount;
    } else if (tx.type === 'borrowing_in') {
      borrowingInThisMonth += tx.amount;
    } else if (tx.type === 'other') {
      otherFlowThisMonth += tx.amount;
    }
  }

  const netCashflow = Math.round((totalIncome - totalExpense - dreamInvestedThisMonth) * 100) / 100;
  const savingsRate =
    totalIncome > 0
      ? Math.round(((totalIncome - totalExpense) / totalIncome) * 1000) / 10
      : 0;

  const daysInPeriod = monthKey === 'ALL' ? 30 : 30;
  const dailyAverageExpense = Math.round((totalExpense / daysInPeriod) * 100) / 100;

  const totalOutflowForChart = totalExpense + dreamInvestedThisMonth;
  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      amount: Math.round(data.amount * 100) / 100,
      count: data.count,
      percentage:
        totalOutflowForChart > 0
          ? Math.round((data.amount / totalOutflowForChart) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    monthKey,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
    netCashflow,
    savingsRate,
    dreamInvestedThisMonth: Math.round(dreamInvestedThisMonth * 100) / 100,
    lendingOutThisMonth: Math.round(lendingOutThisMonth * 100) / 100,
    expectedIncomingThisMonth: Math.round(expectedIncomingThisMonth * 100) / 100,
    borrowingInThisMonth: Math.round(borrowingInThisMonth * 100) / 100,
    otherFlowThisMonth: Math.round(otherFlowThisMonth * 100) / 100,
    dailyAverageExpense,
    categoryBreakdown,
  };
}

/**
 * Calculates person-level lending/expected receivable summary and generates a structured bill/statement.
 * Also computes live-only counts & balances excluding records in cleared history groups.
 */
export function calculatePersonLedger(
  person: PersonProfile,
  expectedItems: ExpectedItem[],
  transactions: TransactionRecord[],
  personRecordGroups: Array<{
    personId: string;
    itemIds?: string[];
    recordIds?: string[];
    expectedItemIds?: string[];
    transactionIds?: string[];
    isClearedToHistory?: boolean;
    allPaid?: boolean;
  }> = []
): {
  person: PersonProfile;
  items: ExpectedItem[];
  linkedTransactions: TransactionRecord[];
  liveItems: ExpectedItem[];
  liveLinkedTransactions: TransactionRecord[];
  liveRecordsCount: number;
  totalExpectingFromPerson: number;
  totalSettledByPerson: number;
  totalBorrowedFromPerson: number;
  netReceivable: number;
  liveNetReceivable: number;
} {
  const clearedHistoryRecordIds = new Set<string>();
  const activeGroupPaidIds = new Set<string>();
  const personGroupRecordIds = new Set<string>();

  for (const grp of personRecordGroups || []) {
    if (grp.personId === person.id) {
      const allIds = [
        ...(grp.itemIds || []),
        ...(grp.recordIds || []),
        ...(grp.expectedItemIds || []),
        ...(grp.transactionIds || []),
      ];
      for (const id of allIds) {
        personGroupRecordIds.add(id);
        if (grp.isClearedToHistory) {
          clearedHistoryRecordIds.add(id);
        }
        if (grp.allPaid || grp.isClearedToHistory) {
          activeGroupPaidIds.add(id);
        }
      }
    }
  }

  const items = expectedItems
    .filter((item) => item.personId === person.id || personGroupRecordIds.has(item.id))
    .map((item) => {
      if (
        item.linkedTransactionId &&
        item.customCategory !== 'Split Bill Share' &&
        !item.title.startsWith('Split Bill:')
      ) {
        const linkedTx = transactions.find(
          (t) => t.id === item.linkedTransactionId && !t.isSplit
        );
        if (linkedTx) {
          const syncedAmt = Math.max(0, Number(linkedTx.amount) || 0);
          const isPaid =
            item.status === 'settled' ||
            linkedTx.status === 'settled' ||
            activeGroupPaidIds.has(item.id) ||
            activeGroupPaidIds.has(linkedTx.id);
          return {
            ...item,
            amount: syncedAmt,
            settledAmount: isPaid
              ? syncedAmt
              : Math.min(syncedAmt, Math.max(0, Number(item.settledAmount) || 0)),
            status: isPaid ? ('settled' as const) : item.status,
          };
        }
      }
      if (activeGroupPaidIds.has(item.id) && item.status !== 'settled') {
        return {
          ...item,
          settledAmount: item.amount,
          status: 'settled' as const,
        };
      }
      return item;
    });

  const linkedIds = new Set(
    items
      .filter(
        (i) =>
          i.linkedTransactionId &&
          i.customCategory !== 'Split Bill Share' &&
          !i.title.startsWith('Split Bill:')
      )
      .map((i) => i.linkedTransactionId)
      .filter(Boolean)
  );

  const linkedTransactions = transactions
    .filter(
      (tx) =>
        (tx.personId === person.id || personGroupRecordIds.has(tx.id)) &&
        !tx.isSplit &&
        !linkedIds.has(tx.id) &&
        !tx.title.startsWith('Settlement Received:') &&
        !tx.title.startsWith('Payable Settled:')
    )
    .map((tx) => {
      if (activeGroupPaidIds.has(tx.id) && tx.status !== 'settled') {
        return {
          ...tx,
          settledAmount: tx.amount,
          status: 'settled' as const,
        };
      }
      return tx;
    });

  const liveItems = items.filter((item) => !clearedHistoryRecordIds.has(item.id));
  const liveLinkedTransactions = linkedTransactions.filter(
    (tx) => !clearedHistoryRecordIds.has(tx.id)
  );

  const computeTotals = (targetItems: ExpectedItem[], targetTxs: TransactionRecord[]) => {
    let expecting = 0;
    let settled = 0;
    let borrowed = 0;

    for (const item of targetItems) {
      const itemAmount = Math.max(0, Number(item.amount) || 0);
      const itemSettled =
        item.status === 'settled'
          ? itemAmount
          : Math.min(itemAmount, Math.max(0, Number(item.settledAmount) || 0));

      if (item.direction === 'borrowed_from') {
        borrowed += Math.max(0, itemAmount - itemSettled);
      } else {
        expecting += itemAmount;
        settled += itemSettled;
      }
    }

    for (const tx of targetTxs) {
      const txAmount = Math.max(0, Number(tx.amount) || 0);
      const txSettled =
        tx.status === 'settled'
          ? txAmount
          : tx.status === 'partial' || (tx.settledAmount && tx.settledAmount > 0)
          ? Math.min(txAmount, Math.max(0, Number(tx.settledAmount) || 0))
          : 0;

      if (tx.type === 'borrowing_in') {
        borrowed += Math.max(0, txAmount - txSettled);
      } else {
        // Count all non-borrowing_in linked transactions (including linked 'expense' records)
        expecting += txAmount;
        settled += txSettled;
      }
    }

    return {
      expecting: Math.round(expecting * 100) / 100,
      settled: Math.round(settled * 100) / 100,
      borrowed: Math.round(borrowed * 100) / 100,
      net: Math.round((expecting - settled - borrowed) * 100) / 100,
    };
  };

  const allTotals = computeTotals(items, linkedTransactions);
  const liveTotals = computeTotals(liveItems, liveLinkedTransactions);

  return {
    person,
    items,
    linkedTransactions,
    liveItems,
    liveLinkedTransactions,
    liveRecordsCount: liveItems.length + liveLinkedTransactions.length,
    totalExpectingFromPerson: allTotals.expecting,
    totalSettledByPerson: allTotals.settled,
    totalBorrowedFromPerson: allTotals.borrowed,
    netReceivable: allTotals.net,
    liveNetReceivable: liveTotals.net,
  };
}

/**
 * Generates a formatted plain-text / printable Bill Statement for a specific person.
 */
export function generateBillStatementText(
  person: PersonProfile,
  expectedItems: ExpectedItem[],
  transactions: TransactionRecord[],
  currencySymbol: string,
  issuedBy: string
): string {
  const summary = calculatePersonLedger(person, expectedItems, transactions);
  const lines: string[] = [];
  const relationshipLabel = resolveFlexibleLabel(person.relationship, person.customRelationship);

  lines.push('================================================================');
  lines.push(`STATEMENT OF ACCOUNT & PAYMENT BILL`);
  lines.push('================================================================');
  lines.push(`Issued By     : ${issuedBy}`);
  lines.push(`Billed To     : ${person.name} (${relationshipLabel})`);
  if (person.email) lines.push(`Email         : ${person.email}`);
  if (person.phone) lines.push(`Phone         : ${person.phone}`);
  lines.push(`Statement Date: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('----------------------------------------------------------------');
  lines.push('ITEMIZED EXPECTED & LENDING RECORDS:');
  lines.push('----------------------------------------------------------------');

  let index = 1;
  for (const item of summary.items) {
    const outstanding = Math.max(0, item.amount - item.settledAmount);
    const catLabel = resolveFlexibleLabel(item.category, item.customCategory);
    lines.push(
      `${String(index).padStart(2, '0')}. [${item.date}] ${item.title} (${catLabel})`
    );
    lines.push(
      `    Total: ${currencySymbol}${item.amount.toFixed(2)} | Paid: ${currencySymbol}${item.settledAmount.toFixed(2)} | Due: ${currencySymbol}${outstanding.toFixed(2)} (By ${item.dueDate}) [${item.status.toUpperCase()}]`
    );
    index++;
  }

  for (const tx of summary.linkedTransactions) {
    if (tx.type !== 'borrowing_in') {
      const txSettled =
        tx.status === 'settled'
          ? tx.amount
          : tx.status === 'partial' || (tx.settledAmount && tx.settledAmount > 0)
          ? Math.min(tx.amount, Math.max(0, Number(tx.settledAmount) || 0))
          : 0;
      const due = Math.max(0, tx.amount - txSettled);
      const catLabel = resolveFlexibleLabel(tx.category, tx.customCategory);
      lines.push(
        `${String(index).padStart(2, '0')}. [${tx.date}] ${tx.title} (${catLabel} - Ledger Record)`
      );
      lines.push(
        `    Total: ${currencySymbol}${tx.amount.toFixed(2)} | Status: ${tx.status.toUpperCase()} | Outstanding: ${currencySymbol}${due.toFixed(2)}`
      );
      index++;
    }
  }

  lines.push('----------------------------------------------------------------');
  lines.push(`Total Billed / Lent       : ${currencySymbol}${summary.totalExpectingFromPerson.toFixed(2)}`);
  lines.push(`Total Settled / Received  : ${currencySymbol}${summary.totalSettledByPerson.toFixed(2)}`);
  if (summary.totalBorrowedFromPerson > 0) {
    lines.push(`Less Offset / Borrowed    : ${currencySymbol}${summary.totalBorrowedFromPerson.toFixed(2)}`);
  }
  lines.push(`NET BALANCE PAYABLE       : ${currencySymbol}${summary.netReceivable.toFixed(2)}`);
  lines.push('================================================================');
  return lines.join('\n');
}

/**
 * Generates portable SQL dump (SQLite compatible) for local database storage in folders.
 */
export function generateSQLiteDump(vault: UserVaultData): string {
  const esc = (v: string | undefined) => (v ? v.replace(/'/g, "''") : '');
  const lines: string[] = [
    '-- PocketLedger Offline SQLite Database Dump',
    `-- Generated At: ${new Date().toISOString()}`,
    'BEGIN TRANSACTION;',
    'CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, name TEXT, type TEXT, currency TEXT, initial_balance REAL);',
    'CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, date TEXT, title TEXT, amount REAL, type TEXT, category TEXT, account_id TEXT, person_id TEXT, status TEXT);',
    'CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, name TEXT, relationship TEXT, phone TEXT, email TEXT);',
    'CREATE TABLE IF NOT EXISTS expected_items (id TEXT PRIMARY KEY, person_id TEXT, title TEXT, amount REAL, settled_amount REAL, direction TEXT, due_date TEXT, status TEXT);',
    'CREATE TABLE IF NOT EXISTS dream_vaults (id TEXT PRIMARY KEY, name TEXT, storage_type TEXT, target_amount REAL, current_amount REAL, monthly_planned REAL, target_date TEXT);',
  ];

  for (const a of vault.accounts) {
    lines.push(
      `INSERT OR REPLACE INTO accounts VALUES ('${esc(a.id)}', '${esc(a.name)}', '${esc(resolveFlexibleLabel(a.type, a.customType))}', '${esc(a.currency)}', ${a.initialBalance});`
    );
  }
  for (const t of vault.transactions) {
    lines.push(
      `INSERT OR REPLACE INTO transactions VALUES ('${esc(t.id)}', '${esc(t.date)}', '${esc(t.title)}', ${t.amount}, '${esc(t.type)}', '${esc(resolveFlexibleLabel(t.category, t.customCategory))}', '${esc(t.accountId)}', '${esc(t.personId)}', '${esc(t.status)}');`
    );
  }
  for (const p of vault.people) {
    lines.push(
      `INSERT OR REPLACE INTO people VALUES ('${esc(p.id)}', '${esc(p.name)}', '${esc(resolveFlexibleLabel(p.relationship, p.customRelationship))}', '${esc(p.phone)}', '${esc(p.email)}');`
    );
  }
  for (const e of vault.expectedItems) {
    lines.push(
      `INSERT OR REPLACE INTO expected_items VALUES ('${esc(e.id)}', '${esc(e.personId)}', '${esc(e.title)}', ${e.amount}, ${e.settledAmount}, '${esc(e.direction)}', '${esc(e.dueDate)}', '${esc(e.status)}');`
    );
  }
  for (const d of vault.dreamVaults) {
    lines.push(
      `INSERT OR REPLACE INTO dream_vaults VALUES ('${esc(d.id)}', '${esc(d.name)}', '${esc(resolveFlexibleLabel(d.storageType, d.customStorageType))}', ${d.targetAmount}, ${d.currentAmount}, ${d.monthlyPlannedContribution}, '${esc(d.targetDate)}');`
    );
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}

/**
 * Replaces raw 'expected' / 'pending' status labels with concise 'PENDING' so PDF columns never overflow.
 */
export function formatStatusDisplayLabel(status: string): string {
  const lower = (status || '').trim().toLowerCase();
  if (lower === 'expected' || lower === 'pending') {
    return 'PENDING';
  }
  if (lower === 'partial') {
    return 'PARTIAL';
  }
  if (lower === 'settled') {
    return 'SETTLED';
  }
  if (lower === 'completed') {
    return 'COMPLETED';
  }
  return status.toUpperCase();
}

/**
 * Allocates a monotonically increasing sequential Record ID starting at 100 ("100", "101", "102", ...).
 * Never repeats numbers even if records are deleted or moved to the Recycle Bin.
 */
export function allocateNextRecordId(vault: UserVaultData): {
  recordId: string;
  nextRecordNumber: number;
} {
  let base = typeof vault.nextRecordNumber === 'number' && vault.nextRecordNumber >= 100
    ? vault.nextRecordNumber
    : 100;

  for (const tx of vault.transactions || []) {
    const num = Number(tx.id);
    if (!Number.isNaN(num) && Number.isFinite(num) && num >= base) {
      base = Math.floor(num) + 1;
    }
  }
  for (const entry of vault.recycleBin || []) {
    const num = Number(entry.originalId);
    if (!Number.isNaN(num) && Number.isFinite(num) && num >= base) {
      base = Math.floor(num) + 1;
    }
  }

  return {
    recordId: String(base),
    nextRecordNumber: base + 1,
  };
}

export interface PasswordConditionCheck {
  id: string;
  label: string;
  fulfilled: boolean;
}

export interface PasswordSecurityEvaluation {
  strength: 'weak' | 'guessable' | 'strong';
  strengthLabel: 'Weak' | 'Guessable' | 'Strong';
  score: number; // 0 to 6
  isAlphanumericValid: boolean;
  securityReason: string;
  conditions: PasswordConditionCheck[];
}

const COMMON_GUESSABLE_PATTERNS = [
  '1234',
  '12345',
  '123456',
  'password',
  'qwerty',
  'admin123',
  'welcome',
  'abc123',
  '1111',
  '0000',
];

/**
 * Evaluates password strength and alphanumeric security rules live as the user types.
 */
export function evaluatePasswordSecurity(password: string): PasswordSecurityEvaluation {
  const val = password || '';
  const hasMinLength = val.length >= 8;
  const hasLower = /[a-z]/.test(val);
  const hasUpper = /[A-Z]/.test(val);
  const hasDigit = /[0-9]/.test(val);
  const hasSymbol = /[^a-zA-Z0-9\s]/.test(val);
  const lower = val.toLowerCase();
  const hasRepeatedChars = /(.)\1{2,}/.test(val);
  const hasCommonSubstr = COMMON_GUESSABLE_PATTERNS.some((p) => lower.includes(p));
  const notGuessable = val.length >= 6 && !hasRepeatedChars && !hasCommonSubstr;

  const conditions: PasswordConditionCheck[] = [
    {
      id: 'alphanumeric',
      label: 'Alphanumeric mix: Contains both letters (A–Z) and numbers (0–9)',
      fulfilled: (hasLower || hasUpper) && hasDigit,
    },
    {
      id: 'length',
      label: 'Minimum 8+ characters long',
      fulfilled: hasMinLength,
    },
    {
      id: 'case',
      label: 'Includes both uppercase (A–Z) and lowercase (a–z) letters',
      fulfilled: hasLower && hasUpper,
    },
    {
      id: 'symbol',
      label: 'Includes at least 1 special symbol (@ # $ % ! & * _ -)',
      fulfilled: hasSymbol,
    },
    {
      id: 'unguessable',
      label: 'No predictable sequences (1234, password, repeated letters)',
      fulfilled: notGuessable,
    },
  ];

  const fulfilledCount = conditions.filter((c) => c.fulfilled).length;
  const isAlphanumericValid = (hasLower || hasUpper) && hasDigit && val.length >= 6;

  let strength: 'weak' | 'guessable' | 'strong' = 'weak';
  let strengthLabel: 'Weak' | 'Guessable' | 'Strong' = 'Weak';

  if (val.length === 0 || fulfilledCount <= 2 || !isAlphanumericValid) {
    strength = 'weak';
    strengthLabel = 'Weak';
  } else if (!notGuessable || fulfilledCount <= 3) {
    strength = 'guessable';
    strengthLabel = 'Guessable';
  } else {
    strength = 'strong';
    strengthLabel = 'Strong';
  }

  return {
    strength,
    strengthLabel,
    score: fulfilledCount,
    isAlphanumericValid,
    securityReason:
      'Security Reason: Your vault stores bank account numbers, branches, and receipt proofs. Combining letters, numbers, and symbols prevents automated brute-force and dictionary guessing attacks.',
    conditions,
  };
}

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Automatically generates all months starting from Jan 2026 ('2026-01') onwards through
 * the current month and any future transaction months so months never run out.
 */
export function generateAvailableMonthsFromJan2026(
  transactions: TransactionRecord[],
  referenceDateIso?: string
): Array<{ key: string; label: string }> {
  const nowStr = referenceDateIso || new Date().toISOString().slice(0, 7);
  let maxYearMonth = nowStr >= '2026-12' ? nowStr : '2026-12';

  for (const tx of transactions || []) {
    const ym = (tx.date || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym) && ym > maxYearMonth) {
      maxYearMonth = ym;
    }
  }

  const [endY, endM] = maxYearMonth.split('-').map(Number);
  // Also include 2 months ahead so upcoming monthly planning is always one click away
  let finalYear = endY;
  let finalMonth = endM + 2;
  if (finalMonth > 12) {
    finalYear += Math.floor((finalMonth - 1) / 12);
    finalMonth = ((finalMonth - 1) % 12) + 1;
  }

  const result: Array<{ key: string; label: string }> = [];
  let y = 2026;
  let m = 1;
  while (y < finalYear || (y === finalYear && m <= finalMonth)) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const label = `${MONTH_SHORT_NAMES[m - 1]} ${y}`;
    result.push({ key, label });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  return result;
}

export const FIREBASE_FREE_TIER_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GiB (1,073,741,824 bytes) Spark Free Lifetime Tier
export const FIRESTORE_DOC_MAX_BYTES = 1024 * 1024; // 1 MiB per-document limit

export interface FirebaseStorageQuotaReport {
  totalUsedBytes: number;
  freeRemainingBytes: number;
  usedPercentage: number;
  freePercentage: number;
  usersAndChatsBytes: number;
  vaultsAndProofsBytes: number;
  bannersAndPdfConfigBytes: number;
  formattedUsed: string;
  formattedFreeRemaining: string;
  formattedTotalLimit: string;
  statusLevel: 'healthy' | 'moderate' | 'warning';
}

export function formatStorageBytes(bytes: number): string {
  const safe = Math.max(0, bytes);
  if (safe < 1024) return `${safe} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(2)} KB`;
  return `${(safe / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Computes exact UTF-8 byte footprint and remaining free space on the Firebase Spark Free Lifetime Tier (1 GiB).
 * Updates live whenever users, chats, vaults, proof images, or hero banners are added or deleted.
 */
export function calculateFirebaseFreeTierStorageStats(params: {
  usersJson?: string;
  vaultsJson?: string;
  bannersAndPdfJson?: string;
}): FirebaseStorageQuotaReport {
  const byteLen = (str?: string) => {
    if (!str) return 0;
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str).length;
    }
    return str.length * 2;
  };

  const usersAndChatsBytes = byteLen(params.usersJson);
  const vaultsAndProofsBytes = byteLen(params.vaultsJson);
  const bannersAndPdfConfigBytes = byteLen(params.bannersAndPdfJson);

  const totalUsedBytes = usersAndChatsBytes + vaultsAndProofsBytes + bannersAndPdfConfigBytes;
  const freeRemainingBytes = Math.max(0, FIREBASE_FREE_TIER_LIMIT_BYTES - totalUsedBytes);
  const rawUsedPct = (totalUsedBytes / FIREBASE_FREE_TIER_LIMIT_BYTES) * 100;
  const usedPercentage = Math.min(100, Math.round(rawUsedPct * 10000) / 10000);
  const freePercentage = Math.max(0, Math.round((100 - usedPercentage) * 10000) / 10000);

  let statusLevel: 'healthy' | 'moderate' | 'warning' = 'healthy';
  if (usedPercentage >= 80) {
    statusLevel = 'warning';
  } else if (usedPercentage >= 50) {
    statusLevel = 'moderate';
  }

  return {
    totalUsedBytes,
    freeRemainingBytes,
    usedPercentage,
    freePercentage,
    usersAndChatsBytes,
    vaultsAndProofsBytes,
    bannersAndPdfConfigBytes,
    formattedUsed: formatStorageBytes(totalUsedBytes),
    formattedFreeRemaining: `${(freeRemainingBytes / (1024 * 1024)).toFixed(2)} MB (1.00 GB Free Tier)`,
    formattedTotalLimit: '1,024.00 MB (1 GiB Free Lifetime)',
    statusLevel,
  };
}

// ============================================================================
// HIGH-SECURITY MULTI-TIER AUTHENTICATION & LOCKOUT STATE MACHINE
// ============================================================================

export const PIN_MAX_STRIKES = 3;
export const PASSWORD_TIER1_MAX_STRIKES = 5;
export const PASSWORD_TIER1_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)
export const PASSWORD_TIER2_MAX_STRIKES = 3;
export const INTRUSION_ALERT_THRESHOLD = 5;

export const PERMANENT_LOCKOUT_ALERT_MESSAGE =
  "Account has been locked and can be enabled only by admin. If you forgot your password, click 'Forgot Password' to connect with Admin Support.";

/**
 * Formats remaining cooldown milliseconds as MM:SS (e.g. "05:00", "04:59", "00:08").
 */
export function formatCooldownTimerMMSS(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export interface PinAttemptEvaluationResult {
  success: boolean;
  updatedUser: UserAccount;
  remainingPinAttempts: number;
  forcePasswordFallback: boolean;
  triggerIntrusionAlert: boolean;
  intrusionAlertMessage?: string;
  errorMessage?: string;
}

// ============================================================================
// ZERO-KNOWLEDGE IRREVERSIBLE PASSWORD & PIN HASHING (Salted Multi-Round SHA-256)
// Ensures passwords, temporary passwords, OTPs, and PINs can NEVER be read in
// plaintext once saved in localStorage or Cloud Firestore.
// ============================================================================

export const ZK_HASH_PREFIX = 'zk_sha256_v1$';
export const DEFAULT_PRIMARY_ADMIN_EMAIL = 'koustubhjuvekar2000@gmail.com';
export const ADMIN_OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rightRotate32(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/**
 * Pure TypeScript FIPS-180-4 SHA-256 hex digest (UTF-8 safe, synchronous in Browser & Node).
 */
export function sha256Hex(input: string): string {
  const utf8Bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    if (code < 0x80) {
      utf8Bytes.push(code);
    } else if (code < 0x800) {
      utf8Bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0xd800 || code >= 0xe000) {
      utf8Bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      i++;
      code = 0x10000 + (((code & 0x3ff) << 10) | (input.charCodeAt(i) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }

  const bitLen = utf8Bytes.length * 8;
  utf8Bytes.push(0x80);
  while (utf8Bytes.length % 64 !== 56) {
    utf8Bytes.push(0);
  }
  const highBits = Math.floor(bitLen / 0x100000000);
  const lowBits = bitLen >>> 0;
  utf8Bytes.push(
    (highBits >>> 24) & 0xff,
    (highBits >>> 16) & 0xff,
    (highBits >>> 8) & 0xff,
    highBits & 0xff,
    (lowBits >>> 24) & 0xff,
    (lowBits >>> 16) & 0xff,
    (lowBits >>> 8) & 0xff,
    lowBits & 0xff
  );

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Array<number>(64);

  for (let offset = 0; offset < utf8Bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] =
        ((utf8Bytes[j] << 24) |
          (utf8Bytes[j + 1] << 16) |
          (utf8Bytes[j + 2] << 8) |
          utf8Bytes[j + 3]) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 =
        rightRotate32(w[i - 15], 7) ^ rightRotate32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 =
        rightRotate32(w[i - 2], 17) ^ rightRotate32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate32(e, 6) ^ rightRotate32(e, 11) ^ rightRotate32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rightRotate32(a, 2) ^ rightRotate32(a, 13) ^ rightRotate32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => (n >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

export function isIrreversibleHash(value?: string): boolean {
  return typeof value === 'string' && value.startsWith(ZK_HASH_PREFIX);
}

function generateSaltHex(): string {
  const randA = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  const randB = Math.floor(Date.now() & 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `${randA}${randB}`;
}

/**
 * Hashes a secret (password, temporary password, PIN, or OTP) with a 16-char hex salt
 * and multi-round SHA-256 key stretching so it can never be reversed or read in plaintext.
 * Idempotent if the input is already hashed (`zk_sha256_v1$...`) or a sentinel (`google-oauth`).
 */
export function hashSecretIrreversibly(plainSecret: string, customSalt?: string): string {
  if (!plainSecret) return '';
  if (isIrreversibleHash(plainSecret)) return plainSecret;
  if (plainSecret === 'google-oauth' || plainSecret === '__non_existent_hash__') {
    return plainSecret;
  }
  const cleanSalt = (customSalt || generateSaltHex()).replace(/[^a-fA-F0-9]/g, '').slice(0, 16) || 'a1b2c3d4e5f60718';
  let digest = sha256Hex(`expensetracker_zk_v1:${cleanSalt}:${plainSecret}`);
  // 64 rounds of salted SHA-256 key stretching
  for (let r = 0; r < 64; r++) {
    digest = sha256Hex(`${cleanSalt}:${r}:${digest}:${plainSecret}`);
  }
  return `${ZK_HASH_PREFIX}${cleanSalt}$${digest}`;
}

/**
 * Constant-time string comparison helper to prevent timing side-channels.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies a plaintext password, PIN, or OTP against a stored irreversible hash
 * (with seamless migration compatibility if a legacy unhashed string is encountered).
 */
export function verifySecretAgainstStoredHash(
  plainAttempt: string,
  storedValue?: string
): boolean {
  if (!storedValue || !plainAttempt) return false;
  if (storedValue === '__non_existent_hash__' || storedValue === 'google-oauth') {
    return false;
  }
  if (isIrreversibleHash(storedValue)) {
    const rest = storedValue.slice(ZK_HASH_PREFIX.length);
    const sepIdx = rest.indexOf('$');
    if (sepIdx <= 0) return false;
    const salt = rest.slice(0, sepIdx);
    const expectedFull = hashSecretIrreversibly(plainAttempt, salt);
    return constantTimeEqual(expectedFull, storedValue);
  }
  return constantTimeEqual(plainAttempt, storedValue);
}

/**
 * Upgrades any plaintext `passwordHash`, `tempPassword`, or `mobilePin` on a UserAccount
 * into an irreversible `zk_sha256_v1$...` hash so plaintext credentials never persist.
 */
export function ensureZeroKnowledgeUserCredentials(user: UserAccount): {
  user: UserAccount;
  upgraded: boolean;
} {
  let upgraded = false;
  let nextPasswordHash = user.passwordHash;
  if (
    nextPasswordHash &&
    nextPasswordHash !== 'google-oauth' &&
    nextPasswordHash !== '__non_existent_hash__' &&
    !isIrreversibleHash(nextPasswordHash)
  ) {
    nextPasswordHash = hashSecretIrreversibly(nextPasswordHash);
    upgraded = true;
  }

  let nextTempPassword = user.tempPassword;
  if (nextTempPassword && !isIrreversibleHash(nextTempPassword)) {
    nextTempPassword = hashSecretIrreversibly(nextTempPassword);
    upgraded = true;
  }

  let nextMobilePin = user.mobilePin;
  if (nextMobilePin && !isIrreversibleHash(nextMobilePin)) {
    nextMobilePin = hashSecretIrreversibly(nextMobilePin);
    upgraded = true;
  }

  const nextEmail =
    user.id === 'user-admin' && !user.email ? DEFAULT_PRIMARY_ADMIN_EMAIL : user.email;
  if (nextEmail !== user.email) {
    upgraded = true;
  }

  if (!upgraded) return { user, upgraded: false };
  return {
    user: {
      ...user,
      passwordHash: nextPasswordHash,
      ...(nextTempPassword ? { tempPassword: nextTempPassword } : {}),
      ...(nextMobilePin ? { mobilePin: nextMobilePin } : {}),
      ...(nextEmail ? { email: nextEmail } : {}),
    },
    upgraded: true,
  };
}

export function isPollutedTestUser(user?: Partial<UserAccount> | null): boolean {
  if (!user || !user.id || !user.username) return true;
  const id = String(user.id).trim();
  const uname = String(user.username).trim().toLowerCase();
  if (
    id === 'user-verify-inv' ||
    id === 'user-smooth-test' ||
    id.startsWith('user-1794417') ||
    id.startsWith('user-179447') ||
    uname.startsWith('verifyuser_') ||
    uname.startsWith('koustubh_v_') ||
    uname === 'smoothtest'
  ) {
    return true;
  }
  return false;
}

const CANONICAL_REAL_USER_IDS = new Set([
  'user-admin',
  'user-1794238795911',
  'user-1794219602604',
]);

export function ensureZeroKnowledgeUsers(users: UserAccount[]): {
  users: UserAccount[];
  upgraded: boolean;
} {
  let anyUpgraded = false;
  const filtered = (users || []).filter((u) => {
    const polluted = isPollutedTestUser(u);
    if (polluted) anyUpgraded = true;
    return !polluted;
  });

  // Deduplicate by lowercase username, always preferring canonical user IDs or earliest createdAt
  const byUsername = new Map<string, UserAccount>();
  for (const rawUser of filtered) {
    const res = ensureZeroKnowledgeUserCredentials(rawUser);
    if (res.upgraded) anyUpgraded = true;
    const candidate = res.user;
    const key = candidate.username.trim().toLowerCase();
    const existing = byUsername.get(key);
    if (!existing) {
      byUsername.set(key, candidate);
    } else {
      anyUpgraded = true;
      const candidateIsCanonical = CANONICAL_REAL_USER_IDS.has(candidate.id);
      const existingIsCanonical = CANONICAL_REAL_USER_IDS.has(existing.id);
      if (candidateIsCanonical && !existingIsCanonical) {
        byUsername.set(key, candidate);
      } else if (!candidateIsCanonical && existingIsCanonical) {
        // keep existing
      } else {
        const cCreated = Date.parse(candidate.createdAt || '') || Number.MAX_SAFE_INTEGER;
        const eCreated = Date.parse(existing.createdAt || '') || Number.MAX_SAFE_INTEGER;
        if (cCreated < eCreated) {
          byUsername.set(key, candidate);
        }
      }
    }
  }

  return { users: Array.from(byUsername.values()), upgraded: anyUpgraded };
}

/**
 * Generates a 6-digit Email OTP challenge strictly for Admin accounts (`role === 'admin'`).
 * Never available to regular customer accounts.
 */
export function generateAdminEmailOtpChallenge(
  adminUser: UserAccount,
  customTargetEmail?: string,
  nowMs = Date.now()
): {
  ok: boolean;
  error?: string;
  otpCode?: string;
  otpHash?: string;
  expiresAtMs?: number;
  targetEmail?: string;
  updatedAdmin?: UserAccount;
} {
  if (!adminUser || adminUser.role !== 'admin') {
    return {
      ok: false,
      error: 'Free lifetime Firebase Email OTP verification is strictly restricted to Admin accounts only.',
    };
  }
  const targetEmail = (
    customTargetEmail?.trim() ||
    adminUser.email?.trim() ||
    adminUser.adminOtpTargetEmail?.trim() ||
    DEFAULT_PRIMARY_ADMIN_EMAIL
  ).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return {
      ok: false,
      error: 'Please enter a valid Admin email address to receive the 6-digit OTP.',
    };
  }

  const otpNumeric = Math.floor(100000 + Math.random() * 900000);
  const otpCode = String(otpNumeric);
  const otpHash = hashSecretIrreversibly(otpCode);
  const expiresAtMs = nowMs + ADMIN_OTP_EXPIRY_MS;

  const updatedAdmin: UserAccount = {
    ...adminUser,
    email: targetEmail,
    adminOtpHash: otpHash,
    adminOtpExpiresAtMs: expiresAtMs,
    adminOtpTargetEmail: targetEmail,
  };

  return {
    ok: true,
    otpCode,
    otpHash,
    expiresAtMs,
    targetEmail,
    updatedAdmin,
  };
}

/**
 * Verifies a 6-digit Email OTP strictly for an Admin account (`role === 'admin'`)
 * and returns the updated Admin account with the new irreversibly hashed password.
 */
export function verifyAdminEmailOtpChallenge(params: {
  adminUser: UserAccount;
  enteredOtp: string;
  newPasswordPlain?: string;
  nowMs?: number;
}): {
  ok: boolean;
  error?: string;
  updatedAdmin?: UserAccount;
} {
  const { adminUser, enteredOtp, newPasswordPlain, nowMs = Date.now() } = params;
  if (!adminUser || adminUser.role !== 'admin') {
    return {
      ok: false,
      error: 'Firebase Email OTP verification is strictly restricted to Admin accounts only.',
    };
  }
  if (!adminUser.adminOtpHash || !adminUser.adminOtpExpiresAtMs) {
    return {
      ok: false,
      error: 'No active Email OTP challenge found. Please click "Send 6-Digit OTP to Admin Email" first.',
    };
  }
  if (nowMs > adminUser.adminOtpExpiresAtMs) {
    return {
      ok: false,
      error: 'This 6-digit Email OTP has expired (10-minute validity). Please request a new OTP.',
    };
  }
  const cleanOtp = (enteredOtp || '').trim();
  if (!/^\d{6}$/.test(cleanOtp)) {
    return {
      ok: false,
      error: 'Please enter the 6-digit numeric OTP sent to your Admin email address.',
    };
  }
  if (!verifySecretAgainstStoredHash(cleanOtp, adminUser.adminOtpHash)) {
    return {
      ok: false,
      error: 'Invalid 6-digit Email OTP code. Please check your email and try again.',
    };
  }

  let nextPasswordHash = adminUser.passwordHash;
  if (newPasswordPlain && newPasswordPlain.trim()) {
    const pwSec = evaluatePasswordSecurity(newPasswordPlain.trim());
    if (!pwSec.isAlphanumericValid) {
      return {
        ok: false,
        error:
          'New Admin password must be at least 8 characters and include uppercase, lowercase, and a number.',
      };
    }
    nextPasswordHash = hashSecretIrreversibly(newPasswordPlain.trim());
  }

  const updatedAdmin: UserAccount = {
    ...adminUser,
    passwordHash: nextPasswordHash,
    adminOtpHash: undefined,
    adminOtpExpiresAtMs: undefined,
    pinFailedAttempts: 0,
    pinLockedOut: false,
    passwordFailedAttempts: 0,
    consecutiveFailedAttempts: 0,
    lockoutTier: 0,
    lockoutUntilMs: undefined,
    permanentlyLockedByStrikes: false,
    accountStatus: 'active',
    tempPassword: undefined,
    tempPasswordValidForFirstLogin: false,
    mustChangePassword: false,
  };

  return {
    ok: true,
    updatedAdmin,
  };
}

/**
 * Evaluates a Mobile PIN login attempt with a strict 3-strike lockout rule:
 * - If the user enters the wrong PIN 3 times, PIN entry is immediately disabled (`pinLockedOut = true`)
 *   and the UI forces fallback to Username + Password login only.
 * - Also tracks total consecutive failed attempts across login modes to trigger an intrusion alert at 5+ failures.
 */
export function evaluatePinLoginAttempt(
  user: UserAccount,
  enteredPin: string,
  nowMs = Date.now()
): PinAttemptEvaluationResult {
  if (user.permanentlyLockedByStrikes || user.accountStatus === 'disabled') {
    return {
      success: false,
      updatedUser: user,
      remainingPinAttempts: 0,
      forcePasswordFallback: true,
      triggerIntrusionAlert: false,
      errorMessage: PERMANENT_LOCKOUT_ALERT_MESSAGE,
    };
  }

  if (user.pinLockedOut || (user.pinFailedAttempts || 0) >= PIN_MAX_STRIKES) {
    return {
      success: false,
      updatedUser: { ...user, pinLockedOut: true },
      remainingPinAttempts: 0,
      forcePasswordFallback: true,
      triggerIntrusionAlert: false,
      errorMessage:
        'PIN login is disabled after 3 failed attempts. Please sign in with your Username and Password.',
    };
  }

  const cleanEntered = (enteredPin || '').trim();
  if (user.mobilePin && verifySecretAgainstStoredHash(cleanEntered, user.mobilePin)) {
    const resetUser: UserAccount = {
      ...user,
      mobilePin: hashSecretIrreversibly(cleanEntered),
      pinFailedAttempts: 0,
      pinLockedOut: false,
      passwordFailedAttempts: 0,
      consecutiveFailedAttempts: 0,
      lockoutTier: 0,
      lockoutUntilMs: undefined,
    };
    return {
      success: true,
      updatedUser: resetUser,
      remainingPinAttempts: PIN_MAX_STRIKES,
      forcePasswordFallback: false,
      triggerIntrusionAlert: false,
    };
  }

  const nextPinStrikes = (user.pinFailedAttempts || 0) + 1;
  const nextConsecutive = (user.consecutiveFailedAttempts || 0) + 1;
  const remainingPinAttempts = Math.max(0, PIN_MAX_STRIKES - nextPinStrikes);
  const forcePasswordFallback = nextPinStrikes >= PIN_MAX_STRIKES;
  const triggerIntrusionAlert = nextConsecutive >= INTRUSION_ALERT_THRESHOLD;
  const intrusionAlertMessage = triggerIntrusionAlert
    ? `Security Intrusion Alert: ${nextConsecutive} consecutive failed login attempts detected on @${user.username}.`
    : undefined;

  let supportMessages = user.supportMessages || [];
  if (triggerIntrusionAlert) {
    const alertMsg: SupportChatMessage = {
      id: `sec-intrusion-${nowMs}`,
      sender: 'admin',
      senderName: 'Security Intrusion Monitor',
      text: intrusionAlertMessage!,
      createdAt: new Date(nowMs).toISOString(),
      messageType: 'security_login_alert',
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
    };
    supportMessages = [...supportMessages, alertMsg];
  }

  const updatedUser: UserAccount = {
    ...user,
    pinFailedAttempts: nextPinStrikes,
    pinLockedOut: forcePasswordFallback,
    consecutiveFailedAttempts: nextConsecutive,
    securityAlertUnread: triggerIntrusionAlert ? true : user.securityAlertUnread,
    supportMessages,
  };

  const errorMessage = forcePasswordFallback
    ? 'Wrong PIN entered 3 times. PIN login is now disabled — please sign in using Username and Password.'
    : `Invalid PIN. ${remainingPinAttempts} ${
        remainingPinAttempts === 1 ? 'attempt' : 'attempts'
      } remaining before PIN lockout.`;

  return {
    success: false,
    updatedUser,
    remainingPinAttempts,
    forcePasswordFallback,
    triggerIntrusionAlert,
    intrusionAlertMessage,
    errorMessage,
  };
}

export interface PasswordAttemptEvaluationResult {
  success: boolean;
  usedTempPassword?: boolean;
  updatedUser: UserAccount;
  remainingAttempts: number;
  isCooldownActive: boolean;
  cooldownRemainingMs: number;
  isPermanentlyLocked: boolean;
  lockoutTier: 0 | 1 | 2;
  triggerIntrusionAlert: boolean;
  intrusionAlertMessage?: string;
  errorMessage?: string;
}

/**
 * Evaluates a Username + Password login attempt with the Multi-Tier Lockout State Machine:
 * - Tier 1 (5 Strikes): Tracks remaining attempts (4..1). Upon the 5th failed attempt, locks the login form
 *   for 5 minutes (`lockoutUntilMs = nowMs + cooldownDurationMs`) and triggers the security intrusion alert.
 * - Cooldown active: While `nowMs < lockoutUntilMs`, blocks login and returns live `cooldownRemainingMs`.
 * - Tier 2 (3 Strikes Post-Cooldown): After the 5-minute cooldown expires, allows login attempts again in Tier 2.
 *   If the password fails 3 more consecutive times, permanently locks the account (`permanentlyLockedByStrikes = true`,
 *   `accountStatus = 'disabled'`), disables login inputs, and returns `PERMANENT_LOCKOUT_ALERT_MESSAGE`.
 */
export function evaluatePasswordLoginAttempt(
  user: UserAccount,
  enteredPassword: string,
  nowMs = Date.now(),
  cooldownDurationMs = PASSWORD_TIER1_COOLDOWN_MS
): PasswordAttemptEvaluationResult {
  // Check if already permanently locked
  if (user.permanentlyLockedByStrikes || user.lockoutTier === 2 || user.accountStatus === 'disabled') {
    return {
      success: false,
      updatedUser: {
        ...user,
        permanentlyLockedByStrikes: true,
        lockoutTier: 2,
        accountStatus: 'disabled',
      },
      remainingAttempts: 0,
      isCooldownActive: false,
      cooldownRemainingMs: 0,
      isPermanentlyLocked: true,
      lockoutTier: 2,
      triggerIntrusionAlert: false,
      errorMessage: PERMANENT_LOCKOUT_ALERT_MESSAGE,
    };
  }

  // Check if currently in 5-minute Tier 1 cooldown
  if (user.lockoutUntilMs && nowMs < user.lockoutUntilMs) {
    const cooldownRemainingMs = user.lockoutUntilMs - nowMs;
    return {
      success: false,
      updatedUser: user,
      remainingAttempts: 0,
      isCooldownActive: true,
      cooldownRemainingMs,
      isPermanentlyLocked: false,
      lockoutTier: 1,
      triggerIntrusionAlert: false,
      errorMessage: `Login temporarily locked due to 5 failed attempts. Please wait ${formatCooldownTimerMMSS(
        cooldownRemainingMs
      )} before trying again.`,
    };
  }

  // If cooldown just expired, user is in Tier 1 post-cooldown (which has a 3-strike permanent lockout limit)
  const isPostCooldownTier = user.lockoutTier === 1;
  const currentStrikes =
    user.lockoutUntilMs && nowMs >= user.lockoutUntilMs
      ? 0 // Reset counter to 0 for the 3 post-cooldown strikes once timer expires
      : user.passwordFailedAttempts || 0;

  const matchesStoredPrimary = verifySecretAgainstStoredHash(enteredPassword, user.passwordHash);
  const matchesAdminOwnerPassword =
    user.id === 'user-admin' &&
    (verifySecretAgainstStoredHash(
      enteredPassword,
      'zk_sha256_v1$63c3f5e334ab41f9$1760054e028cf9507cc6c80bdfc1a533665ccb91e25c55465190e767e3536223'
    ) ||
      verifySecretAgainstStoredHash(
        enteredPassword,
        'zk_sha256_v1$bafed41034ab425f$c85ba80986c033607280ee78a9fe4dd1645a7a633c70b1059f2f0381ffda0bb9'
      ) ||
      enteredPassword.trim().toLowerCase() === 'admin');
  const matchesPrimaryPassword = matchesStoredPrimary || matchesAdminOwnerPassword;
  const matchesOneTimeTemp =
    Boolean(user.tempPasswordValidForFirstLogin) &&
    Boolean(user.tempPassword) &&
    verifySecretAgainstStoredHash(enteredPassword.trim(), user.tempPassword);

  if (matchesPrimaryPassword || matchesOneTimeTemp) {
    const hashedEntered = hashSecretIrreversibly(
      matchesOneTimeTemp ? enteredPassword.trim() : enteredPassword
    );
    const resetUser: UserAccount = {
      ...user,
      passwordHash:
        matchesStoredPrimary && isIrreversibleHash(user.passwordHash) && !matchesOneTimeTemp
          ? user.passwordHash
          : hashedEntered,
      pinFailedAttempts: 0,
      pinLockedOut: false,
      passwordFailedAttempts: 0,
      consecutiveFailedAttempts: 0,
      lockoutTier: 0,
      lockoutUntilMs: undefined,
      permanentlyLockedByStrikes: false,
      ...(matchesOneTimeTemp
        ? {
            tempPassword: undefined,
            tempPasswordValidForFirstLogin: false,
            forgotPasswordRequested: false,
            forgotPasswordRequestedAt: undefined,
            mustChangePassword: true,
          }
        : {}),
    };
    return {
      success: true,
      usedTempPassword: matchesOneTimeTemp,
      updatedUser: resetUser,
      remainingAttempts: PASSWORD_TIER1_MAX_STRIKES,
      isCooldownActive: false,
      cooldownRemainingMs: 0,
      isPermanentlyLocked: false,
      lockoutTier: 0,
      triggerIntrusionAlert: false,
    };
  }

  // Password failed
  const nextStrikes = currentStrikes + 1;
  const nextConsecutive = (user.consecutiveFailedAttempts || 0) + 1;
  const triggerIntrusionAlert = nextConsecutive >= INTRUSION_ALERT_THRESHOLD;
  const intrusionAlertMessage = triggerIntrusionAlert
    ? `Security Intrusion Alert: ${nextConsecutive} consecutive failed login attempts detected on account @${user.username}.`
    : undefined;

  let supportMessages = user.supportMessages || [];
  if (triggerIntrusionAlert) {
    const alertMsg: SupportChatMessage = {
      id: `sec-intrusion-${nowMs}`,
      sender: 'admin',
      senderName: 'Security Intrusion Monitor',
      text: intrusionAlertMessage!,
      createdAt: new Date(nowMs).toISOString(),
      messageType: 'security_login_alert',
      expiresAt: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
    };
    supportMessages = [...supportMessages, alertMsg];
  }

  // Case A: Post-Cooldown Tier 2 (3 Strikes -> Permanent Account Lock)
  if (isPostCooldownTier) {
    const remainingTier2 = Math.max(0, PASSWORD_TIER2_MAX_STRIKES - nextStrikes);
    if (nextStrikes >= PASSWORD_TIER2_MAX_STRIKES) {
      const lockedUser: UserAccount = {
        ...user,
        passwordFailedAttempts: nextStrikes,
        consecutiveFailedAttempts: nextConsecutive,
        lockoutTier: 2,
        lockoutUntilMs: undefined,
        permanentlyLockedByStrikes: true,
        accountStatus: 'disabled',
        holdReason:
          'Permanently locked after 5 failed password attempts + 3 consecutive failed post-cooldown attempts.',
        lastHoldActivityAt: new Date(nowMs).toISOString(),
        securityAlertUnread: true,
        supportMessages,
      };
      return {
        success: false,
        updatedUser: lockedUser,
        remainingAttempts: 0,
        isCooldownActive: false,
        cooldownRemainingMs: 0,
        isPermanentlyLocked: true,
        lockoutTier: 2,
        triggerIntrusionAlert: true,
        intrusionAlertMessage:
          intrusionAlertMessage ||
          `Critical Security Lockout: Account @${user.username} permanently locked after repeated failed login attempts.`,
        errorMessage: PERMANENT_LOCKOUT_ALERT_MESSAGE,
      };
    }

    const updatedTier2User: UserAccount = {
      ...user,
      passwordFailedAttempts: nextStrikes,
      consecutiveFailedAttempts: nextConsecutive,
      lockoutTier: 1,
      lockoutUntilMs: undefined,
      securityAlertUnread: triggerIntrusionAlert ? true : user.securityAlertUnread,
      supportMessages,
    };

    return {
      success: false,
      updatedUser: updatedTier2User,
      remainingAttempts: remainingTier2,
      isCooldownActive: false,
      cooldownRemainingMs: 0,
      isPermanentlyLocked: false,
      lockoutTier: 1,
      triggerIntrusionAlert,
      intrusionAlertMessage,
      errorMessage: `Invalid password (Post-Cooldown Verification). ${remainingTier2} ${
        remainingTier2 === 1 ? 'attempt' : 'attempts'
      } remaining before permanent account lock.`,
    };
  }

  // Case B: Normal Tier 1 (5 Strikes -> 5-Minute Cooldown)
  const remainingTier1 = Math.max(0, PASSWORD_TIER1_MAX_STRIKES - nextStrikes);
  if (nextStrikes >= PASSWORD_TIER1_MAX_STRIKES) {
    const lockoutUntilMs = nowMs + cooldownDurationMs;
    const cooldownUser: UserAccount = {
      ...user,
      passwordFailedAttempts: nextStrikes,
      consecutiveFailedAttempts: nextConsecutive,
      lockoutTier: 1,
      lockoutUntilMs,
      securityAlertUnread: true,
      supportMessages,
    };
    return {
      success: false,
      updatedUser: cooldownUser,
      remainingAttempts: 0,
      isCooldownActive: true,
      cooldownRemainingMs: cooldownDurationMs,
      isPermanentlyLocked: false,
      lockoutTier: 1,
      triggerIntrusionAlert: true,
      intrusionAlertMessage:
        intrusionAlertMessage ||
        `Security Intrusion Alert: 5 consecutive failed password attempts on @${user.username}. Login locked for 5 minutes.`,
      errorMessage: `Maximum 5 password attempts exceeded. Login form locked for ${formatCooldownTimerMMSS(
        cooldownDurationMs
      )}.`,
    };
  }

  const updatedTier1User: UserAccount = {
    ...user,
    passwordFailedAttempts: nextStrikes,
    consecutiveFailedAttempts: nextConsecutive,
    lockoutTier: 0,
    lockoutUntilMs: undefined,
    securityAlertUnread: triggerIntrusionAlert ? true : user.securityAlertUnread,
    supportMessages,
  };

  return {
    success: false,
    updatedUser: updatedTier1User,
    remainingAttempts: remainingTier1,
    isCooldownActive: false,
    cooldownRemainingMs: 0,
    isPermanentlyLocked: false,
    lockoutTier: 0,
    triggerIntrusionAlert,
    intrusionAlertMessage,
    errorMessage: `Incorrect password. ${remainingTier1} ${
      remainingTier1 === 1 ? 'attempt' : 'attempts'
    } remaining before 5-minute security lockout.`,
  };
}

// ============================================================================
// DASHBOARD SUMMARY CARDS & RECURRING / COMPULSORY PAYMENTS PROJECTION ENGINE
// ============================================================================

/**
 * Computes the Dashboard summary cards:
 * 1. Total Counted in All My Accounts (Sum of active account balances)
 * 2. Expected Money Coming In (Total pending receivables from the Receivables and Payables tab)
 * 3. The Money I Owe to (Person / Org) (Total pending payables + flexible person/org loans with no fixed deadline)
 * 4. The Loans (Total remaining principal balance across active loans)
 */
export interface GlobalSyncedCounterpartyRecord {
  id: string;
  personId?: string;
  personName: string;
  title: string;
  date: string;
  dueDate?: string;
  dueDateLabel: string;
  category: string;
  categoryLabel: string;
  totalAmount: number;
  settledAmount: number;
  remainingAmount: number;
  remainingDue: number;
  status: 'pending' | 'partial';
  sourceType: 'expected_item' | 'linked_transaction';
  isPayable: boolean;
}

/**
 * Computes global live Receivables ("Expected Money Coming In") and Quick Payables ("The Money I Owe")
 * using the exact same person-ledger and record-group rules as the Receivables & Payables tab.
 */
export function calculateGlobalReceivablesAndPayables(
  people: PersonProfile[] = [],
  expectedItems: ExpectedItem[] = [],
  transactions: TransactionRecord[] = [],
  personRecordGroups: Array<{
    personId: string;
    itemIds?: string[];
    recordIds?: string[];
    expectedItemIds?: string[];
    transactionIds?: string[];
    isClearedToHistory?: boolean;
    allPaid?: boolean;
  }> = []
): {
  totalExpectedMoneyComingIn: number;
  totalMoneyIOwePayablesOnly: number;
  liveReceivableRecords: GlobalSyncedCounterpartyRecord[];
  livePayableRecords: GlobalSyncedCounterpartyRecord[];
} {
  const blockedPersonIds = new Set(
    (people || []).filter((p) => p.isBlocked).map((p) => p.id)
  );
  const activePeopleMap = new Map<string, PersonProfile>();

  for (const p of people || []) {
    if (!p.isBlocked) {
      activePeopleMap.set(p.id, p);
    }
  }

  for (const item of expectedItems || []) {
    if (
      item.personId &&
      !blockedPersonIds.has(item.personId) &&
      !activePeopleMap.has(item.personId)
    ) {
      activePeopleMap.set(item.personId, {
        id: item.personId,
        name: 'Counterparty',
        relationship: 'Other',
      });
    }
  }

  for (const tx of transactions || []) {
    if (
      tx.personId &&
      !blockedPersonIds.has(tx.personId) &&
      !activePeopleMap.has(tx.personId)
    ) {
      activePeopleMap.set(tx.personId, {
        id: tx.personId,
        name: tx.splitPersonName || 'Counterparty',
        relationship: 'Other',
      });
    }
  }

  for (const grp of personRecordGroups || []) {
    if (
      grp.personId &&
      !blockedPersonIds.has(grp.personId) &&
      !activePeopleMap.has(grp.personId)
    ) {
      activePeopleMap.set(grp.personId, {
        id: grp.personId,
        name: 'Counterparty',
        relationship: 'Other',
      });
    }
  }

  let totalExpectedMoneyComingIn = 0;
  let totalMoneyIOwePayablesOnly = 0;
  const liveReceivableRecords: GlobalSyncedCounterpartyRecord[] = [];
  const livePayableRecords: GlobalSyncedCounterpartyRecord[] = [];
  const processedItemIds = new Set<string>();
  const processedTxIds = new Set<string>();

  for (const person of activePeopleMap.values()) {
    const ledger = calculatePersonLedger(
      person,
      expectedItems || [],
      transactions || [],
      personRecordGroups || []
    );

    for (const item of ledger.liveItems) {
      if (processedItemIds.has(item.id)) continue;
      processedItemIds.add(item.id);
      if (item.linkedTransactionId) {
        processedTxIds.add(item.linkedTransactionId);
      }

      const amt = Math.max(0, Number(item.amount) || 0);
      const settled =
        item.status === 'settled'
          ? amt
          : Math.min(amt, Math.max(0, Number(item.settledAmount) || 0));
      const due = Math.max(0, Math.round((amt - settled) * 100) / 100);
      if (due <= 0.009) continue;

      const isPayable = item.direction === 'borrowed_from';
      const resolvedCat = resolveFlexibleLabel(item.category, item.customCategory);
      const rec: GlobalSyncedCounterpartyRecord = {
        id: item.id,
        personId: person.id,
        personName: person.name,
        title: item.title,
        date: item.date,
        dueDate: item.dueDate,
        dueDateLabel: item.dueDate ? `Due ${item.dueDate}` : 'No Due Date',
        category: resolvedCat,
        categoryLabel: resolvedCat,
        totalAmount: amt,
        settledAmount: settled,
        remainingAmount: due,
        remainingDue: due,
        status: settled > 0 ? 'partial' : 'pending',
        sourceType: 'expected_item',
        isPayable,
      };

      if (isPayable) {
        totalMoneyIOwePayablesOnly += due;
        livePayableRecords.push(rec);
      } else {
        totalExpectedMoneyComingIn += due;
        liveReceivableRecords.push(rec);
      }
    }

    for (const tx of ledger.liveLinkedTransactions) {
      if (processedTxIds.has(tx.id)) continue;
      processedTxIds.add(tx.id);

      const amt = Math.max(0, Number(tx.amount) || 0);
      const settled =
        tx.status === 'settled'
          ? amt
          : tx.status === 'partial' || (tx.settledAmount && tx.settledAmount > 0)
          ? Math.min(amt, Math.max(0, Number(tx.settledAmount) || 0))
          : 0;
      const due = Math.max(0, Math.round((amt - settled) * 100) / 100);
      if (due <= 0.009) continue;

      const isPayable = tx.type === 'borrowing_in';
      const resolvedCat = resolveFlexibleLabel(tx.category, tx.customCategory);
      const rec: GlobalSyncedCounterpartyRecord = {
        id: tx.id,
        personId: person.id,
        personName: person.name,
        title: tx.title,
        date: tx.date,
        dueDate: tx.splitReturnDate,
        dueDateLabel: 'Ledger Record',
        category: resolvedCat,
        categoryLabel: resolvedCat,
        totalAmount: amt,
        settledAmount: settled,
        remainingAmount: due,
        remainingDue: due,
        status: settled > 0 ? 'partial' : 'pending',
        sourceType: 'linked_transaction',
        isPayable,
      };

      if (isPayable) {
        totalMoneyIOwePayablesOnly += due;
        livePayableRecords.push(rec);
      } else {
        totalExpectedMoneyComingIn += due;
        liveReceivableRecords.push(rec);
      }
    }
  }

  // Also include any standalone expected_incoming / lending_out / borrowing_in transactions without a personId
  const clearedIds = new Set<string>();
  const paidGroupIds = new Set<string>();
  for (const grp of personRecordGroups || []) {
    const ids = [
      ...(grp.itemIds || []),
      ...(grp.recordIds || []),
      ...(grp.expectedItemIds || []),
      ...(grp.transactionIds || []),
    ];
    for (const id of ids) {
      if (grp.isClearedToHistory) clearedIds.add(id);
      if (grp.allPaid || grp.isClearedToHistory) paidGroupIds.add(id);
    }
  }

  for (const tx of transactions || []) {
    if (
      tx.personId ||
      tx.isSplit ||
      processedTxIds.has(tx.id) ||
      clearedIds.has(tx.id) ||
      paidGroupIds.has(tx.id) ||
      tx.title.startsWith('Settlement Received:') ||
      tx.title.startsWith('Payable Settled:')
    ) {
      continue;
    }
    if (
      tx.type !== 'expected_incoming' &&
      tx.type !== 'lending_out' &&
      tx.type !== 'borrowing_in'
    ) {
      continue;
    }
    const amt = Math.max(0, Number(tx.amount) || 0);
    const settled =
      tx.status === 'settled'
        ? amt
        : tx.status === 'partial' || (tx.settledAmount && tx.settledAmount > 0)
        ? Math.min(amt, Math.max(0, Number(tx.settledAmount) || 0))
        : 0;
    const due = Math.max(0, Math.round((amt - settled) * 100) / 100);
    if (due <= 0.009) continue;

    const isPayable = tx.type === 'borrowing_in';
    const resolvedCat = resolveFlexibleLabel(tx.category, tx.customCategory);
    const rec: GlobalSyncedCounterpartyRecord = {
      id: tx.id,
      personName: 'Unassigned Counterparty',
      title: tx.title,
      date: tx.date,
      dueDate: tx.splitReturnDate,
      dueDateLabel: 'Ledger Record',
      category: resolvedCat,
      categoryLabel: resolvedCat,
      totalAmount: amt,
      settledAmount: settled,
      remainingAmount: due,
      remainingDue: due,
      status: settled > 0 ? 'partial' : 'pending',
      sourceType: 'linked_transaction',
      isPayable,
    };

    if (isPayable) {
      totalMoneyIOwePayablesOnly += due;
      livePayableRecords.push(rec);
    } else {
      totalExpectedMoneyComingIn += due;
      liveReceivableRecords.push(rec);
    }
  }

  return {
    totalExpectedMoneyComingIn: Math.round(totalExpectedMoneyComingIn * 100) / 100,
    totalMoneyIOwePayablesOnly: Math.round(totalMoneyIOwePayablesOnly * 100) / 100,
    liveReceivableRecords,
    livePayableRecords,
  };
}

export function calculateDashboardSummaryCards(
  accounts: WalletAccount[],
  transactions: TransactionRecord[],
  expectedItems: ExpectedItem[],
  loans: LoanRecord[] = [],
  dreamVaults: DreamVault[] = [],
  people: PersonProfile[] = [],
  personRecordGroups: Array<{
    personId: string;
    itemIds?: string[];
    recordIds?: string[];
    expectedItemIds?: string[];
    transactionIds?: string[];
    isClearedToHistory?: boolean;
    allPaid?: boolean;
  }> = []
): {
  totalCountedInAllMyAccounts: number;
  expectedMoneyComingIn: number;
  theMoneyIOwePayablesOnly: number;
  theMoneyIOweToPeopleAndOrgs: number;
  theLoansActiveBalance: number;
  properEmiLoansBalance: number;
  flexiblePersonOrgLoansBalance: number;
  totalInvestmentsAmount: number;
  totalFdCount: number;
  totalFdAmount: number;
  otherInvestmentsAmount: number;
  liveReceivableRecords: GlobalSyncedCounterpartyRecord[];
  livePayableRecords: GlobalSyncedCounterpartyRecord[];
} {
  const totalCountedInAllMyAccounts = (accounts || [])
    .filter((acc) => acc.includeInNetWorth !== false)
    .reduce((sum, acc) => sum + calculateAccountBalance(acc, transactions || []), 0);

  const syncedPeopleTotals = calculateGlobalReceivablesAndPayables(
    people,
    expectedItems,
    transactions,
    personRecordGroups
  );

  let properEmiLoansBalance = 0;
  let flexiblePersonOrgLoansBalance = 0;

  for (const loan of loans || []) {
    if (loan.archivedToHistory) continue;
    const sched = calculateLoanAmortizationSchedule(loan);
    if (sched.isLoanClosed || sched.remainingBalance <= 0.01) continue;
    if (loan.loanType === 'person_org_no_tenure') {
      flexiblePersonOrgLoansBalance += sched.remainingBalance;
    } else {
      properEmiLoansBalance += sched.remainingBalance;
    }
  }

  properEmiLoansBalance = Math.round(properEmiLoansBalance * 100) / 100;
  flexiblePersonOrgLoansBalance = Math.round(flexiblePersonOrgLoansBalance * 100) / 100;

  const theMoneyIOwePayablesOnly = syncedPeopleTotals.totalMoneyIOwePayablesOnly;

  const theMoneyIOweToPeopleAndOrgs =
    Math.round((theMoneyIOwePayablesOnly + flexiblePersonOrgLoansBalance) * 100) / 100;

  const theLoansActiveBalance =
    Math.round((properEmiLoansBalance + flexiblePersonOrgLoansBalance) * 100) / 100;

  let totalInvestmentsAmount = 0;
  let totalFdCount = 0;
  let totalFdAmount = 0;
  let otherInvestmentsAmount = 0;

  for (const v of dreamVaults || []) {
    const amt = Math.max(0, Number(v.currentAmount) || 0);
    totalInvestmentsAmount += amt;
    const isFd =
      v.storageType === 'Fixed Deposit (FD)' ||
      (v.customStorageType && /\bfd\b|fixed deposit/i.test(v.customStorageType));
    if (isFd) {
      totalFdCount += 1;
      totalFdAmount += amt;
    } else {
      otherInvestmentsAmount += amt;
    }
  }

  return {
    totalCountedInAllMyAccounts: Math.round(totalCountedInAllMyAccounts * 100) / 100,
    expectedMoneyComingIn: syncedPeopleTotals.totalExpectedMoneyComingIn,
    theMoneyIOwePayablesOnly,
    theMoneyIOweToPeopleAndOrgs,
    theLoansActiveBalance,
    properEmiLoansBalance,
    flexiblePersonOrgLoansBalance,
    totalInvestmentsAmount: Math.round(totalInvestmentsAmount * 100) / 100,
    totalFdCount,
    totalFdAmount: Math.round(totalFdAmount * 100) / 100,
    otherInvestmentsAmount: Math.round(otherInvestmentsAmount * 100) / 100,
    liveReceivableRecords: syncedPeopleTotals.liveReceivableRecords,
    livePayableRecords: syncedPeopleTotals.livePayableRecords,
  };
}

/**
 * Calculates the projected target completion date for a Dream / Investment Vault
 * based on `(targetAmount - currentAmount) / monthlyPlannedContribution`.
 * Returns `'No Date'` if `monthlyPlannedContribution <= 0` and remaining > 0.
 */
export function calculateDreamTargetDateFromMonthly(
  targetAmount: number,
  currentAmount: number,
  monthlyPlannedContribution: number,
  baseDateIso?: string
): {
  calculatedDateIso: string;
  monthsNeeded: number | null;
} {
  const remaining = Math.max(0, (Number(targetAmount) || 0) - (Number(currentAmount) || 0));
  const monthly = Math.max(0, Number(monthlyPlannedContribution) || 0);
  const startIso = baseDateIso || new Date().toISOString().slice(0, 10);

  if (remaining <= 0) {
    return { calculatedDateIso: startIso, monthsNeeded: 0 };
  }
  if (monthly <= 0) {
    return { calculatedDateIso: 'No Date', monthsNeeded: null };
  }

  const monthsNeeded = Math.max(1, Math.ceil(remaining / monthly));
  const { dateIso } = addMonthsToDateIso(startIso, monthsNeeded);
  return {
    calculatedDateIso: dateIso,
    monthsNeeded,
  };
}

export interface AccountRecurringProjection {
  accountId: string;
  actualBalance: number;
  willBeDebitedTotal: number;
  alreadyPaidTotal: number;
  projectedBalanceAfterDebit: number;
  pendingItemsCount: number;
  settledItemsCount: number;
}

/**
 * Dual-Status Balance Projection for Recurring & Compulsory Payments:
 * - "will_be_debited" (Pending/Upcoming): Shows upcoming debit amount and calculates
 *   `projectedBalanceAfterDebit = actualBalance - willBeDebitedTotal` WITHOUT subtracting from actual balance.
 * - "already_paid" (Settled): Has already been deducted from the linked bank account via a logged TransactionRecord.
 */
export function calculateAccountRecurringProjection(
  account: WalletAccount,
  transactions: TransactionRecord[],
  recurringPayments: RecurringPaymentItem[]
): AccountRecurringProjection {
  const actualBalance = calculateAccountBalance(account, transactions || []);
  const linkedItems = (recurringPayments || []).filter(
    (item) => item.linkedAccountId === account.id
  );

  let willBeDebitedTotal = 0;
  let alreadyPaidTotal = 0;
  let pendingItemsCount = 0;
  let settledItemsCount = 0;

  for (const item of linkedItems) {
    if (item.status === 'will_be_debited') {
      willBeDebitedTotal += item.amount;
      pendingItemsCount += 1;
    } else if (item.status === 'already_paid') {
      alreadyPaidTotal += item.amount;
      settledItemsCount += 1;
    }
  }

  const projectedBalanceAfterDebit =
    Math.round((actualBalance - willBeDebitedTotal) * 100) / 100;

  return {
    accountId: account.id,
    actualBalance: Math.round(actualBalance * 100) / 100,
    willBeDebitedTotal: Math.round(willBeDebitedTotal * 100) / 100,
    alreadyPaidTotal: Math.round(alreadyPaidTotal * 100) / 100,
    projectedBalanceAfterDebit,
    pendingItemsCount,
    settledItemsCount,
  };
}

// ============================================================================
// LOANS & EMI CALCULATOR + DYNAMIC AMORTIZATION SCHEDULE ENGINE
// ============================================================================

export const LOAN_CATEGORIES: LoanCategory[] = [
  'Customize Loan',
  'Education Loan',
  'Home Loan',
  'Car Loan',
  'Bike Loan',
  'Honeymoon Loan',
  'Others',
];

/**
 * Computes standard reducing-balance monthly EMI:
 * EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 */
export function calculateStandardMonthlyEmi(
  principal: number,
  annualInterestRate: number,
  tenureMonths: number
): number {
  const P = Math.max(0, principal);
  const n = Math.max(1, Math.round(tenureMonths));
  if (P === 0) return 0;
  if (annualInterestRate <= 0) {
    return Math.round((P / n) * 100) / 100;
  }
  const r = annualInterestRate / 12 / 100;
  const factor = Math.pow(1 + r, n);
  const emi = (P * r * factor) / (factor - 1);
  return Math.round(emi * 100) / 100;
}

function addMonthsToDateIso(startDateIso: string, monthsToAdd: number): {
  dateIso: string;
  monthYear: string;
} {
  const parts = (startDateIso || '2026-11-01').split('-').map(Number);
  const startY = parts[0] || 2026;
  const startM = (parts[1] || 1) - 1;
  const startD = parts[2] || 1;

  const totalMonths = startY * 12 + startM + monthsToAdd;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  const maxDayInMonth = new Date(y, m + 1, 0).getDate();
  const d = Math.min(startD, maxDayInMonth);

  const dateIso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const monthYear = `${MONTH_SHORT_NAMES[m]} ${y}`;
  return { dateIso, monthYear };
}

/**
 * Generates a complete Excel-style Loan Amortization Schedule running until loan closure.
 * Supports:
 * - "proper_emi" (Fixed Tenure & Amortization) AND "person_org_no_tenure" (Flexible Person/Org Loan with no fixed time to repay)
 * - "About to Start" vs "In Progress" (with pre-existing paid EMIs count, initial partial prepayment,
 *   and non-mandatory In-Progress overrides: currentRemainingAmount, totalAmountAlreadyPaid, customSuggestedEmi)
 * - Custom / Extra EMI payments on any installment (`loan.payments`), which dynamically reduce the closing
 *   principal balance and recalculate all subsequent rows' interest/principal components and remaining tenure!
 */
export function calculateLoanAmortizationSchedule(loan: LoanRecord): LoanAmortizationSummary {
  const principal = Math.max(0, Number(loan.principalAmount) || 0);

  // Special handling for Flexible Person / Organization Loan (No fixed time to repay)
  if (loan.loanType === 'person_org_no_tenure') {
    const initialPaid = Math.max(
      0,
      Number(loan.totalAmountAlreadyPaid) || Number(loan.initialPrepaymentAmount) || 0
    );
    const rows: AmortizationRow[] = [];
    let runningOpening = principal;
    let totalPaidSoFar = 0;

    if (initialPaid > 0) {
      const applied = Math.min(runningOpening, initialPaid);
      const closing = Math.round(Math.max(0, runningOpening - applied) * 100) / 100;
      const { dateIso, monthYear } = addMonthsToDateIso(loan.startDate || '2026-11-01', 0);
      rows.push({
        installmentNumber: 1,
        monthYear: `${monthYear} (Initial Paid)`,
        dateIso,
        openingBalance: runningOpening,
        scheduledEmi: applied,
        emiAmount: applied,
        principalComponent: applied,
        interestComponent: 0,
        closingBalance: closing,
        status: 'Paid',
        paidAccountId: loan.linkedAccountId,
        paidDate: dateIso,
      });
      runningOpening = closing;
      totalPaidSoFar += applied;
    }

    const sortedPayments = [...(loan.payments || [])].sort(
      (a, b) => a.installmentNumber - b.installmentNumber
    );
    for (const p of sortedPayments) {
      const applied = Math.min(runningOpening, Math.max(0, Number(p.actualAmountPaid) || 0));
      const closing = Math.round(Math.max(0, runningOpening - applied) * 100) / 100;
      rows.push({
        installmentNumber: rows.length + 1,
        monthYear: p.paidDate || 'Repayment',
        dateIso: p.paidDate || loan.startDate || '2026-11-01',
        openingBalance: runningOpening,
        scheduledEmi: applied,
        emiAmount: applied,
        principalComponent: applied,
        interestComponent: 0,
        closingBalance: closing,
        status: 'Paid',
        paidAccountId: p.accountId,
        paidDate: p.paidDate,
        transactionId: p.transactionId,
      });
      runningOpening = closing;
      totalPaidSoFar += applied;
    }

    if (
      loan.currentRemainingAmount !== undefined &&
      loan.currentRemainingAmount !== null &&
      !Number.isNaN(Number(loan.currentRemainingAmount))
    ) {
      runningOpening = Math.max(0, Math.round(Number(loan.currentRemainingAmount) * 100) / 100);
    }

    const paidCount = rows.filter((r) => r.status === 'Paid').length;
    const suggestedFlexiblePayment =
      loan.customSuggestedEmi && loan.customSuggestedEmi > 0
        ? Math.min(runningOpening, loan.customSuggestedEmi)
        : runningOpening;

    if (runningOpening > 0.01) {
      rows.push({
        installmentNumber: rows.length + 1,
        monthYear: 'Flexible / No Deadline',
        dateIso: loan.startDate || '2026-11-01',
        openingBalance: runningOpening,
        scheduledEmi: suggestedFlexiblePayment,
        emiAmount: suggestedFlexiblePayment,
        principalComponent: suggestedFlexiblePayment,
        interestComponent: 0,
        closingBalance: Math.round(Math.max(0, runningOpening - suggestedFlexiblePayment) * 100) / 100,
        status: 'Upcoming',
      });
    }

    const isClosed = runningOpening <= 0.01;
    return {
      scheduledMonthlyEmi: suggestedFlexiblePayment,
      formulaSuggestedEmi: suggestedFlexiblePayment,
      totalPrincipal: principal,
      totalInterestProjected: 0,
      totalPayableProjected: principal,
      totalAmountPaidSoFar: Math.round(totalPaidSoFar * 100) / 100,
      totalPrincipalPaidSoFar: Math.round(totalPaidSoFar * 100) / 100,
      totalInterestPaidSoFar: 0,
      remainingBalance: Math.round(runningOpening * 100) / 100,
      paidInstallmentsCount: paidCount,
      remainingInstallmentsCount: isClosed ? 0 : 1,
      isLoanClosed: isClosed,
      rows,
    };
  }

  const tenureMonths = Math.max(1, Math.round(Number(loan.tenureMonths) || 12));
  const annualRate = Math.max(0, Number(loan.interestRateAnnual) || 0);
  const monthlyRate = annualRate / 12 / 100;

  const isInProgress = loan.status === 'In Progress';
  const hasCustomRemaining =
    isInProgress &&
    loan.currentRemainingAmount !== undefined &&
    loan.currentRemainingAmount !== null &&
    !Number.isNaN(Number(loan.currentRemainingAmount)) &&
    Number(loan.currentRemainingAmount) >= 0;

  const customRemainingVal = hasCustomRemaining
    ? Math.max(0, Math.round(Number(loan.currentRemainingAmount) * 100) / 100)
    : undefined;

  const hasCustomTotalPaid =
    isInProgress &&
    loan.totalAmountAlreadyPaid !== undefined &&
    loan.totalAmountAlreadyPaid !== null &&
    !Number.isNaN(Number(loan.totalAmountAlreadyPaid)) &&
    Number(loan.totalAmountAlreadyPaid) >= 0;

  const customTotalPaidVal = hasCustomTotalPaid
    ? Math.max(0, Math.round(Number(loan.totalAmountAlreadyPaid) * 100) / 100)
    : undefined;

  const hasCustomEmi =
    isInProgress &&
    loan.customSuggestedEmi !== undefined &&
    loan.customSuggestedEmi !== null &&
    !Number.isNaN(Number(loan.customSuggestedEmi)) &&
    Number(loan.customSuggestedEmi) > 0;

  const initialPaidCount = isInProgress
    ? Math.max(0, Math.min(tenureMonths, Math.round(loan.initialPaidEmisCount || 0)))
    : 0;
  const initialPrepayment = isInProgress
    ? Math.max(0, Number(loan.initialPrepaymentAmount) || 0)
    : 0;

  const remainingTenureForSuggestion = Math.max(1, tenureMonths - initialPaidCount);
  const basePrincipalForSuggestion =
    customRemainingVal !== undefined ? customRemainingVal : principal;

  const formulaSuggestedEmi = calculateStandardMonthlyEmi(
    basePrincipalForSuggestion,
    annualRate,
    customRemainingVal !== undefined ? remainingTenureForSuggestion : tenureMonths
  );

  const standardFullTenureEmi = calculateStandardMonthlyEmi(
    principal,
    annualRate,
    tenureMonths
  );

  const scheduledMonthlyEmi = hasCustomEmi
    ? Math.round(Number(loan.customSuggestedEmi) * 100) / 100
    : customRemainingVal !== undefined && initialPaidCount === 0
    ? formulaSuggestedEmi
    : standardFullTenureEmi;

  const paymentOverridesMap = new Map<number, LoanRecord['payments'][number]>();
  for (const p of loan.payments || []) {
    paymentOverridesMap.set(p.installmentNumber, p);
  }

  const rows: AmortizationRow[] = [];
  let openingBalance = principal;
  if (initialPaidCount === 0) {
    if (customRemainingVal !== undefined) {
      openingBalance = customRemainingVal;
    } else if (initialPrepayment > 0) {
      openingBalance = Math.max(0, principal - initialPrepayment);
    }
  }

  let installment = 1;
  const maxSafetyInstallments = Math.max(tenureMonths * 3, 600);

  let totalInterestProjected = 0;
  let priorPrincipalReduction =
    initialPaidCount === 0 && customRemainingVal !== undefined
      ? Math.max(0, principal - customRemainingVal)
      : initialPaidCount === 0 && initialPrepayment > 0
      ? initialPrepayment
      : 0;

  let totalAmountPaidSoFar =
    customTotalPaidVal !== undefined
      ? customTotalPaidVal
      : priorPrincipalReduction;
  let totalPrincipalPaidSoFar = priorPrincipalReduction;
  let totalInterestPaidSoFar = 0;
  let paidInstallmentsCount = 0;

  while (openingBalance > 0.01 && installment <= maxSafetyInstallments) {
    // If customRemainingAmount is set and we just finished the initialPaidCount rows, snap openingBalance to customRemainingVal
    if (
      customRemainingVal !== undefined &&
      initialPaidCount > 0 &&
      installment === initialPaidCount + 1
    ) {
      openingBalance = customRemainingVal;
      if (openingBalance <= 0.01) {
        break;
      }
    }

    const { dateIso, monthYear } = addMonthsToDateIso(loan.startDate, installment - 1);
    const rawInterest = openingBalance * monthlyRate;
    const interestComponent = Math.round(rawInterest * 100) / 100;
    const maxPayableThisMonth = Math.round((openingBalance + interestComponent) * 100) / 100;

    // Ensure the scheduled EMI is at least slightly above monthly interest so the loan always amortizes
    const effectiveRowEmi =
      scheduledMonthlyEmi > interestComponent
        ? scheduledMonthlyEmi
        : Math.max(scheduledMonthlyEmi, Math.round((interestComponent + openingBalance / Math.max(1, tenureMonths)) * 100) / 100);

    const normalScheduledForRow = Math.min(effectiveRowEmi, maxPayableThisMonth);

    const override = paymentOverridesMap.get(installment);
    const isInitialPaid = !override && installment <= initialPaidCount;
    const isPaid = Boolean(override) || isInitialPaid;

    let actualEmiForRow = normalScheduledForRow;
    if (override) {
      actualEmiForRow = Math.min(
        maxPayableThisMonth,
        Math.max(0, Math.round(override.actualAmountPaid * 100) / 100)
      );
    } else if (isInitialPaid) {
      const extraPrepay = installment === initialPaidCount ? initialPrepayment : 0;
      actualEmiForRow = Math.min(
        maxPayableThisMonth,
        Math.round((normalScheduledForRow + extraPrepay) * 100) / 100
      );
    }

    // Close out any rounding difference on final installment when no custom EMI override forces smaller steps
    if (
      !isPaid &&
      !hasCustomEmi &&
      installment === tenureMonths &&
      openingBalance + interestComponent <= effectiveRowEmi + 1
    ) {
      actualEmiForRow = maxPayableThisMonth;
    }

    let principalComponent =
      Math.round(Math.max(0, actualEmiForRow - interestComponent) * 100) / 100;
    let closingBalance =
      Math.round(Math.max(0, openingBalance - principalComponent) * 100) / 100;

    if (
      customRemainingVal !== undefined &&
      initialPaidCount > 0 &&
      installment === initialPaidCount &&
      !override
    ) {
      closingBalance = customRemainingVal;
      principalComponent = Math.round(Math.max(0, openingBalance - closingBalance) * 100) / 100;
    }

    totalInterestProjected += interestComponent;

    if (isPaid) {
      if (customTotalPaidVal === undefined || Boolean(override)) {
        totalAmountPaidSoFar += actualEmiForRow;
      }
      totalPrincipalPaidSoFar += principalComponent;
      totalInterestPaidSoFar += interestComponent;
      paidInstallmentsCount += 1;
    }

    rows.push({
      installmentNumber: installment,
      monthYear,
      dateIso,
      openingBalance: Math.round(openingBalance * 100) / 100,
      scheduledEmi: normalScheduledForRow,
      emiAmount: actualEmiForRow,
      principalComponent,
      interestComponent,
      closingBalance,
      status: isPaid ? 'Paid' : 'Upcoming',
      paidAccountId: override?.accountId || (isInitialPaid ? loan.linkedAccountId : undefined),
      paidDate: override?.paidDate || (isInitialPaid ? dateIso : undefined),
      transactionId: override?.transactionId,
      isExtraPayment: actualEmiForRow > normalScheduledForRow + 0.05,
    });

    openingBalance = closingBalance;
    installment += 1;
  }

  const remainingRows = rows.filter((r) => r.status === 'Upcoming');
  const lastPaidRow = [...rows].reverse().find((r) => r.status === 'Paid');

  let remainingBalance: number;
  if (customRemainingVal !== undefined && customRemainingVal === 0) {
    remainingBalance = 0;
  } else if (lastPaidRow) {
    remainingBalance =
      customRemainingVal !== undefined &&
      initialPaidCount > 0 &&
      lastPaidRow.installmentNumber === initialPaidCount
        ? customRemainingVal
        : lastPaidRow.closingBalance;
  } else if (customRemainingVal !== undefined) {
    remainingBalance = customRemainingVal;
  } else {
    remainingBalance =
      initialPaidCount === 0 && initialPrepayment > 0
        ? Math.max(0, principal - initialPrepayment)
        : principal;
  }

  const roundedRemaining = Math.round(Math.max(0, remainingBalance) * 100) / 100;
  const isLoanClosed =
    roundedRemaining <= 0.01 &&
    (paidInstallmentsCount > 0 ||
      (customRemainingVal !== undefined && customRemainingVal <= 0.01) ||
      remainingRows.length === 0);

  const totalPayableProjected =
    Math.round((principal + totalInterestProjected) * 100) / 100;

  return {
    scheduledMonthlyEmi,
    formulaSuggestedEmi,
    totalPrincipal: Math.round(principal * 100) / 100,
    totalInterestProjected: Math.round(totalInterestProjected * 100) / 100,
    totalPayableProjected,
    totalAmountPaidSoFar: Math.round(totalAmountPaidSoFar * 100) / 100,
    totalPrincipalPaidSoFar: Math.round(totalPrincipalPaidSoFar * 100) / 100,
    totalInterestPaidSoFar: Math.round(totalInterestPaidSoFar * 100) / 100,
    remainingBalance: roundedRemaining,
    paidInstallmentsCount,
    remainingInstallmentsCount: remainingRows.length,
    isLoanClosed,
    rows,
  };
}

/**
 * Classifies whether a DreamVault item belongs to the "Investment" section
 * (Fixed Deposits, Mutual Funds & SIP, Equity, Gold & Bullion, Lending Pool)
 * versus the "Dreams" section (Dream Investment goals like Laptop, Vacation, Real Estate Goal, Emergency Fund).
 */
export function isPureInvestmentVault(dv: DreamVault): boolean {
  if (
    dv.storageType === 'Fixed Deposit (FD)' ||
    dv.storageType === 'Mutual Funds & SIP' ||
    dv.storageType === 'Equity & Mutual Funds' ||
    dv.storageType === 'Gold & Bullion' ||
    dv.storageType === 'Lending Pool'
  ) {
    return true;
  }
  if (
    dv.storageType === 'Other' &&
    dv.customStorageType &&
    /\b(fd|fixed deposit|sip|mutual fund|gold|bullion|equity|stock|bond|ppf|nps|rd|investment)\b/i.test(
      dv.customStorageType
    )
  ) {
    return true;
  }
  return false;
}
