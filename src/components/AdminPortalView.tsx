import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Ban,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  ImagePlus,
  Images,
  KeyRound,
  Lock,
  LogOut,
  MessageSquare,
  Moon,
  Move,
  Palette,
  PauseCircle,
  PlayCircle,
  RectangleHorizontal,
  RectangleVertical,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Sun,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AccountLifecycleStatus, PdfHeaderImageConfig, TransactionRecord, UserAccount } from '../types/finance';
import {
  collectStorageFootprintJsonStrings,
  compressImageFileToDataUrl,
  DEFAULT_PDF_HEADER_CONFIG,
  parseHeroImagesPayload,
  serializeHeroImagesPayload,
} from '../utils/localVaultStorage';
import {
  EXPENSE_TRACKER_FULL_LOGO,
  EXPENSE_TRACKER_FULL_LOGO_DARK,
  EXPENSE_TRACKER_SQUARE_ICON,
  extractDominantColorFromImageDataUrl,
} from '../utils/bankLogos';
import {
  calculateFirebaseFreeTierStorageStats,
  DEFAULT_PRIMARY_ADMIN_EMAIL,
  evaluatePasswordSecurity,
  formatStorageBytes,
  generateAdminEmailOtpChallenge,
  isIrreversibleHash,
  verifySecretAgainstStoredHash,
} from '../utils/financeRules';
import {
  fetchLiveFirebaseAdminOverview,
  FIREBASE_CONSOLE_LINKS,
  FirebaseStoredImageItem,
  LiveFirebaseAdminOverview,
  sendAdminEmailOtpViaFirebaseAndRelay,
  verifyAdminEmailOwnershipWithFirebaseGoogle,
} from '../lib/firebase';
import { PasswordStrengthChecklist } from './PasswordStrengthChecklist';
import { PdfPreviewModal } from './PdfPreviewModal';
import { PWAInstallButton } from './PWAInstallButton';

interface AdminPortalViewProps {
  adminUser: UserAccount;
  users: UserAccount[];
  darkMode: boolean;
  onToggleDarkMode: () => void;
  inactivityRemainingSeconds?: number;
  landingHeroImage: string | null;
  onUpdateLandingHeroImage: (dataUrl: string | null) => void;
  pdfHeaderConfig: PdfHeaderImageConfig;
  onSavePdfHeaderConfig: (config: PdfHeaderImageConfig) => void;
  onGenerateTempPasswordForUser: (userId: string) => string;
  onResolveForgotPasswordIssue: (userId: string) => void;
  onUpdateAdminPassword: (displayName: string, newPassword: string, adminEmail?: string) => void;
  onAdminCreateCustomer: (
    username: string,
    displayName: string,
    password: string
  ) => { ok: boolean; error?: string };
  onAdminCreateAdmin: (details: {
    username: string;
    displayName: string;
    email: string;
    phone: string;
    department: string;
    currency: string;
  }) => { ok: boolean; tempPassword?: string; error?: string };
  onAdminUpdateAccountStatus: (
    userId: string,
    status: AccountLifecycleStatus,
    reason?: string
  ) => void;
  onAdminSendSupportMessage: (userId: string, text: string, updatedReason?: string) => void;
  onAdminCloseSupportIssue: (userId: string) => void;
  onAdminPermanentlyDeleteUser: (
    userId: string,
    adminPassword?: string
  ) => { ok: boolean; error?: string } | void;
  onResetEntirePortal: (adminPassword: string) => { ok: boolean; error?: string };
  onSyncLiveUsersFromFirebase?: (users: UserAccount[]) => void;
  onTriggerFeedback: (
    message: string,
    type?: 'success' | 'error',
    mode?: 'fullscreen' | 'toast'
  ) => void;
  onLogout: () => void;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  adminUser,
  users,
  darkMode,
  onToggleDarkMode,
  inactivityRemainingSeconds,
  landingHeroImage,
  onUpdateLandingHeroImage,
  pdfHeaderConfig,
  onSavePdfHeaderConfig,
  onGenerateTempPasswordForUser,
  onResolveForgotPasswordIssue,
  onUpdateAdminPassword,
  onAdminCreateCustomer,
  onAdminCreateAdmin,
  onAdminUpdateAccountStatus,
  onAdminSendSupportMessage,
  onAdminCloseSupportIssue,
  onAdminPermanentlyDeleteUser,
  onResetEntirePortal,
  onSyncLiveUsersFromFirebase,
  onTriggerFeedback,
  onLogout,
}) => {
  const [statusBanner, setStatusBanner] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [copiedUserId, setCopiedUserId] = useState<string>('');

  // Live Firebase Inspector & Refresh State
  const [firebaseRefreshing, setFirebaseRefreshing] = useState<boolean>(false);
  const [liveFirebaseOverview, setLiveFirebaseOverview] =
    useState<LiveFirebaseAdminOverview | null>(null);
  const [activeFirebaseInspectorTab, setActiveFirebaseInspectorTab] = useState<
    'images' | 'users' | 'data' | null
  >(null);
  const [previewStoredImage, setPreviewStoredImage] = useState<FirebaseStoredImageItem | null>(
    null
  );

  // Support Chat & Hold Reason Modal State
  const [activeSupportUserId, setActiveSupportUserId] = useState<string | null>(null);
  const [adminReasonInput, setAdminReasonInput] = useState<string>('');
  const [adminMessageInput, setAdminMessageInput] = useState<string>('');

  // Master Reset Portal Modal State (for primary Admin `user-admin`)
  const [showResetPortalModal, setShowResetPortalModal] = useState<boolean>(false);
  const [resetPortalPassword, setResetPortalPassword] = useState<string>('');
  const [showResetPortalPass, setShowResetPortalPass] = useState<boolean>(false);
  const [resetPortalError, setResetPortalError] = useState<string>('');

  // Confirm Permanent User Deletion Modal State (requires Admin Password before deleting any user in Admin)
  const [userPendingPermanentDelete, setUserPendingPermanentDelete] =
    useState<UserAccount | null>(null);
  const [adminDeleteUserPassword, setAdminDeleteUserPassword] = useState<string>('');
  const [showAdminDeleteUserPass, setShowAdminDeleteUserPass] = useState<boolean>(false);
  const [adminDeleteUserError, setAdminDeleteUserError] = useState<string>('');

  // Admin own password change state (with Free Lifetime Firebase Email OTP + Confirm Password)
  const [adminDisplayName, setAdminDisplayName] = useState(adminUser.displayName);
  const [adminEmailInput, setAdminEmailInput] = useState(
    adminUser.email || DEFAULT_PRIMARY_ADMIN_EMAIL
  );
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [showAdminNewPass, setShowAdminNewPass] = useState(false);
  const [showAdminConfirmPass, setShowAdminConfirmPass] = useState(false);
  const [adminOtpHashState, setAdminOtpHashState] = useState<string | null>(null);
  const [adminOtpExpiresAtMs, setAdminOtpExpiresAtMs] = useState<number>(0);
  const [adminDispatchedOtpPlain, setAdminDispatchedOtpPlain] = useState<string | null>(null);
  const [showAdminDispatchedOtp, setShowAdminDispatchedOtp] = useState(false);
  const [adminOtpSending, setAdminOtpSending] = useState(false);
  const [adminOtpEntered, setAdminOtpEntered] = useState('');

  // Transient in-memory map for newly generated 1-time temp passwords (never persisted in plaintext)
  const [sessionTempPasswords, setSessionTempPasswords] = useState<Record<string, string>>({});

  // Admin create new customer account state (with Confirm Password + transient Eye toggles)
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newTempOrInitPass, setNewTempOrInitPass] = useState('');
  const [newCustomerConfirmPass, setNewCustomerConfirmPass] = useState('');
  const [showNewCustomerPass, setShowNewCustomerPass] = useState(false);
  const [showNewCustomerConfirmPass, setShowNewCustomerConfirmPass] = useState(false);

  // Admin create new Admin account state (with all details + random 1-time temporary password)
  const [newAdminUsername, setNewAdminUsername] = useState('');
  const [newAdminDisplayName, setNewAdminDisplayName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminDepartment, setNewAdminDepartment] = useState('Finance & Audit Admin');
  const [newAdminCurrency, setNewAdminCurrency] = useState('₹');
  const [createdAdminCredentials, setCreatedAdminCredentials] = useState<{
    username: string;
    displayName: string;
    tempPassword: string;
  } | null>(null);

  // PDF Header Image Studio state (with interactive drag & 8-direction unlimited height resize handles)
  const [draftPdfHeader, setDraftPdfHeader] = useState<PdfHeaderImageConfig>({
    ...pdfHeaderConfig,
    imageUrl: pdfHeaderConfig.imageUrl || (pdfHeaderConfig as any).dataUrl || null,
    headerBgColor: pdfHeaderConfig.headerBgColor || '#162d59',
    orientation: pdfHeaderConfig.orientation || 'portrait',
  });
  const [showInteractiveHandles, setShowInteractiveHandles] = useState<boolean>(true);
  const [showExamplePdfModal, setShowExamplePdfModal] = useState<boolean>(false);

  useEffect(() => {
    setDraftPdfHeader((prev) => ({
      ...prev,
      ...pdfHeaderConfig,
      imageUrl:
        pdfHeaderConfig.imageUrl ||
        (pdfHeaderConfig as any).dataUrl ||
        prev.imageUrl ||
        null,
      headerBgColor: pdfHeaderConfig.headerBgColor || prev.headerBgColor || '#162d59',
    }));
  }, [pdfHeaderConfig]);

  const interactionRef = useRef<{
    type: 'move' | 'resize';
    dir?: ResizeDirection;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  const usersRequestingReset = users.filter(
    (u) => u.forgotPasswordRequested || u.tempPasswordValidForFirstLogin
  );

  const activeSupportUser = activeSupportUserId
    ? users.find((u) => u.id === activeSupportUserId) || null
    : null;

  const openSupportModalForUser = (u: UserAccount) => {
    setActiveSupportUserId(u.id);
    setAdminReasonInput(
      u.holdReason ||
        'Your account is currently on hold for verification. Please contact Admin Support.'
    );
    setAdminMessageInput('');
  };

  const handleSendSupportReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSupportUser) return;
    if (!adminMessageInput.trim() && !adminReasonInput.trim()) return;

    if (adminMessageInput.trim()) {
      onAdminSendSupportMessage(
        activeSupportUser.id,
        adminMessageInput.trim(),
        adminReasonInput.trim() || undefined
      );
      setAdminMessageInput('');
      setStatusBanner(`Sent support message & notification to @${activeSupportUser.username}.`);
      onTriggerFeedback(`Message Sent to @${activeSupportUser.username}`, 'success');
    } else if (adminReasonInput.trim()) {
      onAdminUpdateAccountStatus(
        activeSupportUser.id,
        activeSupportUser.accountStatus || 'on_hold',
        adminReasonInput.trim()
      );
      setStatusBanner(`Updated account status reason for @${activeSupportUser.username}.`);
      onTriggerFeedback('Account Reason Updated Successfully', 'success');
    }
  };

  const handleCopyTempPassword = (userId: string, tempPass: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(tempPass).catch(() => {});
    }
    setCopiedUserId(userId);
    setStatusBanner(`Copied 1st-login temporary password (${tempPass}) to clipboard.`);
    setTimeout(() => setCopiedUserId(''), 2500);
  };

  const handleIssueTempPassword = (u: UserAccount) => {
    const generated = onGenerateTempPasswordForUser(u.id);
    setSessionTempPasswords((prev) => ({ ...prev, [u.id]: generated }));
    setStatusBanner(
      `Generated 1st-login-only temporary password (${generated}) for @${u.username}. Copy it now — it is stored as an irreversible SHA-256 hash in the database.`
    );
    onTriggerFeedback(`1-Time Temp Password Generated for @${u.username}`, 'success');
  };

  const handleSolvedIssueClick = (u: UserAccount) => {
    onResolveForgotPasswordIssue(u.id);
    setStatusBanner(
      `Solved password reset issue for @${u.username}. Security alert cleared and account status restored.`
    );
    onTriggerFeedback('Password Issue Resolved Successfully', 'success');
  };

  const heroImagesList = parseHeroImagesPayload(landingHeroImage);

  const storageFootprintStrings = collectStorageFootprintJsonStrings(
    users,
    heroImagesList,
    draftPdfHeader
  );
  const firebaseStorageReport = calculateFirebaseFreeTierStorageStats(storageFootprintStrings);

  const handleRefreshLiveFirebaseData = async (showFeedback = true) => {
    setFirebaseRefreshing(true);
    try {
      const overview = await fetchLiveFirebaseAdminOverview({
        currentUsers: users,
        heroImage: landingHeroImage,
        pdfHeaderConfig: draftPdfHeader,
        forceFirestoreCheck: showFeedback,
      });
      setLiveFirebaseOverview(overview);
      if (onSyncLiveUsersFromFirebase && overview.users.length > 0) {
        onSyncLiveUsersFromFirebase(overview.users);
      }
      if (showFeedback) {
        setStatusBanner(
          `Refreshed live Firebase data at ${new Date(
            overview.refreshedAtIso
          ).toLocaleTimeString()}: ${overview.users.length} Users in /appUsers, ${
            overview.vaultSummaries.length
          } Vaults in /userVaults, and ${overview.storedImages.length} Images stored in Firebase.`
        );
        onTriggerFeedback(
          `Live Firebase Data Refreshed (${overview.users.length} Users, ${overview.storedImages.length} Images)`,
          'success',
          'toast'
        );
      }
    } catch {
      if (showFeedback) {
        setErrorBanner('Could not refresh live Firebase data. Showing latest cached snapshot.');
      }
    } finally {
      setFirebaseRefreshing(false);
    }
  };

  useEffect(() => {
    void handleRefreshLiveFirebaseData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users.length, landingHeroImage, draftPdfHeader.imageUrl]);

  const heroFileInputRef = useRef<HTMLInputElement | null>(null);
  const [adminBannerPreviewIdx, setAdminBannerPreviewIdx] = useState(0);

  useEffect(() => {
    if (heroImagesList.length <= 1) {
      setAdminBannerPreviewIdx(0);
      return;
    }
    const timer = window.setInterval(() => {
      setAdminBannerPreviewIdx((prev) => (prev + 1) % heroImagesList.length);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [heroImagesList.length]);

  const readFileAsDataUrlFallback = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Empty file result'));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

  const processHeroImageFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isImg =
          file.type.startsWith('image/') ||
          /\.(png|jpe?g|webp|gif|svg|bmp|avif|ico)$/i.test(file.name || '');
        if (!isImg) continue;
        try {
          // Compress each banner photo cleanly so multiple photos fit inside Firestore's document limit
          const dataUrl = await compressImageFileToDataUrl(file, 720, 0.8);
          if (dataUrl && dataUrl.startsWith('data:')) {
            uploadedUrls.push(dataUrl);
          }
        } catch {
          const fallbackUrl = await readFileAsDataUrlFallback(file);
          if (fallbackUrl && fallbackUrl.startsWith('data:')) {
            uploadedUrls.push(fallbackUrl);
          }
        }
      }
      if (uploadedUrls.length === 0) {
        setErrorBanner('Please select valid image files (PNG, JPG, WEBP, GIF, or SVG).');
        return;
      }
      const combined = [...heroImagesList, ...uploadedUrls];
      const serialized = serializeHeroImagesPayload(combined);
      const savedCount = parseHeroImagesPayload(serialized).length;
      onUpdateLandingHeroImage(serialized || null);
      setAdminBannerPreviewIdx(Math.max(0, savedCount - 1));
      setStatusBanner(
        `Uploaded & saved ${uploadedUrls.length} photo(s) to Front Page Hero Banner (${savedCount} total active in database)! Automatically synced to Firebase & Public Landing Page.`
      );
      onTriggerFeedback(
        uploadedUrls.length > 1
          ? `${uploadedUrls.length} Banner Photos Saved to Database`
          : 'Banner Photo Saved to Database',
        'success'
      );
    } catch {
      setErrorBanner('Could not process the selected image file(s).');
      onTriggerFeedback('Image Upload Failed', 'error');
    }
  };

  const handleHeroImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    await processHeroImageFiles(Array.from(fileList));
    e.target.value = '';
  };

  const handleRemoveSingleHeroPhoto = (indexToRemove: number) => {
    const remaining = heroImagesList.filter((_, idx) => idx !== indexToRemove);
    const serialized = serializeHeroImagesPayload(remaining);
    onUpdateLandingHeroImage(serialized || null);
    setAdminBannerPreviewIdx(0);
    setStatusBanner(
      remaining.length > 0
        ? `Removed photo #${indexToRemove + 1}. ${remaining.length} banner photo(s) remaining and Firebase database updated.`
        : 'All custom banner photos removed. Restored default Indian Family poster and freed Firebase storage.'
    );
    onTriggerFeedback('Banner Photo Deleted & Database Updated', 'success', 'toast');
  };

  const processPdfHeaderImageFile = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      // Preserve transparency and HD crispness (no background fill box!)
      const dataUrl = await compressImageFileToDataUrl(file, 650, 0.92, true);
      const extractedColor = await extractDominantColorFromImageDataUrl(dataUrl);
      const next: PdfHeaderImageConfig = {
        ...draftPdfHeader,
        imageUrl: dataUrl,
        headerBgColor: extractedColor,
      };
      setDraftPdfHeader(next);
      setShowInteractiveHandles(true);
      onSavePdfHeaderConfig(next);
      setStatusBanner(
        `Uploaded HD PDF Header Image & synced reference background color (${extractedColor})! Drag any side/corner handle to resize with unlimited height, or open the Example PDF Popup.`
      );
      onTriggerFeedback('Header Image & Reference Color Synced', 'success', 'toast');
    } catch {
      setErrorBanner('Could not read the uploaded PDF header image.');
      onTriggerFeedback('PDF Header Image Upload Failed', 'error', 'toast');
    }
  };

  const handlePdfHeaderImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processPdfHeaderImageFile(file);
  };

  // Interactive Pointer Drag & All-Sides / All-Corners Unlimited Resize Handlers
  const startMoveHeaderImage = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    interactionRef.current = {
      type: 'move',
      startX: e.clientX,
      startY: e.clientY,
      startW: draftPdfHeader.width,
      startH: draftPdfHeader.height,
      startOffsetX: draftPdfHeader.offsetX,
      startOffsetY: draftPdfHeader.offsetY,
    };
  };

  const startResizeHeaderImage = (dir: ResizeDirection, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    interactionRef.current = {
      type: 'resize',
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startW: draftPdfHeader.width,
      startH: draftPdfHeader.height,
      startOffsetX: draftPdfHeader.offsetX,
      startOffsetY: draftPdfHeader.offsetY,
    };
  };

  const handlePointerMoveOnPreview = (e: React.PointerEvent) => {
    const active = interactionRef.current;
    if (!active) return;
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;

    if (active.type === 'move') {
      const nextX = Math.max(-260, Math.min(260, Math.round(active.startOffsetX + dx)));
      const nextY = Math.max(-160, Math.min(160, Math.round(active.startOffsetY + dy)));
      setDraftPdfHeader((prev) => ({
        ...prev,
        offsetX: nextX,
        offsetY: nextY,
      }));
      return;
    }

    if (active.type === 'resize' && active.dir) {
      let nextW = active.startW;
      let nextH = active.startH;
      let nextOffsetX = active.startOffsetX;
      let nextOffsetY = active.startOffsetY;

      if (active.dir.includes('e')) {
        nextW = Math.max(24, Math.min(520, Math.round(active.startW + dx)));
      }
      if (active.dir.includes('w')) {
        const proposedW = Math.max(24, Math.min(520, Math.round(active.startW - dx)));
        nextOffsetX = Math.round(active.startOffsetX + (active.startW - proposedW) / 2);
        nextW = proposedW;
      }
      // Unlimited height! Drag as tall as desired
      if (active.dir.includes('s')) {
        nextH = Math.max(18, Math.round(active.startH + dy));
      }
      if (active.dir.includes('n')) {
        const proposedH = Math.max(18, Math.round(active.startH - dy));
        nextOffsetY = Math.round(active.startOffsetY + (active.startH - proposedH) / 2);
        nextH = proposedH;
      }

      setDraftPdfHeader((prev) => ({
        ...prev,
        width: nextW,
        height: nextH,
        offsetX: Math.max(-260, Math.min(260, nextOffsetX)),
        offsetY: Math.max(-160, Math.min(160, nextOffsetY)),
      }));
    }
  };

  const stopPointerInteraction = () => {
    if (interactionRef.current) {
      interactionRef.current = null;
      onSavePdfHeaderConfig(draftPdfHeader);
    }
  };

  const handleSavePdfHeaderSettings = () => {
    onSavePdfHeaderConfig(draftPdfHeader);
    setStatusBanner(
      `Saved PDF Header Image (${draftPdfHeader.width}×${draftPdfHeader.height}px, ${
        draftPdfHeader.orientation === 'landscape' ? 'Landscape' : 'Portrait'
      } A4 default)! Preview and downloaded PDF are 100% synced.`
    );
    onTriggerFeedback('PDF Header Settings Saved Successfully', 'success');
  };

  const handleResetPdfHeaderSettings = () => {
    const reset = { ...DEFAULT_PDF_HEADER_CONFIG };
    setDraftPdfHeader(reset);
    onSavePdfHeaderConfig(reset);
    setStatusBanner('Cleared custom PDF Header Image and restored default header.');
    onTriggerFeedback('PDF Header Image Removed', 'success');
  };

  const handleSendAdminPortalOtp = async () => {
    setErrorBanner('');
    if (adminUser.role !== 'admin') {
      setErrorBanner('Firebase Email OTP verification is strictly restricted to Admin accounts only.');
      return;
    }
    const cleanEmail = (adminEmailInput.trim() || adminUser.email || DEFAULT_PRIMARY_ADMIN_EMAIL).toLowerCase();
    const challenge = generateAdminEmailOtpChallenge(adminUser, cleanEmail);
    if (!challenge.ok || !challenge.otpCode || !challenge.otpHash || !challenge.expiresAtMs) {
      setErrorBanner(challenge.error || 'Could not generate Admin Email OTP.');
      return;
    }
    setAdminOtpSending(true);
    setAdminOtpHashState(challenge.otpHash);
    setAdminOtpExpiresAtMs(challenge.expiresAtMs);
    setAdminDispatchedOtpPlain(challenge.otpCode);
    setShowAdminDispatchedOtp(false);

    const dispatchRes = await sendAdminEmailOtpViaFirebaseAndRelay({
      adminUser,
      otpCode: challenge.otpCode,
      targetEmail: cleanEmail,
    });
    setAdminOtpSending(false);
    setStatusBanner(dispatchRes.message);
    onTriggerFeedback(`6-Digit OTP Sent to ${cleanEmail}`, 'success', 'toast');
  };

  const handleVerifyAdminPortalGoogleEmail = async () => {
    setErrorBanner('');
    const cleanEmail = (adminEmailInput.trim() || adminUser.email || DEFAULT_PRIMARY_ADMIN_EMAIL).toLowerCase();
    const res = await verifyAdminEmailOwnershipWithFirebaseGoogle(cleanEmail);
    if (!res.ok) {
      setErrorBanner(res.error || 'Could not verify Admin email via Firebase Google Auth.');
      return;
    }
    const challenge = generateAdminEmailOtpChallenge(adminUser, res.verifiedEmail);
    if (challenge.ok && challenge.otpCode && challenge.otpHash && challenge.expiresAtMs) {
      setAdminOtpHashState(challenge.otpHash);
      setAdminOtpExpiresAtMs(challenge.expiresAtMs);
      setAdminDispatchedOtpPlain(challenge.otpCode);
      setAdminOtpEntered(challenge.otpCode);
      setStatusBanner(
        `Verified Admin Email (${res.verifiedEmail}) via Firebase Google Auth! 6-digit OTP auto-verified.`
      );
      onTriggerFeedback('Admin Email Verified via Firebase', 'success', 'toast');
    }
  };

  const handleSaveAdminCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner('');
    setShowAdminNewPass(false);
    setShowAdminConfirmPass(false);

    if (!adminNewPassword.trim()) {
      setErrorBanner('Please enter a new admin password to update.');
      onTriggerFeedback('Please Enter a New Password', 'error', 'toast');
      return;
    }
    const pwSec = evaluatePasswordSecurity(adminNewPassword.trim());
    if (!pwSec.isAlphanumericValid) {
      setErrorBanner(
        'Please fulfill all green password security conditions (minimum 8 characters, uppercase, lowercase, and a number).'
      );
      onTriggerFeedback('Password Must Be Alphanumeric (8+ Chars)', 'error', 'toast');
      return;
    }
    if (adminNewPassword !== adminConfirmPassword) {
      setErrorBanner('New Admin Password and Confirm Admin Password do not match.');
      onTriggerFeedback('Passwords Do Not Match', 'error', 'toast');
      return;
    }

    // Require Admin Email OTP verification before changing Admin Password
    if (!adminOtpHashState || Date.now() > adminOtpExpiresAtMs) {
      setErrorBanner(
        'Admin password change requires Free Lifetime Firebase Email OTP verification. Please click "Send 6-Digit OTP to Admin Email" first.'
      );
      onTriggerFeedback('Send & Enter 6-Digit Email OTP First', 'error', 'toast');
      return;
    }
    if (!verifySecretAgainstStoredHash(adminOtpEntered.trim(), adminOtpHashState)) {
      setErrorBanner('Invalid 6-digit Admin Email OTP code. Please verify and try again.');
      onTriggerFeedback('Invalid 6-Digit Email OTP', 'error', 'toast');
      return;
    }

    onUpdateAdminPassword(
      adminDisplayName.trim() || adminUser.displayName,
      adminNewPassword.trim(),
      adminEmailInput.trim() || DEFAULT_PRIMARY_ADMIN_EMAIL
    );
    setAdminNewPassword('');
    setAdminConfirmPassword('');
    setAdminOtpEntered('');
    setAdminOtpHashState(null);
    setAdminDispatchedOtpPlain(null);
    setStatusBanner(
      'Admin display name, email, and zero-knowledge SHA-256 hashed password updated via Email OTP!'
    );
    onTriggerFeedback('Admin Password Updated via Email OTP', 'success', 'fullscreen');
  };

  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner('');
    setShowNewCustomerPass(false);
    setShowNewCustomerConfirmPass(false);

    if (!newUsername.trim() || !newTempOrInitPass.trim()) return;
    const pwSec = evaluatePasswordSecurity(newTempOrInitPass.trim());
    if (!pwSec.isAlphanumericValid) {
      setErrorBanner(
        'Customer initial password must be alphanumeric (at least 8 characters with uppercase, lowercase, and a number).'
      );
      onTriggerFeedback('Customer Password Must Be Alphanumeric', 'error', 'toast');
      return;
    }
    if (newTempOrInitPass !== newCustomerConfirmPass) {
      setErrorBanner('Customer Initial Password and Confirm Password do not match.');
      onTriggerFeedback('Passwords Do Not Match', 'error', 'toast');
      return;
    }
    const res = onAdminCreateCustomer(
      newUsername.trim(),
      newDisplayName.trim() || newUsername.trim(),
      newTempOrInitPass.trim()
    );
    if (!res.ok) {
      setErrorBanner(res.error || 'Could not create user.');
      onTriggerFeedback(res.error || 'Could not create user', 'error', 'toast');
      return;
    }
    setStatusBanner(`Created customer account @${newUsername.trim()}.`);
    onTriggerFeedback(`Customer @${newUsername.trim()} Created Successfully`, 'success', 'toast');
    setNewUsername('');
    setNewDisplayName('');
    setNewTempOrInitPass('');
    setNewCustomerConfirmPass('');
  };

  const handleCreateNewAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner('');
    if (!newAdminUsername.trim() || !newAdminDisplayName.trim()) {
      setErrorBanner('Admin Username and Full Name are required to add a new Admin.');
      onTriggerFeedback('Admin Username & Name Required', 'error');
      return;
    }
    const res = onAdminCreateAdmin({
      username: newAdminUsername.trim(),
      displayName: newAdminDisplayName.trim(),
      email: newAdminEmail.trim(),
      phone: newAdminPhone.trim(),
      department: newAdminDepartment.trim(),
      currency: newAdminCurrency,
    });
    if (!res.ok || !res.tempPassword) {
      setErrorBanner(res.error || 'Could not create new Admin account.');
      onTriggerFeedback(res.error || 'Could not create Admin', 'error');
      return;
    }
    setCreatedAdminCredentials({
      username: newAdminUsername.trim(),
      displayName: newAdminDisplayName.trim(),
      tempPassword: res.tempPassword,
    });
    setStatusBanner(
      `Created new Admin @${newAdminUsername.trim()} with 1-time temporary password: ${res.tempPassword}`
    );
    onTriggerFeedback(`New Admin @${newAdminUsername.trim()} Created`, 'success');
    setNewAdminUsername('');
    setNewAdminDisplayName('');
    setNewAdminEmail('');
    setNewAdminPhone('');
  };

  const handleConfirmResetEntirePortal = (e: React.FormEvent) => {
    e.preventDefault();
    setResetPortalError('');
    setShowResetPortalPass(false);
    if (!resetPortalPassword.trim()) {
      setResetPortalError('Please enter your Admin password to confirm full portal reset.');
      return;
    }
    const res = onResetEntirePortal(resetPortalPassword);
    if (!res.ok) {
      setResetPortalError(res.error || 'Incorrect Admin password. Portal reset cancelled.');
      onTriggerFeedback(res.error || 'Incorrect Admin Password', 'error');
      return;
    }
    setShowResetPortalModal(false);
    setResetPortalPassword('');
    setDraftPdfHeader({ ...DEFAULT_PDF_HEADER_CONFIG });
    setStatusBanner(
      'Portal Reset Complete! All cloud and local user accounts, vaults, and custom images have been cleared.'
    );
    onTriggerFeedback('Portal Reset & All Data Cleared Successfully', 'success', 'fullscreen');
  };

  const activeHeaderImageUrl = draftPdfHeader.imageUrl || (draftPdfHeader as any).dataUrl;

  // Render the interactive borderless image box with 4 sides + 4 corners resize handles (unlimited height)
  const renderInteractiveHeaderImage = () => {
    if (!activeHeaderImageUrl) return null;
    return (
      <div
        onPointerDown={startMoveHeaderImage}
        onPointerMove={handlePointerMoveOnPreview}
        onPointerUp={stopPointerInteraction}
        style={{
          width: `${draftPdfHeader.width}px`,
          height: `${draftPdfHeader.height}px`,
          transform: `translate(${draftPdfHeader.offsetX}px, ${draftPdfHeader.offsetY}px)`,
          touchAction: 'none',
        }}
        title="Drag image to position, or drag any side/corner handle to resize (unlimited height)"
        className={`relative shrink-0 select-none cursor-move group ${
          showInteractiveHandles ? 'outline-1 outline-dashed outline-amber-300/90' : ''
        }`}
      >
        {/* Borderless Image — NO background box or padding, exact object-contain aspect ratio */}
        <img
          src={activeHeaderImageUrl}
          alt="PDF Header Preview"
          draggable={false}
          className="w-full h-full object-contain pointer-events-none select-none"
        />

        {showInteractiveHandles && (
          <>
            {/* 4 Corner Handles (NW, NE, SW, SE) */}
            <div
              onPointerDown={(e) => startResizeHeaderImage('nw', e)}
              title="Drag Top-Left Corner to resize"
              data-resize-handle="nw"
              className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-amber-300 border border-slate-900 cursor-nwse-resize shadow"
            />
            <div
              onPointerDown={(e) => startResizeHeaderImage('ne', e)}
              title="Drag Top-Right Corner to resize"
              data-resize-handle="ne"
              className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-amber-300 border border-slate-900 cursor-nesw-resize shadow"
            />
            <div
              onPointerDown={(e) => startResizeHeaderImage('sw', e)}
              title="Drag Bottom-Left Corner to resize"
              data-resize-handle="sw"
              className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 rounded-full bg-amber-300 border border-slate-900 cursor-nesw-resize shadow"
            />
            <div
              onPointerDown={(e) => startResizeHeaderImage('se', e)}
              title="Drag Bottom-Right Corner to resize"
              data-resize-handle="se"
              className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-amber-300 border border-slate-900 cursor-nwse-resize shadow"
            />

            {/* 4 Side Handles (N, S, E, W) */}
            <div
              onPointerDown={(e) => startResizeHeaderImage('n', e)}
              title="Drag Top Side to resize height (unlimited)"
              data-resize-handle="n"
              className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-5 h-2 rounded-xs bg-white border border-slate-900 cursor-ns-resize shadow"
            />
            <div
              onPointerDown={(e) => startResizeHeaderImage('s', e)}
              title="Drag Bottom Side to resize height (unlimited)"
              data-resize-handle="s"
              className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-2 rounded-xs bg-white border border-slate-900 cursor-ns-resize shadow"
            />
            <div
              onPointerDown={(e) => startResizeHeaderImage('w', e)}
              title="Drag Left Side to resize width"
              data-resize-handle="w"
              className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2 h-5 rounded-xs bg-white border border-slate-900 cursor-ew-resize shadow"
            />
            <div
              onPointerDown={(e) => startResizeHeaderImage('e', e)}
              title="Drag Right Side to resize width"
              data-resize-handle="e"
              className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2 h-5 rounded-xs bg-white border border-slate-900 cursor-ew-resize shadow"
            />
          </>
        )}
      </div>
    );
  };

  const sampleExampleTransactions: TransactionRecord[] = [
    {
      id: '100',
      title: 'Supermarket Family Grocery & Ration',
      amount: 2450,
      type: 'expense',
      category: 'Food & Dining',
      accountId: 'acc-1',
      paymentMethod: 'UPI / Instant Transfer',
      date: new Date().toISOString().slice(0, 10),
      status: 'completed',
      proofId: 'PRF-100201',
      proofImageName: 'supermarket_receipt_hd.png',
      proofImageDataUrl: EXPENSE_TRACKER_SQUARE_ICON,
    },
    {
      id: '101',
      title: 'Weekend Dinner Split (Samar)',
      amount: 1850,
      type: 'expected_incoming',
      category: 'Shared Expense Split',
      accountId: 'acc-1',
      paymentMethod: 'UPI / Instant Transfer',
      date: new Date().toISOString().slice(0, 10),
      status: 'expected',
      proofId: 'PRF-100202',
      proofImageName: 'dinner_bill_hd.png',
      proofImageDataUrl: EXPENSE_TRACKER_SQUARE_ICON,
    },
    {
      id: '102',
      title: 'Monthly Salary Credit',
      amount: 65000,
      type: 'income',
      category: 'Salary & Payroll',
      accountId: 'acc-1',
      paymentMethod: 'Bank Transfer (ACH / NEFT / Wire)',
      date: new Date().toISOString().slice(0, 10),
      status: 'completed',
    },
  ];

  return (
    <div
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col"
      data-portal-role="admin-portal"
    >
      {/* Top Admin Header with Official Embedded Symbols */}
      <header className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 px-3 sm:px-6 py-3.5 sm:py-4 border-b border-rose-500/40 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0 select-none">
            <img
              src={EXPENSE_TRACKER_SQUARE_ICON}
              alt="ExpenseTracker Icon"
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-xs shrink-0"
            />
            <img
              src={darkMode ? EXPENSE_TRACKER_FULL_LOGO_DARK : EXPENSE_TRACKER_FULL_LOGO}
              alt="ExpenseTracker"
              className="h-5 sm:h-7 w-auto object-contain block shrink-0"
            />
          </div>
          <div className="min-w-0 pl-1 border-l border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-rose-600 text-white shrink-0">
                Admin Security Portal
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
              @{adminUser.username} ({adminUser.displayName}) · User vaults strictly private
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {typeof inactivityRemainingSeconds === 'number' && inactivityRemainingSeconds <= 60 && (
            <span
              data-testid="inactivity-countdown-timer"
              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-mono font-extrabold text-[11px] animate-pulse flex items-center gap-1.5 shadow-sm"
            >
              ⏱ Auto-Logout: 00:{String(Math.max(0, inactivityRemainingSeconds)).padStart(2, '0')}
            </span>
          )}
          <PWAInstallButton compact />
          {adminUser.id === 'user-admin' && (
            <button
              type="button"
              onClick={() => {
                setResetPortalPassword('');
                setResetPortalError('');
                setShowResetPortalModal(true);
              }}
              data-testid="header-reset-portal-btn"
              className="px-3.5 py-2 rounded-xl border border-rose-500/50 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Portal
            </button>
          )}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Log Off Admin
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Concurrent Login Security Notification for Admin */}
        {(adminUser.supportMessages || []).some((m) => m.messageType === 'security_login_alert') && (
          <div
            role="alert"
            data-testid="admin-concurrent-login-alert"
            className="p-4 rounded-2xl bg-rose-600 text-white shadow-xl border-2 border-rose-300 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="space-y-0.5">
              <div className="font-extrabold text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                Security Login Alert (Auto-deletes after 24 hours)
              </div>
              <p>
                Somebody tried to log in at the same time you logged in. If you think your password
                leaked, change it immediately here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('admin-new-password');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.focus();
                }
              }}
              className="px-4 py-2 rounded-xl bg-white text-rose-700 font-extrabold text-xs hover:bg-rose-50 cursor-pointer shrink-0 shadow-sm"
            >
              Change Password Immediately Here
            </button>
          </div>
        )}
        {/* Prompt if this Admin signed in using a 1st-login temporary password */}
        {adminUser.mustChangePassword && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500 text-amber-900 dark:text-amber-200 text-xs flex flex-wrap items-center justify-between gap-3"
          >
            <div className="space-y-0.5">
              <div className="font-extrabold text-sm flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-500" />
                First-Time Admin Sign-In Complete (1-Time Temporary Password Used)
              </div>
              <p>
                Your one-time temporary password has been consumed. You can set your own permanent
                Admin password anytime in the <strong>Admin Security Credentials</strong> section
                below.
              </p>
            </div>
          </div>
        )}

        {/* Status Toast */}
        {statusBanner && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{statusBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusBanner('')}
              className="text-xs underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorBanner && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center justify-between"
          >
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner('')}
              className="text-xs underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* SECURITY NOTIFICATION ALERT FOR FORGOT PASSWORD REQUESTS WITH "SOLVED ISSUE" BUTTON */}
        {usersRequestingReset.length > 0 && (
          <div
            role="alert"
            className="p-5 rounded-2xl bg-rose-600 text-white shadow-xl border-2 border-rose-400 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-6 h-6 text-amber-300 shrink-0" />
                <div>
                  <h2 className="text-base font-extrabold tracking-tight">
                    SECURITY ALERT: {usersRequestingReset.length} Account(s) Have Active 1-Time
                    Temporary Password!
                  </h2>
                  <p className="text-xs text-rose-100">
                    Share the 1st-login-only Temporary Password below with the user/admin, or click{' '}
                    <strong>&ldquo;Solved Issue&rdquo;</strong> once resolved to clear the alert.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-white text-rose-700 font-extrabold text-xs uppercase whitespace-nowrap">
                Action Required
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {usersRequestingReset.map((u) => (
                <div
                  key={u.id}
                  className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-300/40 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-sm">
                      {u.displayName} (@{u.username}) —{' '}
                      <span className="uppercase text-amber-300">{u.role}</span>
                    </div>
                    <div className="text-[11px] text-rose-200">
                      {u.forgotPasswordRequestedAt
                        ? `Requested: ${u.forgotPasswordRequestedAt.slice(0, 19).replace('T', ' ')}`
                        : '1st-Login Temporary Password Ready'}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1.5 rounded-lg bg-slate-950 text-amber-300 font-mono font-bold text-xs border border-amber-400/40">
                      {sessionTempPasswords[u.id] ||
                        (u.tempPassword && !isIrreversibleHash(u.tempPassword)
                          ? u.tempPassword
                          : 'SHA-256 Hashed (Click Regenerate to View)')}
                    </span>
                    {sessionTempPasswords[u.id] ? (
                      <button
                        type="button"
                        onClick={() => handleCopyTempPassword(u.id, sessionTempPasswords[u.id])}
                        className="px-2.5 py-1.5 rounded-lg bg-white text-rose-700 font-bold text-xs hover:bg-rose-50 cursor-pointer flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copiedUserId === u.id ? 'Copied' : 'Copy'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleIssueTempPassword(u)}
                        className="px-2.5 py-1.5 rounded-lg bg-white text-rose-700 font-bold text-xs hover:bg-rose-50 cursor-pointer flex items-center gap-1"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Issue New 1-Time Code
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSolvedIssueClick(u)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs cursor-pointer flex items-center gap-1 shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Solved Issue
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FIREBASE FREE-TIER LIFETIME STORAGE & QUOTA STATUS MONITOR + LIVE DATA REFRESH & LINKS */}
        <section
          data-testid="firebase-storage-quota-monitor"
          className="p-5 rounded-2xl border-2 border-emerald-500/30 bg-white dark:bg-slate-900 shadow-xs space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Firebase Free-Tier Lifetime Storage &amp; Live Data Inspector
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-[11px] uppercase">
                    Spark Plan · $0 Free Forever
                  </span>
                  {liveFirebaseOverview && (
                    <span className="px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300 font-bold text-[11px] flex items-center gap-1">
                      <Activity className="w-3 h-3" />
                      Last Live Check:{' '}
                      {new Date(liveFirebaseOverview.refreshedAtIso).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Real-time storage footprint across all users, vaults, receipt proofs, and banner
                  photos. Click <strong>Refresh Live Data</strong> or use the links below to inspect
                  images, users, and vault data stored in Firebase.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleRefreshLiveFirebaseData(true)}
                disabled={firebaseRefreshing}
                data-testid="admin-refresh-firebase-live-btn"
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-xs transition-all"
              >
                <RefreshCw
                  className={`w-4 h-4 ${firebaseRefreshing ? 'animate-spin' : ''}`}
                />
                {firebaseRefreshing ? 'Checking Live Firebase...' : 'Refresh Live Data'}
              </button>

              <div className="text-right">
                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Free Space Remaining
                </div>
                <div
                  data-testid="firebase-free-space-remaining"
                  className="text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400"
                >
                  {firebaseStorageReport.formattedFreeRemaining} (
                  {firebaseStorageReport.freePercentage}% Free)
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-emerald-500" />
                Current Used Storage:{' '}
                <strong
                  data-testid="firebase-used-storage"
                  className="font-mono text-slate-900 dark:text-white"
                >
                  {firebaseStorageReport.formattedUsed}
                </strong>{' '}
                ({firebaseStorageReport.totalUsedBytes.toLocaleString()} bytes)
              </span>
              <span className="font-mono text-slate-500">
                Total Free Limit: {firebaseStorageReport.formattedTotalLimit}
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-700">
              <div
                style={{
                  width: `${Math.max(1.5, Math.min(100, firebaseStorageReport.usedPercentage))}%`,
                }}
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
              />
            </div>
          </div>

          {/* 3-Column Clickable Live Breakdown Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <button
              type="button"
              onClick={() =>
                setActiveFirebaseInspectorTab((prev) => (prev === 'users' ? null : 'users'))
              }
              data-testid="firebase-check-users-card-btn"
              className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                activeFirebaseInspectorTab === 'users'
                  ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500/40'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-emerald-500/50'
              }`}
            >
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-500" />
                  1. Users &amp; Support Chats ({users.length})
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                  Click to check users in Firebase (/appUsers)
                </div>
              </div>
              <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                {formatStorageBytes(firebaseStorageReport.usersAndChatsBytes)}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveFirebaseInspectorTab((prev) => (prev === 'data' ? null : 'data'))
              }
              data-testid="firebase-check-data-card-btn"
              className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                activeFirebaseInspectorTab === 'data'
                  ? 'bg-sky-500/15 border-sky-500 ring-1 ring-sky-500/40'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-sky-500/50'
              }`}
            >
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-sky-500" />
                  2. Vaults &amp; Receipt Proofs (
                  {liveFirebaseOverview?.vaultSummaries.length ?? users.length})
                </div>
                <div className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold mt-0.5">
                  Click to check data in Firebase (/userVaults)
                </div>
              </div>
              <span className="font-mono font-extrabold text-sky-600 dark:text-sky-400">
                {formatStorageBytes(firebaseStorageReport.vaultsAndProofsBytes)}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveFirebaseInspectorTab((prev) => (prev === 'images' ? null : 'images'))
              }
              data-testid="firebase-check-images-card-btn"
              className={`p-3 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                activeFirebaseInspectorTab === 'images'
                  ? 'bg-violet-500/15 border-violet-500 ring-1 ring-violet-500/40'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-violet-500/50'
              }`}
            >
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Images className="w-3.5 h-3.5 text-violet-500" />
                  3. Stored Images ({liveFirebaseOverview?.storedImages.length ?? heroImagesList.length})
                </div>
                <div className="text-[11px] text-violet-600 dark:text-violet-400 font-semibold mt-0.5">
                  Click to check images stored in Firebase
                </div>
              </div>
              <span className="font-mono font-extrabold text-violet-600 dark:text-violet-400">
                {formatStorageBytes(firebaseStorageReport.bannersAndPdfConfigBytes)}
              </span>
            </button>
          </div>

          {/* ATTACHED LINKS TO CHECK IMAGES, USERS, AND DATA IN FIREBASE (IN-APP + DIRECT FIREBASE CONSOLE) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
                Quick Links — Check Images, Users &amp; Data Stored in Firebase:
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                DB: {FIREBASE_CONSOLE_LINKS.databaseId}
              </span>
            </div>

            {/* In-App Live Inspector Toggle Links + External Firebase Console Links */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() =>
                  setActiveFirebaseInspectorTab((prev) => (prev === 'images' ? null : 'images'))
                }
                data-testid="link-check-firebase-images"
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer border transition-all ${
                  activeFirebaseInspectorTab === 'images'
                    ? 'bg-violet-600 text-white border-violet-500'
                    : 'bg-violet-500/10 hover:bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30'
                }`}
              >
                <Images className="w-3.5 h-3.5" />
                Check Images Stored in Firebase ({liveFirebaseOverview?.storedImages.length ?? 0})
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveFirebaseInspectorTab((prev) => (prev === 'users' ? null : 'users'))
                }
                data-testid="link-check-firebase-users"
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer border transition-all ${
                  activeFirebaseInspectorTab === 'users'
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Check Users in Firebase ({liveFirebaseOverview?.users.length ?? users.length})
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveFirebaseInspectorTab((prev) => (prev === 'data' ? null : 'data'))
                }
                data-testid="link-check-firebase-data"
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer border transition-all ${
                  activeFirebaseInspectorTab === 'data'
                    ? 'bg-sky-600 text-white border-sky-500'
                    : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/30'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                Check Vault Data in Firebase (
                {liveFirebaseOverview?.vaultSummaries.length ?? users.length})
              </button>

              <a
                href={FIREBASE_CONSOLE_LINKS.globalConfigDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="external-link-firebase-images"
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 text-violet-500" />
                Firebase Console: Images &amp; Config (/globalConfig)
              </a>

              <a
                href={FIREBASE_CONSOLE_LINKS.appUsersCollectionUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="external-link-firebase-users"
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
                Firebase Console: Users (/appUsers)
              </a>

              <a
                href={FIREBASE_CONSOLE_LINKS.userVaultsCollectionUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="external-link-firebase-data"
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 text-sky-500" />
                Firebase Console: Vault Data (/userVaults)
              </a>

              <a
                href={FIREBASE_CONSOLE_LINKS.firebaseStorageBucketUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="external-link-firebase-storage-bucket"
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 font-semibold flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-500" />
                Firebase Storage Bucket
              </a>
            </div>

            {/* EXPANDABLE LIVE FIREBASE INSPECTOR PANEL */}
            {activeFirebaseInspectorTab && (
              <div
                data-testid={`firebase-live-inspector-${activeFirebaseInspectorTab}`}
                className="mt-3 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    {activeFirebaseInspectorTab === 'images' && (
                      <>
                        <Images className="w-4 h-4 text-violet-500" />
                        Live Images Stored in Firebase (
                        {liveFirebaseOverview?.storedImages.length ?? 0})
                      </>
                    )}
                    {activeFirebaseInspectorTab === 'users' && (
                      <>
                        <Users className="w-4 h-4 text-emerald-500" />
                        Live Users Stored in Firebase `/appUsers` (
                        {(liveFirebaseOverview?.users || users).length})
                      </>
                    )}
                    {activeFirebaseInspectorTab === 'data' && (
                      <>
                        <Database className="w-4 h-4 text-sky-500" />
                        Live User Vault Documents in Firebase `/userVaults` (
                        {liveFirebaseOverview?.vaultSummaries.length ?? users.length})
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleRefreshLiveFirebaseData(true)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${firebaseRefreshing ? 'animate-spin' : ''}`}
                      />
                      Refresh Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFirebaseInspectorTab(null)}
                      aria-label="Close Firebase Inspector"
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* TAB 1: IMAGES STORED IN FIREBASE */}
                {activeFirebaseInspectorTab === 'images' && (
                  <div>
                    {(liveFirebaseOverview?.storedImages || []).length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500">
                        No custom images currently stored in Firebase (using embedded default SVG
                        vectors). Upload a Front Page Hero Banner, PDF Header Logo, or Receipt Proof
                        to see it listed here.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(liveFirebaseOverview?.storedImages || []).map((img) => (
                          <div
                            key={img.id}
                            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3"
                          >
                            <img
                              src={img.dataUrl}
                              alt={img.title}
                              onClick={() => setPreviewStoredImage(img)}
                              className="w-14 h-14 rounded-lg object-cover border border-slate-300 dark:border-slate-700 shrink-0 cursor-pointer bg-white"
                            />
                            <div className="min-w-0 flex-1 space-y-1 text-xs">
                              <div className="font-bold text-slate-900 dark:text-white truncate">
                                {img.title}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 font-bold">
                                  {img.category}
                                </span>
                                <span className="font-mono text-slate-500">
                                  {formatStorageBytes(img.sizeBytes)}
                                </span>
                              </div>
                              <div className="text-[10px] font-mono text-slate-400 truncate">
                                Path: {img.firestorePath} · {img.ownerLabel}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setPreviewStoredImage(img)}
                                  className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                  Preview Image
                                </button>
                                <a
                                  href={img.consoleUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Firebase Doc
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: USERS IN FIREBASE (/appUsers) */}
                {activeFirebaseInspectorTab === 'users' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-500">
                          <th className="py-2 px-3">Firestore Doc ID</th>
                          <th className="py-2 px-3">Username &amp; Name</th>
                          <th className="py-2 px-3">Role &amp; Status</th>
                          <th className="py-2 px-3">Password Security</th>
                          <th className="py-2 px-3 text-right">Firebase Console Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {(liveFirebaseOverview?.users || users).map((u) => (
                          <tr key={u.id}>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              /appUsers/{u.id}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900 dark:text-white">
                                @{u.username}
                              </span>{' '}
                              <span className="text-slate-500">({u.displayName})</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                                  u.role === 'admin'
                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                {u.role}
                              </span>{' '}
                              <span className="text-[11px] text-slate-500 uppercase">
                                · {u.accountStatus || 'active'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                              {isIrreversibleHash(u.passwordHash)
                                ? 'SHA-256 Zero-Knowledge Hash'
                                : 'Protected'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <a
                                href={FIREBASE_CONSOLE_LINKS.getUserDocConsoleUrl(u.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open in Firebase
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* TAB 3: VAULT DATA IN FIREBASE (/userVaults) */}
                {activeFirebaseInspectorTab === 'data' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase text-slate-500">
                          <th className="py-2 px-3">Firestore Vault Path</th>
                          <th className="py-2 px-3">Owner</th>
                          <th className="py-2 px-3">Live Vault Contents</th>
                          <th className="py-2 px-3">Doc Size</th>
                          <th className="py-2 px-3">Last Updated</th>
                          <th className="py-2 px-3 text-right">Firebase Console Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {(liveFirebaseOverview?.vaultSummaries || []).map((v) => (
                          <tr key={v.userId}>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-sky-600 dark:text-sky-400">
                              {v.firestorePath}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900 dark:text-white">
                                @{v.username}
                              </span>{' '}
                              <span className="text-slate-500">({v.displayName})</span>
                            </td>
                            <td className="py-2.5 px-3 text-[11px] text-slate-700 dark:text-slate-300">
                              <strong>{v.accountsCount}</strong> Accounts ·{' '}
                              <strong>{v.transactionsCount}</strong> Records ·{' '}
                              <strong>{v.dreamVaultsCount}</strong> Investments/Dreams ·{' '}
                              <strong>{v.peopleCount}</strong> People ·{' '}
                              <strong>{v.storedImagesCount}</strong> Images
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                              {formatStorageBytes(v.sizeBytes)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                              {v.updatedAt ? v.updatedAt.slice(0, 19).replace('T', ' ') : 'Synced'}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <a
                                href={v.consoleUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold text-[11px]"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Open Vault Doc
                              </a>
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

          {/* FULL-SCREEN IMAGE PREVIEW MODAL FOR STORED FIREBASE IMAGES */}
          {previewStoredImage && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Preview ${previewStoredImage.title}`}
              className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={() => setPreviewStoredImage(null)}
            >
              <div
                className="max-w-2xl w-full rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {previewStoredImage.title}
                    </h3>
                    <p className="text-[11px] font-mono text-slate-500">
                      {previewStoredImage.firestorePath} ·{' '}
                      {formatStorageBytes(previewStoredImage.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={previewStoredImage.consoleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open in Firebase Console
                    </a>
                    <button
                      type="button"
                      onClick={() => setPreviewStoredImage(null)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[70vh] overflow-auto rounded-xl bg-slate-100 dark:bg-slate-950 p-3 flex items-center justify-center">
                  <img
                    src={previewStoredImage.dataUrl}
                    alt={previewStoredImage.title}
                    className="max-w-full max-h-[62vh] object-contain rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 1. USER & ADMIN MANAGEMENT TABLE (Hold, Activate, Disable, Delete, Support Chat & Reset Portal) */}
        <section className="rounded-2xl border border-rose-500/30 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-rose-600" />
                User &amp; Admin Directory — Status, Support Chat &amp; Account Controls ({users.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Clicking Delete on an active user places their account <strong>On Hold</strong>{' '}
                (preserving their data in read-only mode). From there you can{' '}
                <strong>Activate</strong>, <strong>Disable</strong> (blocks viewing data),{' '}
                <strong>Delete Permanently</strong>, or chat with the user.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold border border-rose-500/30">
              <ShieldCheck className="w-4 h-4" />
              Strict User Financial Privacy
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3.5 px-4">Profile &amp; Contact Details</th>
                  <th className="py-3.5 px-4">Username &amp; Role</th>
                  <th className="py-3.5 px-4">Account Status &amp; User Activity</th>
                  <th className="py-3.5 px-4">1st-Login Temp Password / Reset</th>
                  <th className="py-3.5 px-4">Admin Support Chat</th>
                  <th className="py-3.5 px-4 text-right">Account Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                {users.map((u) => {
                  const isRowAdmin = u.role === 'admin';
                  const isPrimaryAdmin = u.id === 'user-admin';
                  const acctStatus: AccountLifecycleStatus = u.accountStatus || 'active';
                  const hasForgotAlert = Boolean(
                    u.forgotPasswordRequested || u.tempPasswordValidForFirstLogin
                  );
                  const supportMsgs = u.supportMessages || [];
                  const lastUserMsg = [...supportMsgs]
                    .reverse()
                    .find((m) => m.sender === 'user');

                  return (
                    <tr
                      key={u.id}
                      className={
                        acctStatus === 'disabled'
                          ? 'bg-rose-500/5 dark:bg-rose-950/25'
                          : acctStatus === 'on_hold'
                          ? 'bg-amber-500/10 dark:bg-amber-950/25'
                          : hasForgotAlert
                          ? 'bg-rose-500/10 dark:bg-rose-950/40'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {u.avatarThumbnailDataUrl ? (
                            <img
                              src={u.avatarThumbnailDataUrl}
                              alt={u.displayName}
                              className="w-9 h-9 rounded-full object-cover border border-slate-300 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                isRowAdmin
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-emerald-600 text-white'
                              }`}
                            >
                              {u.displayName.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-1.5">
                              <span>{u.displayName}</span>
                              {isPrimaryAdmin && (
                                <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[10px] font-extrabold uppercase">
                                  Primary Admin
                                </span>
                              )}
                              {hasForgotAlert && (
                                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold uppercase">
                                  1-Time Temp Pass
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Currency: {u.currency || '₹'}
                              {u.department ? ` · ${u.department}` : ''}
                              {u.email ? ` · ${u.email}` : ''}
                              {u.phone ? ` · ${u.phone}` : ''}
                            </div>
                            <div className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                              <Lock className="w-3 h-3" />
                              <span>Password: ••••••••••</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          @{u.username}
                        </div>
                        <span
                          className={`inline-block mt-0.5 text-[10px] font-bold uppercase ${
                            isRowAdmin
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isRowAdmin ? 'Admin Portal' : 'Customer Portal'}
                        </span>
                      </td>

                      {/* Account Status + User Hold Activity Indicator */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          {acctStatus === 'active' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Active
                            </span>
                          )}
                          {acctStatus === 'on_hold' && (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 font-extrabold text-[11px] border border-amber-500/40">
                                <PauseCircle className="w-3.5 h-3.5" />
                                Account On Hold
                              </span>
                              {u.holdAcknowledgedByUser && (
                                <div className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                                  <Activity className="w-3 h-3 shrink-0" />
                                  <span>
                                    User Clicked Okay (Active{' '}
                                    {u.lastHoldActivityAt
                                      ? u.lastHoldActivityAt.slice(11, 16)
                                      : 'Now'}
                                    )
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                          {acctStatus === 'disabled' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 font-extrabold text-[11px] border border-rose-500/40">
                              <Ban className="w-3.5 h-3.5" />
                              Disabled (Blocked)
                            </span>
                          )}
                          {u.holdReason && acctStatus !== 'active' && (
                            <div className="text-[10px] text-slate-500 max-w-[200px] truncate">
                              Reason: {u.holdReason}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 1st-Login Temp Password */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {u.tempPasswordValidForFirstLogin && u.tempPassword && (
                            <>
                              <span className="px-2 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-300 font-mono font-bold text-[11px]">
                                {sessionTempPasswords[u.id] ||
                                  (!isIrreversibleHash(u.tempPassword)
                                    ? u.tempPassword
                                    : 'SHA-256 Hashed')}
                              </span>
                              {sessionTempPasswords[u.id] && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyTempPassword(u.id, sessionTempPasswords[u.id])
                                  }
                                  className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-[10px] font-semibold cursor-pointer flex items-center gap-1"
                                >
                                  <Copy className="w-3 h-3" />
                                  {copiedUserId === u.id ? 'Copied' : 'Copy'}
                                </button>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleIssueTempPassword(u)}
                            className="px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-800 hover:bg-slate-700 text-white font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            {u.tempPasswordValidForFirstLogin ? 'Regenerate' : '1-Time Temp Pass'}
                          </button>
                          {hasForgotAlert && (
                            <button
                              type="button"
                              onClick={() => handleSolvedIssueClick(u)}
                              className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Solved
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Support Chat & User Messages */}
                      <td className="py-3.5 px-4">
                        {isPrimaryAdmin ? (
                          <span className="text-[11px] text-slate-400">Primary Support Host</span>
                        ) : (
                          <div className="space-y-1">
                            <button
                              type="button"
                              onClick={() => openSupportModalForUser(u)}
                              data-testid={`support-chat-btn-${u.username}`}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1.5 cursor-pointer border border-slate-300 dark:border-slate-700"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-rose-600" />
                              Support Chat ({supportMsgs.length})
                            </button>
                            {lastUserMsg && (
                              <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-slate-700 dark:text-slate-300 max-w-[210px]">
                                <span className="font-bold text-amber-700 dark:text-amber-300">
                                  @{u.username}:
                                </span>{' '}
                                &ldquo;{lastUserMsg.text}&rdquo;
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Account Actions: Hold / Activate / Disable / Delete OR Reset Portal for Primary Admin */}
                      <td className="py-3.5 px-4 text-right">
                        {isPrimaryAdmin ? (
                          <button
                            type="button"
                            onClick={() => {
                              setResetPortalPassword('');
                              setResetPortalError('');
                              setShowResetPortalModal(true);
                            }}
                            data-testid="table-reset-portal-btn"
                            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[11px] inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset Portal (Clear All Data)
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {acctStatus === 'active' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onAdminUpdateAccountStatus(
                                      u.id,
                                      'on_hold',
                                      u.holdReason ||
                                        'Your account is on hold. Contact Admin to check the issue and reason.'
                                    );
                                    setStatusBanner(
                                      `Account @${u.username} placed On Hold (data preserved). User will see the Hold popup on login and enter read-only mode.`
                                    );
                                    onTriggerFeedback(
                                      `@${u.username} Placed On Hold`,
                                      'success'
                                    );
                                  }}
                                  data-testid={`hold-or-delete-btn-${u.username}`}
                                  title="Places account On Hold without deleting data"
                                  className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                >
                                  <PauseCircle className="w-3.5 h-3.5" />
                                  Put On Hold
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onAdminUpdateAccountStatus(
                                      u.id,
                                      'disabled',
                                      u.holdReason ||
                                        'Your account has been disabled by the Administrator.'
                                    );
                                    setStatusBanner(
                                      `Disabled account @${u.username}. User can no longer view previous data (only popup & Admin Support Chat).`
                                    );
                                    onTriggerFeedback(`@${u.username} Disabled`, 'success');
                                  }}
                                  data-testid={`disable-user-btn-${u.username}`}
                                  className="px-2.5 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  Disable User
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUserPendingPermanentDelete(u);
                                    setAdminDeleteUserPassword('');
                                    setShowAdminDeleteUserPass(false);
                                    setAdminDeleteUserError('');
                                  }}
                                  data-testid={`permanent-delete-btn-${u.username}`}
                                  title="Ask Admin password and permanently delete user and vault"
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete User
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onAdminUpdateAccountStatus(u.id, 'active');
                                    setStatusBanner(
                                      `Activated @${u.username}! Full portal access restored.`
                                    );
                                    onTriggerFeedback(
                                      `@${u.username} Activated Successfully`,
                                      'success'
                                    );
                                  }}
                                  data-testid={`activate-user-btn-${u.username}`}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                >
                                  <PlayCircle className="w-3.5 h-3.5" />
                                  Activate User
                                </button>

                                {acctStatus === 'on_hold' ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onAdminUpdateAccountStatus(
                                        u.id,
                                        'disabled',
                                        u.holdReason ||
                                          'Your account has been disabled by the Administrator.'
                                      );
                                      setStatusBanner(
                                        `Disabled @${u.username}. Previous data view is now blocked.`
                                      );
                                      onTriggerFeedback(`@${u.username} Disabled`, 'success');
                                    }}
                                    data-testid={`disable-user-btn-${u.username}`}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                    Disable User
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onAdminUpdateAccountStatus(
                                        u.id,
                                        'on_hold',
                                        u.holdReason ||
                                          'Your account is on hold. Contact Admin to check the issue and reason.'
                                      );
                                      setStatusBanner(
                                        `Placed @${u.username} On Hold (read-only view allowed).`
                                      );
                                      onTriggerFeedback(
                                        `@${u.username} Placed On Hold`,
                                        'success'
                                      );
                                    }}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <PauseCircle className="w-3.5 h-3.5" />
                                    Put On Hold
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setUserPendingPermanentDelete(u);
                                    setAdminDeleteUserPassword('');
                                    setShowAdminDeleteUserPass(false);
                                    setAdminDeleteUserError('');
                                  }}
                                  data-testid={`permanent-delete-btn-${u.username}`}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete User
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Register a New Customer Account from Admin (with Confirm Password + Eye toggles) */}
          <form
            onSubmit={handleCreateUserSubmit}
            autoComplete="off"
            className="p-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-5 gap-3 items-center"
          >
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="New Customer Username"
              aria-label="New Customer Username"
              required
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <input
              type="text"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Customer Full Name"
              aria-label="Customer Full Name"
              className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <div className="relative">
              <input
                type={showNewCustomerPass ? 'text' : 'password'}
                value={newTempOrInitPass}
                onChange={(e) => setNewTempOrInitPass(e.target.value)}
                placeholder="Initial Password"
                aria-label="Initial Password"
                required
                autoComplete="new-password"
                className="w-full pl-3 pr-8 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowNewCustomerPass((p) => !p)}
                aria-label={showNewCustomerPass ? 'Hide initial password' : 'Show initial password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                {showNewCustomerPass ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div>
              <div className="relative">
                <input
                  type={showNewCustomerConfirmPass ? 'text' : 'password'}
                  value={newCustomerConfirmPass}
                  onChange={(e) => setNewCustomerConfirmPass(e.target.value)}
                  placeholder="Confirm Password"
                  aria-label="Confirm Customer Password"
                  required
                  autoComplete="new-password"
                  className={`w-full pl-3 pr-8 py-2 text-xs rounded-lg border bg-white dark:bg-slate-900 ${
                    newCustomerConfirmPass.length > 0 &&
                    newTempOrInitPass !== newCustomerConfirmPass
                      ? 'border-rose-500'
                      : newCustomerConfirmPass.length > 0 &&
                        newTempOrInitPass.length > 0 &&
                        newTempOrInitPass === newCustomerConfirmPass
                      ? 'border-emerald-500'
                      : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowNewCustomerConfirmPass((p) => !p)}
                  aria-label={
                    showNewCustomerConfirmPass ? 'Hide confirm password' : 'Show confirm password'
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showNewCustomerConfirmPass ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
              {newCustomerConfirmPass.length > 0 &&
                newTempOrInitPass !== newCustomerConfirmPass && (
                  <p
                    role="alert"
                    className="mt-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1"
                  >
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>Passwords do not match</span>
                  </p>
                )}
              {newCustomerConfirmPass.length > 0 &&
                newTempOrInitPass.length > 0 &&
                newTempOrInitPass === newCustomerConfirmPass && (
                  <p className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>Passwords match</span>
                  </p>
                )}
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 cursor-pointer self-start"
            >
              <UserPlus className="w-4 h-4" />
              Add Customer Account
            </button>
          </form>
          {newTempOrInitPass.length > 0 && (
            <div className="px-4 pb-4 bg-slate-50 dark:bg-slate-950/60">
              <PasswordStrengthChecklist password={newTempOrInitPass} compact />
            </div>
          )}
        </section>

        {/* 1B. ADD NEW ADMIN ACCOUNT WITH ALL DETAILS & RANDOM 1-TIME TEMPORARY PASSWORD */}
        <section className="p-6 rounded-2xl border-2 border-rose-500/40 bg-white dark:bg-slate-900 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldPlus className="w-5 h-5 text-rose-600" />
                Add New Admin Account (All Details + Random 1-Time Temporary Password)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Create an additional Admin account with full profile details. A random{' '}
                <strong>1st-login-only Temporary Password</strong> is generated automatically—the
                new Admin will use it once to sign in and can then change their password in Admin
                Settings.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold text-xs border border-rose-500/30">
              Auto-Generates 1-Time Temp Password
            </span>
          </div>

          <form
            onSubmit={handleCreateNewAdminSubmit}
            autoComplete="off"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 items-end"
          >
            <div>
              <label
                htmlFor="new-admin-username"
                className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Admin Username *
              </label>
              <input
                id="new-admin-username"
                type="text"
                value={newAdminUsername}
                onChange={(e) => setNewAdminUsername(e.target.value)}
                placeholder="e.g. admin_rahul"
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label
                htmlFor="new-admin-display"
                className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Admin Full Name / Title *
              </label>
              <input
                id="new-admin-display"
                type="text"
                value={newAdminDisplayName}
                onChange={(e) => setNewAdminDisplayName(e.target.value)}
                placeholder="e.g. Rahul Verma"
                required
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label
                htmlFor="new-admin-email"
                className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Admin Email
              </label>
              <input
                id="new-admin-email"
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="rahul@expensetracker.in"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label
                htmlFor="new-admin-phone"
                className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Phone / Mobile
              </label>
              <input
                id="new-admin-phone"
                type="text"
                value={newAdminPhone}
                onChange={(e) => setNewAdminPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div>
              <label
                htmlFor="new-admin-dept"
                className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Department / Role
              </label>
              <input
                id="new-admin-dept"
                type="text"
                value={newAdminDepartment}
                onChange={(e) => setNewAdminDepartment(e.target.value)}
                placeholder="Finance & Security Admin"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
              <div className="w-full sm:w-24 shrink-0">
                <label
                  htmlFor="new-admin-currency"
                  className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Currency
                </label>
                <select
                  id="new-admin-currency"
                  value={newAdminCurrency}
                  onChange={(e) => setNewAdminCurrency(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                >
                  <option value="₹">₹ INR</option>
                  <option value="$">$ USD</option>
                  <option value="€">€ EUR</option>
                  <option value="£">£ GBP</option>
                </select>
              </div>
              <button
                type="submit"
                data-testid="add-new-admin-submit-btn"
                className="flex-1 py-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <ShieldPlus className="w-4 h-4 shrink-0" />
                <span>Add New Admin</span>
              </button>
            </div>
          </form>

          {createdAdminCredentials && (
            <div className="p-4 rounded-xl bg-amber-500/15 border-2 border-amber-500/60 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="space-y-1">
                <div className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-500" />
                  New Admin Created: {createdAdminCredentials.displayName} (@
                  {createdAdminCredentials.username})
                </div>
                <p className="text-slate-600 dark:text-slate-300">
                  Share this <strong>1-Time Temporary Password</strong> with the new Admin. It works
                  for their <strong>1st login only</strong>, after which they can set their own
                  password:
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3.5 py-2 rounded-lg bg-slate-950 text-amber-300 font-mono font-extrabold text-sm border border-amber-400">
                  {createdAdminCredentials.tempPassword}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyTempPassword(
                      `new-admin-${createdAdminCredentials.username}`,
                      createdAdminCredentials.tempPassword
                    )
                  }
                  className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy 1-Time Password
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 2. PDF HEADER IMAGE UPLOADER & INTERACTIVE DRAG / ALL-SIDES & CORNERS UNLIMITED RESIZE STUDIO */}
        <section className="p-6 rounded-2xl border border-rose-500/30 bg-white dark:bg-slate-900 space-y-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-rose-600" />
                PDF Header Image Customizer — Unlimited Corner/Side Resize + Horizontal Positioning
                Bar
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Upload an image (rendered with <strong>zero border</strong>), drag any of its{' '}
                <strong>4 sides or 4 corners</strong> to resize with{' '}
                <strong>unlimited height</strong>, slide the{' '}
                <strong>Horizontal Positioning Bar</strong>, and click{' '}
                <strong>Save PDF Header Settings</strong>. Whatever you see in the preview will be
                100% identical in the downloaded PDF.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowExamplePdfModal(true)}
                data-testid="open-example-pdf-popup-btn"
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-4 h-4" />
                Open Example PDF Preview Popup
              </button>
              <label
                htmlFor="admin-pdf-header-upload"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const f = e.dataTransfer?.files?.[0];
                  if (f) void processPdfHeaderImageFile(f);
                }}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (items) {
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.startsWith('image/')) {
                        const f = items[i].getAsFile();
                        if (f) {
                          e.preventDefault();
                          void processPdfHeaderImageFile(f);
                          break;
                        }
                      }
                    }
                  }
                }}
                tabIndex={0}
                title="Click, drag & drop, or paste (Ctrl+V) PDF header image"
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer outline-none"
              >
                <ImagePlus className="w-4 h-4" />
                Upload / Drop / Paste PDF Header Image
                <input
                  id="admin-pdf-header-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePdfHeaderImageUpload}
                  className="hidden"
                />
              </label>
              {activeHeaderImageUrl && (
                <button
                  type="button"
                  onClick={() => setShowInteractiveHandles((h) => !h)}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
                >
                  <Move className="w-3.5 h-3.5 text-rose-500" />
                  {showInteractiveHandles ? 'Preview Clean (Hide Handles)' : 'Show Resize Handles'}
                </button>
              )}
              <button
                type="button"
                onClick={handleSavePdfHeaderSettings}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                Save PDF Header Settings
              </button>
              {activeHeaderImageUrl && (
                <button
                  type="button"
                  onClick={handleResetPdfHeaderSettings}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  Remove Header Image
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Orientation, Anchor, Reference Background Color & ONLY Horizontal Positioning Bar */}
            <div className="lg:col-span-5 space-y-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
              {/* Portrait vs Landscape Mode Selector */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  A4 Page Orientation (Portrait &amp; Landscape Preview / Export)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next: PdfHeaderImageConfig = {
                        ...draftPdfHeader,
                        orientation: 'portrait',
                      };
                      setDraftPdfHeader(next);
                      onSavePdfHeaderConfig(next);
                    }}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 border cursor-pointer ${
                      (draftPdfHeader.orientation || 'portrait') === 'portrait'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <RectangleVertical className="w-3.5 h-3.5" />
                    Portrait A4 Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next: PdfHeaderImageConfig = {
                        ...draftPdfHeader,
                        orientation: 'landscape',
                      };
                      setDraftPdfHeader(next);
                      onSavePdfHeaderConfig(next);
                    }}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 border cursor-pointer ${
                      draftPdfHeader.orientation === 'landscape'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <RectangleHorizontal className="w-3.5 h-3.5" />
                    Landscape A4 Mode
                  </button>
                </div>
              </div>

              {/* PDF Header Reference Background Color (Auto-synced from uploaded image + Manual Color Picker) */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-rose-500" />
                  PDF Header Background Color (Auto-Saved for Export):
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={draftPdfHeader.headerBgColor || '#162d59'}
                    onChange={(e) => {
                      const next: PdfHeaderImageConfig = {
                        ...draftPdfHeader,
                        headerBgColor: e.target.value,
                      };
                      setDraftPdfHeader(next);
                      onSavePdfHeaderConfig(next);
                    }}
                    aria-label="PDF Header Background Color"
                    className="w-9 h-8 rounded cursor-pointer border border-slate-300 dark:border-slate-700 bg-transparent"
                  />
                  {[
                    { hex: '#162d59', label: 'Royal Saree Navy' },
                    { hex: '#0f172a', label: 'Midnight Slate' },
                    { hex: '#059669', label: 'Emerald Green' },
                    { hex: '#1e3a8a', label: 'Deep Indigo' },
                    { hex: '#7c2d12', label: 'Warm Maroon' },
                  ].map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => {
                        const next: PdfHeaderImageConfig = {
                          ...draftPdfHeader,
                          headerBgColor: preset.hex,
                        };
                        setDraftPdfHeader(next);
                        onSavePdfHeaderConfig(next);
                      }}
                      style={{ backgroundColor: preset.hex }}
                      title={preset.label}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold text-white border cursor-pointer ${
                        (draftPdfHeader.headerBgColor || '#162d59').toLowerCase() === preset.hex
                          ? 'ring-2 ring-rose-500 border-white'
                          : 'border-transparent opacity-85 hover:opacity-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Header Image Anchor Alignment
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { key: 'left', label: 'Left', icon: AlignLeft },
                      { key: 'center', label: 'Center', icon: AlignCenter },
                      { key: 'right', label: 'Right', icon: AlignRight },
                    ] as const
                  ).map((pos) => {
                    const Icon = pos.icon;
                    const active = draftPdfHeader.align === pos.key;
                    return (
                      <button
                        key={pos.key}
                        type="button"
                        onClick={() =>
                          setDraftPdfHeader({
                            ...draftPdfHeader,
                            align: pos.key,
                            offsetX: 0,
                            offsetY: 0,
                          })
                        }
                        className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 border cursor-pointer ${
                          active
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {pos.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ONLY Horizontal Positioning Bar (Width, Height, and Vertical bars removed as requested) */}
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="pdf-img-offset-x"
                    className="font-bold text-slate-700 dark:text-slate-300"
                  >
                    Horizontal Positioning Bar: {draftPdfHeader.offsetX}px
                  </label>
                  {draftPdfHeader.offsetX !== 0 && (
                    <button
                      type="button"
                      onClick={() => setDraftPdfHeader({ ...draftPdfHeader, offsetX: 0 })}
                      className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                    >
                      Center / Reset (0px)
                    </button>
                  )}
                </div>
                <input
                  id="pdf-img-offset-x"
                  type="range"
                  min={-240}
                  max={240}
                  value={draftPdfHeader.offsetX}
                  onChange={(e) =>
                    setDraftPdfHeader({ ...draftPdfHeader, offsetX: Number(e.target.value) })
                  }
                  className="w-full accent-rose-600 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  Current Size: {draftPdfHeader.width}px × {draftPdfHeader.height}px (Header Height = Text 68pt or Image Height)
                </div>
                <p>
                  Default height margin is kept strictly for the compact text block (68pt). Your
                  uploaded image determines any additional header height.
                </p>
              </div>
            </div>

            {/* Right: Interactive Live A4 PDF Header & Sheet Preview (1:1 synced with PdfPreviewModal & pdfExporter) */}
            <div className="lg:col-span-7 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <span>
                  Live Exported A4 PDF Preview (
                  {draftPdfHeader.orientation === 'landscape'
                    ? 'Landscape A4 — 842×595pt'
                    : 'Portrait A4 — 595×842pt'}
                  )
                </span>
                {activeHeaderImageUrl && (
                  <span className="text-rose-600 dark:text-rose-400">
                    ✦ Drag image or drag any side/corner handle (unlimited height)
                  </span>
                )}
              </div>

              <div
                onPointerMove={handlePointerMoveOnPreview}
                onPointerUp={stopPointerInteraction}
                className="p-4 rounded-xl bg-slate-200/80 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 overflow-x-auto"
              >
                <div
                  data-admin-pdf-preview-orientation={draftPdfHeader.orientation || 'portrait'}
                  className={`mx-auto rounded-lg overflow-hidden border border-slate-300 shadow-xl bg-white text-slate-900 transition-all duration-300 ${
                    draftPdfHeader.orientation === 'landscape'
                      ? 'w-full max-w-[760px]'
                      : 'w-full max-w-[540px]'
                  }`}
                >
                  {/* Customer PDF Header Banner (Compact 68pt text height or image height, Reference Color, No Crossed-Out Text) */}
                  <div
                    style={{
                      minHeight: `${
                        activeHeaderImageUrl
                          ? Math.max(68, draftPdfHeader.height + Math.max(0, draftPdfHeader.offsetY))
                          : 68
                      }px`,
                      backgroundColor: draftPdfHeader.headerBgColor || '#162d59',
                    }}
                    className="relative text-white px-6 py-2.5 flex items-end justify-between gap-4 overflow-hidden"
                  >
                    {activeHeaderImageUrl &&
                      draftPdfHeader.align === 'left' &&
                      renderInteractiveHeaderImage()}

                    <div className="space-y-0.5 flex-1 min-w-0 select-none pb-0.5">
                      <div className="text-lg font-extrabold tracking-tight leading-tight">
                        Expense Tracker
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-white/95">
                        HD LEDGER STATEMENT &amp; PROOF REPORT
                      </div>
                      <div className="text-[9.5px] text-white/85">
                        Account Holder: Customer Name &nbsp;|&nbsp; Period: All Time &nbsp;|&nbsp; Date:{' '}
                        {new Date().toISOString().slice(0, 10)}
                      </div>
                    </div>

                    {activeHeaderImageUrl &&
                      draftPdfHeader.align === 'center' &&
                      renderInteractiveHeaderImage()}

                    {activeHeaderImageUrl &&
                      draftPdfHeader.align === 'right' &&
                      renderInteractiveHeaderImage()}
                  </div>

                  {/* Simulated A4 Body with 36pt Margins */}
                  <div className="px-6 py-4 bg-white space-y-2.5 text-[11px] text-slate-600">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">Total Records: 3</span>
                      <span className="font-bold text-emerald-600">Inflow: +Rs. 65,000.00</span>
                      <span className="font-bold text-rose-600">Outflow: -Rs. 4,300.00</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                      <span>
                        {activeHeaderImageUrl
                          ? `✓ Borderless Header Image (${draftPdfHeader.width}×${draftPdfHeader.height}px, Bg: ${draftPdfHeader.headerBgColor || '#162d59'})`
                          : 'No custom PDF header image uploaded yet — click "Upload PDF Header Image" above.'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowExamplePdfModal(true)}
                        className="font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        Open Full Example PDF Popup →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. MULTI-PHOTO FRONT PAGE BANNER MANAGER & ADMIN PASSWORD SETTINGS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Upload / Manage Multiple Front Page Banner Photos */}
          <section
            data-testid="admin-front-banner-studio"
            className="lg:col-span-7 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3
                  data-testid="admin-front-banner-studio-heading"
                  className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2"
                >
                  <Images className="w-5 h-5 text-rose-600" />
                  Front Page Multi-Photo Scrolling Banner Studio ({heroImagesList.length} Active)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Upload multiple promotional or family photos to animate and scroll automatically in
                  the main hero banner on the public ExpenseTracker index page.
                </p>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
                  if (files.length > 0) void processHeroImageFiles(files);
                }}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (items) {
                    const pasted: File[] = [];
                    for (let i = 0; i < items.length; i++) {
                      if (items[i].type.startsWith('image/')) {
                        const f = items[i].getAsFile();
                        if (f) pasted.push(f);
                      }
                    }
                    if (pasted.length > 0) {
                      e.preventDefault();
                      void processHeroImageFiles(pasted);
                    }
                  }
                }}
                tabIndex={0}
                className="flex flex-wrap items-center gap-2 outline-none"
              >
                <input
                  ref={heroFileInputRef}
                  id="admin-front-image-upload"
                  data-testid="admin-front-image-upload-input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleHeroImageFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  data-testid="upload-hero-banner-btn"
                  onClick={() => heroFileInputRef.current?.click()}
                  title="Click, drag & drop, or paste (Ctrl+V) banner photos"
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <ImagePlus className="w-4 h-4" />
                  <span>+ Upload / Drop / Paste Banner Photos</span>
                </button>
                {heroImagesList.length > 0 && (
                  <>
                    <button
                      type="button"
                      data-testid="save-hero-banner-db-btn"
                      onClick={() => {
                        const serialized = serializeHeroImagesPayload(heroImagesList);
                        onUpdateLandingHeroImage(serialized || null);
                        void handleRefreshLiveFirebaseData(false);
                        setStatusBanner(
                          `Saved & verified ${heroImagesList.length} banner photo(s) in Firebase Database (/globalConfig/main) & Public Front Page!`
                        );
                        onTriggerFeedback(
                          `Banner Saved to Firebase (${heroImagesList.length} Active)`,
                          'success',
                          'toast'
                        );
                      }}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save &amp; Sync ({heroImagesList.length})</span>
                    </button>
                    <button
                      type="button"
                      data-testid="clear-all-hero-banner-btn"
                      onClick={() => {
                        onUpdateLandingHeroImage(null);
                        setAdminBannerPreviewIdx(0);
                        setStatusBanner(
                          'Cleared all custom banner photos, restored default Indian Family poster, and freed Firebase storage.'
                        );
                        onTriggerFeedback('Restored Default Front Page Banner', 'success');
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      Clear All ({heroImagesList.length})
                    </button>
                  </>
                )}
              </div>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
                if (files.length > 0) void processHeroImageFiles(files);
              }}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 min-h-[200px] flex flex-col justify-center"
            >
              {heroImagesList.length > 0 ? (
                <div className="space-y-4">
                  {/* Live Auto-Scrolling Banner Preview right inside Admin Studio */}
                  <div
                    data-testid="admin-banner-live-carousel-preview"
                    className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-slate-900 p-2"
                  >
                    <div className="flex items-center justify-between px-2 pb-1.5 text-[11px] font-bold text-emerald-300">
                      <span>
                        LIVE FRONT PAGE BANNER PREVIEW (Slide{' '}
                        {Math.min(adminBannerPreviewIdx + 1, heroImagesList.length)} of{' '}
                        {heroImagesList.length})
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200">
                        Synced to /globalConfig/main
                      </span>
                    </div>
                    <div className="relative h-44 w-full rounded-lg overflow-hidden bg-slate-950 flex items-center justify-center">
                      <img
                        src={
                          heroImagesList[adminBannerPreviewIdx % heroImagesList.length] ||
                          heroImagesList[0]
                        }
                        alt="Live Front Page Banner Preview"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {heroImagesList.map((imgUrl, idx) => (
                      <div
                        key={idx}
                        data-testid={`admin-banner-slide-card-${idx + 1}`}
                        className="relative group rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 flex flex-col justify-between"
                      >
                        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-950/80 text-white font-mono font-bold text-[10px]">
                          Slide #{idx + 1}
                        </span>
                        <img
                          src={imgUrl}
                          alt={`Uploaded Front Page Banner Slide ${idx + 1}`}
                          onClick={() => setAdminBannerPreviewIdx(idx)}
                          className="w-full h-28 object-cover rounded-lg cursor-pointer"
                        />
                        <div className="pt-1.5 flex items-center justify-between gap-2 text-[10px]">
                          <span className="font-mono text-slate-500">
                            {formatStorageBytes(imgUrl.length)}
                          </span>
                          <button
                            type="button"
                            data-testid={`delete-banner-slide-btn-${idx + 1}`}
                            onClick={() => handleRemoveSingleHeroPhoto(idx)}
                            className="px-2 py-1 rounded-md bg-rose-500/10 hover:bg-rose-600 text-rose-600 hover:text-white font-bold flex items-center gap-1 transition cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold text-center">
                    ✓ {heroImagesList.length} Photo(s) Active &amp; Saved in Database for Public Page
                    Auto-Sliding &amp; Scrolling Banner Carousel
                  </p>
                </div>
              ) : (
                <div
                  onClick={() => heroFileInputRef.current?.click()}
                  className="text-center space-y-2 text-xs text-slate-500 py-6 cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-900/60 rounded-xl transition"
                >
                  <ImagePlus className="w-8 h-8 text-rose-500 mx-auto opacity-80" />
                  <p className="font-bold text-slate-700 dark:text-slate-300">
                    Default Royal Blue Saree Indian Family Illustration Active (0 Custom Photos)
                  </p>
                  <p>
                    Click here or click &ldquo;+ Upload / Drop / Paste Banner Photos&rdquo; above to
                    select 1 or multiple photos for the animated scrolling hero banner on the public
                    index page.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Right: Admin Own Credentials (with Confirm Password + Transient Eye Toggles) */}
          <section className="lg:col-span-5 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-rose-600" />
                Admin Security Credentials (@{adminUser.username})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Update your Administrator display name, authorized email, or change your admin
                password with <strong>Free Lifetime Firebase Email OTP Verification (Admins Only)</strong>.
                All saved passwords use irreversible salted SHA-256 hashing.
              </p>
            </div>

            <form onSubmit={handleSaveAdminCredentials} autoComplete="off" className="space-y-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
                <span className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  Zero-Knowledge Salted SHA-256 Active (Plaintext Passwords Hidden Everywhere)
                </span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 font-bold">
                  ADMIN ONLY OTP
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="admin-display-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Admin Title / Name
                  </label>
                  <input
                    id="admin-display-name"
                    type="text"
                    value={adminDisplayName}
                    onChange={(e) => setAdminDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-email-address"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Authorized Admin Email Address (For Free Lifetime OTP)
                  </label>
                  <input
                    id="admin-email-address"
                    data-testid="admin-portal-email-input"
                    type="email"
                    value={adminEmailInput}
                    onChange={(e) => setAdminEmailInput(e.target.value)}
                    placeholder={DEFAULT_PRIMARY_ADMIN_EMAIL}
                    className="w-full px-3.5 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-new-password"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  New Admin Password (Saved as Irreversible SHA-256 Hash)
                </label>
                <div className="relative">
                  <input
                    id="admin-new-password"
                    type={showAdminNewPass ? 'text' : 'password'}
                    value={adminNewPassword}
                    onChange={(e) => setAdminNewPassword(e.target.value)}
                    placeholder="Enter new admin password"
                    autoComplete="new-password"
                    className="w-full pl-3.5 pr-10 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminNewPass((p) => !p)}
                    aria-label={
                      showAdminNewPass ? 'Hide new admin password' : 'Show new admin password'
                    }
                    title={showAdminNewPass ? 'Hide password' : 'Show typed password while typing'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showAdminNewPass ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-confirm-password"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Confirm New Admin Password
                </label>
                <div className="relative">
                  <input
                    id="admin-confirm-password"
                    type={showAdminConfirmPass ? 'text' : 'password'}
                    value={adminConfirmPassword}
                    onChange={(e) => setAdminConfirmPassword(e.target.value)}
                    placeholder="Re-enter new admin password"
                    autoComplete="new-password"
                    className={`w-full pl-3.5 pr-10 py-2 text-xs rounded-lg border bg-white dark:bg-slate-950 ${
                      adminConfirmPassword.length > 0 && adminNewPassword !== adminConfirmPassword
                        ? 'border-rose-500'
                        : adminConfirmPassword.length > 0 &&
                          adminNewPassword.length > 0 &&
                          adminNewPassword === adminConfirmPassword
                        ? 'border-emerald-500'
                        : 'border-slate-300 dark:border-slate-700'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminConfirmPass((p) => !p)}
                    aria-label={
                      showAdminConfirmPass
                        ? 'Hide confirm admin password'
                        : 'Show confirm admin password'
                    }
                    title={
                      showAdminConfirmPass
                        ? 'Hide confirm password'
                        : 'Show confirm password while typing'
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showAdminConfirmPass ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {adminConfirmPassword.length > 0 && adminNewPassword !== adminConfirmPassword && (
                  <p
                    role="alert"
                    data-testid="admin-password-mismatch-msg"
                    className="mt-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Passwords do not match</span>
                  </p>
                )}
                {adminConfirmPassword.length > 0 &&
                  adminNewPassword.length > 0 &&
                  adminNewPassword === adminConfirmPassword && (
                    <p
                      data-testid="admin-password-match-msg"
                      className="mt-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Passwords match</span>
                    </p>
                  )}
              </div>

              {adminNewPassword.length > 0 && (
                <PasswordStrengthChecklist password={adminNewPassword} compact />
              )}

              {/* Free Lifetime Firebase Email OTP Gate for Admin Password Change */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">
                    Step 1: Verify Admin Email OTP (Free Lifetime — Admins Only)
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="admin-portal-send-otp-btn"
                      disabled={adminOtpSending}
                      onClick={handleSendAdminPortalOtp}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
                    >
                      {adminOtpSending
                        ? 'Sending OTP...'
                        : adminOtpHashState
                        ? 'Resend 6-Digit Email OTP'
                        : 'Send 6-Digit OTP to Admin Email'}
                    </button>
                    <button
                      type="button"
                      data-testid="admin-portal-google-verify-btn"
                      onClick={handleVerifyAdminPortalGoogleEmail}
                      className="px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold cursor-pointer"
                    >
                      Verify via Firebase Google Auth
                    </button>
                  </div>
                </div>

                {adminDispatchedOtpPlain && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">
                      OTP sent to <strong>{adminEmailInput || DEFAULT_PRIMARY_ADMIN_EMAIL}</strong>
                    </span>
                    <button
                      type="button"
                      data-testid="admin-portal-reveal-otp-btn"
                      onClick={() => setShowAdminDispatchedOtp((p) => !p)}
                      className="font-mono font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                    >
                      {showAdminDispatchedOtp
                        ? `Firebase OTP Receipt: ${adminDispatchedOtpPlain} (Hide)`
                        : 'View Firebase Cloud OTP Receipt'}
                    </button>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="admin-portal-otp-input"
                    className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Enter 6-Digit Admin Email OTP
                  </label>
                  <input
                    id="admin-portal-otp-input"
                    data-testid="admin-portal-otp-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={adminOtpEntered}
                    onChange={(e) => setAdminOtpEntered(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Enter 6-digit OTP to confirm password change"
                    className="w-full px-3.5 py-2 text-xs font-mono font-extrabold tracking-[0.35em] placeholder:tracking-normal placeholder:font-sans placeholder:font-medium text-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              <button
                type="submit"
                data-testid="admin-portal-submit-password-btn"
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
              >
                Verify Email OTP &amp; Update Admin Password
              </button>
            </form>
          </section>
        </div>
      </main>

      {/* EXAMPLE PDF PREVIEW POPUP MODAL FOR ADMIN */}
      {showExamplePdfModal && (
        <PdfPreviewModal
          isOpen={showExamplePdfModal}
          mode="records"
          issuedBy="Tejashree Pradhan (Example Preview)"
          role="user"
          currency="₹"
          periodLabel="Nov 2026"
          transactions={sampleExampleTransactions}
          accounts={[
            {
              id: 'acc-1',
              name: 'Bank of Baroda Savings',
              type: 'Bank Account',
              currency: '₹',
              initialBalance: 60700,
              color: '#ea580c',
              includeInNetWorth: true,
            },
          ]}
          people={[]}
          headerConfig={draftPdfHeader}
          onHeaderConfigChange={(updatedCfg) => {
            setDraftPdfHeader(updatedCfg);
            onSavePdfHeaderConfig(updatedCfg);
          }}
          onClose={() => setShowExamplePdfModal(false)}
          onDownloaded={() =>
            onTriggerFeedback('Example HD PDF Generated Successfully', 'success', 'fullscreen')
          }
          onDownloadExcel={() =>
            onTriggerFeedback('Example Excel Exported Successfully', 'success', 'toast')
          }
        />
      )}

      {/* SIMPLE ADMIN SUPPORT CHAT & CUSTOM REASON MODAL */}
      {activeSupportUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-support-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-fade-up">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-5 h-5 text-rose-400" />
                <div>
                  <h3 id="admin-support-modal-title" className="text-sm font-extrabold">
                    Admin Support Chat &amp; Status Reason — @{activeSupportUser.username}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    {activeSupportUser.displayName} · Status:{' '}
                    <span className="uppercase font-bold text-amber-300">
                      {activeSupportUser.accountStatus || 'active'}
                    </span>
                    {activeSupportUser.holdAcknowledgedByUser
                      ? ' · User Clicked Okay (Active)'
                      : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onAdminCloseSupportIssue(activeSupportUser.id);
                    setStatusBanner(
                      `Marked support issue as CLOSED for @${activeSupportUser.username}. Chat history will automatically delete after 24 hours.`
                    );
                    onTriggerFeedback(
                      `Issue Closed for @${activeSupportUser.username} (Auto-Deletes in 24h)`,
                      'success',
                      'toast'
                    );
                  }}
                  data-testid="admin-close-support-issue-btn"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Issue Closed (24h Auto-Clear)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSupportUserId(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {activeSupportUser.supportIssueClosedAt && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                  ✓ Issue Marked Closed at{' '}
                  {activeSupportUser.supportIssueClosedAt.slice(0, 16).replace('T', ' ')} — Chat
                  history scheduled for automatic cleanup 24 hours after closure.
                </div>
              )}

              {/* Custom Hold / Disable Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Hold / Disable Reason Shown to User on Login Popup
                </label>
                <input
                  type="text"
                  value={adminReasonInput}
                  onChange={(e) => setAdminReasonInput(e.target.value)}
                  placeholder="Enter reason for account hold or disable..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                />
              </div>

              {/* Chat History */}
              <div className="space-y-2 max-h-60 overflow-y-auto p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                {(activeSupportUser.supportMessages || []).length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No support messages exchanged with @{activeSupportUser.username} yet.
                  </p>
                ) : (
                  (activeSupportUser.supportMessages || []).map((msg) => {
                    const isFromAdmin = msg.sender === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isFromAdmin ? 'items-end' : 'items-start'}`}
                      >
                        <div
                          className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs ${
                            isFromAdmin
                              ? 'bg-rose-600 text-white rounded-br-xs'
                              : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-bl-xs'
                          }`}
                        >
                          <div className="font-bold text-[10px] opacity-80 mb-0.5">
                            {isFromAdmin ? 'You (Admin)' : `@${activeSupportUser.username}`} ·{' '}
                            {msg.createdAt.slice(11, 16)}
                          </div>
                          <p className="leading-relaxed">{msg.text}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Send Custom Message / Notification to User */}
              <form onSubmit={handleSendSupportReply} className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Send Custom Message &amp; Login Notification to @{activeSupportUser.username}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={adminMessageInput}
                    onChange={(e) => setAdminMessageInput(e.target.value)}
                    placeholder="Type message or instructions for user..."
                    className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send to User
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MASTER PORTAL RESET CONFIRMATION MODAL (Primary Admin Only) */}
      {showResetPortalModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-portal-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border-2 border-rose-500 shadow-2xl overflow-hidden animate-fade-up">
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-5 h-5" />
                <h3 id="reset-portal-modal-title" className="text-sm font-extrabold">
                  Reset Entire Portal &amp; Clear All Data
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowResetPortalModal(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmResetEntirePortal} className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                This primary Admin account cannot be deleted. Confirming <strong>Reset Portal</strong>{' '}
                will permanently wipe all registered customer &amp; secondary admin accounts, all
                financial vaults, and all custom images in Firebase Cloud &amp; Local Storage,
                restoring the portal to a clean state.
              </p>

              {resetPortalError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs font-bold">
                  {resetPortalError}
                </div>
              )}

              <div>
                <label
                  htmlFor="confirm-reset-portal-password"
                  className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Enter Your Admin Password to Confirm Reset
                </label>
                <div className="relative">
                  <input
                    id="confirm-reset-portal-password"
                    type={showResetPortalPass ? 'text' : 'password'}
                    value={resetPortalPassword}
                    onChange={(e) => setResetPortalPassword(e.target.value)}
                    placeholder="Enter current Admin password"
                    required
                    autoComplete="off"
                    className="w-full pl-3.5 pr-10 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPortalPass((p) => !p)}
                    aria-label={showResetPortalPass ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showResetPortalPass ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetPortalModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="confirm-reset-portal-submit"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold cursor-pointer shadow-md"
                >
                  Confirm &amp; Clear All Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM PERMANENT USER DELETION MODAL (Requires Admin Password before deleting any user in Admin) */}
      {userPendingPermanentDelete && (
        <div
          data-testid="admin-delete-user-confirm-modal"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-delete-user-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border-2 border-rose-500 shadow-2xl overflow-hidden animate-fade-up">
            <div className="px-6 py-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-5 h-5" />
                <h3 id="admin-delete-user-modal-title" className="text-sm font-extrabold">
                  Confirm Permanent User Deletion
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUserPendingPermanentDelete(null);
                  setAdminDeleteUserPassword('');
                  setAdminDeleteUserError('');
                }}
                className="p-1 rounded-lg text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Are you sure you want to permanently delete user{' '}
                <strong className="text-slate-900 dark:text-white">
                  @{userPendingPermanentDelete.username}
                </strong>{' '}
                ({userPendingPermanentDelete.displayName})?
              </p>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[11px] text-rose-700 dark:text-rose-300 font-semibold leading-relaxed">
                This action will permanently remove @{userPendingPermanentDelete.username}&apos;s
                account, login credentials, and entire financial vault from both Local Storage and
                Firebase Cloud. Once deleted, it cannot be recovered.
              </div>

              <div>
                <label
                  htmlFor="admin-delete-user-password-input"
                  className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Enter Admin Password to Confirm Deletion *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-delete-user-password-input"
                    data-testid="admin-delete-user-password-input"
                    type={showAdminDeleteUserPass ? 'text' : 'password'}
                    value={adminDeleteUserPassword}
                    onChange={(e) => {
                      setAdminDeleteUserPassword(e.target.value);
                      if (adminDeleteUserError) setAdminDeleteUserError('');
                    }}
                    placeholder="Enter your Admin password..."
                    autoComplete="new-password"
                    className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                  />
                  <button
                    type="button"
                    data-testid="toggle-admin-delete-user-pass"
                    onClick={() => setShowAdminDeleteUserPass((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    aria-label={showAdminDeleteUserPass ? 'Hide password' : 'Show password'}
                  >
                    {showAdminDeleteUserPass ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {adminDeleteUserError && (
                  <p
                    data-testid="admin-delete-user-error"
                    className="mt-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{adminDeleteUserError}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  data-testid="cancel-admin-delete-user-btn"
                  onClick={() => {
                    setUserPendingPermanentDelete(null);
                    setAdminDeleteUserPassword('');
                    setAdminDeleteUserError('');
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-admin-delete-user-btn"
                  onClick={() => {
                    if (!adminDeleteUserPassword.trim()) {
                      setAdminDeleteUserError(
                        'Please enter your Admin password to confirm deleting this account.'
                      );
                      return;
                    }
                    if (
                      !verifySecretAgainstStoredHash(
                        adminDeleteUserPassword,
                        adminUser.passwordHash
                      )
                    ) {
                      setAdminDeleteUserError('Incorrect Admin password. Deletion cancelled.');
                      return;
                    }
                    const target = userPendingPermanentDelete;
                    const res = onAdminPermanentlyDeleteUser(target.id, adminDeleteUserPassword);
                    if (res && typeof res === 'object' && 'ok' in res && !res.ok) {
                      setAdminDeleteUserError(
                        res.error || 'Incorrect Admin password. Deletion cancelled.'
                      );
                      return;
                    }
                    setUserPendingPermanentDelete(null);
                    setAdminDeleteUserPassword('');
                    setAdminDeleteUserError('');
                    setStatusBanner(
                      `Permanently deleted @${target.username} and all associated vault data from Local & Firebase Cloud.`
                    );
                    onTriggerFeedback(
                      `@${target.username} Deleted Permanently`,
                      'success',
                      'fullscreen'
                    );
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Yes, Permanently Delete @{userPendingPermanentDelete.username}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
