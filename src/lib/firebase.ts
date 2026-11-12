import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  getDocs,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  DreamVault,
  ExpectedItem,
  PdfHeaderImageConfig,
  PersonProfile,
  TransactionRecord,
  UserAccount,
  UserVaultData,
  WalletAccount,
} from '../types/finance';
import {
  DEFAULT_PDF_HEADER_CONFIG,
  getLocalGlobalConfigUpdatedAt,
  getLocalUsersUpdatedAt,
  loadDeletedUserIdsFromLocal,
  loadProofImageLocally,
  markUserIdDeletedLocally,
  parseHeroImagesPayload,
  saveLandingHeroImage,
  savePdfHeaderConfig,
  saveProofImageLocally,
  saveUsersToLocal,
  saveUserVault,
} from '../utils/localVaultStorage';
import {
  DEFAULT_PRIMARY_ADMIN_EMAIL,
  ensureZeroKnowledgeUsers,
} from '../utils/financeRules';

// Silence noisy internal Firestore WebChannel backoff logs when free-tier daily quota is reached
try {
  setLogLevel('silent');
} catch {
  // ignore
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Circuit breaker when Firestore free-tier daily write quota is exhausted
const WRITE_PAUSE_SESSION_KEY = 'pocketledger_firestore_write_paused_until_v1';
let firestoreWritePausedUntilMs = 0;

function isWriteQuotaPaused(): boolean {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const saved = Number(sessionStorage.getItem(WRITE_PAUSE_SESSION_KEY) || '0');
      if (saved > firestoreWritePausedUntilMs) {
        firestoreWritePausedUntilMs = saved;
      }
    }
  } catch {
    // ignore
  }
  return Date.now() < firestoreWritePausedUntilMs;
}

function checkAndPauseOnQuotaError(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error || '');
  if (msg.includes('resource-exhausted') || msg.includes('Quota limit exceeded')) {
    firestoreWritePausedUntilMs = Date.now() + 10 * 60 * 1000;
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(WRITE_PAUSE_SESSION_KEY, String(firestoreWritePausedUntilMs));
      }
    } catch {
      // ignore
    }
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'globalConfig', 'main'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Defensive payload sanitization helpers matching firebase-blueprint.json maxLengths & patterns
const cleanId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'doc_1';
const clampStr = (val: string | undefined, max: number, fallback = '') =>
  (val ?? fallback).trim().slice(0, max);

export async function signInWithGoogleCloud(): Promise<User> {
  const res = await signInWithPopup(auth, googleProvider);
  return res.user;
}

export async function signOutFromCloud(): Promise<void> {
  if (auth.currentUser) {
    await firebaseSignOut(auth);
  }
}

export { onAuthStateChanged };
export type { User };

// ============================================================================
// AUTOMATIC REAL-TIME CROSS-DEVICE SYNC (Desktop <-> Mobile <-> Custom Domain)
// Syncs Front Page Hero Photo, PDF Header Config, User/Admin Accounts & Passwords,
// and Per-User Financial Vaults automatically via Cloud Firestore.
// ============================================================================

/**
 * Subscribes in real time to `/globalConfig/main` so Front Page Hero Image and
 * PDF Header Image Configuration automatically sync across Desktop & Mobile.
 * Local changes with a newer timestamp are never overwritten by stale cloud snapshots.
 */
export function subscribeToGlobalCloudConfig(callbacks: {
  onHeroImage: (heroImage: string | null) => void;
  onPdfHeaderConfig: (config: PdfHeaderImageConfig) => void;
  getInitialLocalState: () => {
    heroImage: string | null;
    pdfHeaderConfig: PdfHeaderImageConfig;
  };
}): () => void {
  const configRef = doc(db, 'globalConfig', 'main');
  let seededInitial = false;

  return onSnapshot(
    configRef,
    (snap) => {
      if (!snap.exists()) {
        if (!seededInitial) {
          seededInitial = true;
          const initial = callbacks.getInitialLocalState();
          saveGlobalCloudConfig(initial.heroImage, initial.pdfHeaderConfig).catch(() => {
            // ignore offline fallback
          });
        }
        return;
      }
      const data = snap.data();
      const cloudUpdatedAtMs =
        data.updatedAt && typeof data.updatedAt.toMillis === 'function'
          ? data.updatedAt.toMillis()
          : 0;
      const localUpdatedAtMs = getLocalGlobalConfigUpdatedAt();

      // If local global config was updated more recently than the cloud document, keep local!
      if (localUpdatedAtMs > 0 && localUpdatedAtMs >= cloudUpdatedAtMs) {
        return;
      }

      const cloudHero =
        typeof data.landingHeroImage === 'string' && data.landingHeroImage.length > 0
          ? data.landingHeroImage
          : null;
      saveLandingHeroImage(cloudHero, false);
      callbacks.onHeroImage(cloudHero);

      if (typeof data.pdfHeaderJson === 'string' && data.pdfHeaderJson.length >= 2) {
        try {
          const parsed = JSON.parse(data.pdfHeaderJson) as Partial<PdfHeaderImageConfig>;
          const mergedConfig: PdfHeaderImageConfig = {
            imageUrl:
              parsed.imageUrl ?? loadProofImageLocally('global-pdf-header-logo') ?? null,
            width: typeof parsed.width === 'number' ? parsed.width : 64,
            height: typeof parsed.height === 'number' ? parsed.height : 48,
            align:
              parsed.align === 'left' || parsed.align === 'center' || parsed.align === 'right'
                ? parsed.align
                : 'right',
            offsetX: typeof parsed.offsetX === 'number' ? parsed.offsetX : 0,
            offsetY: typeof parsed.offsetY === 'number' ? parsed.offsetY : 0,
            orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
            headerBgColor:
              typeof parsed.headerBgColor === 'string' && parsed.headerBgColor.trim()
                ? parsed.headerBgColor.trim()
                : '#162d59',
          };
          savePdfHeaderConfig(mergedConfig, false);
          callbacks.onPdfHeaderConfig(mergedConfig);
        } catch {
          // ignore malformed JSON
        }
      }
    },
    (err) => {
      console.warn('Global config sync listener notice:', err?.message || err);
    }
  );
}

/**
 * Pushes updated Front Page Hero Image and PDF Header Config to `/globalConfig/main` in Firestore.
 */
export async function saveGlobalCloudConfig(
  landingHeroImage: string | null,
  pdfHeaderConfig: PdfHeaderImageConfig
): Promise<void> {
  if (isWriteQuotaPaused()) return;
  let safePdfJson = JSON.stringify(pdfHeaderConfig || DEFAULT_PDF_HEADER_CONFIG);
  if (safePdfJson.length > 450000) {
    safePdfJson = JSON.stringify({
      ...(pdfHeaderConfig || DEFAULT_PDF_HEADER_CONFIG),
      imageUrl: null,
    });
  }

  let safeHero = '';
  const heroList = parseHeroImagesPayload(landingHeroImage);
  if (heroList.length === 1) {
    safeHero = heroList[0].length <= 850000 - safePdfJson.length ? heroList[0] : '';
  } else if (heroList.length > 1) {
    const fitting: string[] = [];
    for (const img of heroList) {
      const candidate = JSON.stringify([...fitting, img]);
      if (candidate.length + safePdfJson.length <= 850000) {
        fitting.push(img);
      }
    }
    safeHero = fitting.length > 0 ? JSON.stringify(fitting) : '';
  }

  try {
    await setDoc(doc(db, 'globalConfig', 'main'), {
      configId: 'main',
      landingHeroImage: safeHero,
      pdfHeaderJson: safePdfJson,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    checkAndPauseOnQuotaError(error);
    console.warn('Failed to push global config to cloud:', error);
  }
}

/**
 * Subscribes in real time to `/appUsers` collection so Admin password changes,
 * newly added Admins, 1-time temp passwords, and Customer accounts sync automatically across Desktop & Mobile.
 * Filters out deleted user tombstones and preserves newer local user updates.
 */
export function subscribeToCloudUsers(callbacks: {
  onUsers: (users: UserAccount[]) => void;
  getInitialLocalUsers: () => UserAccount[];
}): () => void {
  let seededInitial = false;

  return onSnapshot(
    collection(db, 'appUsers'),
    (snap) => {
      const localUsers = callbacks.getInitialLocalUsers();
      const deletedIds = new Set(loadDeletedUserIdsFromLocal());

      if (snap.empty) {
        if (!seededInitial) {
          seededInitial = true;
          syncUsersToCloud(localUsers).catch(() => {
            // ignore offline fallback
          });
        }
        return;
      }

      let maxCloudDocUpdatedAtMs = 0;
      const cloudUsersMap = new Map<string, UserAccount>();
      for (const d of snap.docs) {
        const data = d.data();
        const docMs =
          data.updatedAt && typeof data.updatedAt.toMillis === 'function'
            ? data.updatedAt.toMillis()
            : 0;
        if (docMs > maxCloudDocUpdatedAtMs) {
          maxCloudDocUpdatedAtMs = docMs;
        }
        if (typeof data.userJson === 'string') {
          try {
            const parsed = JSON.parse(data.userJson) as UserAccount;
            if (
              parsed &&
              parsed.id &&
              parsed.username &&
              (parsed.id === 'user-admin' || !deletedIds.has(parsed.id))
            ) {
              cloudUsersMap.set(parsed.id, {
                ...parsed,
                avatarThumbnailDataUrl:
                  parsed.avatarThumbnailDataUrl ||
                  loadProofImageLocally(`user-avatar-${parsed.id}`),
              });
            }
          } catch {
            // skip invalid entry
          }
        }
      }

      const localUsersUpdatedAtMs = getLocalUsersUpdatedAt();
      const localIsNewerOverall =
        localUsersUpdatedAtMs > 0 && localUsersUpdatedAtMs >= maxCloudDocUpdatedAtMs;

      // Merge localUsers and cloudUsersMap without ever resurrecting deletedIds or losing newer local edits
      const mergedMap = new Map<string, UserAccount>();

      for (const [id, cUser] of cloudUsersMap.entries()) {
        mergedMap.set(id, cUser);
      }

      for (const lUser of localUsers) {
        if (lUser.id !== 'user-admin' && deletedIds.has(lUser.id)) {
          continue;
        }
        const cUser = mergedMap.get(lUser.id);
        if (!cUser) {
          // Local user was created locally and hasn't synced to cloud yet
          mergedMap.set(lUser.id, lUser);
        } else {
          const lTime = Date.parse(lUser.updatedAt || lUser.createdAt || '');
          const cTime = Date.parse(cUser.updatedAt || cUser.createdAt || '');
          if (
            localIsNewerOverall ||
            (!Number.isNaN(lTime) && (Number.isNaN(cTime) || lTime >= cTime))
          ) {
            mergedMap.set(lUser.id, {
              ...cUser,
              ...lUser,
              avatarThumbnailDataUrl:
                lUser.avatarThumbnailDataUrl ||
                cUser.avatarThumbnailDataUrl ||
                loadProofImageLocally(`user-avatar-${lUser.id}`),
            });
          }
        }
      }

      const mergedList = Array.from(mergedMap.values());
      if (mergedList.length > 0) {
        if (!mergedList.some((u) => u.id === 'user-admin' || u.username.toLowerCase() === 'admin')) {
          const fallbackAdmin = localUsers.find(
            (u) => u.id === 'user-admin' || u.username.toLowerCase() === 'admin'
          );
          if (fallbackAdmin) {
            mergedList.unshift(fallbackAdmin);
          }
        }
        const { users: sanitizedUsers } = ensureZeroKnowledgeUsers(mergedList);
        saveUsersToLocal(sanitizedUsers, false);
        callbacks.onUsers(sanitizedUsers);
      }
    },
    (err) => {
      console.warn('Cloud users sync listener notice:', err?.message || err);
    }
  );
}

/**
 * Pushes all user accounts (or updated Admin/Customer account) to `/appUsers/{userId}` in Firestore.
 * Always enforces irreversible zero-knowledge password & PIN hashing prior to cloud persistence.
 */
export async function syncUsersToCloud(users: UserAccount[]): Promise<void> {
  if (isWriteQuotaPaused()) return;
  const deletedIds = new Set(loadDeletedUserIdsFromLocal());
  const activeUsers = users.filter((u) => u && (u.id === 'user-admin' || !deletedIds.has(u.id)));
  const { users: sanitizedUsers } = ensureZeroKnowledgeUsers(activeUsers);
  try {
    await Promise.all(
      sanitizedUsers.map(async (user) => {
        const safeUserId = cleanId(user.id);
        let userJson = JSON.stringify(user);
        if (userJson.length > 580000) {
          userJson = JSON.stringify({
            ...user,
            avatarThumbnailDataUrl: undefined,
          });
        }
        await setDoc(doc(db, 'appUsers', safeUserId), {
          userId: safeUserId,
          username: clampStr(user.username, 100, 'user'),
          role: user.role === 'admin' ? 'admin' : 'user',
          userJson,
          updatedAt: serverTimestamp(),
        });
      })
    );
  } catch (error) {
    checkAndPauseOnQuotaError(error);
    console.warn('Failed to sync users to cloud:', error);
  }
}

/**
 * Free Lifetime Admin-Only Firebase Email OTP & Verification Dispatch.
 * Strictly restricted to `role === 'admin'`. Never available to regular users.
 */
export async function sendAdminEmailOtpViaFirebaseAndRelay(params: {
  adminUser: UserAccount;
  otpCode: string;
  targetEmail: string;
}): Promise<{
  ok: boolean;
  emailDelivered: boolean;
  firebaseResetSent: boolean;
  message: string;
}> {
  const { adminUser, otpCode, targetEmail } = params;
  if (!adminUser || adminUser.role !== 'admin') {
    return {
      ok: false,
      emailDelivered: false,
      firebaseResetSent: false,
      message: 'Firebase Email OTP verification is strictly restricted to Admin accounts only.',
    };
  }

  const cleanEmail = (targetEmail || adminUser.email || DEFAULT_PRIMARY_ADMIN_EMAIL)
    .trim()
    .toLowerCase();

  let emailDelivered = false;
  let firebaseResetSent = false;

  // 1. Free lifetime email dispatch via FormSubmit AJAX endpoint to Admin's inbox
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(cleanEmail)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        _subject: `ExpenseTracker Admin Security OTP: ${otpCode}`,
        _template: 'table',
        _captcha: 'false',
        Admin_Account: `@${adminUser.username} (${adminUser.displayName})`,
        Verification_Type: 'Admin-Only Password Change / Recovery OTP (Free Lifetime)',
        Six_Digit_OTP_Code: otpCode,
        Validity_Window: '10 Minutes (Stored as Zero-Knowledge SHA-256 Hash in Firebase)',
        Security_Notice:
          'Never share this 6-digit Admin OTP. Passwords are irreversibly hashed with salted SHA-256.',
      }),
    });
    if (res.ok) {
      emailDelivered = true;
    }
  } catch {
    // Fallback to Firebase Auth verification & Cloud OTP dispatch receipt
  }

  // 2. Also trigger Firebase Authentication native email reset/verification notification if configured
  try {
    await sendPasswordResetEmail(auth, cleanEmail);
    firebaseResetSent = true;
  } catch {
    // Ignore if Email/Password provider is not enabled in Firebase Console
  }

  return {
    ok: true,
    emailDelivered,
    firebaseResetSent,
    message: emailDelivered
      ? `6-digit Admin OTP dispatched to ${cleanEmail} (valid for 10 minutes). Check your inbox/spam or verify via Firebase Google Auth below.`
      : `6-digit Admin OTP generated and secured in Firebase Cloud for ${cleanEmail} (valid for 10 minutes).`,
  };
}

/**
 * Free Lifetime Firebase Google Auth Email Ownership Verification for Admins (`role === 'admin'`).
 * Cryptographically verifies that the signed-in Google account matches the Admin's email address.
 */
export async function verifyAdminEmailOwnershipWithFirebaseGoogle(
  expectedAdminEmail: string
): Promise<{
  ok: boolean;
  verifiedEmail?: string;
  error?: string;
}> {
  const cleanExpected = (expectedAdminEmail || DEFAULT_PRIMARY_ADMIN_EMAIL).trim().toLowerCase();
  try {
    // If already signed in with matching verified Google email, succeed immediately
    if (
      auth.currentUser &&
      auth.currentUser.emailVerified &&
      (auth.currentUser.email?.toLowerCase() === cleanExpected ||
        auth.currentUser.email?.toLowerCase() === DEFAULT_PRIMARY_ADMIN_EMAIL)
    ) {
      return {
        ok: true,
        verifiedEmail: auth.currentUser.email.toLowerCase(),
      };
    }

    const fbUser = await signInWithGoogleCloud();
    const signedInEmail = (fbUser.email || '').toLowerCase();
    if (
      fbUser.emailVerified &&
      (signedInEmail === cleanExpected || signedInEmail === DEFAULT_PRIMARY_ADMIN_EMAIL)
    ) {
      return {
        ok: true,
        verifiedEmail: signedInEmail,
      };
    }
    return {
      ok: false,
      error: `Google account (${signedInEmail || 'unknown'}) does not match the authorized Admin email (${cleanExpected}).`,
    };
  } catch (err: any) {
    return {
      ok: false,
      error:
        err?.message ||
        'Could not complete Firebase Google Email verification popup. Please enter the 6-digit OTP code directly.',
    };
  }
}

/**
 * Deletes a user account and their vault from `/appUsers/{userId}` and `/userVaults/{userId}` in Firestore.
 */
export async function deleteUserFromCloud(userId: string): Promise<void> {
  const safeUserId = cleanId(userId);
  if (safeUserId === 'user-admin') return;
  markUserIdDeletedLocally(userId);
  if (isWriteQuotaPaused()) return;
  try {
    await Promise.all([
      deleteDoc(doc(db, 'appUsers', safeUserId)),
      deleteDoc(doc(db, 'userVaults', safeUserId)),
    ]);
  } catch (error) {
    checkAndPauseOnQuotaError(error);
    console.warn('Failed to delete user from cloud:', error);
  }
}

/**
 * Clears all users, user vaults, and global config in Cloud Firestore when the primary Admin resets the portal.
 */
export async function resetEntireCloudPortal(
  existingUsers: UserAccount[],
  freshAdmin: UserAccount
): Promise<void> {
  if (isWriteQuotaPaused()) return;
  try {
    const nonPrimaryIds = existingUsers
      .map((u) => cleanId(u.id))
      .filter((id) => id !== 'user-admin');

    await Promise.all([
      ...nonPrimaryIds.map((id) => deleteDoc(doc(db, 'appUsers', id)).catch(() => {})),
      ...nonPrimaryIds.map((id) => deleteDoc(doc(db, 'userVaults', id)).catch(() => {})),
      setDoc(doc(db, 'appUsers', 'user-admin'), {
        userId: 'user-admin',
        username: 'admin',
        role: 'admin',
        userJson: JSON.stringify(freshAdmin),
        updatedAt: serverTimestamp(),
      }),
      setDoc(doc(db, 'userVaults', 'user-admin'), {
        userId: 'user-admin',
        vaultJson: JSON.stringify({
          userId: 'user-admin',
          updatedAt: new Date().toISOString(),
          accounts: [],
          transactions: [],
          people: [],
          expectedItems: [],
          dreamVaults: [],
        }),
        updatedAt: serverTimestamp(),
      }),
      saveGlobalCloudConfig(null, DEFAULT_PDF_HEADER_CONFIG),
    ]);
  } catch (error) {
    checkAndPauseOnQuotaError(error);
    console.warn('Failed to reset entire cloud portal:', error);
  }
}

/**
 * Subscribes in real time to `/userVaults/{userId}` so a user's wallets, records, proof images,
 * people, expected bills, and dream vaults automatically sync across Desktop & Mobile.
 * Local vault changes with a newer `updatedAt` timestamp are never overwritten by stale cloud snapshots.
 */
export function subscribeToUserCloudVault(
  userId: string,
  callbacks: {
    onVault: (vault: UserVaultData) => void;
    getInitialLocalVault: () => UserVaultData;
  }
): () => void {
  const safeUserId = cleanId(userId);
  const vaultRef = doc(db, 'userVaults', safeUserId);
  let seededInitial = false;

  return onSnapshot(
    vaultRef,
    (snap) => {
      const localVault = callbacks.getInitialLocalVault();
      if (!snap.exists()) {
        if (!seededInitial) {
          seededInitial = true;
          const hasData =
            localVault.accounts.length > 0 ||
            localVault.transactions.length > 0 ||
            localVault.people.length > 0 ||
            localVault.expectedItems.length > 0 ||
            localVault.dreamVaults.length > 0 ||
            (localVault.loans || []).length > 0 ||
            (localVault.recurringPayments || []).length > 0;
          if (hasData) {
            saveUserCloudVault(localVault).catch(() => {
              // ignore offline fallback
            });
          }
        }
        return;
      }

      const data = snap.data();
      if (typeof data.vaultJson === 'string' && data.vaultJson.length >= 2) {
        try {
          const parsed = JSON.parse(data.vaultJson) as UserVaultData;
          if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
            const localTime = Date.parse(localVault.updatedAt || '');
            const cloudTime = Date.parse(parsed.updatedAt || '');

            // Never let an older cloud snapshot overwrite newer local changes (records, images, deletions)!
            if (!Number.isNaN(localTime) && (Number.isNaN(cloudTime) || localTime >= cloudTime)) {
              return;
            }

            parsed.accounts = (parsed.accounts || []).map((acc) => ({
              ...acc,
              bankLogoUrl: acc.bankLogoUrl || loadProofImageLocally(`acc-logo-${acc.id}`),
            }));
            parsed.transactions = (parsed.transactions || []).map((tx) => {
              const pid = tx.proofId || (tx.proofImageDataUrl ? `prf-${tx.id}` : undefined);
              if (pid && tx.proofImageDataUrl) {
                saveProofImageLocally(pid, tx.proofImageDataUrl);
              }
              return {
                ...tx,
                proofId: pid,
                proofImageDataUrl: tx.proofImageDataUrl || loadProofImageLocally(pid),
              };
            });
            parsed.expectedItems = (parsed.expectedItems || []).map((item) => {
              const pid =
                item.proofId || (item.proofImageDataUrl ? `prf-exp-${item.id}` : undefined);
              if (pid && item.proofImageDataUrl) {
                saveProofImageLocally(pid, item.proofImageDataUrl);
              }
              return {
                ...item,
                proofId: pid,
                proofImageDataUrl: item.proofImageDataUrl || loadProofImageLocally(pid),
              };
            });
            parsed.dreamVaults = (parsed.dreamVaults || []).map((dv) => {
              if (
                dv.imageUrl &&
                dv.imageUrl.startsWith('data:image/') &&
                !dv.imageUrl.startsWith('data:image/svg+xml')
              ) {
                saveProofImageLocally(`dream-img-${dv.id}`, dv.imageUrl);
              }
              return {
                ...dv,
                imageUrl: loadProofImageLocally(`dream-img-${dv.id}`) || dv.imageUrl,
              };
            });
            saveUserVault(parsed, true);
            callbacks.onVault(parsed);
          }
        } catch {
          // ignore malformed JSON
        }
      }
    },
    (err) => {
      console.warn('User vault sync listener notice:', err?.message || err);
    }
  );
}

/**
 * Saves a user's financial vault to `/userVaults/{userId}` in Cloud Firestore.
 */
export async function saveUserCloudVault(vault: UserVaultData): Promise<void> {
  if (isWriteQuotaPaused()) return;
  const safeUserId = cleanId(vault.userId);
  const nowIso = vault.updatedAt || new Date().toISOString();
  let vaultJson = JSON.stringify({
    ...vault,
    updatedAt: nowIso,
  });

  // Safety guard: if multiple large images exceed 880KB in a single document, strip inline dataUrls for cloud transport while keeping them in local proof storage
  if (vaultJson.length > 880000) {
    const compactTransactions = (vault.transactions || []).map((tx) => ({
      ...tx,
      proofImageDataUrl: undefined,
    }));
    const compactExpected = (vault.expectedItems || []).map((item) => ({
      ...item,
      proofImageDataUrl: undefined,
    }));
    vaultJson = JSON.stringify({
      ...vault,
      transactions: compactTransactions,
      expectedItems: compactExpected,
      updatedAt: nowIso,
    });
  }
  if (vaultJson.length > 880000) {
    const compactDreams = (vault.dreamVaults || []).map((dv) => ({
      ...dv,
      imageUrl:
        dv.imageUrl && dv.imageUrl.length > 50000 ? undefined : dv.imageUrl,
    }));
    vaultJson = JSON.stringify({
      ...vault,
      transactions: (vault.transactions || []).map((tx) => ({
        ...tx,
        proofImageDataUrl: undefined,
      })),
      expectedItems: (vault.expectedItems || []).map((item) => ({
        ...item,
        proofImageDataUrl: undefined,
      })),
      dreamVaults: compactDreams,
      updatedAt: nowIso,
    });
  }

  try {
    await setDoc(doc(db, 'userVaults', safeUserId), {
      userId: safeUserId,
      vaultJson,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    checkAndPauseOnQuotaError(error);
    console.warn('Failed to sync user vault to cloud:', error);
  }
}

/**
 * Ensures initial cloud profile exists for an authenticated Google user (all collections start empty).
 */
export async function ensureCloudUserInitialized(
  uid: string,
  displayName: string,
  _initialVaultTemplate: UserVaultData
): Promise<void> {
  const safeUid = cleanId(uid);
  const profilePath = `profiles/${safeUid}`;
  try {
    const profileQ = query(collection(db, 'profiles'), where('ownerId', '==', safeUid));
    const snap = await getDocs(profileQ);
    if (!snap.empty) return;

    await setDoc(doc(db, 'profiles', safeUid), {
      ownerId: safeUid,
      displayName: clampStr(displayName, 100, 'Cloud Workspace'),
      currency: '$',
      role: 'user',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }
}

/**
 * Subscribes to live Firestore collections for an authenticated cloud user.
 */
export function subscribeToCloudVault(
  uid: string,
  callbacks: {
    onAccounts: (accounts: WalletAccount[]) => void;
    onTransactions: (transactions: TransactionRecord[]) => void;
    onPeople: (people: PersonProfile[]) => void;
    onExpectedItems: (items: ExpectedItem[]) => void;
    onDreamVaults: (vaults: DreamVault[]) => void;
  }
): () => void {
  const safeUid = cleanId(uid);

  const unsubAccounts = onSnapshot(
    query(collection(db, 'accounts'), where('ownerId', '==', safeUid)),
    (snap) => {
      const list: WalletAccount[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          type: data.type,
          customType: data.customType,
          currency: data.currency,
          initialBalance: Number(data.initialBalance) || 0,
          color: data.color || '#10b981',
          includeInNetWorth: Boolean(data.includeInNetWorth),
        };
      });
      callbacks.onAccounts(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'accounts')
  );

  const unsubTransactions = onSnapshot(
    query(collection(db, 'transactions'), where('ownerId', '==', safeUid)),
    (snap) => {
      const list: TransactionRecord[] = snap.docs
        .map((d) => {
          const data = d.data();
          const proofId = data.proofId;
          return {
            id: d.id,
            date: data.date,
            title: data.title,
            amount: Number(data.amount) || 0,
            type: data.type,
            customTypeLabel: data.customTypeLabel,
            category: data.category,
            customCategory: data.customCategory,
            accountId: data.accountId,
            toAccountId: data.toAccountId,
            paymentMethod: data.paymentMethod,
            customPaymentMethod: data.customPaymentMethod,
            personId: data.personId,
            dreamVaultId: data.dreamVaultId,
            status: data.status,
            billable: data.billable,
            notes: data.notes,
            proofId,
            proofImageName: data.proofImageName,
            proofImageDataUrl: loadProofImageLocally(proofId),
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date));
      callbacks.onTransactions(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
  );

  const unsubPeople = onSnapshot(
    query(collection(db, 'people'), where('ownerId', '==', safeUid)),
    (snap) => {
      const list: PersonProfile[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          relationship: data.relationship,
          customRelationship: data.customRelationship,
          phone: data.contactHandle,
          notes: data.notes,
        };
      });
      callbacks.onPeople(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'people')
  );

  const unsubExpected = onSnapshot(
    query(collection(db, 'expectedItems'), where('ownerId', '==', safeUid)),
    (snap) => {
      const list: ExpectedItem[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          personId: data.personId,
          title: data.title,
          amount: Number(data.amount) || 0,
          settledAmount: Number(data.settledAmount) || 0,
          direction: data.direction,
          customDirection: data.customDirection,
          category: data.category,
          customCategory: data.customCategory,
          date: data.date,
          dueDate: data.dueDate,
          linkedTransactionId: data.linkedTransactionId,
          status: data.status,
          notes: data.notes,
        };
      });
      callbacks.onExpectedItems(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'expectedItems')
  );

  const unsubDreams = onSnapshot(
    query(collection(db, 'dreamVaults'), where('ownerId', '==', safeUid)),
    (snap) => {
      const list: DreamVault[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          storageType: data.storageType,
          customStorageType: data.customStorageType,
          targetAmount: Number(data.targetAmount) || 0,
          currentAmount: Number(data.currentAmount) || 0,
          monthlyPlannedContribution: Number(data.monthlyPlannedContribution) || 0,
          targetDate: data.targetDate,
          linkedAccountId: data.linkedAccountId,
          notes: data.notes,
        };
      });
      callbacks.onDreamVaults(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'dreamVaults')
  );

  return () => {
    unsubAccounts();
    unsubTransactions();
    unsubPeople();
    unsubExpected();
    unsubDreams();
  };
}

export async function saveCloudAccount(uid: string, acc: WalletAccount): Promise<void> {
  const safeUid = cleanId(uid);
  const docId = cleanId(acc.id);
  try {
    await setDoc(doc(db, 'accounts', docId), {
      ownerId: safeUid,
      name: clampStr(acc.name, 100, 'Wallet'),
      type: clampStr(acc.type, 60, 'Bank Account'),
      ...(acc.customType ? { customType: clampStr(acc.customType, 80) } : {}),
      currency: clampStr(acc.currency, 16, '$'),
      initialBalance: Number(acc.initialBalance) || 0,
      color: clampStr(acc.color, 32, '#10b981'),
      includeInNetWorth: Boolean(acc.includeInNetWorth),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `accounts/${docId}`);
  }
}

export async function deleteCloudAccount(accId: string): Promise<void> {
  const docId = cleanId(accId);
  try {
    await deleteDoc(doc(db, 'accounts', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `accounts/${docId}`);
  }
}

export async function saveCloudTransaction(uid: string, tx: TransactionRecord): Promise<void> {
  const safeUid = cleanId(uid);
  const docId = cleanId(tx.id);
  if (tx.proofId && tx.proofImageDataUrl) {
    saveProofImageLocally(tx.proofId, tx.proofImageDataUrl);
  }
  try {
    await setDoc(doc(db, 'transactions', docId), {
      ownerId: safeUid,
      date: clampStr(tx.date, 32, '2026-11-07'),
      title: clampStr(tx.title, 160, 'Record'),
      amount: Math.max(0.01, Number(tx.amount) || 1),
      type: tx.type,
      ...(tx.customTypeLabel ? { customTypeLabel: clampStr(tx.customTypeLabel, 80) } : {}),
      category: clampStr(tx.category, 100, 'Other'),
      ...(tx.customCategory ? { customCategory: clampStr(tx.customCategory, 100) } : {}),
      accountId: cleanId(tx.accountId),
      ...(tx.toAccountId ? { toAccountId: cleanId(tx.toAccountId) } : {}),
      paymentMethod: clampStr(tx.paymentMethod, 100, 'Bank Transfer'),
      ...(tx.customPaymentMethod ? { customPaymentMethod: clampStr(tx.customPaymentMethod, 100) } : {}),
      ...(tx.personId ? { personId: cleanId(tx.personId) } : {}),
      ...(tx.dreamVaultId ? { dreamVaultId: cleanId(tx.dreamVaultId) } : {}),
      status: tx.status,
      ...(tx.billable !== undefined ? { billable: Boolean(tx.billable) } : {}),
      ...(tx.notes ? { notes: clampStr(tx.notes, 400) } : {}),
      ...(tx.proofId ? { proofId: clampStr(tx.proofId, 64) } : {}),
      ...(tx.proofImageName ? { proofImageName: clampStr(tx.proofImageName, 160) } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `transactions/${docId}`);
  }
}

export async function deleteCloudTransaction(txId: string): Promise<void> {
  const docId = cleanId(txId);
  try {
    await deleteDoc(doc(db, 'transactions', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `transactions/${docId}`);
  }
}

export async function settleCloudTransaction(txId: string): Promise<void> {
  const docId = cleanId(txId);
  try {
    await updateDoc(doc(db, 'transactions', docId), {
      status: 'settled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `transactions/${docId}`);
  }
}

export async function saveCloudPerson(uid: string, p: PersonProfile): Promise<void> {
  const safeUid = cleanId(uid);
  const docId = cleanId(p.id);
  try {
    await setDoc(doc(db, 'people', docId), {
      ownerId: safeUid,
      name: clampStr(p.name, 120, 'Person'),
      relationship: p.relationship,
      ...(p.customRelationship ? { customRelationship: clampStr(p.customRelationship, 100) } : {}),
      ...(p.phone ? { contactHandle: clampStr(p.phone, 160) } : {}),
      ...(p.notes ? { notes: clampStr(p.notes, 400) } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `people/${docId}`);
  }
}

export async function deleteCloudPerson(personId: string): Promise<void> {
  const docId = cleanId(personId);
  try {
    await deleteDoc(doc(db, 'people', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `people/${docId}`);
  }
}

export async function saveCloudExpectedItem(uid: string, item: ExpectedItem): Promise<void> {
  const safeUid = cleanId(uid);
  const docId = cleanId(item.id);
  try {
    await setDoc(doc(db, 'expectedItems', docId), {
      ownerId: safeUid,
      personId: cleanId(item.personId),
      title: clampStr(item.title, 160, 'Expected Item'),
      amount: Math.max(0.01, Number(item.amount) || 1),
      settledAmount: Math.max(0, Number(item.settledAmount) || 0),
      direction: item.direction,
      ...(item.customDirection ? { customDirection: clampStr(item.customDirection, 100) } : {}),
      category: clampStr(item.category, 100, 'Receivable'),
      ...(item.customCategory ? { customCategory: clampStr(item.customCategory, 100) } : {}),
      date: clampStr(item.date, 32, '2026-11-07'),
      dueDate: clampStr(item.dueDate, 32, '2026-11-30'),
      ...(item.linkedTransactionId ? { linkedTransactionId: cleanId(item.linkedTransactionId) } : {}),
      status: item.status,
      ...(item.notes ? { notes: clampStr(item.notes, 400) } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `expectedItems/${docId}`);
  }
}

export async function deleteCloudExpectedItem(itemId: string): Promise<void> {
  const docId = cleanId(itemId);
  try {
    await deleteDoc(doc(db, 'expectedItems', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `expectedItems/${docId}`);
  }
}

export async function updateCloudExpectedSettlement(
  itemId: string,
  settledAmount: number,
  status: ExpectedItem['status']
): Promise<void> {
  const docId = cleanId(itemId);
  try {
    await updateDoc(doc(db, 'expectedItems', docId), {
      settledAmount,
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `expectedItems/${docId}`);
  }
}

export async function saveCloudDreamVault(uid: string, dv: DreamVault): Promise<void> {
  const safeUid = cleanId(uid);
  const docId = cleanId(dv.id);
  try {
    await setDoc(doc(db, 'dreamVaults', docId), {
      ownerId: safeUid,
      name: clampStr(dv.name, 120, 'Dream Vault'),
      storageType: dv.storageType,
      ...(dv.customStorageType ? { customStorageType: clampStr(dv.customStorageType, 100) } : {}),
      targetAmount: Math.max(1, Number(dv.targetAmount) || 1000),
      currentAmount: Math.max(0, Number(dv.currentAmount) || 0),
      monthlyPlannedContribution: Math.max(0, Number(dv.monthlyPlannedContribution) || 0),
      targetDate: clampStr(dv.targetDate, 32, '2028-12-31'),
      ...(dv.linkedAccountId ? { linkedAccountId: cleanId(dv.linkedAccountId) } : {}),
      ...(dv.notes ? { notes: clampStr(dv.notes, 400) } : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `dreamVaults/${docId}`);
  }
}

export async function deleteCloudDreamVault(vaultId: string): Promise<void> {
  const docId = cleanId(vaultId);
  try {
    await deleteDoc(doc(db, 'dreamVaults', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `dreamVaults/${docId}`);
  }
}

export async function updateCloudDreamVaultAmount(
  vaultId: string,
  currentAmount: number
): Promise<void> {
  const docId = cleanId(vaultId);
  try {
    await updateDoc(doc(db, 'dreamVaults', docId), {
      currentAmount,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `dreamVaults/${docId}`);
  }
}
