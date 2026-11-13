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
  getDoc,
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
  hasVaultContent,
  loadDeletedUserIdsFromLocal,
  loadProofImageLocally,
  markUserIdDeletedLocally,
  parseHeroImagesPayload,
  saveLandingHeroImage,
  savePdfHeaderConfig,
  saveProofImageLocally,
  saveUsersToLocal,
  saveUserVault,
  loadUserVault,
} from '../utils/localVaultStorage';
import {
  DEFAULT_PRIMARY_ADMIN_EMAIL,
  ensureZeroKnowledgeUsers,
  isPollutedTestUser,
} from '../utils/financeRules';
import {
  getCanonicalSeedUsers,
  getCanonicalSeedVault,
} from '../utils/canonicalCloudSeed';

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

// Clear any legacy write-pause key and track latest local vault write timestamp per user
// so an older snapshot in flight never resurrects a deleted item or overwrites a just-saved item.
try {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('pocketledger_firestore_write_paused_until_v1');
  }
} catch {
  // ignore
}
const lastLocalVaultWriteMsByUser = new Map<string, number>();
let firestoreQuotaExhaustedUntilMs = 0;

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return (
    msg.includes('resource-exhausted') ||
    msg.includes('Quota limit exceeded') ||
    msg.includes('Quota exceeded')
  );
}

function markQuotaExhaustedIfMatched(err: unknown): void {
  if (isQuotaError(err)) {
    // Pause redundant Firestore network calls for 5 minutes when daily free-tier quota is exhausted
    firestoreQuotaExhaustedUntilMs = Date.now() + 5 * 60 * 1000;
  }
}

function canCallFirestoreNow(): boolean {
  if (typeof window === 'undefined') return false;
  return Date.now() >= firestoreQuotaExhaustedUntilMs;
}

interface ServerMirrorState {
  users?: UserAccount[];
  deletedUserIds?: string[];
  vaults?: Record<string, UserVaultData>;
  globalConfig?: {
    landingHeroImage?: string | null;
    pdfHeaderConfig?: PdfHeaderImageConfig | null;
    updatedAt?: number;
  };
}

async function fetchFromServerMirror(): Promise<ServerMirrorState | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
  try {
    const res = await fetch('/api/vault-mirror', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as ServerMirrorState;
  } catch {
    return null;
  }
}

async function pushToServerMirror(payload: Record<string, unknown>): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  try {
    await fetch('/api/vault-mirror', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore offline/build environments
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
    tenantId?: boolean | string | null;
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
  markQuotaExhaustedIfMatched(error);
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
// and Per-User Financial Vaults automatically via Cloud Firestore + Server Mirror.
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
  if (!canCallFirestoreNow()) {
    return () => {};
  }
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
      markQuotaExhaustedIfMatched(err);
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
  await pushToServerMirror({
    globalConfig: {
      landingHeroImage,
      pdfHeaderConfig: pdfHeaderConfig || DEFAULT_PDF_HEADER_CONFIG,
      updatedAt: Date.now(),
    },
  });

  if (!canCallFirestoreNow()) return;

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
    markQuotaExhaustedIfMatched(error);
  }
}

function mergeUserListsSafely(
  primaryUsers: UserAccount[],
  secondaryUsers: UserAccount[],
  deletedIds: Set<string>
): UserAccount[] {
  const byId = new Map<string, UserAccount>();
  const canonicalSeeds = getCanonicalSeedUsers();

  // 1. Start with canonical seeds so admin, koustubh, and Tejashree are never lost unless explicitly deleted
  for (const seedUser of canonicalSeeds) {
    if (seedUser.id === 'user-admin' || !deletedIds.has(seedUser.id)) {
      byId.set(seedUser.id, seedUser);
    }
  }

  // 2. Layer secondary users
  for (const u of secondaryUsers) {
    if (!u || !u.id || !u.username || isPollutedTestUser(u)) continue;
    if (u.id !== 'user-admin' && deletedIds.has(u.id)) continue;
    byId.set(u.id, {
      ...u,
      avatarThumbnailDataUrl:
        u.avatarThumbnailDataUrl || loadProofImageLocally(`user-avatar-${u.id}`),
    });
  }

  // 3. Layer primary (authoritative) users
  for (const u of primaryUsers) {
    if (!u || !u.id || !u.username || isPollutedTestUser(u)) continue;
    if (u.id !== 'user-admin' && deletedIds.has(u.id)) continue;
    byId.set(u.id, {
      ...u,
      avatarThumbnailDataUrl:
        u.avatarThumbnailDataUrl || loadProofImageLocally(`user-avatar-${u.id}`),
    });
  }

  const merged = Array.from(byId.values());
  const { users: sanitized } = ensureZeroKnowledgeUsers(merged);
  return sanitized;
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
  if (!canCallFirestoreNow()) {
    return () => {};
  }
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

      const cloudUsersList: UserAccount[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        if (typeof data.userJson === 'string') {
          try {
            const parsed = JSON.parse(data.userJson) as UserAccount;
            if (
              parsed &&
              parsed.id &&
              parsed.username &&
              !isPollutedTestUser(parsed) &&
              (parsed.id === 'user-admin' || !deletedIds.has(parsed.id))
            ) {
              cloudUsersList.push({
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

      if (cloudUsersList.length > 0) {
        const sanitizedUsers = mergeUserListsSafely(cloudUsersList, localUsers, deletedIds);
        saveUsersToLocal(sanitizedUsers, false);
        pushToServerMirror({ users: sanitizedUsers }).catch(() => {});
        callbacks.onUsers(sanitizedUsers);
      }
    },
    (err) => {
      markQuotaExhaustedIfMatched(err);
    }
  );
}

/**
 * Explicitly fetches all users from Server Mirror + `/appUsers` on Firestore so the app always uses the latest user records.
 */
export async function fetchCloudUsersFromServer(
  localUsers: UserAccount[]
): Promise<UserAccount[] | null> {
  const deletedIds = new Set(loadDeletedUserIdsFromLocal());
  let mirrorUsers: UserAccount[] = [];

  const mirror = await fetchFromServerMirror();
  if (mirror) {
    if (Array.isArray(mirror.deletedUserIds)) {
      for (const delId of mirror.deletedUserIds) {
        if (delId && delId !== 'user-admin') {
          deletedIds.add(delId);
          markUserIdDeletedLocally(delId);
        }
      }
    }
    if (Array.isArray(mirror.users)) {
      mirrorUsers = mirror.users;
    }
  }

  const cloudUsersList: UserAccount[] = [];
  if (canCallFirestoreNow()) {
    try {
      const snap = await getDocs(collection(db, 'appUsers'));
      if (!snap.empty) {
        for (const d of snap.docs) {
          const data = d.data();
          if (typeof data.userJson === 'string') {
            try {
              const parsed = JSON.parse(data.userJson) as UserAccount;
              if (
                parsed &&
                parsed.id &&
                parsed.username &&
                !isPollutedTestUser(parsed) &&
                (parsed.id === 'user-admin' || !deletedIds.has(parsed.id))
              ) {
                cloudUsersList.push({
                  ...parsed,
                  avatarThumbnailDataUrl:
                    parsed.avatarThumbnailDataUrl ||
                    loadProofImageLocally(`user-avatar-${parsed.id}`),
                });
              }
            } catch {
              // ignore malformed doc
            }
          }
        }
      }
    } catch (err) {
      markQuotaExhaustedIfMatched(err);
    }
  }

  const mergedWithMirror = mergeUserListsSafely(mirrorUsers, localUsers, deletedIds);
  const finalUsers =
    cloudUsersList.length > 0
      ? mergeUserListsSafely(cloudUsersList, mergedWithMirror, deletedIds)
      : mergedWithMirror;

  saveUsersToLocal(finalUsers, false);
  await pushToServerMirror({ users: finalUsers });
  return finalUsers;
}

/**
 * Pushes all user accounts (or updated Admin/Customer account) to Server Mirror and `/appUsers/{userId}` in Firestore.
 * Always enforces irreversible zero-knowledge password & PIN hashing prior to cloud persistence.
 */
export async function syncUsersToCloud(users: UserAccount[]): Promise<void> {
  const deletedIds = new Set(loadDeletedUserIdsFromLocal());
  const activeUsers = users.filter(
    (u) => u && !isPollutedTestUser(u) && (u.id === 'user-admin' || !deletedIds.has(u.id))
  );
  const { users: sanitizedUsers } = ensureZeroKnowledgeUsers(activeUsers);

  await pushToServerMirror({ users: sanitizedUsers });

  if (!canCallFirestoreNow()) return;

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
    markQuotaExhaustedIfMatched(error);
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
 * Deletes a user account and their vault from Server Mirror, `/appUsers/{userId}`, and `/userVaults/{userId}` in Firestore.
 */
export async function deleteUserFromCloud(userId: string): Promise<void> {
  const safeUserId = cleanId(userId);
  if (safeUserId === 'user-admin') return;
  markUserIdDeletedLocally(userId);
  await pushToServerMirror({ deleteUserId: safeUserId });

  if (!canCallFirestoreNow()) return;

  try {
    await Promise.all([
      deleteDoc(doc(db, 'appUsers', safeUserId)),
      deleteDoc(doc(db, 'userVaults', safeUserId)),
    ]);
  } catch (error) {
    markQuotaExhaustedIfMatched(error);
  }
}

/**
 * Clears all users, user vaults, and global config in Cloud Firestore when the primary Admin resets the portal.
 */
export async function resetEntireCloudPortal(
  existingUsers: UserAccount[],
  freshAdmin: UserAccount
): Promise<void> {
  try {
    const nonPrimaryIds = existingUsers
      .map((u) => cleanId(u.id))
      .filter((id) => id !== 'user-admin');

    for (const id of nonPrimaryIds) {
      await pushToServerMirror({ deleteUserId: id });
    }
    await pushToServerMirror({
      users: [freshAdmin],
      vault: {
        userId: 'user-admin',
        updatedAt: new Date().toISOString(),
        accounts: [],
        transactions: [],
        people: [],
        expectedItems: [],
        dreamVaults: [],
      },
    });

    if (!canCallFirestoreNow()) return;

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
    markQuotaExhaustedIfMatched(error);
  }
}

/**
 * Hydrates a vault payload with locally cached proof images, bank logos, and dream images.
 */
function hydrateCloudVaultPayload(parsed: UserVaultData, fallbackUserId: string): UserVaultData {
  const hydrated: UserVaultData = {
    ...parsed,
    userId: parsed.userId || fallbackUserId,
    nextRecordNumber:
      parsed.nextRecordNumber && parsed.nextRecordNumber >= 100 ? parsed.nextRecordNumber : 100,
    accounts: (parsed.accounts || []).map((acc) => {
      if (
        acc.bankLogoUrl &&
        acc.bankLogoUrl.startsWith('data:image/') &&
        !acc.bankLogoUrl.startsWith('data:image/svg+xml')
      ) {
        saveProofImageLocally(`acc-logo-${acc.id}`, acc.bankLogoUrl);
      }
      return {
        ...acc,
        bankLogoUrl: acc.bankLogoUrl || loadProofImageLocally(`acc-logo-${acc.id}`),
      };
    }),
    transactions: (parsed.transactions || []).map((tx) => {
      const pid = tx.proofId || (tx.proofImageDataUrl ? `prf-${tx.id}` : undefined);
      if (pid && tx.proofImageDataUrl) {
        saveProofImageLocally(pid, tx.proofImageDataUrl);
      }
      return {
        ...tx,
        proofId: pid,
        proofImageDataUrl: tx.proofImageDataUrl || loadProofImageLocally(pid),
      };
    }),
    people: parsed.people || [],
    expectedItems: (parsed.expectedItems || []).map((item) => {
      const pid = item.proofId || (item.proofImageDataUrl ? `prf-exp-${item.id}` : undefined);
      if (pid && item.proofImageDataUrl) {
        saveProofImageLocally(pid, item.proofImageDataUrl);
      }
      return {
        ...item,
        proofId: pid,
        proofImageDataUrl: item.proofImageDataUrl || loadProofImageLocally(pid),
      };
    }),
    dreamVaults: (parsed.dreamVaults || []).map((dv) => {
      if (
        dv.imageUrl &&
        dv.imageUrl.startsWith('data:image/') &&
        !dv.imageUrl.startsWith('data:image/svg+xml')
      ) {
        saveProofImageLocally(`dream-img-${dv.id}`, dv.imageUrl);
      }
      return {
        ...dv,
        imageUrl: dv.imageUrl || loadProofImageLocally(`dream-img-${dv.id}`),
      };
    }),
    recurringPayments: parsed.recurringPayments || [],
    loans: parsed.loans || [],
    personRecordGroups: (parsed.personRecordGroups || []).map((grp) => ({
      ...grp,
      itemsSnapshot: (grp.itemsSnapshot || []).map((snap) => ({
        ...snap,
        proofImageDataUrl: snap.proofImageDataUrl || loadProofImageLocally(snap.proofId),
      })),
    })),
    recycleBin: (parsed.recycleBin || []).map((entry) => {
      if (entry.transaction?.proofId && entry.transaction.proofImageDataUrl) {
        saveProofImageLocally(entry.transaction.proofId, entry.transaction.proofImageDataUrl);
      }
      return entry;
    }),
  };
  return hydrated;
}

/**
 * Subscribes in real time to `/userVaults/{userId}` so a user's wallets, records, proof images,
 * people, expected bills, loans, and dream vaults automatically sync across Desktop, Mobile, Tor & Incognito.
 */
export function subscribeToUserCloudVault(
  userId: string,
  callbacks: {
    onVault: (vault: UserVaultData) => void;
    getInitialLocalVault: () => UserVaultData;
  }
): () => void {
  if (!canCallFirestoreNow()) {
    return () => {};
  }
  const safeUserId = cleanId(userId);
  const vaultRef = doc(db, 'userVaults', safeUserId);
  let seededInitial = false;

  return onSnapshot(
    vaultRef,
    (snap) => {
      const localVault = callbacks.getInitialLocalVault();
      const localHasData = hasVaultContent(localVault);

      if (!snap.exists()) {
        if (!seededInitial && localHasData) {
          seededInitial = true;
          saveUserCloudVault(localVault).catch(() => {
            // ignore offline fallback
          });
        }
        return;
      }

      const data = snap.data();
      if (typeof data.vaultJson === 'string' && data.vaultJson.length >= 2) {
        try {
          const parsed = JSON.parse(data.vaultJson) as UserVaultData;
          if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
            const cloudHasData = hasVaultContent(parsed);
            const docServerMs =
              data.updatedAt && typeof data.updatedAt.toMillis === 'function'
                ? data.updatedAt.toMillis()
                : 0;
            const parsedCloudMs = Date.parse(parsed.updatedAt || '');
            const cloudTime =
              !Number.isNaN(parsedCloudMs) && parsedCloudMs > 0 ? parsedCloudMs : docServerMs;
            const recentLocalWriteMs = lastLocalVaultWriteMsByUser.get(safeUserId) || 0;

            // If a local write/delete happened more recently than this incoming snapshot, ignore the stale snapshot
            if (recentLocalWriteMs > 0 && cloudTime > 0 && cloudTime < recentLocalWriteMs - 500) {
              return;
            }

            // Whenever Cloud Firestore has vault data, treat Firebase as the authoritative source of truth
            if (cloudHasData) {
              const hydrated = hydrateCloudVaultPayload(parsed, userId);
              if (!hydrated.updatedAt || Date.parse(hydrated.updatedAt) <= 0) {
                hydrated.updatedAt = new Date(cloudTime || Date.now()).toISOString();
              }
              saveUserVault(hydrated, true);
              pushToServerMirror({ vault: hydrated }).catch(() => {});
              callbacks.onVault(hydrated);
              return;
            }

            // Only if Cloud doc is an empty placeholder and Local has real data (and wasn't just emptied locally) -> push Local to Cloud
            if (localHasData && !cloudHasData && recentLocalWriteMs === 0) {
              if (!seededInitial) {
                seededInitial = true;
                saveUserCloudVault(localVault).catch(() => {
                  // ignore offline fallback
                });
              }
              return;
            }

            const hydrated = hydrateCloudVaultPayload(parsed, userId);
            saveUserVault(hydrated, true);
            callbacks.onVault(hydrated);
          }
        } catch {
          // ignore malformed JSON
        }
      }
    },
    (err) => {
      markQuotaExhaustedIfMatched(err);
    }
  );
}

/**
 * Actively fetches `/userVaults/{userId}` from Server Mirror + Firestore on login or mount so the app
 * ALWAYS loads the latest user database across all browsers (standard, Tor, Incognito, Mobile).
 */
export async function fetchUserCloudVaultFromServer(
  userId: string,
  currentLocalVault?: UserVaultData
): Promise<UserVaultData | null> {
  const safeUserId = cleanId(userId);
  const recentLocalWriteMs = lastLocalVaultWriteMsByUser.get(safeUserId) || 0;

  // 1. Check Server Mirror first (instant, zero quota limits, persists across all browsers & incognito)
  let mirrorVault: UserVaultData | null = null;
  const mirror = await fetchFromServerMirror();
  if (mirror && mirror.vaults && mirror.vaults[safeUserId]) {
    const candidate = mirror.vaults[safeUserId];
    if (candidate && Array.isArray(candidate.accounts) && Array.isArray(candidate.transactions)) {
      mirrorVault = candidate;
    }
  }

  // 2. Also check Firestore if quota is available
  let firestoreVault: UserVaultData | null = null;
  let firestoreTimeMs = 0;
  if (canCallFirestoreNow()) {
    try {
      const vaultRef = doc(db, 'userVaults', safeUserId);
      const snap = await getDoc(vaultRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data && typeof data.vaultJson === 'string' && data.vaultJson.length >= 2) {
          const parsed = JSON.parse(data.vaultJson) as UserVaultData;
          if (parsed && Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions)) {
            firestoreVault = parsed;
            const docServerMs =
              data.updatedAt && typeof data.updatedAt.toMillis === 'function'
                ? data.updatedAt.toMillis()
                : 0;
            const parsedCloudMs = Date.parse(parsed.updatedAt || '');
            firestoreTimeMs =
              !Number.isNaN(parsedCloudMs) && parsedCloudMs > 0 ? parsedCloudMs : docServerMs;
          }
        }
      }
    } catch (err) {
      markQuotaExhaustedIfMatched(err);
    }
  }

  // Pick the newest non-empty vault between Firestore, Server Mirror, Local, and Canonical Seed
  const mirrorTimeMs = mirrorVault ? Date.parse(mirrorVault.updatedAt || '') || 0 : 0;
  let chosenVault: UserVaultData | null = null;

  if (firestoreVault && hasVaultContent(firestoreVault)) {
    if (mirrorVault && hasVaultContent(mirrorVault) && mirrorTimeMs > firestoreTimeMs) {
      chosenVault = mirrorVault;
    } else {
      chosenVault = firestoreVault;
    }
  } else if (mirrorVault && hasVaultContent(mirrorVault)) {
    chosenVault = mirrorVault;
  } else if (currentLocalVault && hasVaultContent(currentLocalVault)) {
    chosenVault = currentLocalVault;
  } else {
    const seedVault = getCanonicalSeedVault(safeUserId);
    if (seedVault && hasVaultContent(seedVault)) {
      chosenVault = seedVault;
    }
  }

  if (chosenVault) {
    const chosenTimeMs = Date.parse(chosenVault.updatedAt || '') || 0;
    if (
      recentLocalWriteMs > 0 &&
      chosenTimeMs > 0 &&
      chosenTimeMs < recentLocalWriteMs - 500 &&
      currentLocalVault
    ) {
      return currentLocalVault;
    }
    const hydrated = hydrateCloudVaultPayload(chosenVault, userId);
    saveUserVault(hydrated, true);
    await pushToServerMirror({ vault: hydrated });
    return hydrated;
  }

  return currentLocalVault || null;
}

/**
 * Saves a user's financial vault to Server Mirror and `/userVaults/{userId}` in Cloud Firestore.
 */
export async function saveUserCloudVault(vault: UserVaultData): Promise<void> {
  const safeUserId = cleanId(vault.userId);
  const nowIso =
    vault.updatedAt && Date.parse(vault.updatedAt) > 0
      ? vault.updatedAt
      : new Date().toISOString();
  lastLocalVaultWriteMsByUser.set(safeUserId, Date.parse(nowIso) || Date.now());

  // Rehydrate any locally stored images so Server Mirror & Firestore receive proof images, bank logos, and dream images
  const enrichedVault: UserVaultData = {
    ...vault,
    updatedAt: nowIso,
    accounts: (vault.accounts || []).map((acc) => ({
      ...acc,
      bankLogoUrl: acc.bankLogoUrl || loadProofImageLocally(`acc-logo-${acc.id}`),
    })),
    transactions: (vault.transactions || []).map((tx) => {
      const pid = tx.proofId || (tx.proofImageDataUrl ? `prf-${tx.id}` : undefined);
      return {
        ...tx,
        proofId: pid,
        proofImageDataUrl: tx.proofImageDataUrl || loadProofImageLocally(pid),
      };
    }),
    expectedItems: (vault.expectedItems || []).map((item) => {
      const pid = item.proofId || (item.proofImageDataUrl ? `prf-exp-${item.id}` : undefined);
      return {
        ...item,
        proofId: pid,
        proofImageDataUrl: item.proofImageDataUrl || loadProofImageLocally(pid),
      };
    }),
    dreamVaults: (vault.dreamVaults || []).map((dv) => ({
      ...dv,
      imageUrl: dv.imageUrl || loadProofImageLocally(`dream-img-${dv.id}`),
    })),
  };

  // Always persist to Server Mirror immediately so any operation (add/edit/delete) is saved on disk right away
  await pushToServerMirror({ vault: enrichedVault });

  if (!canCallFirestoreNow()) return;

  let vaultJson = JSON.stringify(enrichedVault);

  // Safety guard: if multiple large images exceed 880KB in a single document, strip only the largest inline dataUrls while keeping smaller ones that fit
  if (vaultJson.length > 880000) {
    const compactTransactions = (enrichedVault.transactions || []).map((tx) => ({
      ...tx,
      proofImageDataUrl:
        tx.proofImageDataUrl && tx.proofImageDataUrl.length > 90000
          ? undefined
          : tx.proofImageDataUrl,
    }));
    const compactExpected = (enrichedVault.expectedItems || []).map((item) => ({
      ...item,
      proofImageDataUrl:
        item.proofImageDataUrl && item.proofImageDataUrl.length > 90000
          ? undefined
          : item.proofImageDataUrl,
    }));
    vaultJson = JSON.stringify({
      ...enrichedVault,
      transactions: compactTransactions,
      expectedItems: compactExpected,
      updatedAt: nowIso,
    });
  }
  if (vaultJson.length > 880000) {
    const compactDreams = (enrichedVault.dreamVaults || []).map((dv) => ({
      ...dv,
      imageUrl:
        dv.imageUrl && dv.imageUrl.length > 50000 ? undefined : dv.imageUrl,
    }));
    vaultJson = JSON.stringify({
      ...enrichedVault,
      transactions: (enrichedVault.transactions || []).map((tx) => ({
        ...tx,
        proofImageDataUrl: undefined,
      })),
      expectedItems: (enrichedVault.expectedItems || []).map((item) => ({
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
    markQuotaExhaustedIfMatched(error);
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

// ============================================================================
// ADMIN LIVE FIREBASE INSPECTOR & DIRECT CONSOLE LINKS
// ============================================================================

const FB_PROJECT_ID = firebaseConfig.projectId || 'authentic-mantis-4xq1s';
const FB_DB_ID =
  firebaseConfig.firestoreDatabaseId ||
  'ai-studio-pocketledgervaul-69a2f2f1-759f-4f8a-a83e-963bbfb7ff75';
const FB_CONSOLE_BASE = `https://console.firebase.google.com/project/${FB_PROJECT_ID}/firestore/databases/${FB_DB_ID}`;

export const FIREBASE_CONSOLE_LINKS = {
  projectId: FB_PROJECT_ID,
  databaseId: FB_DB_ID,
  storageBucket: firebaseConfig.storageBucket || `${FB_PROJECT_ID}.firebasestorage.app`,
  firestoreRootUrl: `${FB_CONSOLE_BASE}/data`,
  appUsersCollectionUrl: `${FB_CONSOLE_BASE}/data/~2FappUsers`,
  userVaultsCollectionUrl: `${FB_CONSOLE_BASE}/data/~2FuserVaults`,
  globalConfigDocUrl: `${FB_CONSOLE_BASE}/data/~2FglobalConfig~2Fmain`,
  authUsersUrl: `https://console.firebase.google.com/project/${FB_PROJECT_ID}/authentication/users`,
  storageAndUsageUrl: `${FB_CONSOLE_BASE}/usage`,
  firebaseStorageBucketUrl: `https://console.firebase.google.com/project/${FB_PROJECT_ID}/storage`,
  getUserDocConsoleUrl: (userId: string) =>
    `${FB_CONSOLE_BASE}/data/~2FappUsers~2F${cleanId(userId)}`,
  getVaultDocConsoleUrl: (userId: string) =>
    `${FB_CONSOLE_BASE}/data/~2FuserVaults~2F${cleanId(userId)}`,
};

export interface FirebaseStoredImageItem {
  id: string;
  title: string;
  category:
    | 'Banner Photo'
    | 'PDF Header Logo'
    | 'User Avatar'
    | 'Receipt Proof'
    | 'Dream / Investment Image'
    | 'Bank Logo';
  ownerLabel: string;
  firestorePath: string;
  consoleUrl: string;
  dataUrl: string;
  sizeBytes: number;
}

export interface FirebaseVaultDocSummary {
  userId: string;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  firestorePath: string;
  consoleUrl: string;
  updatedAt: string;
  accountsCount: number;
  transactionsCount: number;
  dreamVaultsCount: number;
  peopleCount: number;
  expectedItemsCount: number;
  loansCount: number;
  storedImagesCount: number;
  sizeBytes: number;
}

export interface LiveFirebaseAdminOverview {
  refreshedAtIso: string;
  connectionStatus: 'live_firestore' | 'cloud_mirror_active';
  statusNote: string;
  users: UserAccount[];
  vaultSummaries: FirebaseVaultDocSummary[];
  storedImages: FirebaseStoredImageItem[];
  totalCloudBytes: number;
}

export async function fetchLiveFirebaseAdminOverview(params: {
  currentUsers: UserAccount[];
  heroImage: string | null;
  pdfHeaderConfig: PdfHeaderImageConfig;
  forceFirestoreCheck?: boolean;
}): Promise<LiveFirebaseAdminOverview> {
  if (params.forceFirestoreCheck) {
    firestoreQuotaExhaustedUntilMs = 0;
  }

  // 1. Refresh users from Server Mirror + Firestore
  const refreshedUsers =
    (await fetchCloudUsersFromServer(params.currentUsers)) || params.currentUsers;

  const storedImages: FirebaseStoredImageItem[] = [];
  const vaultSummaries: FirebaseVaultDocSummary[] = [];

  // 2. Inspect Global Config images (/globalConfig/main)
  const heroList = parseHeroImagesPayload(params.heroImage);
  heroList.forEach((imgDataUrl, idx) => {
    if (imgDataUrl && imgDataUrl.length > 0) {
      storedImages.push({
        id: `global-hero-${idx + 1}`,
        title: `Front Page Hero Banner #${idx + 1}`,
        category: 'Banner Photo',
        ownerLabel: 'Global Config',
        firestorePath: '/globalConfig/main',
        consoleUrl: FIREBASE_CONSOLE_LINKS.globalConfigDocUrl,
        dataUrl: imgDataUrl,
        sizeBytes: new Blob([imgDataUrl]).size,
      });
    }
  });

  const pdfImg =
    params.pdfHeaderConfig?.imageUrl ||
    (params.pdfHeaderConfig as any)?.dataUrl ||
    loadProofImageLocally('global-pdf-header-logo');
  if (pdfImg && typeof pdfImg === 'string' && pdfImg.length > 0) {
    storedImages.push({
      id: 'global-pdf-header-logo',
      title: 'PDF Statement Header Logo',
      category: 'PDF Header Logo',
      ownerLabel: 'Global Config',
      firestorePath: '/globalConfig/main',
      consoleUrl: FIREBASE_CONSOLE_LINKS.globalConfigDocUrl,
      dataUrl: pdfImg,
      sizeBytes: new Blob([pdfImg]).size,
    });
  }

  // 3. Inspect each user's /appUsers/{userId} and /userVaults/{userId}
  for (const u of refreshedUsers) {
    const safeUid = cleanId(u.id);
    const userAvatar = u.avatarThumbnailDataUrl || loadProofImageLocally(`user-avatar-${u.id}`);
    if (userAvatar && userAvatar.length > 0) {
      storedImages.push({
        id: `avatar-${safeUid}`,
        title: `Profile Avatar — @${u.username}`,
        category: 'User Avatar',
        ownerLabel: `${u.displayName} (@${u.username})`,
        firestorePath: `/appUsers/${safeUid}`,
        consoleUrl: FIREBASE_CONSOLE_LINKS.getUserDocConsoleUrl(safeUid),
        dataUrl: userAvatar,
        sizeBytes: new Blob([userAvatar]).size,
      });
    }

    const localFallbackVault = loadUserVault(u.id);
    const liveVault =
      (await fetchUserCloudVaultFromServer(u.id, localFallbackVault)) || localFallbackVault;

    let vaultImagesCount = 0;
    const vaultDocUrl = FIREBASE_CONSOLE_LINKS.getVaultDocConsoleUrl(safeUid);
    const vaultPath = `/userVaults/${safeUid}`;

    for (const tx of liveVault.transactions || []) {
      const proofImg =
        tx.proofImageDataUrl || (tx.proofId ? loadProofImageLocally(tx.proofId) : undefined);
      if (proofImg && proofImg.length > 0) {
        vaultImagesCount++;
        storedImages.push({
          id: `tx-proof-${safeUid}-${tx.id}`,
          title: `Receipt Proof #${tx.id} — ${tx.title}`,
          category: 'Receipt Proof',
          ownerLabel: `@${u.username}`,
          firestorePath: vaultPath,
          consoleUrl: vaultDocUrl,
          dataUrl: proofImg,
          sizeBytes: new Blob([proofImg]).size,
        });
      }
    }

    for (const dv of liveVault.dreamVaults || []) {
      const dvImg = dv.imageUrl || loadProofImageLocally(`dream-img-${dv.id}`);
      if (dvImg && dvImg.length > 0) {
        vaultImagesCount++;
        storedImages.push({
          id: `dream-img-${safeUid}-${dv.id}`,
          title: `${dv.name} (${dv.storageType})`,
          category: 'Dream / Investment Image',
          ownerLabel: `@${u.username}`,
          firestorePath: vaultPath,
          consoleUrl: vaultDocUrl,
          dataUrl: dvImg,
          sizeBytes: new Blob([dvImg]).size,
        });
      }
    }

    for (const acc of liveVault.accounts || []) {
      const accLogo = acc.bankLogoUrl || loadProofImageLocally(`acc-logo-${acc.id}`);
      if (accLogo && accLogo.startsWith('data:image/') && !accLogo.startsWith('data:image/svg+xml')) {
        vaultImagesCount++;
        storedImages.push({
          id: `acc-logo-${safeUid}-${acc.id}`,
          title: `Bank Logo — ${acc.name}`,
          category: 'Bank Logo',
          ownerLabel: `@${u.username}`,
          firestorePath: vaultPath,
          consoleUrl: vaultDocUrl,
          dataUrl: accLogo,
          sizeBytes: new Blob([accLogo]).size,
        });
      }
    }

    const vaultJsonStr = JSON.stringify(liveVault);
    vaultSummaries.push({
      userId: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role,
      firestorePath: vaultPath,
      consoleUrl: vaultDocUrl,
      updatedAt: liveVault.updatedAt || u.updatedAt || u.createdAt,
      accountsCount: (liveVault.accounts || []).length,
      transactionsCount: (liveVault.transactions || []).length,
      dreamVaultsCount: (liveVault.dreamVaults || []).length,
      peopleCount: (liveVault.people || []).length,
      expectedItemsCount: (liveVault.expectedItems || []).length,
      loansCount: (liveVault.loans || []).length,
      storedImagesCount: vaultImagesCount,
      sizeBytes: new Blob([vaultJsonStr]).size,
    });
  }

  const connectionStatus = canCallFirestoreNow() ? 'live_firestore' : 'cloud_mirror_active';
  const totalCloudBytes =
    vaultSummaries.reduce((acc, v) => acc + v.sizeBytes, 0) +
    new Blob([JSON.stringify(refreshedUsers)]).size +
    storedImages
      .filter((img) => img.firestorePath === '/globalConfig/main')
      .reduce((acc, img) => acc + img.sizeBytes, 0);

  return {
    refreshedAtIso: new Date().toISOString(),
    connectionStatus,
    statusNote:
      connectionStatus === 'live_firestore'
        ? 'Connected directly to Firebase Cloud Firestore & Cloud Mirror'
        : 'Synced via Cloud Mirror (Firestore daily free-tier read quota cooldown active)',
    users: refreshedUsers,
    vaultSummaries,
    storedImages,
    totalCloudBytes,
  };
}

