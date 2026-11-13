import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Cloud,
  Delete,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserPlus,
} from 'lucide-react';
import { UserAccount } from '../types/finance';
import { EXPENSE_TRACKER_SQUARE_ICON, EXPENSE_TRACKER_FULL_LOGO_DARK } from '../utils/bankLogos';
import {
  DEFAULT_PRIMARY_ADMIN_EMAIL,
  evaluatePasswordLoginAttempt,
  evaluatePasswordSecurity,
  evaluatePinLoginAttempt,
  formatCooldownTimerMMSS,
  generateAdminEmailOtpChallenge,
  INTRUSION_ALERT_THRESHOLD,
  PASSWORD_TIER1_COOLDOWN_MS,
  PASSWORD_TIER1_MAX_STRIKES,
  PASSWORD_TIER2_MAX_STRIKES,
  PERMANENT_LOCKOUT_ALERT_MESSAGE,
  PIN_MAX_STRIKES,
  verifyAdminEmailOtpChallenge,
} from '../utils/financeRules';
import {
  sendAdminEmailOtpViaFirebaseAndRelay,
  verifyAdminEmailOwnershipWithFirebaseGoogle,
} from '../lib/firebase';
import { PasswordStrengthChecklist } from './PasswordStrengthChecklist';

interface AuthGateProps {
  users: UserAccount[];
  initialMode?: 'login' | 'register' | 'forgot';
  onBackToLanding: () => void;
  onLogin: (
    user: UserAccount,
    usedOneTimeTempPassword?: boolean,
    hadPriorFailedAttemptsOrLock?: boolean,
    priorFailedAttemptsCount?: number
  ) => { ok: boolean; error?: string } | void;
  onUpdateUserSecurityState?: (
    updatedUser: UserAccount,
    intrusionAlertMessage?: string
  ) => void;
  onGoogleLogin: () => Promise<void>;
  onRegisterUser: (
    username: string,
    displayName: string,
    password: string,
    currency: string,
    seedDemo: boolean
  ) => { ok: boolean; error?: string };
  onRequestForgotPassword: (username: string) => { ok: boolean; message: string };
}

const CURRENCY_OPTIONS = [
  { label: 'Indian Rupee (₹)', value: '₹' },
  { label: 'US Dollar ($)', value: '$' },
  { label: 'Euro (€)', value: '€' },
  { label: 'British Pound (£)', value: '£' },
  { label: 'Other', value: 'Other' },
];

export const AuthGate: React.FC<AuthGateProps> = ({
  users,
  initialMode = 'login',
  onBackToLanding,
  onLogin,
  onUpdateUserSecurityState,
  onGoogleLogin,
  onRegisterUser,
  onRequestForgotPassword,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [loginMethod, setLoginMethod] = useState<'password' | 'pin'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [submittedAttemptUsername, setSubmittedAttemptUsername] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState('');
  const [intrusionBanner, setIntrusionBanner] = useState<string | null>(null);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotPromptMessage, setForgotPromptMessage] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  // Admin-Only Free Lifetime Firebase Email OTP State (strictly for role === 'admin')
  const [adminForgotEmail, setAdminForgotEmail] = useState(DEFAULT_PRIMARY_ADMIN_EMAIL);
  const [adminOtpSent, setAdminOtpSent] = useState(false);
  const [adminOtpSending, setAdminOtpSending] = useState(false);
  const [adminOtpEntered, setAdminOtpEntered] = useState('');
  const [adminDispatchedOtpCode, setAdminDispatchedOtpCode] = useState<string | null>(null);
  const [showDispatchedOtpReceipt, setShowDispatchedOtpReceipt] = useState(false);
  const [adminForgotNewPassword, setAdminForgotNewPassword] = useState('');
  const [adminForgotConfirmPassword, setAdminForgotConfirmPassword] = useState('');
  const [showAdminForgotNewPass, setShowAdminForgotNewPass] = useState(false);

  // Live clock tick for the 5-minute MM:SS lockout countdown timer
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Fallback synthetic tracking map for usernames not yet matched in `users`
  const [unmatchedUsersMap, setUnmatchedUsersMap] = useState<Record<string, UserAccount>>({});

  // Registration state (with Confirm Password + transient Eye toggles)
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regCurrency, setRegCurrency] = useState('₹');
  const [regCustomCurrency, setRegCustomCurrency] = useState('');

  useEffect(() => {
    setMode(initialMode);
    setUsername('');
    setPassword('');
    setPinInput('');
    setSubmittedAttemptUsername(null);
    setIntrusionBanner(null);
    setError('');
    setShowLoginPassword(false);
    setShowRegPassword(false);
    setShowRegConfirmPassword(false);
  }, [initialMode]);

  const cleanUsername = username.trim().toLowerCase();
  const hasSubmittedForCurrentUsername = Boolean(
    cleanUsername && submittedAttemptUsername === cleanUsername
  );
  const matchedLoginUser =
    users.find((u) => u.username.toLowerCase() === cleanUsername) ||
    (cleanUsername ? unmatchedUsersMap[cleanUsername] : undefined);

  const isPinDisabledForUser = Boolean(
    matchedLoginUser &&
      (matchedLoginUser.pinLockedOut ||
        (matchedLoginUser.pinFailedAttempts || 0) >= PIN_MAX_STRIKES)
  );

  const isPermanentlyLocked = Boolean(
    matchedLoginUser &&
      (matchedLoginUser.permanentlyLockedByStrikes ||
        matchedLoginUser.lockoutTier === 2 ||
        matchedLoginUser.accountStatus === 'disabled')
  );

  const cooldownUntilMs = matchedLoginUser?.lockoutUntilMs || 0;
  const isCooldownActive = !isPermanentlyLocked && cooldownUntilMs > nowMs;
  const cooldownRemainingMs = isCooldownActive ? Math.max(0, cooldownUntilMs - nowMs) : 0;

  // Only reveal lockout / cooldown / remaining attempts on the login UI AFTER the user submits for this username
  const showPermanentLockOnUi = hasSubmittedForCurrentUsername && isPermanentlyLocked;
  const showCooldownOnUi = hasSubmittedForCurrentUsername && isCooldownActive;
  const showPinDisabledOnUi = hasSubmittedForCurrentUsername && isPinDisabledForUser;

  const isPostCooldownTier2 =
    !isPermanentlyLocked &&
    !isCooldownActive &&
    matchedLoginUser?.lockoutTier === 1;

  // Compute remaining attempts badge for active user
  const remainingPasswordAttempts = (() => {
    if (!matchedLoginUser) return PASSWORD_TIER1_MAX_STRIKES;
    if (isPermanentlyLocked || isCooldownActive) return 0;
    if (isPostCooldownTier2) {
      // If cooldown just expired, failed attempts reset to 0 for the 3 post-cooldown strikes
      const strikes =
        matchedLoginUser.lockoutUntilMs && nowMs >= matchedLoginUser.lockoutUntilMs
          ? 0
          : matchedLoginUser.passwordFailedAttempts || 0;
      return Math.max(0, PASSWORD_TIER2_MAX_STRIKES - strikes);
    }
    return Math.max(
      0,
      PASSWORD_TIER1_MAX_STRIKES - (matchedLoginUser.passwordFailedAttempts || 0)
    );
  })();

  const remainingPinAttempts = (() => {
    if (!matchedLoginUser) return PIN_MAX_STRIKES;
    return Math.max(0, PIN_MAX_STRIKES - (matchedLoginUser.pinFailedAttempts || 0));
  })();

  // Tick every 250ms while a 5-minute cooldown timer is active
  useEffect(() => {
    if (!cooldownUntilMs || cooldownUntilMs <= Date.now()) return;
    const interval = window.setInterval(() => {
      const current = Date.now();
      setNowMs(current);
      if (current >= cooldownUntilMs) {
        // Cooldown expired: clear lockoutUntilMs while keeping lockoutTier = 1 (Tier 2 3-strike mode)
        if (matchedLoginUser && matchedLoginUser.lockoutUntilMs) {
          const unlockedForTier2: UserAccount = {
            ...matchedLoginUser,
            updatedAt: new Date(current).toISOString(),
            lockoutUntilMs: undefined,
            passwordFailedAttempts: 0,
            lockoutTier: 1,
          };
          if (users.some((u) => u.id === matchedLoginUser.id)) {
            onUpdateUserSecurityState?.(unlockedForTier2);
          } else if (cleanUsername) {
            setUnmatchedUsersMap((prev) => ({
              ...prev,
              [cleanUsername]: unlockedForTier2,
            }));
          }
          if (hasSubmittedForCurrentUsername) {
            setError(
              '5-minute security cooldown has expired. You now have 3 password attempts remaining before permanent account lock.'
            );
          }
        }
        window.clearInterval(interval);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [
    cooldownUntilMs,
    matchedLoginUser,
    users,
    cleanUsername,
    hasSubmittedForCurrentUsername,
    onUpdateUserSecurityState,
  ]);

  // Force fallback to password mode if PIN is locked out after submit
  useEffect(() => {
    if (loginMethod === 'pin' && showPinDisabledOnUi) {
      setLoginMethod('password');
    }
  }, [loginMethod, showPinDisabledOnUi]);

  const resolveCooldownDurationMs = (): number => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const customSec = Number(params.get('lockoutCooldownSec'));
      if (!Number.isNaN(customSec) && customSec > 0 && customSec <= 300) {
        return customSec * 1000;
      }
    }
    return PASSWORD_TIER1_COOLDOWN_MS;
  };

  const persistSecurityEvaluation = (
    targetUser: UserAccount,
    isKnownUser: boolean,
    intrusionAlertMessage?: string
  ) => {
    if (isKnownUser) {
      onUpdateUserSecurityState?.(targetUser, intrusionAlertMessage);
    } else if (cleanUsername) {
      setUnmatchedUsersMap((prev) => ({
        ...prev,
        [cleanUsername]: targetUser,
      }));
    }
    if (intrusionAlertMessage) {
      setIntrusionBanner(intrusionAlertMessage);
    }
  };

  const handleSwitchToPinMode = () => {
    setError('');
    if (showPermanentLockOnUi) {
      setError(PERMANENT_LOCKOUT_ALERT_MESSAGE);
      return;
    }
    if (showPinDisabledOnUi) {
      setError(
        'PIN entry has been disabled after 3 failed attempts. Please sign in using your Username and Password.'
      );
      setLoginMethod('password');
      return;
    }
    if (matchedLoginUser && users.some((u) => u.id === matchedLoginUser.id) && !matchedLoginUser.mobilePin) {
      setError(
        `@${matchedLoginUser.username} has not set a Mobile PIN yet. Please sign in with your Password below, then configure your 4–6 digit Mobile PIN in Settings.`
      );
      setLoginMethod('password');
      return;
    }
    setLoginMethod('pin');
    setTimeout(() => {
      pinInputRef.current?.focus();
    }, 60);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setForgotPromptMessage('');
    setShowLoginPassword(false);

    const currentTs = Date.now();
    setNowMs(currentTs);
    if (cleanUsername) {
      setSubmittedAttemptUsername(cleanUsername);
    }

    const knownUser = users.find((u) => u.username.toLowerCase() === cleanUsername);
    const targetUser: UserAccount =
      knownUser ||
      unmatchedUsersMap[cleanUsername] || {
        id: `unmatched-${cleanUsername || 'guest'}`,
        username: cleanUsername || 'unknown',
        displayName: cleanUsername || 'Unknown User',
        passwordHash: '__non_existent_hash__',
        role: 'user',
        createdAt: new Date(currentTs).toISOString(),
        currency: '₹',
        customCategories: [],
      };

    // Check permanent lock first
    if (
      targetUser.permanentlyLockedByStrikes ||
      targetUser.lockoutTier === 2 ||
      targetUser.accountStatus === 'disabled'
    ) {
      setError(PERMANENT_LOCKOUT_ALERT_MESSAGE);
      return;
    }

    // Check 5-minute cooldown
    if (targetUser.lockoutUntilMs && currentTs < targetUser.lockoutUntilMs) {
      setError(
        `Login form is locked. Please wait ${formatCooldownTimerMMSS(
          targetUser.lockoutUntilMs - currentTs
        )} before attempting to sign in.`
      );
      return;
    }

    if (loginMethod === 'pin') {
      if (knownUser && !knownUser.mobilePin) {
        setLoginMethod('password');
        setError(
          'No Mobile PIN is set for this account yet. Please sign in with your Password first, then set your Mobile PIN in Settings.'
        );
        return;
      }

      const pinEval = evaluatePinLoginAttempt(targetUser, pinInput, currentTs);
      if (pinEval.success && knownUser) {
        setIntrusionBanner(null);
        setSubmittedAttemptUsername(null);
        const loginRes = onLogin(
          pinEval.updatedUser,
          false,
          pinEval.hadPriorFailedAttemptsOrLock,
          pinEval.priorFailedAttemptsCount
        );
        if (loginRes && !loginRes.ok && loginRes.error) {
          setError(loginRes.error);
        }
        return;
      }

      persistSecurityEvaluation(
        pinEval.updatedUser,
        Boolean(knownUser),
        pinEval.triggerIntrusionAlert ? pinEval.intrusionAlertMessage : undefined
      );

      setPinInput('');
      if (pinEval.forcePasswordFallback) {
        setLoginMethod('password');
      }
      setError(pinEval.errorMessage || 'Invalid PIN.');
      return;
    }

    // Password Login Evaluation (Multi-Tier Lockout State Machine)
    const cooldownMs = resolveCooldownDurationMs();
    const pwEval = evaluatePasswordLoginAttempt(
      targetUser,
      password,
      currentTs,
      cooldownMs
    );

    if (pwEval.success && knownUser) {
      setIntrusionBanner(null);
      setSubmittedAttemptUsername(null);
      const loginRes = onLogin(
        pwEval.updatedUser,
        Boolean(pwEval.usedTempPassword),
        pwEval.hadPriorFailedAttemptsOrLock,
        pwEval.priorFailedAttemptsCount
      );
      if (loginRes && !loginRes.ok && loginRes.error) {
        setError(loginRes.error);
      }
      return;
    }

    persistSecurityEvaluation(
      pwEval.updatedUser,
      Boolean(knownUser),
      pwEval.triggerIntrusionAlert ? pwEval.intrusionAlertMessage : undefined
    );

    setPassword('');
    setError(pwEval.errorMessage || 'Invalid username or password.');
  };

  const matchedForgotUser = users.find(
    (u) => u.username.toLowerCase() === forgotUsername.trim().toLowerCase()
  );
  const isForgotTargetAdmin = Boolean(matchedForgotUser && matchedForgotUser.role === 'admin');

  const handleOpenForgotPasswordSupport = () => {
    setMode('forgot');
    const targetName = username.trim() || 'admin';
    setForgotUsername(targetName);
    const matched = users.find((u) => u.username.toLowerCase() === targetName.toLowerCase());
    if (matched?.role === 'admin') {
      setAdminForgotEmail(matched.email || DEFAULT_PRIMARY_ADMIN_EMAIL);
    }
    setError('');
    setForgotPromptMessage('');
  };

  const handleSendAdminEmailOtpClick = async () => {
    setError('');
    setForgotPromptMessage('');
    if (!matchedForgotUser || matchedForgotUser.role !== 'admin') {
      setError('Firebase Email OTP verification is strictly restricted to Admin accounts only.');
      return;
    }
    const targetEmail = (
      adminForgotEmail.trim() ||
      matchedForgotUser.email ||
      DEFAULT_PRIMARY_ADMIN_EMAIL
    ).toLowerCase();

    const challenge = generateAdminEmailOtpChallenge(matchedForgotUser, targetEmail);
    if (!challenge.ok || !challenge.updatedAdmin || !challenge.otpCode) {
      setError(challenge.error || 'Could not generate Admin Email OTP.');
      return;
    }

    setAdminOtpSending(true);
    onUpdateUserSecurityState?.(challenge.updatedAdmin);
    setAdminDispatchedOtpCode(challenge.otpCode);
    setShowDispatchedOtpReceipt(false);

    const dispatchRes = await sendAdminEmailOtpViaFirebaseAndRelay({
      adminUser: challenge.updatedAdmin,
      otpCode: challenge.otpCode,
      targetEmail,
    });
    setAdminOtpSending(false);
    setAdminOtpSent(true);
    setForgotPromptMessage(dispatchRes.message);
  };

  const handleVerifyAdminGoogleEmailClick = async () => {
    setError('');
    if (!matchedForgotUser || matchedForgotUser.role !== 'admin') {
      setError('Firebase Email OTP verification is strictly restricted to Admin accounts only.');
      return;
    }
    const targetEmail = (
      adminForgotEmail.trim() ||
      matchedForgotUser.email ||
      DEFAULT_PRIMARY_ADMIN_EMAIL
    ).toLowerCase();

    const verifyRes = await verifyAdminEmailOwnershipWithFirebaseGoogle(targetEmail);
    if (!verifyRes.ok) {
      setError(verifyRes.error || 'Could not verify Admin email via Google.');
      return;
    }

    // Generate & auto-fill verified OTP challenge for the verified Admin email
    const challenge = generateAdminEmailOtpChallenge(matchedForgotUser, verifyRes.verifiedEmail);
    if (challenge.ok && challenge.updatedAdmin && challenge.otpCode) {
      onUpdateUserSecurityState?.(challenge.updatedAdmin);
      setAdminDispatchedOtpCode(challenge.otpCode);
      setAdminOtpSent(true);
      setAdminOtpEntered(challenge.otpCode);
      setForgotPromptMessage(
        `Verified Admin email (${verifyRes.verifiedEmail}) via Firebase Auth! Your 6-digit OTP has been auto-verified below — enter your new Admin password to complete.`
      );
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setForgotPromptMessage('');
    if (!forgotUsername.trim()) {
      setError('Please enter your username.');
      return;
    }

    // If target account is an ADMIN, enforce the Admin-Only Firebase Email OTP Password Reset flow
    if (isForgotTargetAdmin && matchedForgotUser) {
      if (!adminOtpSent && !matchedForgotUser.adminOtpHash) {
        setError('Please click "Send 6-Digit OTP to Admin Email" first to verify your Admin email.');
        return;
      }
      if (!adminForgotNewPassword.trim()) {
        setError('Please enter a new Admin password.');
        return;
      }
      const pwSec = evaluatePasswordSecurity(adminForgotNewPassword.trim());
      if (!pwSec.isAlphanumericValid) {
        setError(
          'New Admin password must be at least 8 characters and include uppercase, lowercase, and a number.'
        );
        return;
      }
      if (adminForgotNewPassword !== adminForgotConfirmPassword) {
        setError('New Admin Password and Confirm Admin Password do not match.');
        return;
      }

      const verifyRes = verifyAdminEmailOtpChallenge({
        adminUser: matchedForgotUser,
        enteredOtp: adminOtpEntered,
        newPasswordPlain: adminForgotNewPassword.trim(),
      });
      if (!verifyRes.ok || !verifyRes.updatedAdmin) {
        setError(verifyRes.error || 'Invalid 6-digit Email OTP.');
        return;
      }

      onUpdateUserSecurityState?.(verifyRes.updatedAdmin);
      setAdminOtpEntered('');
      setAdminDispatchedOtpCode(null);
      setAdminForgotNewPassword('');
      setAdminForgotConfirmPassword('');
      setAdminOtpSent(false);
      setUsername(verifyRes.updatedAdmin.username);
      setPassword('');
      setMode('login');
      setForgotPromptMessage(
        `Admin password for @${verifyRes.updatedAdmin.username} has been verified via Email OTP, irreversibly hashed (SHA-256), and unlocked! You can now sign in below.`
      );
      return;
    }

    // Non-admin customer flow (Email OTP is strictly disabled for regular users)
    const res = onRequestForgotPassword(forgotUsername.trim());
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setForgotPromptMessage(res.message);
  };

  const handleGoogleSignInClick = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await onGoogleLogin();
    } catch (err: any) {
      const rawMsg = String(err?.code || err?.message || '');
      if (rawMsg.includes('unauthorized-domain')) {
        const host =
          typeof window !== 'undefined' && window.location.hostname
            ? window.location.hostname
            : 'koustubhjuvekar.in';
        setError(
          `Google Popup Sign-In requires adding "${host}" to Firebase Console → Authentication → Settings → Authorized domains (Project: ai-studio-pocketledgervaul). Note: Automatic Cross-Device Cloud Sync is ALREADY ACTIVE for all Username & Password accounts below across Mobile & Desktop!`
        );
      } else {
        setError(err?.message || 'Google Sign-In popup was closed or blocked.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowRegPassword(false);
    setShowRegConfirmPassword(false);

    if (!regUsername.trim() || !regPassword.trim()) {
      setError('Username and password are required to create an account.');
      return;
    }
    const pwSec = evaluatePasswordSecurity(regPassword);
    if (!pwSec.isAlphanumericValid) {
      setError(
        'Please fulfill all green password security conditions (minimum 8 characters, uppercase, lowercase, and a number).'
      );
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match. Please make sure Password and Confirm Password match.');
      return;
    }
    const finalCurrency =
      regCurrency === 'Other' ? regCustomCurrency.trim() || '₹' : regCurrency;

    const result = onRegisterUser(
      regUsername.trim(),
      regDisplayName.trim() || regUsername.trim(),
      regPassword,
      finalCurrency,
      false
    );
    if (!result.ok && result.error) {
      setError(result.error);
    }
  };

  const regPasswordsMismatch =
    regConfirmPassword.length > 0 && regPassword !== regConfirmPassword;
  const regPasswordsMatch =
    regConfirmPassword.length > 0 && regPassword.length > 0 && regPassword === regConfirmPassword;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center p-3 sm:p-6 relative overflow-x-hidden">
      {/* Ambient Glow Orbs */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-emerald-500/15 blur-3xl animate-float-slow" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-amber-500/15 blur-3xl animate-float-reverse" />

      <div className="w-full max-w-4xl mb-4 flex flex-wrap items-center justify-between gap-2 relative z-10 animate-fade-up">
        <button
          type="button"
          onClick={onBackToLanding}
          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-transform hover:-translate-x-0.5"
        >
          <ArrowLeft className="w-4 h-4 shrink-0" />
          <span>Back to ExpenseTracker Front Page</span>
        </button>
        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          Multi-Tier Intrusion &amp; Lockout Protection Active
        </span>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden shadow-2xl relative z-10 animate-fade-up">
        {/* Left Brand & Security Architecture Panel */}
        <div className="lg:col-span-5 bg-slate-900 dark:bg-slate-950 text-slate-100 p-5 sm:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800 relative overflow-hidden">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <img
                src={EXPENSE_TRACKER_SQUARE_ICON}
                alt="ExpenseTracker Icon"
                className="w-10 h-10 sm:w-11 sm:h-11 object-contain drop-shadow-sm shrink-0"
              />
              <img
                src={EXPENSE_TRACKER_FULL_LOGO_DARK}
                alt="ExpenseTracker"
                className="h-6 sm:h-7 w-auto object-contain block shrink-0"
              />
            </div>

            <h1 className="mt-5 sm:mt-6 text-xl sm:text-2xl font-bold tracking-tight text-white text-balance">
              High-Security Personal Finance, Wallet &amp; Loan Vault
            </h1>
            <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-slate-400 leading-relaxed">
              Every user account is strictly isolated and protected by our Multi-Tier Lockout State
              Machine and real-time intrusion detection.
            </p>

            <div className="mt-5 sm:mt-6 space-y-3 text-xs text-slate-300">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-emerald-400">3-Strike PIN Guard:</strong> 3 failed Mobile
                  PIN attempts immediately disable PIN access and require full Username + Password
                  authentication.
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-amber-400">5-Strike Cooldown &amp; Intrusion Alert:</strong>{' '}
                  5 failed password attempts trigger a security intrusion alert and lock login for 5
                  minutes with a live countdown.
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-rose-400">Post-Cooldown Admin Lock:</strong> 3 additional
                  failed attempts after cooldown permanently lock the account until re-enabled by
                  Admin Support.
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span>ExpenseTracker Security v3</span>
            <span>koustubhjuvekar.in/expensetracker</span>
          </div>
        </div>

        {/* Right Sign-In, Forgot Password & Registration Panel */}
        <div className="lg:col-span-7 p-5 sm:p-8 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setForgotPromptMessage('');
                    setShowLoginPassword(false);
                  }}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError('');
                    setForgotPromptMessage('');
                    setShowRegPassword(false);
                    setShowRegConfirmPassword(false);
                  }}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Register New Account
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError('');
                    setForgotPromptMessage('');
                  }}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    mode === 'forgot'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Forgot Password?
                </button>
              </div>
            </div>

            {/* Security Intrusion Alert Notification (Triggered ONLY when >= 5 consecutive failed attempts occur after submit) */}
            {hasSubmittedForCurrentUsername && intrusionBanner && (
              <div
                role="alert"
                data-testid="security-intrusion-alert"
                className="mb-4 p-3.5 rounded-xl bg-rose-950/90 border-2 border-rose-500 text-rose-100 text-xs flex items-start gap-2.5 shadow-lg"
              >
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-extrabold uppercase tracking-wider text-rose-300">
                    Intrusion Detection Alert ({INTRUSION_ALERT_THRESHOLD}+ Failed Attempts)
                  </div>
                  <p className="leading-relaxed">{intrusionBanner}</p>
                </div>
              </div>
            )}

            {/* Tier 2 Permanent Account Lockout Prominent Alert + Direct Admin Support Button */}
            {mode === 'login' && showPermanentLockOnUi && (
              <div
                role="alert"
                data-testid="permanent-lockout-alert"
                className="mb-5 p-4 rounded-xl bg-red-50 dark:bg-red-950/80 border-2 border-red-500 dark:border-red-500 text-red-900 dark:text-red-100 space-y-3 shadow-md"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-extrabold text-sm text-red-800 dark:text-red-200">
                      Permanent Security Account Lockout
                    </div>
                    <p className="text-xs leading-relaxed font-semibold">
                      {PERMANENT_LOCKOUT_ALERT_MESSAGE}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="locked-forgot-password-support-btn"
                  onClick={handleOpenForgotPasswordSupport}
                  className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Forgot Password / Contact Admin Support</span>
                </button>
              </div>
            )}

            {/* Tier 1 5-Minute Live Cooldown Timer Box */}
            {mode === 'login' && showCooldownOnUi && (
              <div
                role="alert"
                data-testid="tier1-cooldown-timer-banner"
                className="mb-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/70 border-2 border-amber-500/80 text-amber-950 dark:text-amber-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-extrabold text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      Login Locked — 5 Failed Password Attempts
                    </div>
                    <p className="text-xs mt-0.5 text-amber-800 dark:text-amber-200">
                      Please wait for the security cooldown timer to finish before trying again.
                    </p>
                  </div>
                </div>
                <div
                  data-testid="lockout-countdown-mmss"
                  className="px-3.5 py-2 rounded-lg bg-slate-900 text-amber-400 font-mono tabular-nums text-lg font-extrabold tracking-widest shrink-0 border border-amber-500/40"
                >
                  {formatCooldownTimerMMSS(cooldownRemainingMs)}
                </div>
              </div>
            )}

            {error && !showPermanentLockOnUi && (
              <div
                role="alert"
                data-testid="auth-error-alert"
                className="mb-5 p-3.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            {forgotPromptMessage && (
              <div
                role="status"
                className="mb-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1.5"
              >
                <div className="font-bold text-sm flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-500 shrink-0" />
                  Admin Support Notified — Temporary Password Generated
                </div>
                <p className="leading-relaxed">{forgotPromptMessage}</p>
              </div>
            )}

            {mode === 'login' && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleGoogleSignInClick}
                  disabled={googleLoading || showCooldownOnUi || showPermanentLockOnUi}
                  className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 dark:text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <Cloud className="w-4 h-4 text-emerald-500" />
                  {googleLoading
                    ? 'Connecting to Google Cloud...'
                    : 'Continue with Google (Cloud Sync)'}
                </button>

                {/* Login Method Selector: Password vs Mobile PIN (Biometrics completely removed) */}
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setLoginMethod('password');
                      setError('');
                    }}
                    disabled={showCooldownOnUi || showPermanentLockOnUi}
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                      loginMethod === 'password'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Username &amp; Password</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSwitchToPinMode}
                    disabled={showPinDisabledOnUi || showCooldownOnUi || showPermanentLockOnUi}
                    data-testid="switch-to-mobile-pin-btn"
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                      loginMethod === 'pin'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>
                      {showPinDisabledOnUi ? 'PIN Disabled (3 Strikes)' : 'Mobile PIN (4–6 Digits)'}
                    </span>
                  </button>
                </div>

                <form
                  onSubmit={handleLoginSubmit}
                  className="space-y-4"
                  autoComplete="off"
                  data-form-type="other"
                >
                  {/* Hidden decoy inputs to trap browser password manager autofill and stop saved credential suggestion popups */}
                  <div
                    aria-hidden="true"
                    className="sr-only pointer-events-none h-0 overflow-hidden"
                  >
                    <input
                      type="text"
                      name="decoy_autofill_trap_user"
                      tabIndex={-1}
                      autoComplete="username"
                      defaultValue=""
                    />
                    <input
                      type="password"
                      name="decoy_autofill_trap_pass"
                      tabIndex={-1}
                      autoComplete="current-password"
                      defaultValue=""
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="login-username"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                      >
                        Username
                      </label>
                      {hasSubmittedForCurrentUsername &&
                        matchedLoginUser &&
                        !showPermanentLockOnUi &&
                        !showCooldownOnUi && (
                          <span
                            data-testid="remaining-attempts-indicator"
                            className={`text-[11px] font-mono tabular-nums font-bold px-2 py-0.5 rounded ${
                              loginMethod === 'pin'
                                ? remainingPinAttempts < PIN_MAX_STRIKES
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                  : 'text-slate-500 dark:text-slate-400'
                                : isPostCooldownTier2 ||
                                  remainingPasswordAttempts < PASSWORD_TIER1_MAX_STRIKES
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {loginMethod === 'pin'
                              ? `PIN Attempts Remaining: ${remainingPinAttempts}/${PIN_MAX_STRIKES}`
                              : isPostCooldownTier2
                              ? `Post-Cooldown Attempts Remaining: ${remainingPasswordAttempts}/${PASSWORD_TIER2_MAX_STRIKES}`
                              : `Password Attempts Remaining: ${remainingPasswordAttempts}/${PASSWORD_TIER1_MAX_STRIKES}`}
                          </span>
                        )}
                    </div>
                    <input
                      id="login-username"
                      name="vault_manual_id_entry"
                      type="text"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setSubmittedAttemptUsername(null);
                        setError('');
                        setIntrusionBanner(null);
                      }}
                      placeholder="Enter your username"
                      required
                      disabled={showCooldownOnUi || showPermanentLockOnUi}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-autocomplete="none"
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  {loginMethod === 'password' ? (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label
                          htmlFor="login-password"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                        >
                          Password (or 1st-Login Temporary Password)
                        </label>
                        <button
                          type="button"
                          onClick={handleOpenForgotPasswordSupport}
                          className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          Forgot Password?
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          id="login-password"
                          name="vault_manual_secret_entry"
                          type={showLoginPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            showPermanentLockOnUi
                              ? 'Account locked by security policy'
                              : showCooldownOnUi
                              ? `Cooldown active (${formatCooldownTimerMMSS(cooldownRemainingMs)})`
                              : 'Enter your password'
                          }
                          required
                          disabled={showCooldownOnUi || showPermanentLockOnUi}
                          autoComplete="new-password"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-autocomplete="none"
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-bwignore="true"
                          data-form-type="other"
                          className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((prev) => !prev)}
                          disabled={showCooldownOnUi || showPermanentLockOnUi}
                          aria-label={
                            showLoginPassword ? 'Hide typed password' : 'Show typed password'
                          }
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer disabled:opacity-40"
                        >
                          {showLoginPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-emerald-500/30">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="login-mobile-pin"
                          className="block text-xs font-extrabold text-emerald-700 dark:text-emerald-400"
                        >
                          Enter Mobile App PIN (4–6 Digits)
                        </label>
                        {hasSubmittedForCurrentUsername && (
                          <span className="text-[11px] font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">
                            {remainingPinAttempts} {remainingPinAttempts === 1 ? 'Strike' : 'Strikes'}{' '}
                            Left
                          </span>
                        )}
                      </div>

                      <input
                        id="login-mobile-pin"
                        name="vault_manual_pin_entry"
                        ref={pinInputRef}
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="••••"
                        required
                        disabled={showPinDisabledOnUi || showCooldownOnUi || showPermanentLockOnUi}
                        autoComplete="new-password"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-form-type="other"
                        className="w-full px-4 py-2.5 text-center text-lg tracking-[0.5em] font-mono tabular-nums font-extrabold rounded-lg border border-emerald-500/50 bg-white dark:bg-slate-900 text-slate-900 dark:text-white disabled:opacity-50"
                      />

                      {/* Interactive Mobile Numeric Keypad */}
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                          <button
                            key={digit}
                            type="button"
                            disabled={showPinDisabledOnUi || showCooldownOnUi || showPermanentLockOnUi}
                            onClick={() =>
                              setPinInput((prev) => (prev.length < 6 ? prev + digit : prev))
                            }
                            className="py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-emerald-500/10 font-mono tabular-nums font-extrabold text-sm text-slate-900 dark:text-white cursor-pointer active:scale-95 transition disabled:opacity-40"
                          >
                            {digit}
                          </button>
                        ))}
                        <button
                          type="button"
                          disabled={showPinDisabledOnUi || showCooldownOnUi || showPermanentLockOnUi}
                          onClick={() => setPinInput('')}
                          className="py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-40"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          disabled={showPinDisabledOnUi || showCooldownOnUi || showPermanentLockOnUi}
                          onClick={() =>
                            setPinInput((prev) => (prev.length < 6 ? prev + '0' : prev))
                          }
                          className="py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-emerald-500/10 font-mono tabular-nums font-extrabold text-sm text-slate-900 dark:text-white cursor-pointer active:scale-95 transition disabled:opacity-40"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          disabled={showPinDisabledOnUi || showCooldownOnUi || showPermanentLockOnUi}
                          onClick={() => setPinInput((prev) => prev.slice(0, -1))}
                          aria-label="Backspace PIN digit"
                          className="py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 cursor-pointer disabled:opacity-40"
                        >
                          <Delete className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    data-testid="login-submit-btn"
                    disabled={showCooldownOnUi || showPermanentLockOnUi}
                    className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 dark:disabled:bg-slate-800 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    {showPermanentLockOnUi
                      ? 'Account Permanently Locked by Security Policy'
                      : showCooldownOnUi
                      ? `Locked — Wait ${formatCooldownTimerMMSS(cooldownRemainingMs)}`
                      : loginMethod === 'pin'
                      ? 'Unlock App with Mobile PIN'
                      : 'Sign In to ExpenseTracker'}
                  </button>
                </form>
              </div>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgotSubmit} className="space-y-4" autoComplete="off">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between gap-2">
                    <span>Forgot Password &amp; Recovery</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-extrabold uppercase tracking-wider">
                      {isForgotTargetAdmin
                        ? 'Admin Account Detected — Free Email OTP Active'
                        : 'Email OTP Reserved for Admins Only'}
                    </span>
                  </div>
                  <p>
                    {isForgotTargetAdmin ? (
                      <>
                        Admin accounts (<strong>@{matchedForgotUser?.username}</strong>) include{' '}
                        <strong>Free Lifetime Firebase Email OTP Verification</strong>. Verify a
                        6-digit OTP sent to your Admin email to reset your password and clear any
                        security lockout.
                      </>
                    ) : (
                      <>
                        Enter your username below. <strong>Customer accounts</strong> connect with
                        Admin Support for a 1-time temporary password.{' '}
                        <strong>Admin accounts</strong> automatically unlock Free Lifetime Firebase
                        Email OTP verification.
                      </>
                    )}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="forgot-username"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Your Username
                  </label>
                  <input
                    id="forgot-username"
                    type="text"
                    value={forgotUsername}
                    onChange={(e) => {
                      const val = e.target.value;
                      setForgotUsername(val);
                      const found = users.find(
                        (u) => u.username.toLowerCase() === val.trim().toLowerCase()
                      );
                      if (found?.role === 'admin') {
                        setAdminForgotEmail(found.email || DEFAULT_PRIMARY_ADMIN_EMAIL);
                      }
                    }}
                    placeholder="Enter your username (e.g. admin)"
                    required
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* ADMIN-ONLY FREE LIFETIME FIREBASE EMAIL OTP VERIFICATION PANEL */}
                {isForgotTargetAdmin && matchedForgotUser && (
                  <div
                    data-testid="admin-forgot-email-otp-panel"
                    className="p-4 rounded-xl bg-emerald-500/5 border-2 border-emerald-500/40 space-y-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        <span>Admin-Only Free Lifetime Firebase Email OTP Verification</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        Role: ADMIN (@{matchedForgotUser.username})
                      </span>
                    </div>

                    <div>
                      <label
                        htmlFor="admin-forgot-email"
                        className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Authorized Admin Email Address
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          id="admin-forgot-email"
                          type="email"
                          value={adminForgotEmail}
                          onChange={(e) => setAdminForgotEmail(e.target.value)}
                          placeholder={DEFAULT_PRIMARY_ADMIN_EMAIL}
                          className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          data-testid="send-admin-forgot-otp-btn"
                          disabled={adminOtpSending}
                          onClick={handleSendAdminEmailOtpClick}
                          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap cursor-pointer transition"
                        >
                          {adminOtpSending
                            ? 'Sending 6-Digit OTP...'
                            : adminOtpSent
                            ? 'Resend 6-Digit Email OTP'
                            : 'Send 6-Digit OTP to Email'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        data-testid="verify-admin-google-email-btn"
                        onClick={handleVerifyAdminGoogleEmailClick}
                        className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1.5 cursor-pointer"
                      >
                        <Cloud className="w-3.5 h-3.5" />
                        <span>Instant Verify via Firebase Google Auth ({adminForgotEmail})</span>
                      </button>

                      {adminDispatchedOtpCode && (
                        <button
                          type="button"
                          data-testid="reveal-dispatched-otp-btn"
                          onClick={() => setShowDispatchedOtpReceipt((prev) => !prev)}
                          className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          {showDispatchedOtpReceipt
                            ? `Firebase Cloud OTP Receipt: ${adminDispatchedOtpCode} (Hide)`
                            : 'View Firebase Cloud OTP Dispatch Receipt'}
                        </button>
                      )}
                    </div>

                    {(adminOtpSent || Boolean(matchedForgotUser.adminOtpHash)) && (
                      <div className="space-y-3 pt-2 border-t border-emerald-500/20">
                        <div>
                          <label
                            htmlFor="admin-forgot-otp-input"
                            className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1"
                          >
                            Enter 6-Digit Email OTP Code
                          </label>
                          <input
                            id="admin-forgot-otp-input"
                            data-testid="admin-forgot-otp-input"
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={adminOtpEntered}
                            onChange={(e) =>
                              setAdminOtpEntered(e.target.value.replace(/[^0-9]/g, ''))
                            }
                            placeholder="Enter 6-digit OTP code"
                            className="w-full px-3.5 py-2 text-center font-mono text-base font-extrabold tracking-[0.4em] placeholder:tracking-normal placeholder:font-sans placeholder:font-medium placeholder:text-xs rounded-lg border border-emerald-500/60 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="admin-forgot-new-password"
                              className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1"
                            >
                              New Admin Password (SHA-256 Hashed)
                            </label>
                            <div className="relative">
                              <input
                                id="admin-forgot-new-password"
                                data-testid="admin-forgot-new-password"
                                type={showAdminForgotNewPass ? 'text' : 'password'}
                                value={adminForgotNewPassword}
                                onChange={(e) => setAdminForgotNewPassword(e.target.value)}
                                placeholder="Min 8 chars, A-Z, a-z, 0-9"
                                className="w-full pl-3 pr-9 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                              />
                              <button
                                type="button"
                                onClick={() => setShowAdminForgotNewPass((p) => !p)}
                                aria-label="Toggle new admin password visibility"
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                {showAdminForgotNewPass ? (
                                  <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                  <Eye className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </div>
                          <div>
                            <label
                              htmlFor="admin-forgot-confirm-password"
                              className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1"
                            >
                              Confirm New Admin Password
                            </label>
                            <input
                              id="admin-forgot-confirm-password"
                              data-testid="admin-forgot-confirm-password"
                              type={showAdminForgotNewPass ? 'text' : 'password'}
                              value={adminForgotConfirmPassword}
                              onChange={(e) => setAdminForgotConfirmPassword(e.target.value)}
                              placeholder="Re-enter new Admin password"
                              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                            />
                          </div>
                        </div>

                        {adminForgotNewPassword.length > 0 && (
                          <PasswordStrengthChecklist password={adminForgotNewPassword} compact />
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    data-testid="submit-forgot-password-btn"
                    className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                      isForgotTargetAdmin
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    }`}
                  >
                    <KeyRound className="w-4 h-4" />
                    {isForgotTargetAdmin
                      ? 'Verify Admin Email OTP & Save New Hashed Password'
                      : 'Connect with Admin Support & Request Reset'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4" autoComplete="off">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="reg-username"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      New Username
                    </label>
                    <input
                      id="reg-username"
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="e.g. koustubh"
                      required
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reg-display"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Full Name
                    </label>
                    <input
                      id="reg-display"
                      type="text"
                      value={regDisplayName}
                      onChange={(e) => setRegDisplayName(e.target.value)}
                      placeholder="e.g. Koustubh Juvekar"
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="reg-password"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="reg-password"
                        type={showRegPassword ? 'text' : 'password'}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Set a strong password"
                        required
                        autoComplete="new-password"
                        className="w-full pl-3.5 pr-10 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((prev) => !prev)}
                        aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showRegPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="reg-confirm-password"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        id="reg-confirm-password"
                        type={showRegConfirmPassword ? 'text' : 'password'}
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="Re-enter password to confirm"
                        required
                        autoComplete="new-password"
                        className={`w-full pl-3.5 pr-10 py-2 text-sm rounded-lg border bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${
                          regPasswordsMismatch
                            ? 'border-rose-500 focus:outline-rose-500'
                            : regPasswordsMatch
                            ? 'border-emerald-500 focus:outline-emerald-500'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegConfirmPassword((prev) => !prev)}
                        aria-label={
                          showRegConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {showRegConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {regPasswordsMismatch && (
                      <p
                        role="alert"
                        data-testid="reg-password-mismatch-msg"
                        className="mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1"
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Passwords do not match</span>
                      </p>
                    )}
                    {regPasswordsMatch && (
                      <p
                        data-testid="reg-password-match-msg"
                        className="mt-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Passwords match</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Live Alphanumeric Security Reason & Red/Green Checklist */}
                <PasswordStrengthChecklist password={regPassword} />

                <div>
                  <label
                    htmlFor="reg-currency"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Primary Currency
                  </label>
                  <select
                    id="reg-currency"
                    value={regCurrency}
                    onChange={(e) => setRegCurrency(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {regCurrency === 'Other' && (
                  <div>
                    <label
                      htmlFor="reg-custom-currency"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Custom Currency Symbol / Code (Other)
                    </label>
                    <input
                      id="reg-custom-currency"
                      type="text"
                      value={regCustomCurrency}
                      onChange={(e) => setRegCustomCurrency(e.target.value)}
                      placeholder="e.g. AED, CAD, ¥, CHF"
                      className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Create Private Account &amp; Open Vault
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
