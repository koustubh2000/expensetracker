import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  Users,
  Vault,
  Settings,
  Plus,
  LogOut,
  Sun,
  Moon,
  Search,
  Trash2,
  CheckCircle2,
  Wallet,
  Landmark,
  Cloud,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  X,
  MessageSquareWarning,
  PauseCircle,
  Pencil,
  RotateCcw,
  Calculator,
  ArrowRight,
  Clock,
  ShieldAlert,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AccountLifecycleStatus,
  AccountType,
  DreamVault,
  ExpectedItem,
  LoanRecord,
  PdfHeaderImageConfig,
  PersonProfile,
  PersonRecordGroup,
  RecurringPaymentItem,
  RecurringPaymentStatus,
  RecycleBinEntry,
  SupportChatMessage,
  TransactionRecord,
  UserAccount,
  UserVaultData,
  WalletAccount,
} from './types/finance';
import {
  allocateNextRecordId,
  calculateAccountBalance,
  calculateAccountRecurringProjection,
  calculateDashboardSummaryCards,
  calculateLoanAmortizationSchedule,
  formatStatusDisplayLabel,
  generateAvailableMonthsFromJan2026,
  DEFAULT_PRIMARY_ADMIN_EMAIL,
  hashSecretIrreversibly,
  resolveFlexibleLabel,
  verifySecretAgainstStoredHash,
} from './utils/financeRules';
import {
  EXPENSE_TRACKER_FULL_LOGO,
  EXPENSE_TRACKER_FULL_LOGO_DARK,
  EXPENSE_TRACKER_SQUARE_ICON,
  generateBankFallbackSvgDataUrl,
  maskAccountNumber,
  resolveBankLogoFromName,
} from './utils/bankLogos';
import {
  compressImageFileToDataUrl,
  createInitialAdminVault,
  deleteProofImageLocally,
  generateOneTimeTempPassword,
  getOrCreateBrowserSessionToken,
  isUserSessionActiveElsewhere,
  loadActiveSessionUserId,
  loadLandingHeroImage,
  loadPdfHeaderConfig,
  loadProofImageLocally,
  loadUsersFromLocal,
  loadUserVault,
  permanentlyDeleteUserAndVault,
  purgeExpiredSupportChats,
  resetEntirePortalLocalStorage,
  saveActiveSessionUserId,
  saveLandingHeroImage,
  savePdfHeaderConfig,
  saveProofImageLocally,
  saveUsersToLocal,
  saveUserVault,
  unmarkUserIdDeletedLocally,
} from './utils/localVaultStorage';
import {
  auth,
  deleteCloudAccount,
  deleteCloudDreamVault,
  deleteCloudExpectedItem,
  deleteCloudPerson,
  deleteCloudTransaction,
  deleteUserFromCloud,
  ensureCloudUserInitialized,
  onAuthStateChanged,
  resetEntireCloudPortal,
  saveCloudAccount,
  saveCloudDreamVault,
  saveCloudExpectedItem,
  saveCloudPerson,
  saveCloudTransaction,
  saveGlobalCloudConfig,
  saveUserCloudVault,
  settleCloudTransaction,
  signInWithGoogleCloud,
  signOutFromCloud,
  subscribeToCloudUsers,
  subscribeToCloudVault,
  subscribeToGlobalCloudConfig,
  subscribeToUserCloudVault,
  syncUsersToCloud,
  updateCloudDreamVaultAmount,
  updateCloudExpectedSettlement,
  User,
} from './lib/firebase';
import { exportLedgerRecordsToExcel, generateLedgerRecordsPdf } from './utils/pdfExporter';
import { LandingPageView } from './components/LandingPageView';
import { AuthGate } from './components/AuthGate';
import { AdminPortalView } from './components/AdminPortalView';
import { TransactionModal } from './components/TransactionModal';
import {
  PeopleAndBillsView,
  RecordSettlementAdjustmentPayload,
} from './components/PeopleAndBillsView';
import { DreamVaultsView } from './components/DreamVaultsView';
import { LocalVaultAndSettingsView } from './components/LocalVaultAndSettingsView';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import {
  ActionFeedbackOverlay,
  ActionFeedbackState,
} from './components/ActionFeedbackOverlay';
import {
  AccountDisabledGate,
  AccountHoldPopup,
  UserSupportChatModal,
} from './components/AccountStatusModal';
import { RecycleBinView } from './components/RecycleBinView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { AccountsManagerView } from './components/AccountsManagerView';
import { RecurringPaymentsSection } from './components/RecurringPaymentsSection';
import { LoansAndEmiView } from './components/LoansAndEmiView';
import { InfoTip } from './components/InfoTip';
import { DashboardAnalyticsCharts } from './components/DashboardAnalyticsCharts';
import { CardColorMixerButton } from './components/CardColorMixerPopover';

type ActiveSection =
  | 'dashboard'
  | 'accounts'
  | 'records'
  | 'people'
  | 'dreams'
  | 'loans'
  | 'recycle'
  | 'settings';

export default function App() {
  // Theme state (default Light Mode everywhere, with full Dark Mode toggle)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('expensetracker_theme_v2');
    return saved ? saved === 'dark' : false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('expensetracker_theme_v2', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('expensetracker_theme_v2', 'light');
    }
  }, [darkMode]);

  // Two-Tier Action Feedback state:
  // mode: 'fullscreen' ONLY for Login, Account Deleted / Portal Reset, PDF Generated, Password Changed
  // mode: 'toast' (top navbar notification that vanishes in ~2.4s while window stays usable) for everything else
  const [feedbackState, setFeedbackState] = useState<ActionFeedbackState | null>(null);

  const triggerFeedback = useCallback(
    (
      message: string,
      type: 'success' | 'error' = 'success',
      mode: 'fullscreen' | 'toast' = 'toast'
    ) => {
      setFeedbackState({ id: Date.now(), message, type, mode });
    },
    []
  );

  // Users, Front Page Hero Image & Session State (auto-purging any expired closed support chats)
  const [users, setUsers] = useState<UserAccount[]>(() =>
    purgeExpiredSupportChats(loadUsersFromLocal()).users
  );
  const [activeUserId, setActiveUserId] = useState<string | null>(() => loadActiveSessionUserId());
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [landingHeroImage, setLandingHeroImage] = useState<string | null>(() =>
    loadLandingHeroImage()
  );
  const [pdfHeaderConfig, setPdfHeaderConfig] = useState<PdfHeaderImageConfig>(() =>
    loadPdfHeaderConfig()
  );
  const [showAuthGate, setShowAuthGate] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      return p.get('view') === 'auth';
    }
    return false;
  });
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register' | 'forgot'>('login');

  // Track whether the current page load has acknowledged the On Hold popup
  // (Resets on every browser refresh or re-login so the user always sees the On Hold popup first)
  const [holdDismissedForLoadUserId, setHoldDismissedForLoadUserId] = useState<string | null>(null);
  const [isSupportChatOpen, setIsSupportChatOpen] = useState<boolean>(false);
  const [browserSessionToken] = useState<string>(() => getOrCreateBrowserSessionToken());
  const [inactivityRemainingSeconds, setInactivityRemainingSeconds] = useState<number>(120);
  const lastActivityRef = React.useRef<number>(Date.now());
  const lastSessionHeartbeatRef = React.useRef<number>(0);

  const currentUser = useMemo(
    () => users.find((u) => u.id === activeUserId) || null,
    [users, activeUserId]
  );

  // Active User Vault State (All entries start initially empty)
  const [vault, setVault] = useState<UserVaultData>(() =>
    loadUserVault(activeUserId || 'user-admin', false)
  );

  // Navigation & Filters (Synced with /expensetracker/:section subpath)
  const [activeSection, setActiveSection] = useState<ActiveSection>(() => {
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith('/accounts')) return 'accounts';
    if (path.endsWith('/records')) return 'records';
    if (path.endsWith('/people')) return 'people';
    if (path.endsWith('/dreams')) return 'dreams';
    if (path.endsWith('/loans')) return 'loans';
    if (path.endsWith('/recycle')) return 'recycle';
    if (path.endsWith('/settings')) return 'settings';
    return 'dashboard';
  });

  useEffect(() => {
    if (!currentUser) return;
    const search = window.location.search || '';
    const targetPath = `/expensetracker/${activeSection}${search}`;
    if (window.location.pathname + window.location.search !== targetPath) {
      window.history.replaceState({}, '', targetPath);
    }
  }, [activeSection, currentUser]);

  const [selectedMonth, setSelectedMonth] = useState<string>('2026-11');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [selectedTxType, setSelectedTxType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isTxModalOpen, setIsTxModalOpen] = useState<boolean>(false);
  const [openTxModalWithPaidEmi, setOpenTxModalWithPaidEmi] = useState<boolean>(false);
  const [recordsSubSection, setRecordsSubSection] = useState<'logs' | 'recurring'>('logs');
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null);
  const [previewProofTx, setPreviewProofTx] = useState<TransactionRecord | null>(null);
  const [isRecordsPdfPreviewOpen, setIsRecordsPdfPreviewOpen] = useState<boolean>(false);
  const [dashboardRevealedNumbers, setDashboardRevealedNumbers] = useState<Record<string, boolean>>(
    {}
  );
  const [dashboardTopTab, setDashboardTopTab] = useState<'savings' | 'loans'>('savings');
  const [expandedSummaryCard, setExpandedSummaryCard] = useState<
    'totalCounted' | 'expectedIn' | 'moneyIOwe' | 'theLoans' | 'totalInvestments' | null
  >(null);

  const toggleSummaryCardExpand = useCallback(
    (cardKey: 'totalCounted' | 'expectedIn' | 'moneyIOwe' | 'theLoans' | 'totalInvestments') => {
      setExpandedSummaryCard((prev) => (prev === cardKey ? null : cardKey));
    },
    []
  );

  // Password Confirmation Modal before Deleting a Transaction Record or Proof Image in Records Tab
  const [recordPendingDelete, setRecordPendingDelete] = useState<{
    mode: 'transaction' | 'proof_image';
    tx: TransactionRecord;
  } | null>(null);
  const [deleteRecordPassword, setDeleteRecordPassword] = useState<string>('');
  const [deleteRecordError, setDeleteRecordError] = useState<string>('');

  // 1. Automatic Real-Time Cross-Device Sync for Front Page Hero Image, PDF Header Config & User/Admin Accounts
  useEffect(() => {
    const unsubGlobal = subscribeToGlobalCloudConfig({
      onHeroImage: (cloudHero) => setLandingHeroImage(cloudHero),
      onPdfHeaderConfig: (cloudPdfCfg) => setPdfHeaderConfig(cloudPdfCfg),
      getInitialLocalState: () => ({
        heroImage: loadLandingHeroImage(),
        pdfHeaderConfig: loadPdfHeaderConfig(),
      }),
    });

    const unsubUsers = subscribeToCloudUsers({
      onUsers: (cloudUsers) => {
        const { users: cleanedUsers, changed: didPurge } = purgeExpiredSupportChats(cloudUsers);
        setUsers(cleanedUsers);
        if (didPurge) {
          saveUsersToLocal(cleanedUsers);
          syncUsersToCloud(cleanedUsers);
        }
      },
      getInitialLocalUsers: () => purgeExpiredSupportChats(loadUsersFromLocal()).users,
    });

    return () => {
      unsubGlobal();
      unsubUsers();
    };
  }, []);

  // Listen to Firebase Auth state and attach Firestore listeners when signed in with Google
  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const cloudUid = fbUser.uid;
        const template = createInitialAdminVault(cloudUid);
        await ensureCloudUserInitialized(
          cloudUid,
          fbUser.displayName || 'Cloud Workspace',
          template
        );

        setUsers((prev) => {
          const exists = prev.find((u) => u.id === cloudUid);
          if (exists) return prev;
          const cloudProfile: UserAccount = {
            id: cloudUid,
            username: (fbUser.email?.split('@')[0] || 'cloud_user').replace(/[^a-zA-Z0-9_-]/g, '_'),
            displayName: fbUser.displayName || 'Google Cloud User',
            passwordHash: 'google-oauth',
            role: fbUser.email === 'koustubhjuvekar2000@gmail.com' ? 'admin' : 'user',
            createdAt: new Date().toISOString(),
            currency: '$',
            customCategories: [],
            accountStatus: 'active',
          };
          const next = [...prev, cloudProfile];
          saveUsersToLocal(next);
          syncUsersToCloud(next);
          return next;
        });

        setActiveUserId(cloudUid);
        saveActiveSessionUserId(cloudUid);

        if (unsubFirestore) unsubFirestore();
        unsubFirestore = subscribeToCloudVault(cloudUid, {
          onAccounts: (accounts) =>
            setVault((prev) => ({ ...prev, userId: cloudUid, accounts })),
          onTransactions: (transactions) =>
            setVault((prev) => ({ ...prev, userId: cloudUid, transactions })),
          onPeople: (people) =>
            setVault((prev) => ({ ...prev, userId: cloudUid, people })),
          onExpectedItems: (expectedItems) =>
            setVault((prev) => ({ ...prev, userId: cloudUid, expectedItems })),
          onDreamVaults: (dreamVaults) =>
            setVault((prev) => ({ ...prev, userId: cloudUid, dreamVaults })),
        });
      } else if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  // Load & live-subscribe to user vault across devices when switching between workspace profiles
  useEffect(() => {
    if (activeUserId && (!firebaseUser || firebaseUser.uid !== activeUserId)) {
      const loaded = loadUserVault(activeUserId, false);
      setVault(loaded);
      const unsubUserVault = subscribeToUserCloudVault(activeUserId, {
        onVault: (cloudVault) => setVault(cloudVault),
        getInitialLocalVault: () => loadUserVault(activeUserId, false),
      });
      return () => {
        unsubUserVault();
      };
    }
  }, [activeUserId, firebaseUser]);

  const isCloudSession = Boolean(firebaseUser && activeUserId === firebaseUser.uid);

  const persistUsersChange = (nextUsers: UserAccount[]) => {
    const nowIso = new Date().toISOString();
    const stamped = nextUsers.map((u) => ({
      ...u,
      updatedAt: u.updatedAt || nowIso,
    }));
    setUsers(stamped);
    saveUsersToLocal(stamped, true);
    syncUsersToCloud(stamped);
  };

  const persistVaultChange = (nextVault: UserVaultData) => {
    const stampedVault: UserVaultData = {
      ...nextVault,
      updatedAt: new Date().toISOString(),
    };
    setVault(stampedVault);
    saveUserVault(stampedVault);
    saveUserCloudVault(stampedVault);
  };

  // Auth & Security Handlers (Single-Session Lock + Concurrent Login Alert in Chat with 24h Auto-Delete)
  const handleLogin = (
    user: UserAccount,
    usedOneTimeTempPassword = false
  ): { ok: boolean; error?: string } => {
    const latestUser = users.find((u) => u.id === user.id) || user;

    // 1. Check if this user is already logged in on another active session (within 5-min window)
    if (isUserSessionActiveElsewhere(latestUser, browserSessionToken)) {
      const nowIso = new Date().toISOString();
      const expire24hIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const securityMsg: SupportChatMessage = {
        id: `sec-login-${Date.now()}`,
        sender: 'admin',
        senderName: 'Security System',
        text: 'Somebody tried to log in at the same time you logged in. If you think your password leaked, change it immediately here.',
        createdAt: nowIso,
        messageType: 'security_login_alert',
        expiresAt: expire24hIso,
      };
      const nextUsers = users.map((u) =>
        u.id === latestUser.id
          ? {
              ...u,
              securityAlertUnread: true,
              supportMessages: [...(u.supportMessages || []), securityMsg],
            }
          : u
      );
      persistUsersChange(nextUsers);
      triggerFeedback(
        'User already logged in! Log off there and log in here!',
        'error',
        'toast'
      );
      return {
        ok: false,
        error: 'User already logged in! Log off there and log in here!',
      };
    }

    const nowIso = new Date().toISOString();
    const updatedUser: UserAccount = {
      ...latestUser,
      activeSessionToken: browserSessionToken,
      activeSessionLastSeenAt: nowIso,
      ...(usedOneTimeTempPassword
        ? {
            tempPassword: undefined,
            tempPasswordValidForFirstLogin: false,
            forgotPasswordRequested: false,
            forgotPasswordRequestedAt: undefined,
            mustChangePassword: true,
          }
        : {}),
    };
    const nextUsers = users.map((u) => (u.id === latestUser.id ? updatedUser : u));
    persistUsersChange(nextUsers);

    if (usedOneTimeTempPassword) {
      setActiveSection('settings');
    }
    if (
      updatedUser.securityAlertUnread ||
      (updatedUser.supportMessages || []).some((m) => m.messageType === 'security_login_alert')
    ) {
      setIsSupportChatOpen(true);
    }

    lastActivityRef.current = Date.now();
    setInactivityRemainingSeconds(120);
    setHoldDismissedForLoadUserId(null);
    setActiveUserId(latestUser.id);
    saveActiveSessionUserId(latestUser.id);
    setVault(loadUserVault(latestUser.id, false));

    // Silent Login: Routine "Login Successful" popups/toasts are completely removed upon normal login.
    return { ok: true };
  };

  // Multi-Tier Lockout State Machine & Intrusion Alert Handler (5+ consecutive failed login attempts)
  const handleUpdateUserSecurityState = (
    updatedUser: UserAccount,
    intrusionAlertMessage?: string
  ) => {
    const nextUsers = users.map((u) => (u.id === updatedUser.id ? updatedUser : u));
    persistUsersChange(nextUsers);
    if (intrusionAlertMessage) {
      triggerFeedback(intrusionAlertMessage, 'error', 'toast');
    }
  };

  const handleRequestForgotPassword = (
    usernameInput: string
  ): { ok: boolean; message: string } => {
    const clean = usernameInput.trim().toLowerCase();
    const target = users.find((u) => u.username.toLowerCase() === clean);
    if (!target || target.role === 'admin') {
      triggerFeedback('No customer account found with that username.', 'error');
      return {
        ok: false,
        message: 'No customer account found with that username. Please check your username.',
      };
    }
    const generatedTemp = generateOneTimeTempPassword();
    const hashedTemp = hashSecretIrreversibly(generatedTemp);
    const nextUsers = users.map((u) =>
      u.id === target.id
        ? {
            ...u,
            forgotPasswordRequested: true,
            forgotPasswordRequestedAt: new Date().toISOString(),
            tempPassword: hashedTemp,
            tempPasswordValidForFirstLogin: true,
          }
        : u
    );
    persistUsersChange(nextUsers);
    triggerFeedback('Password Reset Requested Successfully', 'success');
    return {
      ok: true,
      message:
        'Password reset requested! Please contact the Admin to get your Temporary Password (valid for 1st login only), then log in and change your password inside Account Settings.',
    };
  };

  const handleGenerateTempPasswordForUser = (userId: string): string => {
    const generatedTemp = generateOneTimeTempPassword();
    const hashedTemp = hashSecretIrreversibly(generatedTemp);
    const nextUsers = users.map((u) =>
      u.id === userId
        ? {
            ...u,
            tempPassword: hashedTemp,
            tempPasswordValidForFirstLogin: true,
          }
        : u
    );
    persistUsersChange(nextUsers);
    return generatedTemp;
  };

  const handleResolveForgotPasswordIssue = (userId: string) => {
    const nextUsers = users.map((u) =>
      u.id === userId
        ? {
            ...u,
            forgotPasswordRequested: false,
            forgotPasswordRequestedAt: undefined,
            tempPassword: undefined,
            tempPasswordValidForFirstLogin: false,
          }
        : u
    );
    persistUsersChange(nextUsers);
  };

  const handleGoogleLogin = async () => {
    await signInWithGoogleCloud();
    triggerFeedback('Cloud Account Connected Successfully', 'success');
  };

  const handleLogout = useCallback(
    async (isInactivityAutoLogout = false) => {
      if (window.location.search.includes('autostart')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
      if (activeUserId) {
        setUsers((prev) => {
          const next = prev.map((u) =>
            u.id === activeUserId
              ? {
                  ...u,
                  activeSessionToken: undefined,
                  activeSessionLastSeenAt: undefined,
                }
              : u
          );
          saveUsersToLocal(next);
          syncUsersToCloud(next);
          return next;
        });
      }
      await signOutFromCloud();
      setHoldDismissedForLoadUserId(null);
      setIsSupportChatOpen(false);
      setActiveUserId(null);
      saveActiveSessionUserId(null);
      setShowAuthGate(false);
      triggerFeedback(
        isInactivityAutoLogout
          ? 'Auto-Logged Out Due to 2 Minutes of Inactivity'
          : 'Logged Out Successfully',
        'success',
        'toast'
      );
    },
    [activeUserId, triggerFeedback]
  );

  // Auto-open Support Chat when a concurrent login attempt triggers securityAlertUnread while user is logged in
  useEffect(() => {
    if (currentUser && currentUser.securityAlertUnread) {
      setIsSupportChatOpen(true);
      const nextUsers = users.map((u) =>
        u.id === currentUser.id ? { ...u, securityAlertUnread: false } : u
      );
      persistUsersChange(nextUsers);
    }
  }, [currentUser, users]);

  // 2-Minute (120s) Inactivity Auto-Logout (Click / Keydown Only — Mouse Move is NOT Activity)
  // After 1 minute without any click or keyboard press (<= 60s remaining), the header timer blinks and counts down.
  // Clicking inside the app or pressing any keyboard button immediately resets to 120s and hides the timer.
  useEffect(() => {
    if (!currentUser) return;

    const params = new URLSearchParams(window.location.search);
    const customTimeoutSec = Number(params.get('inactivityTimeoutSec'));
    const maxInactivitySec =
      !Number.isNaN(customTimeoutSec) && customTimeoutSec >= 5 && customTimeoutSec <= 300
        ? customTimeoutSec
        : 120;

    lastActivityRef.current = Date.now();
    setInactivityRemainingSeconds(maxInactivitySec);

    const recordUserActivity = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      setInactivityRemainingSeconds(maxInactivitySec);

      // Update activeSessionLastSeenAt heartbeat every 20s of activity locally only (avoid spamming Firestore write quota)
      if (now - lastSessionHeartbeatRef.current > 20000) {
        lastSessionHeartbeatRef.current = now;
        const nowIso = new Date(now).toISOString();
        setUsers((prev) => {
          const next = prev.map((u) =>
            u.id === currentUser.id
              ? {
                  ...u,
                  activeSessionToken: browserSessionToken,
                  activeSessionLastSeenAt: nowIso,
                }
              : u
          );
          saveUsersToLocal(next, false);
          return next;
        });
      }
    };

    // Ensure current session token is registered on mount/refresh
    recordUserActivity();

    // IMPORTANT: Moving mouse (mousemove) or scrolling is NOT activity.
    // Only an actual mouse click/tap inside the app or any keyboard button press counts as activity.
    const events = ['mousedown', 'click', 'keydown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, recordUserActivity, { passive: true }));

    const intervalId = window.setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, maxInactivitySec - elapsedSec);
      setInactivityRemainingSeconds(remaining);

      // Periodically purge any 24h-expired chat notifications
      if (remaining % 30 === 0) {
        setUsers((prev) => {
          const { users: cleaned, changed } = purgeExpiredSupportChats(prev);
          if (!changed) return prev;
          saveUsersToLocal(cleaned);
          syncUsersToCloud(cleaned);
          return cleaned;
        });
      }

      if (remaining <= 0) {
        window.clearInterval(intervalId);
        void handleLogout(true);
      }
    }, 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, recordUserActivity));
      window.clearInterval(intervalId);
    };
  }, [currentUser?.id, browserSessionToken, handleLogout]);

  const handleRegisterUser = (
    username: string,
    displayName: string,
    password: string,
    currency: string,
    _seedDemo: boolean,
    autoLogin = true
  ): { ok: boolean; error?: string } => {
    const clean = username.trim().toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === clean)) {
      triggerFeedback(`Username "${username}" already exists.`, 'error');
      return { ok: false, error: `Username "${username}" already exists.` };
    }
    const newUser: UserAccount = {
      id: `user-${Date.now()}`,
      username: username.trim(),
      displayName: displayName.trim() || username.trim(),
      passwordHash: hashSecretIrreversibly(password),
      role: 'user',
      createdAt: new Date().toISOString(),
      currency,
      customCategories: [],
      accountStatus: 'active',
    };
    const nextUsers = [...users, newUser];
    persistUsersChange(nextUsers);
    const initialVault = loadUserVault(newUser.id, false);
    saveUserVault(initialVault);
    saveUserCloudVault(initialVault);
    if (autoLogin) {
      setActiveUserId(newUser.id);
      saveActiveSessionUserId(newUser.id);
      setVault(initialVault);
      triggerFeedback('Account Registered & Logged In Successfully', 'success', 'fullscreen');
    }
    return { ok: true };
  };

  const handleAdminCreateAdmin = (details: {
    username: string;
    displayName: string;
    email: string;
    phone: string;
    department: string;
    currency: string;
  }): { ok: boolean; tempPassword?: string; error?: string } => {
    const clean = details.username.trim().toLowerCase();
    if (users.some((u) => u.username.toLowerCase() === clean)) {
      return { ok: false, error: `Username "${details.username}" already exists.` };
    }
    const oneTimeTempPassword = generateOneTimeTempPassword();
    const hashedTemp = hashSecretIrreversibly(oneTimeTempPassword);
    const newAdmin: UserAccount = {
      id: `admin-${Date.now()}`,
      username: details.username.trim(),
      displayName: details.displayName.trim() || details.username.trim(),
      passwordHash: hashedTemp,
      role: 'admin',
      createdAt: new Date().toISOString(),
      currency: details.currency || '₹',
      customCategories: [],
      email: details.email || DEFAULT_PRIMARY_ADMIN_EMAIL,
      phone: details.phone || undefined,
      department: details.department || undefined,
      createdByAdmin: currentUser?.username || 'admin',
      tempPassword: hashedTemp,
      tempPasswordValidForFirstLogin: true,
      mustChangePassword: true,
      accountStatus: 'active',
    };
    const nextUsers = [...users, newAdmin];
    persistUsersChange(nextUsers);
    return { ok: true, tempPassword: oneTimeTempPassword };
  };

  // Admin Lifecycle Management: Hold / Activate / Disable / Permanently Delete / Support Chat / Issue Closed / Reset Portal
  const handleAdminUpdateAccountStatus = (
    userId: string,
    status: AccountLifecycleStatus,
    reason?: string
  ) => {
    if (userId === 'user-admin') return;
    const nowIso = new Date().toISOString();
    const nextUsers = users.map((u) => {
      if (u.id !== userId) return u;
      return {
        ...u,
        updatedAt: nowIso,
        accountStatus: status,
        holdReason: status === 'active' ? undefined : reason !== undefined ? reason : u.holdReason,
        // When placed on hold, reset acknowledgement so we see when user clicks Okay next
        holdAcknowledgedByUser: status === 'on_hold' ? false : u.holdAcknowledgedByUser,
        // When user is activated, automatically clear the top unread warning notification banner and any strike lockouts
        adminNoticeUnread: status === 'active' ? false : true,
        ...(status === 'active'
          ? {
              permanentlyLockedByStrikes: false,
              pinLockedOut: false,
              pinFailedAttempts: 0,
              passwordFailedAttempts: 0,
              consecutiveFailedAttempts: 0,
              lockoutTier: 0 as const,
              lockoutUntilMs: undefined,
            }
          : {}),
      };
    });
    persistUsersChange(nextUsers);
  };

  const handleAdminCloseSupportIssue = (userId: string) => {
    const nowIso = new Date().toISOString();
    const expireIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const nextUsers = users.map((u) => {
      if (u.id !== userId) return u;
      const existingMsgs = u.supportMessages || [];
      const closingMsg: SupportChatMessage = {
        id: `msg-closed-${Date.now()}`,
        sender: 'admin',
        senderName: currentUser?.displayName || 'Admin Support',
        text: 'Issue marked as CLOSED by Admin Support. This support chat history will automatically clear in 24 hours.',
        createdAt: nowIso,
      };
      return {
        ...u,
        adminNoticeUnread: false,
        supportIssueClosedAt: nowIso,
        supportIssueExpireAt: expireIso,
        supportMessages: [...existingMsgs, closingMsg],
      };
    });
    persistUsersChange(nextUsers);
  };

  const handleAdminSendSupportMessage = (
    userId: string,
    messageText: string,
    customReason?: string
  ) => {
    const nextUsers = users.map((u) => {
      if (u.id !== userId) return u;
      const existingMsgs = u.supportMessages || [];
      const updatedMsgs: SupportChatMessage[] = messageText.trim()
        ? [
            ...existingMsgs,
            {
              id: `msg-${Date.now()}`,
              sender: 'admin',
              senderName: currentUser?.displayName || 'Admin Support',
              text: messageText.trim(),
              createdAt: new Date().toISOString(),
            },
          ]
        : existingMsgs;
      return {
        ...u,
        holdReason: customReason !== undefined && customReason.trim() ? customReason.trim() : u.holdReason,
        supportMessages: updatedMsgs,
        adminNoticeUnread: (u.accountStatus || 'active') !== 'active',
        supportIssueClosedAt: undefined,
        supportIssueExpireAt: undefined,
      };
    });
    persistUsersChange(nextUsers);
  };

  const handleUserAcknowledgeHold = (userId: string, optionalUserMessage?: string) => {
    setHoldDismissedForLoadUserId(userId);
    const nextUsers = users.map((u) => {
      if (u.id !== userId) return u;
      const existingMsgs = u.supportMessages || [];
      const updatedMsgs: SupportChatMessage[] =
        optionalUserMessage && optionalUserMessage.trim()
          ? [
              ...existingMsgs,
              {
                id: `msg-${Date.now()}`,
                sender: 'user',
                senderName: u.displayName,
                text: optionalUserMessage.trim(),
                createdAt: new Date().toISOString(),
              },
            ]
          : existingMsgs;
      return {
        ...u,
        holdAcknowledgedByUser: true,
        lastHoldActivityAt: new Date().toISOString(),
        adminNoticeUnread: false,
        supportMessages: updatedMsgs,
      };
    });
    persistUsersChange(nextUsers);
    if (optionalUserMessage && optionalUserMessage.trim()) {
      triggerFeedback('Message Sent to Admin & View-Only Mode Opened', 'success');
    }
  };

  const handleUserSendSupportMessage = (userId: string, messageText: string) => {
    if (!messageText.trim()) return;
    const nextUsers = users.map((u) => {
      if (u.id !== userId) return u;
      const existingMsgs = u.supportMessages || [];
      const newMsg: SupportChatMessage = {
        id: `msg-${Date.now()}`,
        sender: 'user',
        senderName: u.displayName,
        text: messageText.trim(),
        createdAt: new Date().toISOString(),
      };
      return {
        ...u,
        holdAcknowledgedByUser: true,
        lastHoldActivityAt: new Date().toISOString(),
        adminNoticeUnread: false,
        supportMessages: [...existingMsgs, newMsg],
      };
    });
    persistUsersChange(nextUsers);
    triggerFeedback('Message Sent to Admin Support', 'success');
  };

  const handleUserDismissAdminNotice = (userId: string) => {
    const nextUsers = users.map((u) =>
      u.id === userId ? { ...u, adminNoticeUnread: false } : u
    );
    persistUsersChange(nextUsers);
  };

  const handleAdminPermanentlyDeleteUser = (userId: string) => {
    if (userId === 'user-admin') return;
    setUsers((prev) => {
      const remaining = permanentlyDeleteUserAndVault(userId, prev);
      deleteUserFromCloud(userId);
      syncUsersToCloud(remaining);
      return remaining;
    });
  };

  const handleResetEntirePortal = (
    passwordAttempt: string
  ): { ok: boolean; error?: string } => {
    if (!currentUser || currentUser.id !== 'user-admin') {
      return { ok: false, error: 'Only the Primary Admin account can reset the entire portal.' };
    }
    if (!verifySecretAgainstStoredHash(passwordAttempt, currentUser.passwordHash)) {
      return { ok: false, error: 'Incorrect Admin password. Portal reset cancelled.' };
    }
    const previousUsers = [...users];
    const freshUsers = resetEntirePortalLocalStorage(currentUser.passwordHash);
    const freshAdmin = freshUsers[0];
    setUsers(freshUsers);
    setLandingHeroImage(null);
    setPdfHeaderConfig(loadPdfHeaderConfig());
    void resetEntireCloudPortal(previousUsers, freshAdmin);
    return { ok: true };
  };

  const handleDeleteOwnAccountPermanently = (
    passwordAttempt: string
  ): { ok: boolean; error?: string } => {
    if (!currentUser || currentUser.role === 'admin') {
      return { ok: false, error: 'Admin account cannot be deleted.' };
    }
    if (!verifySecretAgainstStoredHash(passwordAttempt, currentUser.passwordHash)) {
      return { ok: false, error: 'Incorrect password. Permanent deletion cancelled.' };
    }
    const deletedUserId = currentUser.id;
    const remaining = permanentlyDeleteUserAndVault(deletedUserId, users);
    setUsers(remaining);
    deleteUserFromCloud(deletedUserId);
    syncUsersToCloud(remaining);
    setActiveUserId(null);
    saveActiveSessionUserId(null);
    setShowAuthGate(false);
    triggerFeedback('Account Deleted Permanently', 'success', 'fullscreen');
    return { ok: true };
  };

  const isAccountOnHold = currentUser?.accountStatus === 'on_hold';
  const isAccountDisabled = currentUser?.accountStatus === 'disabled';

  // Helper to push an item into Recycle Bin without duplicating storage data
  const pushToRecycleBin = (
    currentBin: RecycleBinEntry[] | undefined,
    entry: Omit<RecycleBinEntry, 'recycleId' | 'deletedAt'>
  ): RecycleBinEntry[] => {
    const newEntry: RecycleBinEntry = {
      ...entry,
      recycleId: `bin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      deletedAt: new Date().toISOString(),
    };
    return [newEntry, ...(currentBin || [])];
  };

  const handleUpdateMobileSecurity = (mobilePin: string | undefined) => {
    if (!currentUser) return;
    const updated: UserAccount = {
      ...currentUser,
      mobilePin: mobilePin ? hashSecretIrreversibly(mobilePin) : undefined,
      pinFailedAttempts: 0,
      pinLockedOut: false,
    };
    const nextUsers = users.map((u) => (u.id === currentUser.id ? updated : u));
    persistUsersChange(nextUsers);
  };

  // Dedicated Accounts Tab Handler: Add & Edit Bank Accounts and Wallets with Auto-Synced Bank Logo
  const handleSaveAccountFromTab = async (accountObj: WalletAccount, isEdit: boolean) => {
    if (isAccountOnHold) return;
    if (isCloudSession && firebaseUser) {
      await saveCloudAccount(firebaseUser.uid, accountObj);
    } else {
      persistVaultChange({
        ...vault,
        accounts: isEdit
          ? vault.accounts.map((a) => (a.id === accountObj.id ? accountObj : a))
          : [...vault.accounts, accountObj],
      });
    }
    triggerFeedback(
      isEdit
        ? 'Wallet / Bank Account Updated Successfully'
        : 'Wallet / Bank Account Saved Successfully',
      'success',
      'toast'
    );
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (isAccountOnHold) return;
    const targetAcc = vault.accounts.find((a) => a.id === accountId);
    if (isCloudSession) {
      await deleteCloudAccount(accountId);
      triggerFeedback('Account Moved to Recycle Bin', 'success', 'toast');
      return;
    }
    const nextBin = targetAcc
      ? pushToRecycleBin(vault.recycleBin, {
          itemType: 'account',
          originalId: targetAcc.id,
          title: targetAcc.name,
          subtitle: `${targetAcc.type} · A/C: ${targetAcc.accountNumber || 'N/A'} · Branch: ${targetAcc.branchName || 'N/A'}`,
          account: targetAcc,
        })
      : vault.recycleBin;

    persistVaultChange({
      ...vault,
      accounts: vault.accounts.filter((a) => a.id !== accountId),
      recycleBin: nextBin,
    });
    if (selectedAccountId === accountId) {
      setSelectedAccountId('ALL');
    }
    triggerFeedback('Account Moved to Recycle Bin', 'success', 'toast');
  };

  // Add, Edit & Soft-Delete Transaction Record (Sequential IDs starting from 100, never repeating)
  const handleSaveTransaction = async (
    txInput: Omit<TransactionRecord, 'id'>,
    saveCustomCategoryToProfile?: string,
    autoCreateAccountName?: string
  ) => {
    if (isAccountOnHold) return;
    let targetAccountId = txInput.accountId;
    let updatedAccounts = vault.accounts;

    if ((!targetAccountId || vault.accounts.length === 0) && autoCreateAccountName) {
      const matchedBrand = resolveBankLogoFromName(autoCreateAccountName);
      const autoAcc: WalletAccount = {
        id: `acc-${Date.now() - 1}`,
        name: autoCreateAccountName,
        type: 'Bank Account',
        accountNumber: '00001001',
        branchName: 'Main Branch',
        bankDetails: 'A/C: 00001001 · Branch: Main Branch',
        bankLogoUrl: matchedBrand?.logoUrl,
        currency: currentUser?.currency || '₹',
        initialBalance: 0,
        color: matchedBrand?.suggestedColor || '#059669',
        includeInNetWorth: true,
      };
      targetAccountId = autoAcc.id;
      updatedAccounts = [...vault.accounts, autoAcc];
      if (isCloudSession && firebaseUser) {
        await saveCloudAccount(firebaseUser.uid, autoAcc);
      }
    }

    const allocated = allocateNextRecordId(vault);
    let nextRecordNumberCursor = allocated.nextRecordNumber;
    let updatedPeople = vault.people;
    let updatedExpectedItems = vault.expectedItems;
    let resolvedSplitPersonId = txInput.splitPersonId;
    let resolvedSplitPersonName = txInput.splitPersonName?.trim();

    if (
      txInput.isSplit &&
      txInput.splitAmount &&
      txInput.splitAmount > 0 &&
      (resolvedSplitPersonId || resolvedSplitPersonName)
    ) {
      let matchedPerson = resolvedSplitPersonId
        ? updatedPeople.find((p) => p.id === resolvedSplitPersonId)
        : undefined;

      if (!matchedPerson && resolvedSplitPersonName) {
        matchedPerson = updatedPeople.find(
          (p) => p.name.trim().toLowerCase() === resolvedSplitPersonName!.toLowerCase()
        );
      }

      if (!matchedPerson && resolvedSplitPersonName) {
        matchedPerson = {
          id: `person-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: resolvedSplitPersonName,
          relationship: 'Friend',
          notes: 'Auto-created from Split Expense in Records',
        };
        updatedPeople = [...updatedPeople, matchedPerson];
        if (isCloudSession && firebaseUser) {
          await saveCloudPerson(firebaseUser.uid, matchedPerson);
        }
      }

      if (matchedPerson) {
        resolvedSplitPersonId = matchedPerson.id;
        resolvedSplitPersonName = matchedPerson.name;
        const expAllocated = allocateNextRecordId({
          ...vault,
          nextRecordNumber: nextRecordNumberCursor,
        });
        nextRecordNumberCursor = expAllocated.nextRecordNumber;
        const splitExpectedItem: ExpectedItem = {
          id: expAllocated.recordId,
          personId: matchedPerson.id,
          title: `Split Bill: ${txInput.title}`,
          amount: txInput.splitAmount,
          settledAmount: 0,
          category: 'Client Invoice Receivable',
          customCategory: 'Split Bill Share',
          direction: 'expecting_from',
          date: txInput.date,
          dueDate: txInput.splitReturnDate || txInput.date,
          status: 'pending',
          linkedTransactionId: allocated.recordId,
          notes: `Split from Record #${allocated.recordId} (Total Bill: ${
            currentUser?.currency || '₹'
          }${(txInput.grossAmountPaid || txInput.amount).toLocaleString()})`,
        };
        updatedExpectedItems = [splitExpectedItem, ...updatedExpectedItems];
        if (isCloudSession && firebaseUser) {
          await saveCloudExpectedItem(firebaseUser.uid, splitExpectedItem);
        }
      }
    }

    const newTx: TransactionRecord = {
      ...txInput,
      splitPersonId: resolvedSplitPersonId,
      splitPersonName: resolvedSplitPersonName,
      accountId: targetAccountId || vault.accounts[0]?.id || 'acc-default',
      id: allocated.recordId,
    };

    if (newTx.proofId && newTx.proofImageDataUrl) {
      saveProofImageLocally(newTx.proofId, newTx.proofImageDataUrl);
    }

    if (saveCustomCategoryToProfile && currentUser) {
      const updatedUser: UserAccount = {
        ...currentUser,
        customCategories: Array.from(
          new Set([...currentUser.customCategories, saveCustomCategoryToProfile])
        ),
      };
      const nextUsers = users.map((u) => (u.id === currentUser.id ? updatedUser : u));
      persistUsersChange(nextUsers);
    }

    if (isCloudSession && firebaseUser) {
      await saveCloudTransaction(firebaseUser.uid, newTx);
      if (txInput.type === 'dream_investment' && txInput.dreamVaultId) {
        const target = vault.dreamVaults.find((d) => d.id === txInput.dreamVaultId);
        if (target) {
          await updateCloudDreamVaultAmount(target.id, target.currentAmount + txInput.amount);
        }
      }
      triggerFeedback(
        newTx.isSplit
          ? `Record #${newTx.id} Saved & Split Receivable Added for ${resolvedSplitPersonName}`
          : newTx.proofImageDataUrl
          ? `Record #${newTx.id} & HD Proof Saved`
          : `Record #${newTx.id} Saved Successfully`,
        'success',
        'toast'
      );
      return;
    }

    const updatedDreams = vault.dreamVaults.map((dv) => {
      if (txInput.type === 'dream_investment' && txInput.dreamVaultId === dv.id) {
        return { ...dv, currentAmount: dv.currentAmount + txInput.amount };
      }
      return dv;
    });

    const updatedRecurring = (vault.recurringPayments || []).map((rp) => {
      if (newTx.isRegularMonthly && newTx.linkedRecurringId && rp.id === newTx.linkedRecurringId) {
        return {
          ...rp,
          monthlyPaymentStatus: 'already_paid' as const,
          lastPaidDate: newTx.date,
          lastPaidTransactionId: newTx.id,
        };
      }
      return rp;
    });

    persistVaultChange({
      ...vault,
      nextRecordNumber: nextRecordNumberCursor,
      accounts: updatedAccounts,
      people: updatedPeople,
      expectedItems: updatedExpectedItems,
      transactions: [newTx, ...vault.transactions],
      dreamVaults: updatedDreams,
      recurringPayments: updatedRecurring,
    });
    triggerFeedback(
      newTx.isSplit
        ? `Record #${newTx.id} Saved & Split Receivable Added for ${resolvedSplitPersonName}`
        : newTx.proofImageDataUrl
        ? `Record #${newTx.id} & HD Proof Saved`
        : `Record #${newTx.id} Saved Successfully`,
      'success',
      'toast'
    );
  };

  const handleUpdateTransaction = async (
    updatedTx: TransactionRecord,
    saveCustomCategoryToProfile?: string
  ) => {
    if (isAccountOnHold) return;
    if (updatedTx.proofId && updatedTx.proofImageDataUrl) {
      saveProofImageLocally(updatedTx.proofId, updatedTx.proofImageDataUrl);
    }
    if (saveCustomCategoryToProfile && currentUser) {
      const updatedUser: UserAccount = {
        ...currentUser,
        customCategories: Array.from(
          new Set([...currentUser.customCategories, saveCustomCategoryToProfile])
        ),
      };
      const nextUsers = users.map((u) => (u.id === currentUser.id ? updatedUser : u));
      persistUsersChange(nextUsers);
    }

    if (isCloudSession && firebaseUser) {
      await saveCloudTransaction(firebaseUser.uid, updatedTx);
      setEditingTransaction(null);
      triggerFeedback(`Record #${updatedTx.id} Updated Successfully`, 'success', 'toast');
      return;
    }

    const nextTransactions = vault.transactions.map((t) =>
      t.id === updatedTx.id ? updatedTx : t
    );
    const nextExpected = vault.expectedItems.map((e) => {
      if (e.linkedTransactionId !== updatedTx.id) return e;
      const isSplitExpected =
        e.customCategory === 'Split Bill Share' || e.title.startsWith('Split Bill:');
      if (isSplitExpected) {
        return {
          ...e,
          title: `Split Bill: ${updatedTx.title}`,
          amount:
            updatedTx.isSplit && updatedTx.splitAmount && updatedTx.splitAmount > 0
              ? updatedTx.splitAmount
              : e.amount,
          date: updatedTx.date,
          dueDate: updatedTx.splitReturnDate || e.dueDate,
        };
      }
      return {
        ...e,
        title: `${updatedTx.title} (From Ledger Record)`,
        amount: updatedTx.amount,
        date: updatedTx.date,
        status: updatedTx.status === 'settled' ? ('settled' as const) : ('pending' as const),
      };
    });

    persistVaultChange({
      ...vault,
      transactions: nextTransactions,
      expectedItems: nextExpected,
    });
    setEditingTransaction(null);
    triggerFeedback(`Record #${updatedTx.id} Updated Successfully`, 'success', 'toast');
  };

  const handleAttachProofToExistingTx = async (txId: string, file: File) => {
    if (isAccountOnHold) return;
    const generatedProofId = `PRF-${Date.now().toString().slice(-6)}`;
    try {
      // High-Definition 1400px @ 0.90 quality so small letters on receipts stay readable when zoomed in PDF
      const dataUrl = await compressImageFileToDataUrl(file, 1400, 0.9);
      saveProofImageLocally(generatedProofId, dataUrl);
      const updatedTxs = vault.transactions.map((t) =>
        t.id === txId
          ? {
              ...t,
              proofId: generatedProofId,
              proofImageName: file.name,
              proofImageDataUrl: dataUrl,
            }
          : t
      );
      persistVaultChange({
        ...vault,
        transactions: updatedTxs,
      });
      triggerFeedback('HD Proof Image Uploaded Successfully', 'success', 'toast');
    } catch {
      triggerFeedback('Failed to Upload Proof Image', 'error', 'toast');
    }
  };

  const handleDeleteProofFromTransaction = (tx: TransactionRecord) => {
    if (isAccountOnHold || !tx.proofId) return;
    // Move proof reference to Recycle Bin without duplicating the image dataUrl
    const nextBin = pushToRecycleBin(vault.recycleBin, {
      itemType: 'proof_image',
      originalId: tx.proofId,
      title: `Proof ${tx.proofId} for ${tx.title} (#${tx.id})`,
      subtitle: tx.proofImageName || `Attached to Record #${tx.id}`,
      proofRestoreTargetTxId: tx.id,
      proofId: tx.proofId,
      proofImageName: tx.proofImageName,
    });
    const updatedTxs = vault.transactions.map((t) =>
      t.id === tx.id
        ? {
            ...t,
            proofId: undefined,
            proofImageName: undefined,
            proofImageDataUrl: undefined,
          }
        : t
    );
    persistVaultChange({
      ...vault,
      transactions: updatedTxs,
      recycleBin: nextBin,
    });
    setPreviewProofTx(null);
    triggerFeedback('Proof Image Moved to Recycle Bin', 'success', 'toast');
  };

  const handleDeleteTransaction = async (id: string) => {
    if (isAccountOnHold) return;
    const target = vault.transactions.find((t) => t.id === id);
    if (isCloudSession) {
      await deleteCloudTransaction(id);
      triggerFeedback(`Record #${id} Moved to Recycle Bin`, 'success', 'toast');
      return;
    }
    // Keep proof image in localVaultStorage by proofId reference so moving to Recycle Bin does not duplicate data
    const lightweightTxPayload: TransactionRecord | null = target
      ? {
          ...target,
          proofImageDataUrl: undefined,
        }
      : null;

    const nextBin = lightweightTxPayload
      ? pushToRecycleBin(vault.recycleBin, {
          itemType: 'transaction',
          originalId: target!.id,
          title: `#${target!.id} · ${target!.title}`,
          subtitle: `${target!.date} · ${currentUser?.currency || '₹'}${target!.amount.toLocaleString()}${
            target!.proofId ? ` · Proof: ${target!.proofId}` : ''
          }`,
          transaction: lightweightTxPayload,
          proofId: target!.proofId,
        })
      : vault.recycleBin;

    persistVaultChange({
      ...vault,
      transactions: vault.transactions.filter((t) => t.id !== id),
      expectedItems: vault.expectedItems.filter((e) => e.linkedTransactionId !== id),
      recycleBin: nextBin,
    });
    triggerFeedback(`Record #${id} Moved to Recycle Bin`, 'success', 'toast');
  };

  const handleSettleTransaction = async (id: string) => {
    if (isAccountOnHold) return;
    if (isCloudSession) {
      await settleCloudTransaction(id);
      triggerFeedback('Transaction Marked as Settled', 'success', 'toast');
      return;
    }
    persistVaultChange({
      ...vault,
      transactions: vault.transactions.map((t) =>
        t.id === id ? { ...t, status: 'settled' } : t
      ),
    });
    triggerFeedback('Transaction Marked as Settled', 'success', 'toast');
  };

  // People & Expected Items Handlers
  const handleAddPerson = (personInput: Omit<PersonProfile, 'id'>): PersonProfile => {
    const created: PersonProfile = {
      ...personInput,
      id: `person-${Date.now()}`,
    };
    if (isCloudSession && firebaseUser) {
      saveCloudPerson(firebaseUser.uid, created);
    } else {
      persistVaultChange({
        ...vault,
        people: [...vault.people, created],
      });
    }
    return created;
  };

  const handleDeletePerson = async (personId: string) => {
    if (isAccountOnHold) return;
    const targetPerson = vault.people.find((p) => p.id === personId);
    if (isCloudSession) {
      await deleteCloudPerson(personId);
      return;
    }
    const nextBin = targetPerson
      ? pushToRecycleBin(vault.recycleBin, {
          itemType: 'person',
          originalId: targetPerson.id,
          title: targetPerson.name,
          subtitle: `${targetPerson.relationship}${targetPerson.phone ? ` · ${targetPerson.phone}` : ''}`,
          person: targetPerson,
        })
      : vault.recycleBin;

    persistVaultChange({
      ...vault,
      people: vault.people.filter((p) => p.id !== personId),
      expectedItems: vault.expectedItems.filter((e) => e.personId !== personId),
      transactions: vault.transactions.map((t) =>
        t.personId === personId ? { ...t, personId: undefined } : t
      ),
      recycleBin: nextBin,
    });
    triggerFeedback('Person Moved to Recycle Bin', 'success', 'toast');
  };

  const handleQuickAddPerson = (
    name: string,
    relationship: PersonProfile['relationship'],
    customRelationship?: string
  ): PersonProfile => {
    return handleAddPerson({ name, relationship, customRelationship });
  };

  const handleBlockPerson = async (personId: string, reason: string) => {
    if (isAccountOnHold) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    const updatedPeople = vault.people.map((p) =>
      p.id === personId
        ? {
            ...p,
            isBlocked: true,
            blockReason: reason,
            blockedAt: todayIso,
          }
        : p
    );
    const targetPerson = updatedPeople.find((p) => p.id === personId);
    if (isCloudSession && firebaseUser && targetPerson) {
      await saveCloudPerson(firebaseUser.uid, targetPerson);
    }
    persistVaultChange({
      ...vault,
      people: updatedPeople,
    });
  };

  const handleUnblockPerson = async (personId: string) => {
    if (isAccountOnHold) return;
    const updatedPeople = vault.people.map((p) =>
      p.id === personId
        ? {
            ...p,
            isBlocked: false,
            blockReason: undefined,
            blockedAt: undefined,
          }
        : p
    );
    const targetPerson = updatedPeople.find((p) => p.id === personId);
    if (isCloudSession && firebaseUser && targetPerson) {
      await saveCloudPerson(firebaseUser.uid, targetPerson);
    }
    persistVaultChange({
      ...vault,
      people: updatedPeople,
    });
  };

  const handleAddExpectedManual = async (itemInput: Omit<ExpectedItem, 'id'>) => {
    if (isAccountOnHold) return;
    const created: ExpectedItem = {
      ...itemInput,
      id: `exp-${Date.now()}`,
    };
    if (isCloudSession && firebaseUser) {
      await saveCloudExpectedItem(firebaseUser.uid, created);
      return;
    }
    persistVaultChange({
      ...vault,
      expectedItems: [created, ...vault.expectedItems],
    });
  };

  const handleDeleteExpectedItem = async (itemId: string) => {
    if (isAccountOnHold) return;
    const targetItem = vault.expectedItems.find((i) => i.id === itemId);
    if (isCloudSession) {
      await deleteCloudExpectedItem(itemId);
      return;
    }
    const nextBin = targetItem
      ? pushToRecycleBin(vault.recycleBin, {
          itemType: 'expected_item',
          originalId: targetItem.id,
          title: targetItem.title,
          subtitle: `Due ${targetItem.dueDate} · ${currentUser?.currency || '₹'}${targetItem.amount.toLocaleString()}`,
          expectedItem: targetItem,
        })
      : vault.recycleBin;

    persistVaultChange({
      ...vault,
      expectedItems: vault.expectedItems.filter((i) => i.id !== itemId),
      recycleBin: nextBin,
    });
    triggerFeedback('Bill Item Moved to Recycle Bin', 'success', 'toast');
  };

  const handleLinkTransactionToPerson = async (
    txId: string,
    personId: string,
    dueDate: string
  ) => {
    if (isAccountOnHold) return;
    const targetTx = vault.transactions.find((t) => t.id === txId);
    if (!targetTx) return;

    const linkedExpected: ExpectedItem = {
      id: `exp-link-${Date.now()}`,
      personId,
      title: `${targetTx.title} (From Ledger Record)`,
      amount: targetTx.amount,
      settledAmount: targetTx.status === 'settled' ? targetTx.amount : 0,
      direction: targetTx.type === 'borrowing_in' ? 'borrowed_from' : 'expecting_from',
      category: targetTx.category,
      customCategory: targetTx.customCategory,
      date: targetTx.date,
      dueDate,
      linkedTransactionId: targetTx.id,
      status: targetTx.status === 'settled' ? 'settled' : 'pending',
    };

    if (isCloudSession && firebaseUser) {
      await saveCloudExpectedItem(firebaseUser.uid, linkedExpected);
      return;
    }

    const updatedTxs = vault.transactions.map((t) =>
      t.id === txId ? { ...t, personId, billable: true } : t
    );

    persistVaultChange({
      ...vault,
      transactions: updatedTxs,
      expectedItems: [linkedExpected, ...vault.expectedItems],
    });
  };

  // Unlink a transaction from Receivables & Payables WITHOUT deleting the main record from Records
  const handleUnlinkTransactionFromPerson = async (txId: string) => {
    if (isAccountOnHold) return;
    const targetTx = vault.transactions.find((t) => t.id === txId);
    if (!targetTx) return;

    const unlinkedTx: TransactionRecord = {
      ...targetTx,
      personId: undefined,
      billable: false,
    };

    if (isCloudSession && firebaseUser) {
      await saveCloudTransaction(firebaseUser.uid, unlinkedTx);
      const linkedExp = vault.expectedItems.find((e) => e.linkedTransactionId === txId);
      if (linkedExp) {
        await deleteCloudExpectedItem(linkedExp.id);
      }
      triggerFeedback(
        `Removed from Receivables & Payables (Record #${txId} kept in Main Records)`,
        'success',
        'toast'
      );
      return;
    }

    const updatedTxs = vault.transactions.map((t) => (t.id === txId ? unlinkedTx : t));
    const updatedExpected = vault.expectedItems.filter((e) => e.linkedTransactionId !== txId);
    const updatedGroups = (vault.personRecordGroups || [])
      .map((g) => ({
        ...g,
        recordIds: (g.recordIds || []).filter((rid: string) => rid !== txId),
        itemIds: (g.itemIds || []).filter((rid: string) => rid !== txId),
      }))
      .filter(
        (g) => (g.recordIds || []).length > 0 || (g.itemIds || []).length > 0
      );

    persistVaultChange({
      ...vault,
      transactions: updatedTxs,
      expectedItems: updatedExpected,
      personRecordGroups: updatedGroups,
    });
    triggerFeedback(
      `Removed from Receivables & Payables (Record #${txId} kept in Main Records)`,
      'success',
      'toast'
    );
  };

  const handleSettleExpectedItem = async (
    itemId: string,
    amountPaid: number,
    depositAccountId?: string
  ) => {
    if (isAccountOnHold) return;
    const target = vault.expectedItems.find((i) => i.id === itemId);
    if (!target) return;

    const nextSettled = Math.min(target.amount, target.settledAmount + amountPaid);
    const nextStatus =
      nextSettled >= target.amount ? ('settled' as const) : ('partial' as const);

    const allocated = allocateNextRecordId(vault);
    const settlementTx: TransactionRecord = {
      id: allocated.recordId,
      date: new Date().toISOString().slice(0, 10),
      title: `Settlement Received: ${target.title}`,
      amount: amountPaid,
      type: 'income',
      category: 'Loan Repayment Expected',
      accountId: depositAccountId || vault.accounts[0]?.id || 'acc-default',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      personId: target.personId,
      status: 'completed',
    };

    if (isCloudSession && firebaseUser) {
      await updateCloudExpectedSettlement(itemId, nextSettled, nextStatus);
      await saveCloudTransaction(firebaseUser.uid, settlementTx);
      return;
    }

    const updatedItems = vault.expectedItems.map((i) =>
      i.id === itemId ? { ...i, settledAmount: nextSettled, status: nextStatus } : i
    );

    persistVaultChange({
      ...vault,
      nextRecordNumber: allocated.nextRecordNumber,
      expectedItems: updatedItems,
      transactions: [settlementTx, ...vault.transactions],
    });
  };

  const handleUpdateExpectedItem = async (updatedItem: ExpectedItem) => {
    if (isAccountOnHold) return;
    if (isCloudSession && firebaseUser) {
      await saveCloudExpectedItem(firebaseUser.uid, updatedItem);
      return;
    }
    const nextItems = vault.expectedItems.map((i) =>
      i.id === updatedItem.id ? updatedItem : i
    );
    persistVaultChange({
      ...vault,
      expectedItems: nextItems,
    });
  };

  const handleAttachProofToRecord = async (
    recordId: string,
    sourceType: 'expected_item' | 'linked_transaction',
    file: File
  ) => {
    if (isAccountOnHold) return;
    const proofImageDataUrl = await compressImageFileToDataUrl(file);
    const proofImageName = file.name;
    const proofId = `proof-${recordId}-${Date.now()}`;
    saveProofImageLocally(proofId, proofImageDataUrl);
    if (sourceType === 'expected_item') {
      const nextItems = vault.expectedItems.map((item) =>
        item.id === recordId
          ? {
              ...item,
              proofId,
              proofImageName,
              proofImageDataUrl,
            }
          : item
      );
      persistVaultChange({
        ...vault,
        expectedItems: nextItems,
      });
    } else {
      const nextTxs = vault.transactions.map((tx) =>
        tx.id === recordId
          ? {
              ...tx,
              proofId,
              proofImageName,
              proofImageDataUrl,
            }
          : tx
      );
      persistVaultChange({
        ...vault,
        transactions: nextTxs,
      });
    }
  };

  const handleAdjustRecordSettlementStatus = async (
    payload: RecordSettlementAdjustmentPayload
  ) => {
    if (isAccountOnHold) return;
    const targetAccountId =
      payload.selectedAccountId || vault.accounts[0]?.id || 'acc-default';

    const recordId = payload.recordId;
    const isExpectedItem = payload.sourceType === 'expected_item';
    const targetStatus = payload.targetStatus;
    const requestedSettled = payload.newSettledAmount;

    if (isExpectedItem) {
      const target = vault.expectedItems.find((i) => i.id === recordId);
      if (!target) return;

      const clampedSettled =
        targetStatus === 'pending'
          ? 0
          : targetStatus === 'settled'
            ? target.amount
            : Math.max(0, Math.min(target.amount, requestedSettled));

      const nextStatus: ExpectedItem['status'] =
        clampedSettled <= 0
          ? 'pending'
          : clampedSettled >= target.amount
            ? 'settled'
            : 'partial';

      const isPayableDirection =
        target.direction === 'borrowed_from' || Boolean(payload.isPayable);

      const settlementTitlePrefix = isPayableDirection
        ? `Payable Settled: ${target.title}`
        : `Settlement Received: ${target.title}`;

      const existingSettlementTx = vault.transactions.find(
        (t) =>
          t.personId === target.personId &&
          (t.title === `Settlement Received: ${target.title}` ||
            t.title === `Payable Settled: ${target.title}`)
      );

      let nextTransactions = [...vault.transactions];
      let nextRecordNumber = vault.nextRecordNumber;

      if (clampedSettled <= 0) {
        if (existingSettlementTx) {
          nextTransactions = nextTransactions.filter(
            (t) => t.id !== existingSettlementTx.id
          );
        }
      } else if (existingSettlementTx) {
        nextTransactions = nextTransactions.map((t) =>
          t.id === existingSettlementTx.id
            ? {
                ...t,
                amount: clampedSettled,
                accountId: targetAccountId,
                type: isPayableDirection ? 'expense' : 'income',
                status: 'settled',
                settledAmount: clampedSettled,
              }
            : t
        );
      } else {
        const allocated = allocateNextRecordId(vault);
        nextRecordNumber = allocated.nextRecordNumber;
        const settlementTx: TransactionRecord = {
          id: allocated.recordId,
          date: new Date().toISOString().slice(0, 10),
          title: settlementTitlePrefix,
          amount: clampedSettled,
          settledAmount: clampedSettled,
          type: isPayableDirection ? 'expense' : 'income',
          category: isPayableDirection
            ? 'Borrowed / Payable Due'
            : 'Loan Repayment Expected',
          accountId: targetAccountId,
          paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
          personId: target.personId,
          status: 'settled',
        };
        nextTransactions = [settlementTx, ...nextTransactions];
      }

      const updatedItems = vault.expectedItems.map((i) =>
        i.id === recordId
          ? { ...i, settledAmount: clampedSettled, status: nextStatus }
          : i
      );

      persistVaultChange({
        ...vault,
        nextRecordNumber,
        expectedItems: updatedItems,
        transactions: nextTransactions,
      });
      return;
    }

    // Linked TransactionRecord adjustment
    const targetTx = vault.transactions.find((t) => t.id === recordId);
    if (!targetTx) return;

    const clampedSettled =
      targetStatus === 'pending'
        ? 0
        : targetStatus === 'settled'
          ? targetTx.amount
          : Math.max(0, Math.min(targetTx.amount, requestedSettled));

    const nextTxStatus: TransactionRecord['status'] =
      clampedSettled <= 0
        ? 'expected'
        : clampedSettled >= targetTx.amount
          ? 'settled'
          : 'partial';

    const nextTransactions = vault.transactions.map((t) =>
      t.id === recordId
        ? {
            ...t,
            accountId: targetAccountId || t.accountId,
            settledAmount: clampedSettled,
            status: nextTxStatus,
          }
        : t
    );

    persistVaultChange({
      ...vault,
      transactions: nextTransactions,
    });
  };

  const handleUpdatePersonRecordGroups = (
    groups: PersonRecordGroup[],
    bulkStatusUpdates?: {
      expectedItemIds: string[];
      transactionIds: string[];
      markPaid: boolean;
    }
  ) => {
    if (isAccountOnHold) return;
    let nextExpectedItems = vault.expectedItems;
    let nextTransactions = vault.transactions;

    if (bulkStatusUpdates) {
      const { expectedItemIds, transactionIds, markPaid } = bulkStatusUpdates;
      if (expectedItemIds.length > 0) {
        nextExpectedItems = nextExpectedItems.map((item) =>
          expectedItemIds.includes(item.id)
            ? {
                ...item,
                settledAmount: markPaid ? item.amount : 0,
                status: markPaid ? ('settled' as const) : ('pending' as const),
              }
            : item
        );
      }
      if (transactionIds.length > 0) {
        nextTransactions = nextTransactions.map((tx) =>
          transactionIds.includes(tx.id)
            ? {
                ...tx,
                settledAmount: markPaid ? tx.amount : 0,
                status: markPaid ? ('settled' as const) : ('expected' as const),
              }
            : tx
        );
      }
    }

    persistVaultChange({
      ...vault,
      personRecordGroups: groups,
      expectedItems: nextExpectedItems,
      transactions: nextTransactions,
    });
  };

  // Dream Vault Handlers
  const handleAddDreamVault = async (vaultInput: Omit<DreamVault, 'id'>) => {
    if (isAccountOnHold) return;
    const created: DreamVault = {
      ...vaultInput,
      id: `dream-${Date.now()}`,
    };
    if (isCloudSession && firebaseUser) {
      await saveCloudDreamVault(firebaseUser.uid, created);
      return;
    }
    persistVaultChange({
      ...vault,
      dreamVaults: [...vault.dreamVaults, created],
    });
  };

  const handleUpdateDreamVault = async (updatedVault: DreamVault) => {
    if (isAccountOnHold) return;
    if (isCloudSession && firebaseUser) {
      await saveCloudDreamVault(firebaseUser.uid, updatedVault);
    }
    persistVaultChange({
      ...vault,
      dreamVaults: vault.dreamVaults.map((v) => (v.id === updatedVault.id ? updatedVault : v)),
    });
  };

  const handleDeleteDreamVault = async (vaultId: string) => {
    if (isAccountOnHold) return;
    const targetDream = vault.dreamVaults.find((v) => v.id === vaultId);
    if (isCloudSession) {
      await deleteCloudDreamVault(vaultId);
      return;
    }
    const nextBin = targetDream
      ? pushToRecycleBin(vault.recycleBin, {
          itemType: 'dream_vault',
          originalId: targetDream.id,
          title: targetDream.name,
          subtitle: `${targetDream.storageType} · Saved: ${currentUser?.currency || '₹'}${targetDream.currentAmount.toLocaleString()}`,
          dreamVault: targetDream,
        })
      : vault.recycleBin;

    persistVaultChange({
      ...vault,
      dreamVaults: vault.dreamVaults.filter((v) => v.id !== vaultId),
      recycleBin: nextBin,
    });
    triggerFeedback('Dream Vault Moved to Recycle Bin', 'success', 'toast');
  };

  const handleContributeToDreamVault = async (
    vaultId: string,
    amount: number,
    fromAccountId: string
  ) => {
    if (isAccountOnHold) return;
    const targetVault = vault.dreamVaults.find((v) => v.id === vaultId);
    if (!targetVault) return;

    const allocated = allocateNextRecordId(vault);
    const newTx: TransactionRecord = {
      id: allocated.recordId,
      date: new Date().toISOString().slice(0, 10),
      title: `Dream Storage Allocation: ${targetVault.name}`,
      amount,
      type: 'dream_investment',
      category:
        targetVault.storageType === 'Other' ? 'Other' : 'Dream Home Corpus',
      customCategory:
        targetVault.storageType === 'Other' ? targetVault.customStorageType : undefined,
      accountId: fromAccountId,
      dreamVaultId: vaultId,
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      status: 'completed',
    };

    if (isCloudSession && firebaseUser) {
      await updateCloudDreamVaultAmount(vaultId, targetVault.currentAmount + amount);
      await saveCloudTransaction(firebaseUser.uid, newTx);
      return;
    }

    const updatedDreams = vault.dreamVaults.map((v) =>
      v.id === vaultId ? { ...v, currentAmount: v.currentAmount + amount } : v
    );

    persistVaultChange({
      ...vault,
      nextRecordNumber: allocated.nextRecordNumber,
      dreamVaults: updatedDreams,
      transactions: [newTx, ...vault.transactions],
    });
  };

  // Recycle Bin Restore & Permanent Purge Handlers
  const handleRestoreRecycleEntry = (recycleId: string) => {
    if (isAccountOnHold) return;
    const entry = (vault.recycleBin || []).find((b) => b.recycleId === recycleId);
    if (!entry) return;
    const remainingBin = (vault.recycleBin || []).filter((b) => b.recycleId !== recycleId);

    if (entry.itemType === 'transaction' && entry.transaction) {
      const restoredTx = entry.transaction;
      const proofUrl = loadProofImageLocally(restoredTx.proofId);
      const fullTx: TransactionRecord = {
        ...restoredTx,
        proofImageDataUrl: proofUrl || restoredTx.proofImageDataUrl,
      };
      persistVaultChange({
        ...vault,
        transactions: [fullTx, ...vault.transactions.filter((t) => t.id !== fullTx.id)],
        recycleBin: remainingBin,
      });
      triggerFeedback(`Restored Record #${fullTx.id} from Recycle Bin`, 'success', 'toast');
      return;
    }

    if (entry.itemType === 'proof_image' && entry.proofId && entry.proofRestoreTargetTxId) {
      const proofUrl = loadProofImageLocally(entry.proofId);
      persistVaultChange({
        ...vault,
        transactions: vault.transactions.map((t) =>
          t.id === entry.proofRestoreTargetTxId
            ? {
                ...t,
                proofId: entry.proofId,
                proofImageName: entry.proofImageName,
                proofImageDataUrl: proofUrl,
              }
            : t
        ),
        recycleBin: remainingBin,
      });
      triggerFeedback(`Restored Proof Image ${entry.proofId}`, 'success', 'toast');
      return;
    }

    if (entry.itemType === 'account' && entry.account) {
      const restoredAcc = entry.account;
      persistVaultChange({
        ...vault,
        accounts: [...vault.accounts.filter((a) => a.id !== restoredAcc.id), restoredAcc],
        recycleBin: remainingBin,
      });
      triggerFeedback(`Restored Account "${restoredAcc.name}"`, 'success', 'toast');
      return;
    }

    if (entry.itemType === 'person' && entry.person) {
      const restoredPerson = entry.person;
      persistVaultChange({
        ...vault,
        people: [...vault.people.filter((p) => p.id !== restoredPerson.id), restoredPerson],
        recycleBin: remainingBin,
      });
      triggerFeedback(`Restored Person "${restoredPerson.name}"`, 'success', 'toast');
      return;
    }

    if (entry.itemType === 'expected_item' && entry.expectedItem) {
      const restoredItem = entry.expectedItem;
      persistVaultChange({
        ...vault,
        expectedItems: [restoredItem, ...vault.expectedItems.filter((i) => i.id !== restoredItem.id)],
        recycleBin: remainingBin,
      });
      triggerFeedback(`Restored Bill Item "${restoredItem.title}"`, 'success', 'toast');
      return;
    }

    if (entry.itemType === 'dream_vault' && entry.dreamVault) {
      const restoredDream = entry.dreamVault;
      persistVaultChange({
        ...vault,
        dreamVaults: [...vault.dreamVaults.filter((d) => d.id !== restoredDream.id), restoredDream],
        recycleBin: remainingBin,
      });
      triggerFeedback(`Restored Dream Vault "${restoredDream.name}"`, 'success', 'toast');
      return;
    }

    if (entry.itemType === 'recurring_payment' && entry.recurringPayment) {
      const restoredRec = entry.recurringPayment;
      const currentRecurring = vault.recurringPayments || [];
      persistVaultChange({
        ...vault,
        recurringPayments: [
          ...currentRecurring.filter((r) => r.id !== restoredRec.id),
          restoredRec,
        ],
        recycleBin: remainingBin,
      });
      triggerFeedback(`Restored Recurring Payment "${restoredRec.title}"`, 'success', 'toast');
      return;
    }

    if (entry.itemType === 'loan' && entry.loan) {
      const restoredLoan = entry.loan;
      const currentLoans = vault.loans || [];
      persistVaultChange({
        ...vault,
        loans: [...currentLoans.filter((l) => l.id !== restoredLoan.id), restoredLoan],
        recycleBin: remainingBin,
      });
      triggerFeedback(`Restored Loan "${restoredLoan.name}"`, 'success', 'toast');
    }
  };

  // Recurring & Compulsory Payments Engine Handlers
  const handleAddOrUpdateRecurring = (
    item: RecurringPaymentItem,
    previousStatus?: RecurringPaymentStatus
  ) => {
    if (isAccountOnHold) return;
    const currentRecurring = vault.recurringPayments || [];
    const exists = currentRecurring.some((r) => r.id === item.id);
    let nextTransactions = [...vault.transactions];
    let nextRecordNumber = vault.nextRecordNumber;
    let finalItem = { ...item };

    // If newly set to "Already Paid" / "Credited" (and wasn't already settled), update linked bank account and log in Records
    if (item.status === 'already_paid' && previousStatus !== 'already_paid') {
      const allocated = allocateNextRecordId({ ...vault, nextRecordNumber });
      nextRecordNumber = allocated.nextRecordNumber;
      const todayIso = new Date().toISOString().slice(0, 10);
      const isIncomeItem = item.flowType === 'income';
      const settledTx: TransactionRecord = {
        id: allocated.recordId,
        date: todayIso,
        title: isIncomeItem
          ? `Recurring Income: ${item.title} (${item.frequency})`
          : `Recurring Payment: ${item.title} (${item.frequency})`,
        amount: item.amount,
        type: isIncomeItem ? 'income' : 'expense',
        category: item.category || (isIncomeItem ? 'Salary & Payroll' : 'Utilities & Bills'),
        accountId: item.linkedAccountId,
        paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
        status: 'completed',
        isRegularMonthly: item.frequency === 'Monthly',
        linkedRecurringId: item.id,
        notes:
          item.notes ||
          (isIncomeItem
            ? `Credited ${item.frequency} recurring income`
            : `Scheduled ${item.frequency} compulsory payment`),
      };
      nextTransactions = [settledTx, ...nextTransactions];
      finalItem = {
        ...finalItem,
        lastPaidTransactionId: settledTx.id,
        lastPaidDate: todayIso,
      };
    } else if (item.status === 'will_be_debited' && previousStatus === 'already_paid') {
      if (item.lastPaidTransactionId) {
        nextTransactions = nextTransactions.filter((t) => t.id !== item.lastPaidTransactionId);
      }
      finalItem = {
        ...finalItem,
        lastPaidTransactionId: undefined,
        lastPaidDate: undefined,
      };
    }

    const updatedRecurring = exists
      ? currentRecurring.map((r) => (r.id === finalItem.id ? finalItem : r))
      : [finalItem, ...currentRecurring];

    persistVaultChange({
      ...vault,
      nextRecordNumber,
      transactions: nextTransactions,
      recurringPayments: updatedRecurring,
    });

    triggerFeedback(
      finalItem.status === 'already_paid' && previousStatus !== 'already_paid'
        ? finalItem.flowType === 'income'
          ? 'Recurring Income Credited to Account'
          : 'Recurring Payment Settled & Deducted from Account'
        : exists
        ? 'Recurring Item Updated'
        : 'Recurring Item Added',
      'success',
      'toast'
    );
  };

  const handleToggleRecurringStatus = (
    itemId: string,
    targetStatus: RecurringPaymentStatus
  ) => {
    if (isAccountOnHold) return;
    const currentRecurring = vault.recurringPayments || [];
    const targetItem = currentRecurring.find((r) => r.id === itemId);
    if (!targetItem || targetItem.status === targetStatus) return;

    handleAddOrUpdateRecurring(
      {
        ...targetItem,
        status: targetStatus,
      },
      targetItem.status
    );
  };

  const handleDeleteRecurring = (itemId: string) => {
    if (isAccountOnHold) return;
    const currentRecurring = vault.recurringPayments || [];
    const targetItem = currentRecurring.find((r) => r.id === itemId);
    if (!targetItem) return;

    const nextBin = pushToRecycleBin(vault.recycleBin, {
      itemType: 'recurring_payment',
      originalId: targetItem.id,
      title: `${targetItem.title} (${targetItem.frequency})`,
      subtitle: `${currentUser?.currency || '₹'}${targetItem.amount.toLocaleString()} · Status: ${
        targetItem.status === 'already_paid' ? 'Already Paid' : 'Will Be Debited'
      }`,
      recurringPayment: targetItem,
    });

    persistVaultChange({
      ...vault,
      recurringPayments: currentRecurring.filter((r) => r.id !== itemId),
      recycleBin: nextBin,
    });
    triggerFeedback('Recurring Payment Moved to Recycle Bin', 'success', 'toast');
  };

  // Loans & EMI Amortization Tracker Handlers
  const handleSaveLoan = (loan: LoanRecord, isEdit: boolean) => {
    if (isAccountOnHold) return;
    const currentLoans = vault.loans || [];
    const updatedLoans = isEdit
      ? currentLoans.map((l) => (l.id === loan.id ? loan : l))
      : [loan, ...currentLoans];

    persistVaultChange({
      ...vault,
      loans: updatedLoans,
    });
    triggerFeedback(
      isEdit
        ? `Loan "${loan.name}" Updated & Schedule Recalculated`
        : `Loan "${loan.name}" Created with Amortization Schedule`,
      'success',
      'toast'
    );
  };

  const handleDeleteLoan = (loanId: string) => {
    if (isAccountOnHold) return;
    const currentLoans = vault.loans || [];
    const targetLoan = currentLoans.find((l) => l.id === loanId);
    if (!targetLoan) return;

    const nextBin = pushToRecycleBin(vault.recycleBin, {
      itemType: 'loan',
      originalId: targetLoan.id,
      title: `${targetLoan.name} (${targetLoan.category})`,
      subtitle: `Principal: ${currentUser?.currency || '₹'}${targetLoan.principalAmount.toLocaleString()} · ${targetLoan.interestRateAnnual}% p.a.`,
      loan: targetLoan,
    });

    persistVaultChange({
      ...vault,
      loans: currentLoans.filter((l) => l.id !== loanId),
      recycleBin: nextBin,
    });
    triggerFeedback('Loan Moved to Recycle Bin', 'success', 'toast');
  };

  const handleExecuteEmiPayment = (payload: {
    loanId: string;
    installmentNumber: number;
    monthYear: string;
    accountId: string;
    actualAmountPaid: number;
  }) => {
    if (isAccountOnHold) return;
    const currentLoans = vault.loans || [];
    const targetLoan = currentLoans.find((l) => l.id === payload.loanId);
    if (!targetLoan) return;

    const allocated = allocateNextRecordId(vault);
    const todayIso = new Date().toISOString().slice(0, 10);
    const emiTx: TransactionRecord = {
      id: allocated.recordId,
      date: todayIso,
      title: `EMI Payment: ${targetLoan.name} (Installment #${payload.installmentNumber} - ${payload.monthYear})`,
      amount: payload.actualAmountPaid,
      type: 'expense',
      category: 'Utilities & Bills',
      accountId: payload.accountId,
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      status: 'completed',
      isRegularMonthly: true,
      notes: `${targetLoan.category} EMI #${payload.installmentNumber} (${payload.monthYear})`,
    };

    const existingPayments = (targetLoan.payments || []).filter(
      (p) => p.installmentNumber !== payload.installmentNumber
    );
    const updatedLoan: LoanRecord = {
      ...targetLoan,
      status: 'In Progress',
      payments: [
        ...existingPayments,
        {
          installmentNumber: payload.installmentNumber,
          paidDate: todayIso,
          actualAmountPaid: payload.actualAmountPaid,
          accountId: payload.accountId,
          transactionId: emiTx.id,
        },
      ],
    };

    persistVaultChange({
      ...vault,
      nextRecordNumber: allocated.nextRecordNumber,
      transactions: [emiTx, ...vault.transactions],
      loans: currentLoans.map((l) => (l.id === updatedLoan.id ? updatedLoan : l)),
    });

    triggerFeedback(
      `EMI #${payload.installmentNumber} Paid (${currentUser?.currency || '₹'}${payload.actualAmountPaid.toLocaleString()}) & Schedule Updated`,
      'success',
      'toast'
    );
  };

  const handleExecutePaidEmiFromRecords = (params: {
    loanId: string;
    fundingAccountId: string;
    destinationLoanAccountId?: string;
    amount: number;
    paymentDate: string;
    title: string;
    notes?: string;
    markAsPaidInLoanSection?: boolean;
  }) => {
    if (isAccountOnHold) return;
    const currentLoans = vault.loans || [];
    const targetLoan = currentLoans.find((l) => l.id === params.loanId);
    const allocated = allocateNextRecordId(vault);
    const destAcc = vault.accounts.find((a) => a.id === params.destinationLoanAccountId);
    const isCashDirect = params.fundingAccountId === 'CASH_DIRECT';
    const shouldSyncLoan = params.markAsPaidInLoanSection !== false;

    const emiTx: TransactionRecord = {
      id: allocated.recordId,
      date: params.paymentDate,
      title: params.title,
      amount: params.amount,
      type: 'expense',
      category: 'Utilities & Bills',
      accountId: params.fundingAccountId,
      paymentMethod: isCashDirect
        ? 'Physical Cash'
        : 'Bank Transfer (ACH / NEFT / Wire)',
      status: 'completed',
      isRegularMonthly: true,
      isPaidEmi: true,
      linkedLoanId: params.loanId,
      destinationLoanAccountId: params.destinationLoanAccountId,
      notes:
        params.notes ||
        `Paid EMI for ${targetLoan?.name || 'Loan'}${destAcc ? ` → ${destAcc.name}` : ''}`,
    };

    let updatedLoans = currentLoans;
    if (targetLoan && shouldSyncLoan) {
      const summary = calculateLoanAmortizationSchedule(targetLoan);
      const nextUpcomingRow =
        summary.rows.find((r) => r.status === 'Upcoming') ||
        summary.rows[summary.rows.length - 1];
      const nextInstallmentNum = nextUpcomingRow
        ? nextUpcomingRow.installmentNumber
        : (targetLoan.payments?.length || 0) + 1;
      const existingPayments = (targetLoan.payments || []).filter(
        (p) => p.installmentNumber !== nextInstallmentNum
      );
      const updatedLoan: LoanRecord = {
        ...targetLoan,
        status: 'In Progress',
        payments: [
          ...existingPayments,
          {
            installmentNumber: nextInstallmentNum,
            paidDate: params.paymentDate,
            actualAmountPaid: params.amount,
            accountId: params.fundingAccountId,
            transactionId: emiTx.id,
          },
        ],
      };
      updatedLoans = currentLoans.map((l) => (l.id === updatedLoan.id ? updatedLoan : l));
    }

    persistVaultChange({
      ...vault,
      nextRecordNumber: allocated.nextRecordNumber,
      transactions: [emiTx, ...vault.transactions],
      loans: updatedLoans,
    });

    triggerFeedback(
      shouldSyncLoan
        ? `Paid EMI Recorded (${currentUser?.currency || '₹'}${params.amount.toLocaleString()}) & Marked Paid in Loans`
        : `Paid EMI Recorded in Ledger (${currentUser?.currency || '₹'}${params.amount.toLocaleString()})`,
      'success',
      'toast'
    );
  };

  const handlePermanentlyDeleteRecycleEntry = (recycleId: string) => {
    if (isAccountOnHold) return;
    const target = (vault.recycleBin || []).find((b) => b.recycleId === recycleId);
    if (target) {
      if (target.itemType === 'transaction' && target.transaction?.proofId) {
        deleteProofImageLocally(target.transaction.proofId);
      } else if (target.itemType === 'proof_image' && target.proofId) {
        deleteProofImageLocally(target.proofId);
      }
    }
    persistVaultChange({
      ...vault,
      recycleBin: (vault.recycleBin || []).filter((b) => b.recycleId !== recycleId),
    });
    triggerFeedback('Item Permanently Purged from Recycle Bin', 'success', 'toast');
  };

  const handleEmptyRecycleBin = () => {
    if (isAccountOnHold) return;
    for (const entry of vault.recycleBin || []) {
      if (entry.itemType === 'transaction' && entry.transaction?.proofId) {
        deleteProofImageLocally(entry.transaction.proofId);
      } else if (entry.itemType === 'proof_image' && entry.proofId) {
        deleteProofImageLocally(entry.proofId);
      }
    }
    persistVaultChange({
      ...vault,
      recycleBin: [],
    });
    triggerFeedback('Recycle Bin Emptied', 'success', 'toast');
  };

  // 1. If no user is logged in, show the merged Front Landing Page first, then AuthGate when started
  if (!currentUser) {
    return (
      <>
        <ActionFeedbackOverlay
          feedback={feedbackState}
          onComplete={() => setFeedbackState(null)}
        />
        {!showAuthGate ? (
          <LandingPageView
            darkMode={darkMode}
            onSetDarkMode={setDarkMode}
            customHeroImageUrl={landingHeroImage}
            onStartApp={(mode) => {
              setAuthInitialMode(mode);
              setShowAuthGate(true);
            }}
          />
        ) : (
          <AuthGate
            users={users}
            initialMode={authInitialMode}
            onBackToLanding={() => setShowAuthGate(false)}
            onLogin={handleLogin}
            onGoogleLogin={handleGoogleLogin}
            onRegisterUser={(u, d, p, c, s) => handleRegisterUser(u, d, p, c, s, true)}
            onRequestForgotPassword={handleRequestForgotPassword}
            onUpdateUserSecurityState={handleUpdateUserSecurityState}
          />
        )}
      </>
    );
  }

  // 1b. If user or non-primary admin account has been Disabled by Admin:
  // Block viewing previous financial data; allow ONLY the Disabled Popup & Admin Support Chat window
  if (isAccountDisabled && currentUser.id !== 'user-admin') {
    return (
      <>
        <ActionFeedbackOverlay
          feedback={feedbackState}
          onComplete={() => setFeedbackState(null)}
        />
        <AccountDisabledGate
          user={currentUser}
          onSendMessageToAdmin={(msgText) => handleUserSendSupportMessage(currentUser.id, msgText)}
          onLogout={handleLogout}
        />
      </>
    );
  }

  // 2. If logged in as Admin, render the dedicated Admin Security & User Management Console
  if (currentUser.role === 'admin') {
    return (
      <>
        <ActionFeedbackOverlay
          feedback={feedbackState}
          onComplete={() => setFeedbackState(null)}
        />
        <AdminPortalView
          adminUser={currentUser}
          users={users}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          inactivityRemainingSeconds={inactivityRemainingSeconds}
          landingHeroImage={landingHeroImage}
          onUpdateLandingHeroImage={(dataUrl) => {
            setLandingHeroImage(dataUrl);
            saveLandingHeroImage(dataUrl);
            saveGlobalCloudConfig(dataUrl, pdfHeaderConfig);
          }}
          pdfHeaderConfig={pdfHeaderConfig}
          onSavePdfHeaderConfig={(cfg) => {
            setPdfHeaderConfig(cfg);
            savePdfHeaderConfig(cfg);
            saveGlobalCloudConfig(landingHeroImage, cfg);
          }}
          onGenerateTempPasswordForUser={handleGenerateTempPasswordForUser}
          onResolveForgotPasswordIssue={handleResolveForgotPasswordIssue}
          onUpdateAdminPassword={(newDisp, newPass, newAdminEmail) => {
            const updated: UserAccount = {
              ...currentUser,
              updatedAt: new Date().toISOString(),
              displayName: newDisp,
              passwordHash: hashSecretIrreversibly(newPass),
              email: newAdminEmail || currentUser.email || DEFAULT_PRIMARY_ADMIN_EMAIL,
              mustChangePassword: false,
              tempPassword: undefined,
              tempPasswordValidForFirstLogin: false,
              adminOtpHash: undefined,
              adminOtpExpiresAtMs: undefined,
            };
            const nextUsers = users.map((u) => (u.id === currentUser.id ? updated : u));
            persistUsersChange(nextUsers);
          }}
          onAdminCreateCustomer={(uName, dName, pass) =>
            handleRegisterUser(uName, dName, pass, '₹', false, false)
          }
          onAdminCreateAdmin={handleAdminCreateAdmin}
          onAdminUpdateAccountStatus={handleAdminUpdateAccountStatus}
          onAdminSendSupportMessage={handleAdminSendSupportMessage}
          onAdminCloseSupportIssue={handleAdminCloseSupportIssue}
          onAdminPermanentlyDeleteUser={handleAdminPermanentlyDeleteUser}
          onResetEntirePortal={handleResetEntirePortal}
          onTriggerFeedback={triggerFeedback}
          onLogout={() => void handleLogout(false)}
        />
      </>
    );
  }

  // 3. Logged in as Customer
  const isAdminPortal = false;
  const accentBtnClass = isAdminPortal
    ? 'bg-rose-600 hover:bg-rose-500 text-white'
    : 'bg-emerald-600 hover:bg-emerald-500 text-white';
  const accentTextClass = isAdminPortal
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-emerald-600 dark:text-emerald-400';

  const currency = currentUser.currency || '₹';

  // Filtered Transactions for Records Table
  const filteredTransactions = vault.transactions.filter((tx) => {
    if (selectedMonth !== 'ALL' && !tx.date.startsWith(selectedMonth)) return false;
    if (
      selectedAccountId !== 'ALL' &&
      tx.accountId !== selectedAccountId &&
      tx.toAccountId !== selectedAccountId
    ) {
      return false;
    }
    if (selectedTxType !== 'ALL' && tx.type !== selectedTxType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const cat = resolveFlexibleLabel(tx.category, tx.customCategory).toLowerCase();
      const matchTitle = tx.title.toLowerCase().includes(q);
      const matchCat = cat.includes(q);
      const matchNotes = (tx.notes || '').toLowerCase().includes(q);
      const matchId = tx.id.toLowerCase().includes(q) || (tx.proofId || '').toLowerCase().includes(q);
      if (!matchTitle && !matchCat && !matchNotes && !matchId) return false;
    }
    return true;
  });

  const handleDownloadRecordsPdf = (
    orientation?: 'portrait' | 'landscape',
    updatedCfg?: PdfHeaderImageConfig
  ) => {
    if (isAccountOnHold) return;
    const finalCfg = updatedCfg || pdfHeaderConfig;
    if (updatedCfg) {
      setPdfHeaderConfig(updatedCfg);
      savePdfHeaderConfig(updatedCfg);
      saveGlobalCloudConfig(landingHeroImage, updatedCfg);
    }
    generateLedgerRecordsPdf({
      transactions: filteredTransactions,
      accounts: vault.accounts,
      people: vault.people,
      currency,
      issuedBy: currentUser.displayName,
      role: currentUser.role,
      periodLabel: selectedMonth === 'ALL' ? 'All Time' : selectedMonth,
      headerConfig: finalCfg,
      orientation,
      triggerDownload: true,
    });
    triggerFeedback('HD PDF Report Generated Successfully', 'success', 'fullscreen');
  };

  const handleDownloadRecordsExcel = () => {
    if (isAccountOnHold) return;
    exportLedgerRecordsToExcel({
      transactions: filteredTransactions,
      accounts: vault.accounts,
      people: vault.people,
      currency,
      issuedBy: currentUser.displayName,
      periodLabel: selectedMonth === 'ALL' ? 'All Time' : selectedMonth,
    });
    triggerFeedback('Excel Ledger Downloaded Successfully', 'success', 'toast');
  };

  const availableMonths = generateAvailableMonthsFromJan2026(vault.transactions);

  // Dashboard Section 2 Summary Cards:
  // 1) Total Counted in All My Accounts
  // 2) Expected Money Coming In (100% synced with Receivables & Payables tab)
  // 3) The Money I Owe (100% synced with Receivables & Payables tab)
  // 4) The Loans (Active Loan & EMI Balance)
  // 5) Total Investments (FDs + Gold/MF/Goals)
  const dashboardSummaryCards = calculateDashboardSummaryCards(
    vault.accounts,
    vault.transactions,
    vault.expectedItems,
    vault.loans || [],
    vault.dreamVaults || [],
    vault.people || [],
    vault.personRecordGroups || []
  );

  const activeLoansOnDashboard = useMemo(
    () => (vault.loans || []).filter((l) => !l.archivedToHistory),
    [vault.loans]
  );

  // Show the On Hold Popup on login, on every browser refresh, or when Admin sends a new unread notice while on hold
  const shouldShowHoldPopup =
    isAccountOnHold &&
    (holdDismissedForLoadUserId !== currentUser.id || Boolean(currentUser.adminNoticeUnread));

  const TOP_NAV_TABS: Array<{
    id: ActiveSection;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: <Landmark className="w-3.5 h-3.5 shrink-0" />,
      badge: vault.accounts.length,
    },
    {
      id: 'records',
      label: 'Records',
      icon: <ReceiptText className="w-3.5 h-3.5 shrink-0" />,
      badge: vault.transactions.length,
    },
    {
      id: 'people',
      label: 'Receivables and Payables',
      icon: <Users className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: 'dreams',
      label: 'Investments and Dreams',
      icon: <Vault className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: 'loans',
      label: 'Loans and EMI',
      icon: <Calculator className="w-3.5 h-3.5 shrink-0" />,
      badge: (vault.loans || []).length,
    },
    {
      id: 'recycle',
      label: 'Recycle Bin',
      icon: <RotateCcw className="w-3.5 h-3.5 shrink-0" />,
      badge: (vault.recycleBin || []).length,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-3.5 h-3.5 shrink-0" />,
    },
  ];

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col"
      data-portal-role="customer-portal"
    >
      {/* Action Feedback Overlay */}
      <ActionFeedbackOverlay
        feedback={feedbackState}
        onComplete={() => setFeedbackState(null)}
      />

      {/* Account On Hold Popup */}
      <AccountHoldPopup
        user={currentUser}
        isOpen={shouldShowHoldPopup}
        onAcknowledgeOkay={(optionalMsg) => handleUserAcknowledgeHold(currentUser.id, optionalMsg)}
      />

      {/* User <-> Admin Support & Security Alert Chat Modal */}
      <UserSupportChatModal
        user={currentUser}
        isOpen={isSupportChatOpen}
        onClose={() => {
          setIsSupportChatOpen(false);
          if (currentUser.adminNoticeUnread) {
            handleUserDismissAdminNotice(currentUser.id);
          }
        }}
        onSendMessage={(msgText) => handleUserSendSupportMessage(currentUser.id, msgText)}
        onChangePasswordHere={() => setActiveSection('settings')}
      />

      {/* Compact Top Navigation Header Bar (Full-Width Workspace, No Left Sidebar) */}
      <header
        data-testid="top-navigation-header"
        className="relative z-30 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 no-print"
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
          {/* Upper Row: Brand Identity + Quick Actions + User Session Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-slate-100 dark:border-slate-800/80">
            <a
              href="#dashboard"
              onClick={(e) => {
                e.preventDefault();
                setActiveSection('dashboard');
              }}
              className={`flex items-center gap-2.5 text-base sm:text-lg font-bold tracking-tight whitespace-nowrap shrink-0 ${accentTextClass}`}
            >
              <img
                src={EXPENSE_TRACKER_SQUARE_ICON}
                alt="ExpenseTracker Icon"
                className="w-8 h-8 object-contain drop-shadow-xs shrink-0"
              />
              <img
                src={darkMode ? EXPENSE_TRACKER_FULL_LOGO_DARK : EXPENSE_TRACKER_FULL_LOGO}
                alt="ExpenseTracker Official Logo"
                className="h-6 sm:h-7 w-auto object-contain shrink-0"
              />
            </a>

            {/* Right Utility Controls */}
            <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
              {inactivityRemainingSeconds <= 60 && (
                <span
                  data-testid="inactivity-countdown-timer"
                  className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-mono font-extrabold text-[11px] animate-pulse flex items-center gap-1 shadow-sm whitespace-nowrap"
                >
                  ⏱ Auto-Logout: 00:{String(Math.max(0, inactivityRemainingSeconds)).padStart(2, '0')}
                </span>
              )}

              <PWAInstallButton compact />

              <button
                type="button"
                disabled={isAccountOnHold}
                onClick={() => {
                  if (!isAccountOnHold) {
                    setEditingTransaction(null);
                    setIsTxModalOpen(true);
                  }
                }}
                data-testid="top-new-record-btn"
                className={`px-3 sm:px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${accentBtnClass}`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Record</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSupportChatOpen(true)}
                data-testid="top-support-chat-btn"
                title="Admin Support Chat"
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquareWarning className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="hidden sm:inline">Support</span>
                {(currentUser.supportMessages || []).length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-bold">
                    {(currentUser.supportMessages || []).length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shrink-0"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                  {currentUser.displayName}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  @{currentUser.username}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void handleLogout(false)}
                data-testid="top-logout-btn"
                className="px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Log Off</span>
              </button>
            </div>
          </div>

          {/* Lower Row: Exact 8-Tab Top Navigation Bar */}
          <nav
            aria-label="Primary Workspace Navigation"
            data-testid="top-navigation-tabs"
            className="flex items-center gap-1 sm:gap-1.5 py-2 overflow-x-auto no-scrollbar"
          >
            {TOP_NAV_TABS.map((tab) => {
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(tab.id);
                    if (tab.id === 'records') {
                      setRecordsSubSection('logs');
                    }
                  }}
                  data-testid={`nav-tab-${tab.id}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {typeof tab.badge === 'number' && tab.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Top Banner ONLY when Account is On Hold OR has an unread Admin notice */}
      {(isAccountOnHold || Boolean(currentUser.adminNoticeUnread)) && (
        <div
          className={`px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 text-xs no-print ${
            isAccountOnHold
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-200'
              : 'bg-sky-500/15 border-sky-500/40 text-sky-900 dark:text-sky-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <PauseCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              {isAccountOnHold ? (
                <span className="font-bold">
                  Your account is currently ON HOLD (View-Only Mode). Saving, deleting, PDF/Excel conversion, and settings changes (except password) are disabled.
                </span>
              ) : (
                <span className="font-bold">
                  You have a notification / message from Admin Support.
                </span>
              )}
              {currentUser.holdReason && (
                <span className="ml-2 opacity-90">Reason: {currentUser.holdReason}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSupportChatOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <MessageSquareWarning className="w-3.5 h-3.5" />
              Admin Support Chat ({(currentUser.supportMessages || []).length})
            </button>
          </div>
        </div>
      )}

      {/* Full-Width Main Workspace Viewport (Maximized Horizontal Real Estate, No Left Sidebar) */}
      <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full min-w-0 mx-auto space-y-6 overflow-x-hidden">
        {/* Period & Section Subheader (Only rendered on Dashboard and Records to avoid duplicate headers on subviews) */}
        {(activeSection === 'dashboard' || activeSection === 'records') && (
          <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                {activeSection === 'dashboard' && (
                  <>
                    <span>Dashboard</span>
                    <InfoTip text="Clean read-only overview of your Savings Accounts, Wallets, Core Financial Position, Investments & FD breakdown, visual analytics, and recurring commitments." />
                  </>
                )}
                {activeSection === 'records' && (
                  <>
                    <span>Records — Income &amp; Expenses</span>
                    <InfoTip text="Complete transaction ledger for Expenses, Income, and Transfers (Self Transfers & Paid EMIs), plus Recurring & Compulsory Payments." />
                  </>
                )}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Active Workspace: @{currentUser.username} · Currency: {currency}
              </p>
            </div>

            {activeSection === 'records' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="month-period-select"
                    className="text-xs font-bold text-slate-500 dark:text-slate-400"
                  >
                    Month (Jan 2026+):
                  </label>
                  <select
                    id="month-period-select"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    aria-label="Select Month Period"
                    className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white cursor-pointer"
                  >
                    <option value="ALL">All Time (Every Month)</option>
                    {availableMonths.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label} ({m.key})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMonth('ALL')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    selectedMonth === 'ALL'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900'
                  }`}
                >
                  All Time
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 1: DASHBOARD (Clean Read-Only Overview Mode with 3 Strict Visual Sections) */}
        {activeSection === 'dashboard' && (
          <div className="space-y-8" data-testid="dashboard-overview-container">
            {/* SECTION 1 (TOP): Single Unified Window with Savings & Wallets / Loan Accounts Toggle (Medium Cards, Max 4 Per Row) */}
            <section
              aria-labelledby="dashboard-section-1-heading"
              data-testid="dashboard-section-1-bank-cards"
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <h2
                      id="dashboard-section-1-heading"
                      className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                    >
                      Accounts &amp; Loans Overview
                    </h2>
                    <InfoTip text="Switch between your liquid Savings Accounts & Wallets and your active Loan Accounts (in banks, apps, or organizations). Maximum 4 medium cards per row." />
                  </div>

                  {/* Unified Window Toggle: Savings & Wallets vs Loan Accounts */}
                  <div
                    role="tablist"
                    aria-label="Savings and Loans Switcher"
                    className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dashboardTopTab === 'savings'}
                      data-testid="dashboard-top-tab-savings"
                      onClick={() => setDashboardTopTab('savings')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        dashboardTopTab === 'savings'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Savings &amp; Wallets ({vault.accounts.length})</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={dashboardTopTab === 'loans'}
                      data-testid="dashboard-top-tab-loans"
                      onClick={() => setDashboardTopTab('loans')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        dashboardTopTab === 'loans'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      <span>Loan Accounts ({activeLoansOnDashboard.length})</span>
                    </button>
                  </div>
                </div>

                {dashboardTopTab === 'savings' ? (
                  <button
                    type="button"
                    onClick={() => setActiveSection('accounts')}
                    data-testid="dashboard-manage-accounts-link"
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 hover:border-emerald-500/50 text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Manage Accounts</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveSection('loans')}
                    data-testid="dashboard-manage-loans-link"
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 hover:border-indigo-500/50 text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Manage Loans &amp; EMI</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* TAB PANEL A: SAVINGS ACCOUNTS, WALLETS & CASH (Medium Cards, Max 4 in 1 Line, Clean Top View) */}
              {dashboardTopTab === 'savings' && (
                <>
                  {vault.accounts.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          No Savings Accounts or Wallets Added Yet
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Open the Accounts tab to add your first Savings Account, Cash Wallet, or Digital Wallet.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSection('accounts')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${accentBtnClass}`}
                      >
                        <Landmark className="w-4 h-4" />
                        <span>Go to Accounts Tab</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      data-testid="dashboard-savings-cards-grid"
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
                    >
                      {vault.accounts.map((acc) => {
                        const actualBalance = calculateAccountBalance(acc, vault.transactions);
                        const rawTypeLabel = resolveFlexibleLabel(acc.type, acc.customType);
                        const accTypeLabel =
                          rawTypeLabel === 'Bank Account' ? 'Bank Account' : rawTypeLabel;
                        const cardColor = acc.color || '#c2410c';
                        const matchedBrand = resolveBankLogoFromName(acc.name);
                        const fallbackCrest = generateBankFallbackSvgDataUrl(acc.name, cardColor);
                        const syncedLogo = acc.bankLogoUrl || matchedBrand?.logoUrl || fallbackCrest;
                        const maskedNumber = maskAccountNumber(acc.accountNumber);
                        const isRevealed = Boolean(dashboardRevealedNumbers[acc.id]);

                        return (
                          <div
                            key={acc.id}
                            data-testid={`dashboard-bank-card-${acc.id}`}
                            style={{
                              background: `linear-gradient(135deg, ${cardColor} 0%, #0f172a 100%)`,
                            }}
                            className="rounded-xl p-3.5 text-white relative shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between border border-white/10"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <img
                                  src={syncedLogo}
                                  onError={(e) => {
                                    if (
                                      matchedBrand?.remoteFaviconUrl &&
                                      e.currentTarget.src !== matchedBrand.remoteFaviconUrl
                                    ) {
                                      e.currentTarget.src = matchedBrand.remoteFaviconUrl;
                                    } else {
                                      e.currentTarget.onerror = null;
                                      e.currentTarget.src = fallbackCrest;
                                    }
                                  }}
                                  alt={acc.name}
                                  className="w-9 h-9 rounded-xl object-contain bg-white p-1 shrink-0 shadow-sm"
                                />
                                <div className="min-w-0">
                                  <div className="text-sm font-extrabold text-white leading-snug break-words">
                                    {acc.name}
                                  </div>
                                  <div className="text-[11px] text-white/80 leading-tight">
                                    {accTypeLabel}
                                  </div>
                                </div>
                              </div>

                              {/* Small Color Theme Mixer Icon on Top Right */}
                              <div className="flex items-center gap-1 shrink-0">
                                <CardColorMixerButton
                                  color={cardColor}
                                  onChange={(newHex) => {
                                    void handleSaveAccountFromTab(
                                      {
                                        ...acc,
                                        color: newHex,
                                      },
                                      true
                                    );
                                  }}
                                  label="Bank Card Theme Color"
                                  testId={`dashboard-bank-color-mixer-${acc.id}`}
                                />
                              </div>
                            </div>

                            {/* Account Number Row with Show/Hide Toggle */}
                            <div className="mt-3 flex items-center justify-between text-[11px] text-white/85">
                              <div className="font-mono tracking-wider truncate">
                                <span className="text-white/70 mr-1">A/C:</span>
                                <span
                                  data-testid={`dashboard-masked-acc-${acc.id}`}
                                  className="font-bold"
                                >
                                  {isRevealed ? acc.accountNumber || 'Not Provided' : maskedNumber}
                                </span>
                              </div>
                              {acc.accountNumber && (
                                <button
                                  type="button"
                                  data-testid={`dashboard-toggle-acc-num-${acc.id}`}
                                  onClick={() =>
                                    setDashboardRevealedNumbers((prev) => ({
                                      ...prev,
                                      [acc.id]: !prev[acc.id],
                                    }))
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] text-white/85 hover:text-white cursor-pointer shrink-0 ml-1"
                                >
                                  {isRevealed ? (
                                    <>
                                      <EyeOff className="w-3 h-3" />
                                      <span>Hide</span>
                                    </>
                                  ) : (
                                    <>
                                      <Eye className="w-3 h-3" />
                                      <span>Show</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>

                            {/* Current Balance Row */}
                            <div className="mt-2.5 pt-2.5 border-t border-white/15 flex items-baseline justify-between gap-2">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                                CURRENT BALANCE
                              </span>
                              <span
                                className={`text-lg font-extrabold font-mono tabular-nums ${
                                  actualBalance < 0 ? 'text-rose-300' : 'text-white'
                                }`}
                              >
                                {currency}
                                {actualBalance.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* TAB PANEL B: LOAN ACCOUNTS IN BANKS, APPS, OR ORGANIZATIONS (Medium Cards, Max 4 in 1 Line) */}
              {dashboardTopTab === 'loans' && (
                <>
                  {activeLoansOnDashboard.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white">
                          No Active Loan Accounts Found
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Add bank loans, app credit lines, or organization/person loans in the Loans &amp; EMI section.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveSection('loans')}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <Calculator className="w-4 h-4" />
                        <span>Open Loans &amp; EMI</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      data-testid="dashboard-loan-cards-grid"
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
                    >
                      {activeLoansOnDashboard.map((loan) => {
                        const schedule = calculateLoanAmortizationSchedule(loan);
                        const isOpenTenure = loan.loanType === 'person_org_no_tenure';
                        const lenderOrCat =
                          loan.lenderName ||
                          resolveFlexibleLabel(loan.category, loan.customCategory);
                        const matchedBrand = resolveBankLogoFromName(
                          loan.lenderName || loan.name
                        );
                        const cardBgColor = isOpenTenure ? '#b45309' : '#4338ca';
                        const fallbackCrest = generateBankFallbackSvgDataUrl(
                          loan.lenderName || loan.name,
                          cardBgColor
                        );
                        const loanLogo = matchedBrand?.logoUrl || fallbackCrest;

                        return (
                          <div
                            key={loan.id}
                            data-testid={`dashboard-top-loan-card-${loan.id}`}
                            style={{
                              background: `linear-gradient(135deg, ${cardBgColor} 0%, #0f172a 100%)`,
                            }}
                            className="rounded-xl p-3.5 text-white relative shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between border border-white/10"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <img
                                  src={loanLogo}
                                  onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = fallbackCrest;
                                  }}
                                  alt={loan.name}
                                  className="w-9 h-9 rounded-xl object-contain bg-white p-1 shrink-0 shadow-sm"
                                />
                                <div className="min-w-0">
                                  <div className="text-sm font-extrabold text-white leading-snug break-words">
                                    {loan.name}
                                  </div>
                                  <div className="text-[11px] text-white/80 leading-tight break-words">
                                    {lenderOrCat}
                                  </div>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-white/15 border border-white/20 text-[10px] font-bold uppercase tracking-wider text-white shrink-0">
                                {isOpenTenure ? 'Open-Tenure' : 'EMI Loan'}
                              </span>
                            </div>

                            <div className="mt-3 flex items-center justify-between text-[11px] text-white/85">
                              <span>
                                Principal:{' '}
                                <strong className="font-mono">
                                  {currency}
                                  {loan.principalAmount.toLocaleString()}
                                </strong>
                              </span>
                              <span>
                                {isOpenTenure ? (
                                  <>
                                    Paid:{' '}
                                    <strong className="font-mono">
                                      {currency}
                                      {schedule.totalAmountPaidSoFar.toLocaleString()}
                                    </strong>
                                  </>
                                ) : (
                                  <>
                                    EMI:{' '}
                                    <strong className="font-mono">
                                      {currency}
                                      {Math.round(schedule.scheduledMonthlyEmi).toLocaleString()}/mo
                                    </strong>
                                  </>
                                )}
                              </span>
                            </div>

                            <div className="mt-2.5 pt-2.5 border-t border-white/15 flex items-baseline justify-between gap-2">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/80">
                                REMAINING DUE
                              </span>
                              <span className="text-lg font-extrabold font-mono tabular-nums text-white">
                                {currency}
                                {schedule.remainingBalance.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </section>

            {/* SUBTLE VISUAL DIVIDER */}
            <hr className="border-slate-200 dark:border-slate-800" />

            {/* SECTION 2 (MIDDLE - SUMMARY CARDS): 5 Default-Colored Cards in 1 Line with Wrapped Text & Click-to-Expand Animated View-Only Details */}
            <section
              aria-labelledby="dashboard-section-2-heading"
              data-testid="dashboard-two-summary-cards"
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <h2
                    id="dashboard-section-2-heading"
                    className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                  >
                    Core Financial Position Summary
                  </h2>
                  <InfoTip text="Click any of the 5 summary cards below to expand its detailed view-only breakdown right underneath. Click the same card again to close." />
                </div>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Click any card to expand / collapse details
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {/* Summary Card 1: Total Counted in All My Accounts (Default Emerald Theme) */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandedSummaryCard === 'totalCounted'}
                  data-testid="summary-card-total-counted"
                  onClick={() => toggleSummaryCardExpand('totalCounted')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSummaryCardExpand('totalCounted');
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all duration-200 flex flex-col justify-between cursor-pointer select-none ${
                    expandedSummaryCard === 'totalCounted'
                      ? 'border-emerald-600 bg-emerald-500/15 dark:bg-emerald-950/40 shadow-md ring-2 ring-emerald-500/30'
                      : 'border-emerald-500/35 bg-gradient-to-br from-emerald-500/10 via-white to-teal-500/5 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-900 hover:border-emerald-500/60 shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                          <Wallet className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 whitespace-normal break-words leading-snug">
                            Total Counted in All My Accounts
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-normal break-words leading-snug mt-0.5">
                            Savings Accounts &amp; Wallets ({vault.accounts.length})
                          </p>
                        </div>
                      </div>
                      <span className="text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5">
                        {expandedSummaryCard === 'totalCounted' ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </span>
                    </div>

                    <div
                      data-testid="summary-card-total-counted-value"
                      className="mt-3 text-xl font-extrabold font-mono tabular-nums text-emerald-700 dark:text-emerald-300 break-words"
                    >
                      {currency}
                      {dashboardSummaryCards.totalCountedInAllMyAccounts.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold">
                    <span className="whitespace-normal break-words">
                      {expandedSummaryCard === 'totalCounted'
                        ? 'Hide Projected Balances'
                        : 'View Projected Balances'}
                    </span>
                    <span className="font-mono font-bold shrink-0 ml-1">
                      {vault.accounts.length} A/Cs
                    </span>
                  </div>
                </div>

                {/* Summary Card 2: Expected Money Coming In (Default Sky Theme) */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandedSummaryCard === 'expectedIn'}
                  data-testid="summary-card-expected-coming-in"
                  onClick={() => toggleSummaryCardExpand('expectedIn')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSummaryCardExpand('expectedIn');
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all duration-200 flex flex-col justify-between cursor-pointer select-none ${
                    expandedSummaryCard === 'expectedIn'
                      ? 'border-sky-600 bg-sky-500/15 dark:bg-sky-950/40 shadow-md ring-2 ring-sky-500/30'
                      : 'border-sky-500/35 bg-gradient-to-br from-sky-500/10 via-white to-cyan-500/5 dark:from-sky-950/30 dark:via-slate-900 dark:to-slate-900 hover:border-sky-500/60 shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold uppercase tracking-wider text-sky-800 dark:text-sky-300 whitespace-normal break-words leading-snug">
                            Expected Money Coming In
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-normal break-words leading-snug mt-0.5">
                            Receivables Owed to Me (
                            {dashboardSummaryCards.liveReceivableRecords.length})
                          </p>
                        </div>
                      </div>
                      <span className="text-sky-700 dark:text-sky-300 shrink-0 mt-0.5">
                        {expandedSummaryCard === 'expectedIn' ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </span>
                    </div>

                    <div
                      data-testid="summary-card-expected-coming-in-value"
                      className="mt-3 text-xl font-extrabold font-mono tabular-nums text-sky-600 dark:text-sky-400 break-words"
                    >
                      +{currency}
                      {dashboardSummaryCards.expectedMoneyComingIn.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-sky-500/20 flex items-center justify-between text-[11px] text-sky-800 dark:text-sky-300 font-semibold">
                    <span className="whitespace-normal break-words">
                      {expandedSummaryCard === 'expectedIn'
                        ? 'Hide Receivable Records'
                        : 'View Receivable Records'}
                    </span>
                    <span className="font-mono font-bold shrink-0 ml-1">
                      {dashboardSummaryCards.liveReceivableRecords.length} Live
                    </span>
                  </div>
                </div>

                {/* Summary Card 3: The Money I Owe (Default Amber Theme) */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandedSummaryCard === 'moneyIOwe'}
                  data-testid="summary-card-money-i-owe"
                  onClick={() => toggleSummaryCardExpand('moneyIOwe')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSummaryCardExpand('moneyIOwe');
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all duration-200 flex flex-col justify-between cursor-pointer select-none ${
                    expandedSummaryCard === 'moneyIOwe'
                      ? 'border-amber-600 bg-amber-500/15 dark:bg-amber-950/40 shadow-md ring-2 ring-amber-500/30'
                      : 'border-amber-500/35 bg-gradient-to-br from-amber-500/10 via-white to-orange-500/5 dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900 hover:border-amber-500/60 shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                          <Users className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div
                            data-testid="summary-card-money-i-owe-title"
                            className="text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300 whitespace-normal break-words leading-snug"
                          >
                            The Money I Owe
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-normal break-words leading-snug mt-0.5">
                            People I Need to Pay ({dashboardSummaryCards.livePayableRecords.length})
                          </p>
                        </div>
                      </div>
                      <span className="text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
                        {expandedSummaryCard === 'moneyIOwe' ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </span>
                    </div>

                    <div
                      data-testid="summary-card-money-i-owe-value"
                      className="mt-3 text-xl font-extrabold font-mono tabular-nums text-amber-600 dark:text-amber-400 break-words"
                    >
                      -{currency}
                      {dashboardSummaryCards.theMoneyIOwePayablesOnly.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-amber-500/20 flex items-center justify-between text-[11px] text-amber-800 dark:text-amber-300 font-semibold">
                    <span className="whitespace-normal break-words">
                      {expandedSummaryCard === 'moneyIOwe'
                        ? 'Hide Payable Records'
                        : 'View Payable Records'}
                    </span>
                    <span className="font-mono font-bold shrink-0 ml-1">
                      {dashboardSummaryCards.livePayableRecords.length} Due
                    </span>
                  </div>
                </div>

                {/* Summary Card 4: The Loans (Default Indigo Theme) */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandedSummaryCard === 'theLoans'}
                  data-testid="summary-card-active-loans"
                  onClick={() => toggleSummaryCardExpand('theLoans')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSummaryCardExpand('theLoans');
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all duration-200 flex flex-col justify-between cursor-pointer select-none ${
                    expandedSummaryCard === 'theLoans'
                      ? 'border-indigo-600 bg-indigo-500/15 dark:bg-indigo-950/40 shadow-md ring-2 ring-indigo-500/30'
                      : 'border-indigo-500/35 bg-gradient-to-br from-indigo-500/10 via-white to-violet-500/5 dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900 hover:border-indigo-500/60 shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                          <Calculator className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold uppercase tracking-wider text-indigo-800 dark:text-indigo-300 whitespace-normal break-words leading-snug">
                            The Loans
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-normal break-words leading-snug mt-0.5">
                            Active Loan Balances ({activeLoansOnDashboard.length})
                          </p>
                        </div>
                      </div>
                      <span className="text-indigo-700 dark:text-indigo-300 shrink-0 mt-0.5">
                        {expandedSummaryCard === 'theLoans' ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </span>
                    </div>

                    <div
                      data-testid="summary-card-active-loans-value"
                      className="mt-3 text-xl font-extrabold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 break-words"
                    >
                      {currency}
                      {dashboardSummaryCards.theLoansActiveBalance.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-indigo-500/20 grid grid-cols-2 gap-1.5">
                    <div
                      data-testid="dashboard-loan-sub-proper-emi"
                      className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-indigo-500/20"
                    >
                      <div className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 whitespace-normal break-words leading-tight">
                        Structured EMI Loans
                      </div>
                      <div
                        data-testid="dashboard-loan-sub-proper-emi-value"
                        className="mt-0.5 text-[11px] font-extrabold font-mono tabular-nums text-indigo-600 dark:text-indigo-400"
                      >
                        {currency}
                        {dashboardSummaryCards.properEmiLoansBalance.toLocaleString()}
                      </div>
                    </div>
                    <div
                      data-testid="dashboard-loan-sub-open-tenure"
                      className="p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-amber-500/20"
                    >
                      <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 whitespace-normal break-words leading-tight">
                        Open-Tenure Loans
                      </div>
                      <div
                        data-testid="dashboard-loan-sub-open-tenure-value"
                        className="mt-0.5 text-[11px] font-extrabold font-mono tabular-nums text-amber-600 dark:text-amber-400"
                      >
                        {currency}
                        {dashboardSummaryCards.flexiblePersonOrgLoansBalance.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary Card 5: Total Investments (Golden Wealth Theme — "My Money") */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={expandedSummaryCard === 'totalInvestments'}
                  data-testid="summary-card-total-investments"
                  onClick={() => toggleSummaryCardExpand('totalInvestments')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSummaryCardExpand('totalInvestments');
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all duration-200 flex flex-col justify-between cursor-pointer select-none ${
                    expandedSummaryCard === 'totalInvestments'
                      ? 'border-yellow-500 bg-gradient-to-br from-yellow-500/20 via-amber-500/15 to-yellow-600/10 dark:from-yellow-900/40 dark:via-amber-950/40 dark:to-slate-900 shadow-md ring-2 ring-yellow-500/40'
                      : 'border-yellow-500/50 bg-gradient-to-br from-yellow-500/15 via-amber-50/60 to-yellow-500/5 dark:from-yellow-950/35 dark:via-slate-900 dark:to-amber-950/20 hover:border-yellow-500/80 shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                          <Vault className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold uppercase tracking-wider text-yellow-800 dark:text-yellow-300 whitespace-normal break-words leading-snug">
                            Total Investments
                          </div>
                          <p className="text-[11px] text-yellow-700/80 dark:text-yellow-400/80 whitespace-normal break-words leading-snug mt-0.5">
                            Dreams &amp; Investments ({(vault.dreamVaults || []).length})
                          </p>
                        </div>
                      </div>
                      <span className="text-yellow-700 dark:text-yellow-300 shrink-0 mt-0.5">
                        {expandedSummaryCard === 'totalInvestments' ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </span>
                    </div>

                    <div
                      data-testid="summary-card-total-investments-value"
                      className="mt-3 text-xl font-extrabold font-mono tabular-nums text-yellow-700 dark:text-yellow-300 break-words"
                    >
                      {currency}
                      {dashboardSummaryCards.totalInvestmentsAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-yellow-500/30 grid grid-cols-2 gap-1.5">
                    <div
                      data-testid="dashboard-investments-sub-fds"
                      className="p-1.5 rounded-lg bg-yellow-500/10 dark:bg-yellow-950/40 border border-yellow-500/30"
                    >
                      <div className="text-[9px] font-bold uppercase tracking-wider text-yellow-800 dark:text-yellow-300 whitespace-normal break-words leading-tight">
                        Total FDs ({dashboardSummaryCards.totalFdCount})
                      </div>
                      <div
                        data-testid="dashboard-investments-sub-fds-value"
                        className="mt-0.5 text-[11px] font-extrabold font-mono tabular-nums text-yellow-700 dark:text-yellow-300"
                      >
                        {currency}
                        {dashboardSummaryCards.totalFdAmount.toLocaleString()}
                      </div>
                    </div>
                    <div
                      data-testid="dashboard-investments-sub-other"
                      className="p-1.5 rounded-lg bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30"
                    >
                      <div className="text-[9px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 whitespace-normal break-words leading-tight">
                        Dreams / Gold / MF
                      </div>
                      <div
                        data-testid="dashboard-investments-sub-other-value"
                        className="mt-0.5 text-[11px] font-extrabold font-mono tabular-nums text-amber-700 dark:text-amber-300"
                      >
                        {currency}
                        {dashboardSummaryCards.otherInvestmentsAmount.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* EXPANDABLE VIEW-ONLY DETAILS PANEL BELOW CORE FINANCIAL POSITION SUMMARY */}
              {expandedSummaryCard && (
                <div
                  data-testid="dashboard-summary-expanded-panel"
                  className="rounded-2xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-lg transition-all duration-300 ease-out space-y-4"
                >
                  {/* 1. EXPANDED VIEW FOR TOTAL COUNTED IN ALL MY ACCOUNTS (Liquid Accounts & Wallets + Upcoming Recurring Debits & Projected Balance) */}
                  {expandedSummaryCard === 'totalCounted' && (
                    <div
                      data-testid="expanded-panel-total-counted"
                      className="space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
                              View-Only Summary
                            </span>
                            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                              Liquid Savings Accounts &amp; Wallets — Upcoming Debits &amp; Projected Balances
                            </h3>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Detailed view of each liquid account with upcoming recurring debits subtracted and projected balance after debit.
                          </p>
                        </div>
                        <button
                          type="button"
                          data-testid="close-expanded-summary-panel"
                          onClick={() => setExpandedSummaryCard(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Close</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        {vault.accounts.map((acc) => {
                          const projection = calculateAccountRecurringProjection(
                            acc,
                            vault.transactions,
                            vault.recurringPayments || []
                          );
                          const rawTypeLabel = resolveFlexibleLabel(acc.type, acc.customType);
                          const cardColor = acc.color || '#c2410c';
                          const matchedBrand = resolveBankLogoFromName(acc.name);
                          const fallbackCrest = generateBankFallbackSvgDataUrl(acc.name, cardColor);
                          const syncedLogo = acc.bankLogoUrl || matchedBrand?.logoUrl || fallbackCrest;
                          const maskedNumber = maskAccountNumber(acc.accountNumber);
                          const pendingRecurringForAcc = (vault.recurringPayments || []).filter(
                            (item) =>
                              item.linkedAccountId === acc.id &&
                              item.status === 'will_be_debited' &&
                              item.flowType !== 'income'
                          );

                          return (
                            <div
                              key={acc.id}
                              data-testid={`expanded-liquid-card-${acc.id}`}
                              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900 overflow-hidden shadow-xs flex flex-col justify-between"
                            >
                              <div
                                style={{
                                  background: `linear-gradient(135deg, ${cardColor} 0%, #0f172a 100%)`,
                                }}
                                className="p-3.5 text-white"
                              >
                                <div className="flex items-center gap-2.5">
                                  <img
                                    src={syncedLogo}
                                    onError={(e) => {
                                      e.currentTarget.onerror = null;
                                      e.currentTarget.src = fallbackCrest;
                                    }}
                                    alt={acc.name}
                                    className="w-8 h-8 rounded-lg object-contain bg-white p-1 shrink-0"
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-extrabold text-white leading-snug break-words">
                                      {acc.name}
                                    </div>
                                    <div className="text-[11px] text-white/80">
                                      {rawTypeLabel} · A/C: {maskedNumber}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-2.5 pt-2 border-t border-white/15 flex items-baseline justify-between gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                                    CURRENT BALANCE
                                  </span>
                                  <span className="text-base font-extrabold font-mono tabular-nums text-white">
                                    {currency}
                                    {projection.actualBalance.toLocaleString(undefined, {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </div>
                              </div>

                              {/* Upcoming Recurring Debits & Projected Balance Details */}
                              <div className="p-3.5 bg-white dark:bg-slate-900 space-y-2 text-xs flex-1 flex flex-col justify-between">
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-600 dark:text-slate-400">
                                      Upcoming Recurring Debits ({projection.pendingItemsCount}):
                                    </span>
                                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                                      -{currency}
                                      {projection.willBeDebitedTotal.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </span>
                                  </div>

                                  {pendingRecurringForAcc.length > 0 && (
                                    <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-1">
                                      {pendingRecurringForAcc.map((rec) => (
                                        <div
                                          key={rec.id}
                                          className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-300"
                                        >
                                          <span className="truncate pr-2">
                                            • {rec.title} ({rec.dueDayLabel})
                                          </span>
                                          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                                            -{currency}
                                            {rec.amount.toLocaleString()}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-800 dark:text-slate-200">
                                      Projected Balance After Debit:
                                    </span>
                                    <span
                                      data-testid={`expanded-projected-balance-${acc.id}`}
                                      className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400"
                                    >
                                      {currency}
                                      {projection.projectedBalanceAfterDebit.toLocaleString(
                                        undefined,
                                        {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2,
                                        }
                                      )}
                                    </span>
                                  </div>
                                  {acc.branchName && (
                                    <div className="text-[10px] text-slate-400 truncate">
                                      Branch: {acc.branchName}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 2. EXPANDED VIEW FOR EXPECTED MONEY COMING IN (Synced Live Receivable Records) */}
                  {expandedSummaryCard === 'expectedIn' && (
                    <div
                      data-testid="expanded-panel-expected-in"
                      className="space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px] font-extrabold uppercase tracking-wider">
                              View-Only Synced Ledger
                            </span>
                            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                              Expected Money Coming In — Live Receivable Records (
                              {dashboardSummaryCards.liveReceivableRecords.length})
                            </h3>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            100% synced with the Receivables &amp; Payables tab (includes pending expected income, lending, and split bills).
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveSection('people')}
                            className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>Open Receivables &amp; Payables</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            data-testid="close-expanded-summary-panel"
                            onClick={() => setExpandedSummaryCard(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Close</span>
                          </button>
                        </div>
                      </div>

                      {dashboardSummaryCards.liveReceivableRecords.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                          No pending receivable records owed to you right now.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                                <th className="py-2 pr-3">Person / Entity</th>
                                <th className="py-2 px-3">Item Description</th>
                                <th className="py-2 px-3">Date / Due</th>
                                <th className="py-2 px-3">Category</th>
                                <th className="py-2 px-3 text-right">Total</th>
                                <th className="py-2 px-3 text-right">Settled</th>
                                <th className="py-2 pl-3 text-right">Remaining Receivable</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                              {dashboardSummaryCards.liveReceivableRecords.map((rec) => (
                                <tr key={`${rec.personId}-${rec.id}`}>
                                  <td className="py-2.5 pr-3 font-bold text-slate-900 dark:text-white">
                                    {rec.personName}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                                    {rec.title}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                                    {rec.date}
                                    {rec.dueDate && rec.dueDate !== rec.date
                                      ? ` · Due ${rec.dueDate}`
                                      : ''}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                    {rec.category}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                    {currency}
                                    {rec.totalAmount.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                    {currency}
                                    {rec.settledAmount.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 pl-3 text-right font-mono font-extrabold text-sky-600 dark:text-sky-400">
                                    +{currency}
                                    {rec.remainingAmount.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. EXPANDED VIEW FOR THE MONEY I OWE (Synced Live Payable Records) */}
                  {expandedSummaryCard === 'moneyIOwe' && (
                    <div
                      data-testid="expanded-panel-money-i-owe"
                      className="space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold uppercase tracking-wider">
                              View-Only Synced Ledger
                            </span>
                            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                              The Money I Owe — Live Quick Payable Records (
                              {dashboardSummaryCards.livePayableRecords.length})
                            </h3>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            100% synced with People I Need to Pay in the Receivables &amp; Payables tab.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveSection('people')}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>Open Receivables &amp; Payables</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            data-testid="close-expanded-summary-panel"
                            onClick={() => setExpandedSummaryCard(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Close</span>
                          </button>
                        </div>
                      </div>

                      {dashboardSummaryCards.livePayableRecords.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                          You have zero pending payables owed to people or entities right now.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                                <th className="py-2 pr-3">Person / Entity</th>
                                <th className="py-2 px-3">Payable Description</th>
                                <th className="py-2 px-3">Date / Due</th>
                                <th className="py-2 px-3">Category</th>
                                <th className="py-2 px-3 text-right">Total</th>
                                <th className="py-2 px-3 text-right">Paid So Far</th>
                                <th className="py-2 pl-3 text-right">Remaining Payable Due</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                              {dashboardSummaryCards.livePayableRecords.map((rec) => (
                                <tr key={`${rec.personId}-${rec.id}`}>
                                  <td className="py-2.5 pr-3 font-bold text-slate-900 dark:text-white">
                                    {rec.personName}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                                    {rec.title}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                                    {rec.date}
                                    {rec.dueDate && rec.dueDate !== rec.date
                                      ? ` · Due ${rec.dueDate}`
                                      : ''}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                                    {rec.category}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                    {currency}
                                    {rec.totalAmount.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                    {currency}
                                    {rec.settledAmount.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 pl-3 text-right font-mono font-extrabold text-amber-600 dark:text-amber-400">
                                    -{currency}
                                    {rec.remainingAmount.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. EXPANDED VIEW FOR THE LOANS (Active Structured EMI & Open-Tenure Loans Breakdown) */}
                  {expandedSummaryCard === 'theLoans' && (
                    <div
                      data-testid="expanded-panel-the-loans"
                      className="space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-extrabold uppercase tracking-wider">
                              View-Only Loan Summary
                            </span>
                            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                              Active Loans Breakdown ({activeLoansOnDashboard.length})
                            </h3>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Structured EMI Loans: {currency}
                            {dashboardSummaryCards.properEmiLoansBalance.toLocaleString()} ·
                            Open-Tenure Loans: {currency}
                            {dashboardSummaryCards.flexiblePersonOrgLoansBalance.toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveSection('loans')}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>Open Loans &amp; EMI</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            data-testid="close-expanded-summary-panel"
                            onClick={() => setExpandedSummaryCard(null)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Close</span>
                          </button>
                        </div>
                      </div>

                      {activeLoansOnDashboard.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                          No active loans in progress.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                          {activeLoansOnDashboard.map((loan) => {
                            const schedule = calculateLoanAmortizationSchedule(loan);
                            const isOpenTenure = loan.loanType === 'person_org_no_tenure';
                            return (
                              <div
                                key={loan.id}
                                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2 text-xs"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="font-extrabold text-slate-900 dark:text-white break-words">
                                      {loan.name}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {loan.lenderName ||
                                        resolveFlexibleLabel(loan.category, loan.customCategory)}
                                    </div>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      isOpenTenure
                                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                        : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                                    }`}
                                  >
                                    {isOpenTenure ? 'Open-Tenure' : 'Structured EMI'}
                                  </span>
                                </div>
                                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700 space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Principal:</span>
                                    <span className="font-mono font-semibold">
                                      {currency}
                                      {loan.principalAmount.toLocaleString()}
                                    </span>
                                  </div>
                                  {!isOpenTenure && (
                                    <div className="flex justify-between">
                                      <span className="text-slate-500">Monthly EMI:</span>
                                      <span className="font-mono font-semibold">
                                        {currency}
                                        {Math.round(schedule.scheduledMonthlyEmi).toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span className="text-slate-500">Paid So Far:</span>
                                    <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                      {currency}
                                      {schedule.totalAmountPaidSoFar.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="flex justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                                    <span className="font-bold text-slate-800 dark:text-slate-200">
                                      Remaining Due:
                                    </span>
                                    <span className="font-mono font-extrabold text-indigo-600 dark:text-indigo-400">
                                      {currency}
                                      {schedule.remainingBalance.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 5. EXPANDED VIEW FOR TOTAL INVESTMENTS (Golden Theme + Divided Left: Dreams Cards / Right: Investments Cards) */}
                  {expandedSummaryCard === 'totalInvestments' && (() => {
                    const allVaults = vault.dreamVaults || [];
                    const isPureInvestmentItem = (dv: DreamVault): boolean => {
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
                    };

                    const leftDreamsCards = allVaults.filter((dv) => !isPureInvestmentItem(dv));
                    const rightInvestmentsCards = allVaults.filter((dv) =>
                      isPureInvestmentItem(dv)
                    );

                    const leftDreamsSavedTotal = leftDreamsCards.reduce(
                      (sum, dv) => sum + Math.max(0, Number(dv.currentAmount) || 0),
                      0
                    );
                    const rightInvestmentsSavedTotal = rightInvestmentsCards.reduce(
                      (sum, dv) => sum + Math.max(0, Number(dv.currentAmount) || 0),
                      0
                    );

                    const renderGoldenVaultCard = (
                      dv: DreamVault,
                      side: 'dream' | 'investment'
                    ) => {
                      const storageLabel = resolveFlexibleLabel(
                        dv.storageType,
                        dv.customStorageType
                      );
                      const designatedAcc = vault.accounts.find(
                        (a) => a.id === (dv.savedInAccountId || dv.linkedAccountId)
                      );
                      const pct =
                        dv.targetAmount > 0
                          ? Math.min(100, Math.round((dv.currentAmount / dv.targetAmount) * 100))
                          : 100;

                      return (
                        <div
                          key={dv.id}
                          data-testid={`expanded-golden-${side}-card-${dv.id}`}
                          className="rounded-xl border-2 border-yellow-500/45 bg-gradient-to-br from-yellow-500/15 via-amber-50/70 to-yellow-600/10 dark:from-yellow-950/50 dark:via-slate-900 dark:to-amber-950/35 p-3.5 shadow-sm space-y-2.5 text-xs flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {dv.imageUrl ? (
                                  <img
                                    src={dv.imageUrl}
                                    alt={dv.name}
                                    className="w-9 h-9 rounded-lg object-cover border border-yellow-500/50 shrink-0 shadow-xs"
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                    <Vault className="w-4 h-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-extrabold text-yellow-950 dark:text-yellow-100 break-words leading-snug">
                                    {dv.name}
                                  </div>
                                  <div className="text-[11px] font-medium text-yellow-800/80 dark:text-yellow-300/80 break-words">
                                    {storageLabel}
                                  </div>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded-md bg-gradient-to-r from-yellow-500 to-amber-600 text-white text-[10px] font-extrabold uppercase tracking-wider shrink-0 shadow-2xs">
                                {side === 'dream'
                                  ? 'Dream Goal'
                                  : dv.storageType === 'Fixed Deposit (FD)'
                                  ? 'FD'
                                  : 'Investment'}
                              </span>
                            </div>

                            {/* Golden Progress Bar */}
                            <div className="mt-2.5 space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-bold text-yellow-800 dark:text-yellow-300">
                                <span>My Saved Wealth</span>
                                <span>{pct}% of Target</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-yellow-900/15 dark:bg-yellow-200/10 overflow-hidden">
                                <div
                                  style={{ width: `${pct}%` }}
                                  className="h-full rounded-full bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-yellow-500/30 space-y-1">
                            <div className="flex justify-between items-baseline">
                              <span className="text-yellow-900/75 dark:text-yellow-200/75 font-semibold">
                                Current Saved:
                              </span>
                              <span className="font-mono text-sm font-extrabold text-yellow-700 dark:text-yellow-300">
                                {currency}
                                {dv.currentAmount.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-yellow-900/70 dark:text-yellow-200/70">
                                Target Corpus:
                              </span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {currency}
                                {dv.targetAmount.toLocaleString()}
                              </span>
                            </div>
                            {(dv.fdBankName || designatedAcc) && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-yellow-900/70 dark:text-yellow-200/70">
                                  Held In:
                                </span>
                                <span className="font-bold text-yellow-900 dark:text-yellow-200 truncate max-w-[150px]">
                                  {dv.fdBankName || designatedAcc?.name}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between text-[11px]">
                              <span className="text-yellow-900/70 dark:text-yellow-200/70">
                                Target Date:
                              </span>
                              <span className="font-mono text-yellow-800 dark:text-yellow-300">
                                {dv.targetDateMode === 'no_date' || !dv.targetDate
                                  ? 'No Target Date'
                                  : dv.targetDate}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div
                        data-testid="expanded-panel-total-investments"
                        className="space-y-4 rounded-xl border border-yellow-500/40 bg-gradient-to-br from-yellow-500/5 via-amber-500/5 to-transparent p-3 sm:p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-yellow-500/30">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-md bg-gradient-to-r from-yellow-500 to-amber-600 text-white text-[10px] font-extrabold uppercase tracking-wider shadow-2xs">
                                Golden Wealth Portfolio · My Money
                              </span>
                              <h3 className="text-sm font-extrabold text-yellow-950 dark:text-yellow-100">
                                Total Investments &amp; Dreams — Divided Golden View (
                                {allVaults.length})
                              </h3>
                            </div>
                            <p className="text-xs text-yellow-800/80 dark:text-yellow-300/80 mt-0.5">
                              Left: Dreams &amp; Financial Goals ({leftDreamsCards.length}) · Right:
                              Investments &amp; Fixed Deposits ({rightInvestmentsCards.length})
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setActiveSection('dreams')}
                              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer shadow-xs"
                            >
                              <span>Open Investments &amp; Dreams</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              data-testid="close-expanded-summary-panel"
                              onClick={() => setExpandedSummaryCard(null)}
                              className="px-3 py-1.5 rounded-lg border border-yellow-500/40 text-xs font-bold text-yellow-800 dark:text-yellow-200 hover:bg-yellow-500/10 flex items-center gap-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Close</span>
                            </button>
                          </div>
                        </div>

                        {/* DIVIDED LEFT / RIGHT GOLDEN SECTIONS */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                          {/* LEFT SECTION: DREAMS & FINANCIAL GOALS CARDS */}
                          <div
                            data-testid="expanded-investments-left-dreams"
                            className="rounded-2xl border-2 border-yellow-500/40 bg-gradient-to-b from-yellow-500/10 via-white to-amber-500/5 dark:from-yellow-950/30 dark:via-slate-900 dark:to-slate-900 p-4 space-y-3 shadow-xs"
                          >
                            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-yellow-500/30">
                              <div>
                                <div className="text-xs font-extrabold uppercase tracking-wider text-yellow-800 dark:text-yellow-300 flex items-center gap-1.5">
                                  <Vault className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                                  <span>Dreams &amp; Financial Goals ({leftDreamsCards.length})</span>
                                </div>
                                <p className="text-[11px] text-yellow-700/75 dark:text-yellow-400/75">
                                  Personal dreams, milestones &amp; reserve funds
                                </p>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-yellow-700 dark:text-yellow-400">
                                  Saved in Dreams
                                </div>
                                <div
                                  data-testid="expanded-left-dreams-total"
                                  className="text-sm font-extrabold font-mono text-yellow-700 dark:text-yellow-300"
                                >
                                  {currency}
                                  {leftDreamsSavedTotal.toLocaleString()}
                                </div>
                              </div>
                            </div>

                            {leftDreamsCards.length === 0 ? (
                              <div className="p-6 text-center text-xs text-yellow-800/70 dark:text-yellow-300/70 rounded-xl border border-dashed border-yellow-500/35 bg-yellow-500/5">
                                No Dream cards added yet. Add a Dream Investment or Goal in the Investments &amp; Dreams tab.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {leftDreamsCards.map((dv) => renderGoldenVaultCard(dv, 'dream'))}
                              </div>
                            )}
                          </div>

                          {/* RIGHT SECTION: INVESTMENTS & FIXED DEPOSITS CARDS */}
                          <div
                            data-testid="expanded-investments-right-investments"
                            className="rounded-2xl border-2 border-yellow-500/40 bg-gradient-to-b from-amber-500/10 via-white to-yellow-500/5 dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900 p-4 space-y-3 shadow-xs"
                          >
                            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-yellow-500/30">
                              <div>
                                <div className="text-xs font-extrabold uppercase tracking-wider text-yellow-800 dark:text-yellow-300 flex items-center gap-1.5">
                                  <Landmark className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                                  <span>
                                    Investments &amp; Fixed Deposits ({rightInvestmentsCards.length})
                                  </span>
                                </div>
                                <p className="text-[11px] text-yellow-700/75 dark:text-yellow-400/75">
                                  Fixed Deposits (FDs), Gold, Mutual Funds &amp; SIPs
                                </p>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-yellow-700 dark:text-yellow-400">
                                  Total Invested
                                </div>
                                <div
                                  data-testid="expanded-right-investments-total"
                                  className="text-sm font-extrabold font-mono text-yellow-700 dark:text-yellow-300"
                                >
                                  {currency}
                                  {rightInvestmentsSavedTotal.toLocaleString()}
                                </div>
                              </div>
                            </div>

                            {rightInvestmentsCards.length === 0 ? (
                              <div className="p-6 text-center text-xs text-yellow-800/70 dark:text-yellow-300/70 rounded-xl border border-dashed border-yellow-500/35 bg-yellow-500/5">
                                No Investment or FD cards added yet. Add a Fixed Deposit, Gold, or Mutual Fund card in Investments &amp; Dreams.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {rightInvestmentsCards.map((dv) =>
                                  renderGoldenVaultCard(dv, 'investment')
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </section>

            {/* SUBTLE VISUAL DIVIDER */}
            <hr className="border-slate-200 dark:border-slate-800" />

            {/* DASHBOARD VISUAL ANALYTICS CHARTS (Monthly Expenses Pie, Investments & Dreams Portfolio Pie, Cashflow Bars) */}
            <DashboardAnalyticsCharts
              transactions={vault.transactions}
              dreamVaults={vault.dreamVaults || []}
              currency={currency}
              selectedMonth={selectedMonth}
            />

            {/* SUBTLE VISUAL DIVIDER */}
            <hr className="border-slate-200 dark:border-slate-800" />

            {/* SECTION 3 (BOTTOM - RECURRING AND COMPULSORY PAYMENTS): Strictly View-Only on Dashboard */}
            <section
              aria-labelledby="dashboard-section-3-heading"
              data-testid="dashboard-section-3-recurring"
              className="space-y-3"
            >
              <RecurringPaymentsSection
                accounts={vault.accounts}
                transactions={vault.transactions}
                recurringPayments={vault.recurringPayments || []}
                people={vault.people}
                currency={currency}
                readOnlyMode={isAccountOnHold}
                viewOnly={true}
                onAddOrUpdateRecurring={handleAddOrUpdateRecurring}
                onToggleRecurringStatus={handleToggleRecurringStatus}
                onDeleteRecurring={handleDeleteRecurring}
                onNavigateToRecordsRecurring={() => {
                  setActiveSection('records');
                  setRecordsSubSection('recurring');
                }}
              />
            </section>
          </div>
        )}

        {/* TAB 2: ACCOUNTS (Dedicated tab to add, edit, and manage Bank Accounts and Wallets) */}
        {activeSection === 'accounts' && (
          <AccountsManagerView
            accounts={vault.accounts}
            transactions={vault.transactions}
            recurringPayments={vault.recurringPayments || []}
            currency={currency}
            readOnlyMode={isAccountOnHold}
            userPasswordHash={currentUser.passwordHash}
            onSaveAccount={handleSaveAccountFromTab}
            onDeleteAccount={handleDeleteAccount}
          />
        )}

        {activeSection === 'records' && (
          <div className="space-y-5" data-testid="records-tab-view">
            {/* Records Tab 2-Section Switcher Bar */}
            <div
              data-testid="records-section-switcher"
              className="p-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="records-section-logs-tab"
                  onClick={() => setRecordsSubSection('logs')}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-colors cursor-pointer ${
                    recordsSubSection === 'logs'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <ReceiptText className="w-4 h-4 shrink-0" />
                  <span>Income &amp; Expenses</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                      recordsSubSection === 'logs'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {filteredTransactions.length}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="records-section-recurring-tab"
                  onClick={() => setRecordsSubSection('recurring')}
                  className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-colors cursor-pointer ${
                    recordsSubSection === 'recurring'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span>Recurring &amp; Compulsory Payments</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                      recordsSubSection === 'recurring'
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {(vault.recurringPayments || []).length}
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isAccountOnHold}
                  data-testid="records-new-record-btn"
                  onClick={() => {
                    if (!isAccountOnHold) {
                      setEditingTransaction(null);
                      setOpenTxModalWithPaidEmi(false);
                      setIsTxModalOpen(true);
                    }
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 ${accentBtnClass}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ New Record</span>
                </button>
              </div>
            </div>

            {recordsSubSection === 'recurring' ? (
              <RecurringPaymentsSection
                accounts={vault.accounts}
                transactions={vault.transactions}
                recurringPayments={vault.recurringPayments || []}
                people={vault.people}
                currency={currency}
                readOnlyMode={isAccountOnHold}
                viewOnly={false}
                userPasswordHash={currentUser.passwordHash}
                onAddOrUpdateRecurring={handleAddOrUpdateRecurring}
                onToggleRecurringStatus={handleToggleRecurringStatus}
                onDeleteRecurring={handleDeleteRecurring}
                onAutoCreatePerson={handleAddPerson}
              />
            ) : (
              <>
                {/* Filter & Direct HD PDF Export Bar */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-3 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search title, ID (100...), Proof..."
                      aria-label="Search transaction records"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      aria-label="Filter by Wallet Account"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="ALL">All Savings &amp; Wallet Accounts</option>
                      {vault.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <select
                      data-testid="records-flow-type-filter"
                      value={selectedTxType}
                      onChange={(e) => setSelectedTxType(e.target.value)}
                      aria-label="Filter by Transaction Flow Type"
                      className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                    >
                      <option value="ALL">Flow Type: All (Expense, Income, Transfer)</option>
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                      <option value="transfer">Transfer (Self Transfer / EMI)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={isAccountOnHold}
                      onClick={() => {
                        if (!isAccountOnHold) setIsRecordsPdfPreviewOpen(true);
                      }}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${accentBtnClass}`}
                    >
                      <FileText className="w-4 h-4" />
                      Preview &amp; Export PDF
                    </button>
                    <button
                      type="button"
                      disabled={isAccountOnHold}
                      onClick={handleDownloadRecordsExcel}
                      className="px-3.5 py-2 rounded-lg text-xs font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Export Excel (.xls)
                    </button>
                  </div>
                </div>

                {/* High-Density Tabular Ledger Table with Wrapped Column Headers, Clickable Thumbnail Proof, Edit & Delete */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs table-auto">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-3 font-semibold whitespace-normal break-words leading-snug max-w-[110px]">
                          Record ID &amp; Proof ID
                        </th>
                        <th className="py-3 px-3 font-semibold whitespace-normal break-words leading-snug">
                          Date
                        </th>
                        <th className="py-3 px-3 font-semibold whitespace-normal break-words leading-snug">
                          Title / Description
                        </th>
                        <th className="py-3 px-3 font-semibold whitespace-normal break-words leading-snug">
                          Category
                        </th>
                        <th className="py-3 px-3 font-semibold whitespace-normal break-words leading-snug">
                          Account &amp; Method
                        </th>
                        <th className="py-3 px-3 font-semibold whitespace-normal break-words leading-snug max-w-[100px]">
                          Proof Image
                        </th>
                        <th className="py-3 px-3 font-semibold text-right whitespace-normal break-words leading-snug">
                          Amount
                        </th>
                        <th className="py-3 px-3 font-semibold text-right whitespace-normal break-words leading-snug">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-500">
                            No transaction records yet. Click &ldquo;+ New Record&rdquo; to log an entry with sequential ID (starting from 100).
                          </td>
                        </tr>
                      ) : (
                        filteredTransactions.map((tx) => {
                          const acc = vault.accounts.find((a) => a.id === tx.accountId);
                          const toAcc = tx.toAccountId
                            ? vault.accounts.find((a) => a.id === tx.toAccountId)
                            : undefined;
                          const person = vault.people.find((p) => p.id === tx.personId);
                          const linkedRec = tx.linkedRecurringId
                            ? (vault.recurringPayments || []).find(
                                (r) => r.id === tx.linkedRecurringId
                              )
                            : undefined;
                          const catLabel = resolveFlexibleLabel(tx.category, tx.customCategory);
                          const methodLabel = resolveFlexibleLabel(
                            tx.paymentMethod,
                            tx.customPaymentMethod
                          );
                          const isPositive =
                            tx.type === 'income' ||
                            tx.type === 'borrowing_in' ||
                            tx.type === 'expected_incoming';
                          const isTransfer = tx.type === 'transfer';

                          return (
                            <tr
                              key={tx.id}
                              className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              <td className="py-3 px-3 font-mono whitespace-normal break-words">
                                <div className="font-bold text-slate-900 dark:text-slate-100">
                                  #{tx.id}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Proof: {tx.proofId || 'NONE'}
                                </div>
                              </td>
                              <td className="py-3 px-3 font-mono whitespace-nowrap">{tx.date}</td>
                              <td className="py-3 px-3 whitespace-normal break-words">
                                <div className="font-semibold text-slate-900 dark:text-slate-100">
                                  {tx.title}
                                </div>
                                {(tx.isPaidEmi || tx.isRegularMonthly || isTransfer || tx.isSplit) && (
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                    {isTransfer && (
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                                        Transfer
                                      </span>
                                    )}
                                    {tx.isPaidEmi && (
                                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[10px] font-extrabold">
                                        Paid EMI
                                      </span>
                                    )}
                                    {tx.isRegularMonthly && (
                                      <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[10px] font-bold">
                                        Regular Monthly{linkedRec ? `: ${linkedRec.title}` : ''}
                                      </span>
                                    )}
                                    {tx.isSplit && tx.splitAmount && (
                                      <span
                                        data-testid={`record-split-badge-${tx.id}`}
                                        className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[10px] font-extrabold"
                                      >
                                        Split with {tx.splitPersonName || 'Counterparty'}: +{currency}
                                        {tx.splitAmount.toLocaleString()} Receivable
                                      </span>
                                    )}
                                  </div>
                                )}
                                {person && (
                                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                                    <span>Person: {person.name}</span>
                                    <span
                                      className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                                        tx.status === 'settled' ||
                                        (tx.settledAmount ?? 0) >= tx.amount
                                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                          : (tx.settledAmount ?? 0) > 0 || tx.status === 'partial'
                                          ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                      }`}
                                    >
                                      {tx.status === 'settled' ||
                                      (tx.settledAmount ?? 0) >= tx.amount
                                        ? 'PAID'
                                        : (tx.settledAmount ?? 0) > 0 || tx.status === 'partial'
                                        ? 'PARTIALLY PAID'
                                        : 'PENDING'}
                                    </span>
                                  </div>
                                )}
                                {tx.notes && (
                                  <div className="text-[11px] text-slate-500">{tx.notes}</div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-slate-700 dark:text-slate-300 whitespace-normal break-words">
                                {catLabel}
                              </td>
                              <td className="py-3 px-3 whitespace-normal break-words">
                                <div className="text-slate-800 dark:text-slate-200 font-medium">
                                  {acc?.name || 'Primary Wallet'}
                                  {toAcc ? ` → ${toAcc.name}` : ''}
                                </div>
                                <div className="text-[11px] text-slate-500">{methodLabel}</div>
                              </td>
                              <td className="py-3 px-3">
                                {tx.proofImageDataUrl ? (
                                  <button
                                    type="button"
                                    data-testid={`view-proof-thumb-btn-${tx.id}`}
                                    onClick={() => setPreviewProofTx(tx)}
                                    title="Click to view HD proof image (delete option inside)"
                                    className="inline-flex items-center justify-center p-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                                  >
                                    <img
                                      src={tx.proofImageDataUrl}
                                      alt={`Proof for ${tx.title}`}
                                      className="w-10 h-8 object-cover rounded"
                                    />
                                  </button>
                                ) : isAccountOnHold ? (
                                  <span className="text-[11px] text-slate-400">No Proof</span>
                                ) : (
                                  <label
                                    onDragOver={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                    onDrop={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const f = e.dataTransfer?.files?.[0];
                                      if (f && f.type.startsWith('image/')) {
                                        void handleAttachProofToExistingTx(tx.id, f);
                                      }
                                    }}
                                    onPaste={(e) => {
                                      const items = e.clipboardData?.items;
                                      if (items) {
                                        for (let i = 0; i < items.length; i++) {
                                          if (items[i].type.startsWith('image/')) {
                                            const f = items[i].getAsFile();
                                            if (f) {
                                              e.preventDefault();
                                              void handleAttachProofToExistingTx(tx.id, f);
                                              break;
                                            }
                                          }
                                        }
                                      }
                                    }}
                                    tabIndex={0}
                                    title="Click, drag & drop, or paste (Ctrl+V) proof image"
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded border border-dashed border-slate-300 dark:border-slate-700 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:border-emerald-500 cursor-pointer outline-none"
                                  >
                                    <ImageIcon className="w-3 h-3 shrink-0" />
                                    <span>+ Upload</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) void handleAttachProofToExistingTx(tx.id, f);
                                      }}
                                      className="hidden"
                                    />
                                  </label>
                                )}
                              </td>
                              <td
                                className={`py-3 px-3 font-mono tabular-nums font-bold text-right whitespace-nowrap ${
                                  isPositive
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : isTransfer
                                    ? 'text-indigo-600 dark:text-indigo-400'
                                    : tx.type === 'dream_investment'
                                    ? 'text-violet-600 dark:text-violet-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {isPositive ? '+' : isTransfer ? '⇄ ' : '-'}
                                {currency}
                                {tx.amount.toLocaleString()}
                              </td>
                              <td className="py-3 px-3 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isAccountOnHold}
                                    onClick={() => {
                                      setEditingTransaction(tx);
                                      setOpenTxModalWithPaidEmi(false);
                                      setIsTxModalOpen(true);
                                    }}
                                    aria-label={`Edit ${tx.title}`}
                                    title="Edit Record"
                                    className="p-1.5 rounded text-slate-500 hover:text-indigo-600 hover:bg-indigo-500/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isAccountOnHold}
                                    data-testid={`delete-tx-record-btn-${tx.id}`}
                                    onClick={() => {
                                      setRecordPendingDelete({
                                        mode: 'transaction',
                                        tx,
                                      });
                                      setDeleteRecordPassword('');
                                      setDeleteRecordError('');
                                    }}
                                    aria-label={`Delete ${tx.title}`}
                                    title="Move Record to Recycle Bin (Password Required)"
                                    className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

          {activeSection === 'people' && (
            <PeopleAndBillsView
              people={vault.people}
              expectedItems={vault.expectedItems}
              transactions={vault.transactions}
              accounts={vault.accounts}
              personRecordGroups={vault.personRecordGroups || []}
              currency={currency}
              issuedByName={currentUser.displayName}
              isAdminPortal={isAdminPortal}
              readOnlyMode={isAccountOnHold}
              userPasswordHash={currentUser.passwordHash}
              pdfHeaderConfig={pdfHeaderConfig}
              onAddPerson={handleAddPerson}
              onDeletePerson={handleDeletePerson}
              onBlockPerson={handleBlockPerson}
              onUnblockPerson={handleUnblockPerson}
              onAddExpectedManual={handleAddExpectedManual}
              onUpdateExpectedItem={handleUpdateExpectedItem}
              onDeleteExpectedItem={handleDeleteExpectedItem}
              onDeleteTransaction={handleDeleteTransaction}
              onUnlinkTransactionFromPerson={handleUnlinkTransactionFromPerson}
              onEditTransaction={(tx) => {
                setEditingTransaction(tx);
                setOpenTxModalWithPaidEmi(false);
                setIsTxModalOpen(true);
              }}
              onLinkTransactionToPerson={handleLinkTransactionToPerson}
              onSettleExpectedItem={handleSettleExpectedItem}
              onAdjustRecordSettlementStatus={handleAdjustRecordSettlementStatus}
              onAttachProofToRecord={handleAttachProofToRecord}
              onUpdatePersonRecordGroups={handleUpdatePersonRecordGroups}
              onTriggerFeedback={triggerFeedback}
            />
          )}

          {activeSection === 'dreams' && (
            <DreamVaultsView
              dreamVaults={vault.dreamVaults}
              accounts={vault.accounts}
              currency={currency}
              isAdminPortal={isAdminPortal}
              readOnlyMode={isAccountOnHold}
              userPasswordHash={currentUser.passwordHash}
              onAddDreamVault={handleAddDreamVault}
              onUpdateDreamVault={handleUpdateDreamVault}
              onDeleteDreamVault={handleDeleteDreamVault}
              onContributeToDreamVault={handleContributeToDreamVault}
              onTriggerFeedback={triggerFeedback}
            />
          )}

          {activeSection === 'loans' && (
            <LoansAndEmiView
              loans={vault.loans || []}
              accounts={vault.accounts}
              transactions={vault.transactions}
              currency={currency}
              readOnlyMode={isAccountOnHold}
              userPasswordHash={currentUser.passwordHash}
              onSaveLoan={handleSaveLoan}
              onDeleteLoan={handleDeleteLoan}
              onExecuteEmiPayment={handleExecuteEmiPayment}
            />
          )}

          {activeSection === 'recycle' && (
            <RecycleBinView
              entries={vault.recycleBin || []}
              currency={currency}
              readOnlyMode={isAccountOnHold}
              userPasswordHash={currentUser.passwordHash}
              onRestoreEntry={handleRestoreRecycleEntry}
              onDeleteForever={handlePermanentlyDeleteRecycleEntry}
              onEmptyRecycleBin={handleEmptyRecycleBin}
            />
          )}

          {activeSection === 'settings' && (
            <LocalVaultAndSettingsView
              currentUser={currentUser}
              vault={vault}
              isCloudConnected={isCloudSession}
              cloudEmail={firebaseUser?.email}
              readOnlyMode={isAccountOnHold}
              onConnectGoogleCloud={handleGoogleLogin}
              onImportVaultBackup={(imported) =>
                persistVaultChange({ ...imported, userId: currentUser.id })
              }
              onUpdateOwnProfile={(newDisp, newPass, newCurr, newAvatarThumb) => {
                const updated: UserAccount = {
                  ...currentUser,
                  updatedAt: new Date().toISOString(),
                  displayName: newDisp,
                  passwordHash: hashSecretIrreversibly(newPass),
                  currency: newCurr,
                  avatarThumbnailDataUrl: newAvatarThumb,
                  mustChangePassword: false,
                };
                const nextUsers = users.map((u) =>
                  u.id === currentUser.id ? updated : u
                );
                persistUsersChange(nextUsers);
              }}
              onUpdateMobileSecurity={handleUpdateMobileSecurity}
              onDeleteOwnAccountPermanently={handleDeleteOwnAccountPermanently}
              onTriggerFeedback={triggerFeedback}
            />
          )}
      </main>

      {/* Add / Edit Record Modal */}
      {!isAccountOnHold && (
        <TransactionModal
          isOpen={isTxModalOpen}
          onClose={() => {
            setIsTxModalOpen(false);
            setOpenTxModalWithPaidEmi(false);
            setEditingTransaction(null);
          }}
          accounts={vault.accounts}
          people={vault.people}
          dreamVaults={vault.dreamVaults}
          loans={vault.loans || []}
          recurringPayments={vault.recurringPayments || []}
          customCategories={currentUser.customCategories}
          currency={currency}
          userPasswordHash={currentUser.passwordHash}
          isAdminPortal={isAdminPortal}
          editingTransaction={editingTransaction}
          initialIsPaidEmi={openTxModalWithPaidEmi}
          onSaveTransaction={handleSaveTransaction}
          onUpdateTransaction={handleUpdateTransaction}
          onExecutePaidEmiFromRecords={handleExecutePaidEmiFromRecords}
          onQuickAddPerson={handleQuickAddPerson}
        />
      )}

      {/* HD PDF Preview & Export Modal for Records & Ledger */}
      {!isAccountOnHold && (
        <PdfPreviewModal
          isOpen={isRecordsPdfPreviewOpen}
          onClose={() => setIsRecordsPdfPreviewOpen(false)}
          mode="records"
          currency={currency}
          issuedBy={currentUser.displayName}
          role={currentUser.role}
          headerConfig={pdfHeaderConfig}
          onHeaderConfigChange={(updatedCfg) => {
            setPdfHeaderConfig(updatedCfg);
            savePdfHeaderConfig(updatedCfg);
            saveGlobalCloudConfig(landingHeroImage, updatedCfg);
          }}
          periodLabel={selectedMonth === 'ALL' ? 'All Time' : selectedMonth}
          transactions={filteredTransactions}
          accounts={vault.accounts}
          people={vault.people}
          onDownloadPdf={handleDownloadRecordsPdf}
          onDownloadExcel={handleDownloadRecordsExcel}
        />
      )}

      {/* Proof Screenshot Lightbox Modal */}
      {previewProofTx && previewProofTx.proofImageDataUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="proof-modal-title"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 id="proof-modal-title" className="text-sm font-bold text-slate-900 dark:text-white">
                  HD Transaction Proof Screenshot — {previewProofTx.title}
                </h3>
                <p className="text-xs font-mono text-slate-500">
                  Record ID: #{previewProofTx.id} · Proof ID: {previewProofTx.proofId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProofTx(null)}
                aria-label="Close Proof Preview"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <img
                src={previewProofTx.proofImageDataUrl}
                alt={`Proof for ${previewProofTx.title}`}
                className="w-full max-h-96 object-contain rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950"
              />
              <div className="flex justify-between gap-2">
                {!isAccountOnHold && (
                  <button
                    type="button"
                    onClick={() => {
                      const targetTx = previewProofTx;
                      setPreviewProofTx(null);
                      setRecordPendingDelete({
                        mode: 'proof_image',
                        tx: targetTx,
                      });
                      setDeleteRecordPassword('');
                      setDeleteRecordError('');
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-600 hover:bg-rose-600 hover:text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Move Proof to Recycle Bin (Password Required)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewProofTx(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 cursor-pointer ml-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Confirmation Modal before Deleting a Transaction Record or Proof Image */}
      {recordPendingDelete && (
        <div
          data-testid="delete-record-password-modal"
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-record-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="delete-record-modal-title"
                    className="text-sm font-extrabold text-slate-900 dark:text-white"
                  >
                    {recordPendingDelete.mode === 'proof_image'
                      ? 'Confirm Proof Image Deletion'
                      : 'Confirm Transaction Record Deletion'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Password verification required to move to Recycle Bin
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

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!deleteRecordPassword.trim()) {
                  setDeleteRecordError('Please enter your account password to confirm deletion.');
                  return;
                }
                if (
                  currentUser.passwordHash &&
                  currentUser.passwordHash !== 'google-oauth' &&
                  !verifySecretAgainstStoredHash(deleteRecordPassword, currentUser.passwordHash)
                ) {
                  setDeleteRecordError('Incorrect password. Deletion cancelled.');
                  return;
                }
                if (recordPendingDelete.mode === 'proof_image') {
                  handleDeleteProofFromTransaction(recordPendingDelete.tx);
                } else {
                  void handleDeleteTransaction(recordPendingDelete.tx.id);
                }
                setRecordPendingDelete(null);
                setDeleteRecordPassword('');
                setDeleteRecordError('');
              }}
              className="p-5 space-y-4"
            >
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  #{recordPendingDelete.tx.id} · {recordPendingDelete.tx.title}
                </div>
                <div className="text-slate-500">
                  Date: {recordPendingDelete.tx.date} · Amount:{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {currency}
                    {recordPendingDelete.tx.amount.toLocaleString()}
                  </strong>
                </div>
              </div>

              <div>
                <label
                  htmlFor="delete-record-password-input"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Enter Your Account Password to Confirm Deletion
                </label>
                <input
                  id="delete-record-password-input"
                  data-testid="delete-record-password-input"
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
                  data-testid="delete-record-password-error"
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
                  data-testid="confirm-delete-record-btn"
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
}
