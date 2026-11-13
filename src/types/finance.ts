export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'dream_investment'
  | 'lending_out'
  | 'borrowing_in'
  | 'expected_incoming'
  | 'other';

export type AccountType =
  | 'Savings'
  | 'Savings Account'
  | 'Credit Card'
  | 'Loan Account'
  | 'Bank Account'
  | 'Cash Wallet'
  | 'Savings Vault'
  | 'Investment Account'
  | 'Digital Wallet'
  | 'Other';

export interface WalletAccount {
  id: string;
  name: string;
  type: AccountType;
  customType?: string;
  accountNumber?: string;
  branchName?: string;
  bankDetails?: string;
  bankLogoUrl?: string;
  currency: string;
  initialBalance: number;
  color: string;
  includeInNetWorth: boolean;
  /** Loan Account specific fields (when type === 'Loan Account') */
  loanStatus?: LoanStatus;
  sanctionedLoanAmount?: number;
  currentRemainingLoanAmount?: number;
  bankGivenEmi?: number;
  loanInterestRate?: number;
  loanTenureMonths?: number;
  connectedLoanRecordId?: string;
}

export interface TransactionRecord {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  amount: number;
  type: TransactionType;
  customTypeLabel?: string;
  category: string;
  customCategory?: string;
  accountId: string;
  toAccountId?: string;
  paymentMethod: string;
  customPaymentMethod?: string;
  personId?: string;
  dreamVaultId?: string;
  isPaidEmi?: boolean;
  linkedLoanId?: string;
  destinationLoanAccountId?: string;
  status: 'completed' | 'expected' | 'settled' | 'partial';
  settledAmount?: number;
  isRegularMonthly?: boolean;
  linkedRecurringId?: string;
  notes?: string;
  billable?: boolean;
  proofId?: string;
  proofImageName?: string;
  proofImageDataUrl?: string;
  /** Optional Split Expense metadata (splits bill with a person and logs Receivable) */
  isSplit?: boolean;
  splitPersonId?: string;
  splitPersonName?: string;
  splitAmount?: number;
  splitReturnDate?: string;
  grossAmountPaid?: number;
}

export interface PersonProfile {
  id: string;
  name: string;
  relationship: 'Client' | 'Friend' | 'Family' | 'Colleague' | 'Tenant' | 'Borrower' | 'Lender' | 'Other';
  customRelationship?: string;
  phone?: string;
  email?: string;
  notes?: string;
  isBlocked?: boolean;
  blockReason?: string;
  blockedAt?: string;
}

export interface ExpectedItem {
  id: string;
  personId: string;
  title: string;
  amount: number;
  settledAmount: number;
  direction: 'expecting_from' | 'lent_to' | 'borrowed_from' | 'other';
  customDirection?: string;
  category: string;
  customCategory?: string;
  date: string;
  dueDate: string;
  linkedTransactionId?: string;
  status: 'pending' | 'partial' | 'settled';
  isRegularMonthly?: boolean;
  notes?: string;
  proofId?: string;
  proofImageName?: string;
  proofImageDataUrl?: string;
}

export interface DreamVault {
  id: string;
  name: string;
  storageType:
    | 'Fixed Deposit (FD)'
    | 'Mutual Funds & SIP'
    | 'Dream Investment'
    | 'Emergency Fund'
    | 'Real Estate Goal'
    | 'Equity & Mutual Funds'
    | 'Gold & Bullion'
    | 'Lending Pool'
    | 'Incoming Reserve'
    | 'Other';
  customStorageType?: string;
  targetAmount: number;
  currentAmount: number;
  monthlyPlannedContribution: number;
  targetDate: string;
  targetDateMode?: 'custom_date' | 'calculated_date' | 'no_date';
  linkedAccountId?: string;
  /** Optional Savings Account ID where this investment/FD is saved (does NOT alter main account balance) */
  savedInAccountId?: string;
  /** Optional Bank/Institution name when Fixed Deposit (FD) is selected */
  fdBankName?: string;
  notes?: string;
  imageUrl?: string;
}

export interface PdfHeaderImageConfig {
  imageUrl: string | null;
  width: number; // pt
  height: number; // pt (unlimited height adjusted via drag handles)
  align: 'left' | 'center' | 'right';
  offsetX: number; // pt
  offsetY: number; // pt
  orientation?: 'portrait' | 'landscape';
  headerBgColor?: string; // Reference color from uploaded image or custom PDF header background
}

export interface SupportChatMessage {
  id: string;
  sender: 'user' | 'admin';
  senderName: string;
  text: string;
  createdAt: string;
  messageType?: 'normal' | 'security_login_alert';
  expiresAt?: string; // 24-hour auto-delete timestamp for security login alerts
}

export type AccountLifecycleStatus = 'active' | 'on_hold' | 'disabled';

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string; // local offline credential
  role: 'admin' | 'user';
  createdAt: string;
  updatedAt?: string;
  currency: string;
  customCategories: string[];
  email?: string;
  phone?: string;
  department?: string;
  createdByAdmin?: string;
  avatarThumbnailDataUrl?: string;
  forgotPasswordRequested?: boolean;
  forgotPasswordRequestedAt?: string;
  tempPassword?: string;
  tempPasswordValidForFirstLogin?: boolean;
  mustChangePassword?: boolean;
  // Admin Hold / Disable / Delete & Support Chat fields
  accountStatus?: AccountLifecycleStatus;
  holdReason?: string;
  holdAcknowledgedByUser?: boolean;
  lastHoldActivityAt?: string;
  adminNoticeUnread?: boolean;
  supportMessages?: SupportChatMessage[];
  supportIssueClosedAt?: string;
  supportIssueExpireAt?: string; // 24-hour auto-delete timestamp after Admin marks Issue Closed
  // Single-session lock & concurrent login security alert fields
  activeSessionToken?: string;
  activeSessionLastSeenAt?: string;
  securityAlertUnread?: boolean;
  // Mobile App PIN (4-6 digits) & Multi-Tier Lockout State Machine
  mobilePin?: string;
  pinFailedAttempts?: number; // 0-3 strikes; at 3 strikes PIN entry is disabled
  pinLockedOut?: boolean; // true when PIN failed 3 times, forcing Username + Password
  passwordFailedAttempts?: number; // Tier 1 (0-5) or Tier 2 (0-3 post-cooldown) strikes
  consecutiveFailedAttempts?: number; // Total consecutive failed attempts for intrusion detection (5+)
  lockoutTier?: 0 | 1 | 2; // 0 = normal, 1 = 5-min cooldown / post-cooldown Tier 2 active, 2 = permanently locked
  lockoutUntilMs?: number; // Timestamp (ms) when 5-minute Tier 1 cooldown expires
  permanentlyLockedByStrikes?: boolean; // True after 3 failed password attempts post-cooldown
  // Admin-Only Free Lifetime Firebase Email OTP Verification (never stores plaintext OTP)
  adminOtpHash?: string; // Irreversible salted SHA-256 hash of 6-digit OTP
  adminOtpExpiresAtMs?: number; // Expiration timestamp (10 minutes)
  adminOtpTargetEmail?: string; // Target Admin email address for OTP verification
}

export type RecurringFrequency = 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';

export type RecurringPaymentStatus = 'will_be_debited' | 'already_paid';

export interface RecurringPaymentItem {
  id: string;
  title: string;
  category: string;
  amount: number;
  frequency: RecurringFrequency;
  dueDayLabel: string; // e.g. '5th of Month', 'Every Monday', '2026-11-15'
  linkedAccountId: string;
  status: RecurringPaymentStatus;
  flowType?: 'expense' | 'income';
  payeeName?: string;
  linkedPersonId?: string;
  lastPaidDate?: string;
  lastPaidTransactionId?: string;
  notes?: string;
}

export type LoanCategory =
  | 'Customize Loan'
  | 'Personal Loan'
  | 'Credit Card Loan'
  | 'Company / NBFC Loan'
  | 'Education Loan'
  | 'Home Loan'
  | 'Car Loan'
  | 'Bike Loan'
  | 'Honeymoon Loan'
  | 'Others';

export type LoanStatus = 'In Progress' | 'About to Start';

export type LoanStructureType = 'proper_emi' | 'person_org_no_tenure';

export interface LoanPaymentOverride {
  installmentNumber: number;
  paidDate: string;
  actualAmountPaid: number;
  accountId: string;
  transactionId?: string;
}

export interface LoanRecord {
  id: string;
  name: string;
  loanType?: LoanStructureType; // 'proper_emi' (default) vs 'person_org_no_tenure' (flexible person/org loan with no deadline)
  lenderName?: string; // Person or Organization name for flexible loans
  category: LoanCategory;
  customCategory?: string;
  principalAmount: number;
  interestRateAnnual: number; // % p.a.
  tenureMonths: number;
  tenureUnit?: 'Months' | 'Years';
  startDate: string; // YYYY-MM-DD
  linkedAccountId: string;
  /** Optional ID of the Loan Account card from the Accounts section connected to this Loan Amortization schedule */
  connectedLoanAccountId?: string;
  status: LoanStatus;
  initialPaidEmisCount?: number; // Pre-existing paid EMIs when created as In Progress
  initialPrepaymentAmount?: number; // Custom partial / lump-sum prepayment already paid
  // Non-mandatory In-Progress Loan Editing overrides:
  currentRemainingAmount?: number;
  totalAmountAlreadyPaid?: number;
  customSuggestedEmi?: number;
  archivedToHistory?: boolean; // True once a closed loan is saved to the History tab
  archivedAt?: string;
  payments: LoanPaymentOverride[];
  createdAt: string;
  notes?: string;
}

export interface AmortizationRow {
  installmentNumber: number;
  monthYear: string; // e.g. 'Nov 2026'
  dateIso: string; // YYYY-MM-DD
  openingBalance: number;
  scheduledEmi: number;
  emiAmount: number; // Actual paid if Paid, or scheduled EMI (capped at opening + interest)
  principalComponent: number;
  interestComponent: number;
  closingBalance: number;
  status: 'Paid' | 'Upcoming';
  paidAccountId?: string;
  paidDate?: string;
  transactionId?: string;
  isExtraPayment?: boolean;
}

export interface LoanAmortizationSummary {
  scheduledMonthlyEmi: number;
  formulaSuggestedEmi?: number;
  totalPrincipal: number;
  totalInterestProjected: number;
  totalPayableProjected: number;
  totalAmountPaidSoFar: number;
  totalPrincipalPaidSoFar: number;
  totalInterestPaidSoFar: number;
  remainingBalance: number;
  paidInstallmentsCount: number;
  remainingInstallmentsCount: number;
  isLoanClosed?: boolean;
  rows: AmortizationRow[];
}

export interface PersonRecordGroupItemSnapshot {
  id: string;
  sourceType: 'expected_item' | 'linked_transaction' | 'expected' | 'transaction';
  title: string;
  date: string;
  dueDate?: string;
  category: string;
  categoryLabel?: string;
  amount: number;
  settledAmount: number;
  dueAmount?: number;
  directionLabel: string;
  isPaid: boolean;
  status?: 'pending' | 'partial' | 'settled';
  proofId?: string;
  proofImageName?: string;
  proofImageDataUrl?: string;
}

export interface PersonRecordGroup {
  id: string;
  personId: string;
  title: string;
  name?: string;
  itemIds: string[];
  recordIds?: string[];
  itemsSnapshot: PersonRecordGroupItemSnapshot[];
  allPaid: boolean;
  isClearedToHistory: boolean;
  createdAt: string;
  clearedAt?: string;
}

export type RecycleItemType =
  | 'transaction'
  | 'account'
  | 'person'
  | 'expected_item'
  | 'dream_vault'
  | 'recurring_payment'
  | 'loan'
  | 'proof_image';

export interface RecycleBinEntry {
  recycleId: string;
  itemType: RecycleItemType;
  originalId: string;
  title: string;
  subtitle?: string;
  deletedAt: string;
  // Reference payload moved (not duplicated) from active lists
  transaction?: TransactionRecord;
  account?: WalletAccount;
  person?: PersonProfile;
  expectedItem?: ExpectedItem;
  dreamVault?: DreamVault;
  recurringPayment?: RecurringPaymentItem;
  loan?: LoanRecord;
  proofRestoreTargetTxId?: string;
  proofId?: string;
  proofImageName?: string;
}

export interface UserVaultData {
  userId: string;
  updatedAt: string;
  nextRecordNumber?: number; // Monotonically increasing sequential ID starting at 100 (100, 101, 102...)
  accounts: WalletAccount[];
  transactions: TransactionRecord[];
  people: PersonProfile[];
  expectedItems: ExpectedItem[];
  dreamVaults: DreamVault[];
  recurringPayments?: RecurringPaymentItem[];
  loans?: LoanRecord[];
  personRecordGroups?: PersonRecordGroup[];
  recycleBin?: RecycleBinEntry[];
  regularMonthlyPayableAmount?: number;
  randomOtherPayableAmount?: number;
}

export interface MonthlyCalculationSummary {
  monthKey: string; // YYYY-MM or 'ALL'
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
  savingsRate: number;
  dreamInvestedThisMonth: number;
  lendingOutThisMonth: number;
  expectedIncomingThisMonth: number;
  borrowingInThisMonth: number;
  otherFlowThisMonth: number;
  dailyAverageExpense: number;
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
    count: number;
  }>;
}

