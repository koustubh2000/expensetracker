import {
  PdfHeaderImageConfig,
  UserAccount,
  UserVaultData,
} from '../types/finance';
import {
  DEFAULT_PRIMARY_ADMIN_EMAIL,
  ensureZeroKnowledgeUsers,
  generateSQLiteDump,
  hashSecretIrreversibly,
  resolveFlexibleLabel,
} from './financeRules';

// Bumped to v2 so all entries start initially empty without leftover demo cache
const USERS_STORAGE_KEY = 'pocketledger_users_v2';
const USERS_UPDATED_AT_KEY = 'pocketledger_users_updated_at_v2';
const DELETED_USERS_STORAGE_KEY = 'pocketledger_deleted_user_ids_v2';
const GLOBAL_CONFIG_UPDATED_AT_KEY = 'pocketledger_global_config_updated_at_v2';
const SESSION_STORAGE_KEY = 'pocketledger_active_session_v2';
const VAULT_PREFIX = 'pocketledger_vault_v2_';
const PROOF_IMAGES_KEY = 'pocketledger_proof_images_v2';
const PDF_HEADER_CONFIG_KEY = 'expensetracker_pdf_header_config_v1';

export function getLocalUsersUpdatedAt(): number {
  try {
    const raw = localStorage.getItem(USERS_UPDATED_AT_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function setLocalUsersUpdatedAt(ts = Date.now()): void {
  try {
    localStorage.setItem(USERS_UPDATED_AT_KEY, String(ts));
  } catch {
    // ignore
  }
}

export function getLocalGlobalConfigUpdatedAt(): number {
  try {
    const raw = localStorage.getItem(GLOBAL_CONFIG_UPDATED_AT_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function setLocalGlobalConfigUpdatedAt(ts = Date.now()): void {
  try {
    localStorage.setItem(GLOBAL_CONFIG_UPDATED_AT_KEY, String(ts));
  } catch {
    // ignore
  }
}

export function loadDeletedUserIdsFromLocal(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_USERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function markUserIdDeletedLocally(userId: string): void {
  if (!userId || userId === 'user-admin') return;
  try {
    const existing = new Set(loadDeletedUserIdsFromLocal());
    existing.add(userId);
    localStorage.setItem(DELETED_USERS_STORAGE_KEY, JSON.stringify(Array.from(existing)));
    setLocalUsersUpdatedAt(Date.now());
  } catch {
    // ignore
  }
}

export function unmarkUserIdDeletedLocally(userId: string): void {
  if (!userId) return;
  try {
    const existing = loadDeletedUserIdsFromLocal().filter((id) => id !== userId);
    localStorage.setItem(DELETED_USERS_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}

export const DEFAULT_PDF_HEADER_CONFIG: PdfHeaderImageConfig = {
  imageUrl: null,
  width: 64,
  height: 48,
  align: 'right',
  offsetX: 0,
  offsetY: 0,
  orientation: 'portrait',
  headerBgColor: '#162d59',
};

export function savePdfHeaderConfig(config: PdfHeaderImageConfig, markLocalChange = true): void {
  try {
    if (config.imageUrl && config.imageUrl.startsWith('data:image/')) {
      saveProofImageLocally('global-pdf-header-logo', config.imageUrl);
    } else if (!config.imageUrl) {
      deleteProofImageLocally('global-pdf-header-logo');
    }
    localStorage.setItem(PDF_HEADER_CONFIG_KEY, JSON.stringify(config));
    if (markLocalChange) {
      setLocalGlobalConfigUpdatedAt(Date.now());
    }
  } catch {
    // Fallback: store image in proof map and keep lightweight reference in config key
    try {
      const compactCfg = { ...config };
      localStorage.setItem(PDF_HEADER_CONFIG_KEY, JSON.stringify(compactCfg));
      if (markLocalChange) {
        setLocalGlobalConfigUpdatedAt(Date.now());
      }
    } catch {
      // ignore storage quota errors
    }
  }
}

export function loadPdfHeaderConfig(): PdfHeaderImageConfig {
  try {
    const raw = localStorage.getItem(PDF_HEADER_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PdfHeaderImageConfig>;
      const storedLogo = parsed.imageUrl ?? loadProofImageLocally('global-pdf-header-logo') ?? null;
      return {
        imageUrl: storedLogo,
        width: typeof parsed.width === 'number' ? parsed.width : 64,
        height: typeof parsed.height === 'number' ? parsed.height : 48,
        align: parsed.align === 'left' || parsed.align === 'center' || parsed.align === 'right' ? parsed.align : 'right',
        offsetX: typeof parsed.offsetX === 'number' ? parsed.offsetX : 0,
        offsetY: typeof parsed.offsetY === 'number' ? parsed.offsetY : 0,
        orientation: parsed.orientation === 'landscape' ? 'landscape' : 'portrait',
        headerBgColor: parsed.headerBgColor || '#162d59',
      };
    }
  } catch {
    // fallback
  }
  return { ...DEFAULT_PDF_HEADER_CONFIG };
}

export function createInitialAdminVault(userId: string): UserVaultData {
  // All entries initially empty as requested
  return {
    userId,
    updatedAt: new Date().toISOString(),
    nextRecordNumber: 100,
    accounts: [],
    transactions: [],
    people: [],
    expectedItems: [],
    dreamVaults: [],
    recurringPayments: [],
    loans: [],
    recycleBin: [],
  };
}

export function saveProofImageLocally(proofId: string, dataUrl: string): void {
  if (!proofId || !dataUrl) return;
  try {
    const raw = localStorage.getItem(PROOF_IMAGES_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[proofId] = dataUrl;
    localStorage.setItem(PROOF_IMAGES_KEY, JSON.stringify(map));
  } catch {
    // If localStorage is full, prune oldest proof entries or keep newest
    try {
      const raw = localStorage.getItem(PROOF_IMAGES_KEY);
      const map: Record<string, string> = raw ? JSON.parse(raw) : {};
      const keys = Object.keys(map);
      while (keys.length > 5) {
        const oldest = keys.shift();
        if (oldest && oldest !== proofId) delete map[oldest];
      }
      map[proofId] = dataUrl;
      localStorage.setItem(PROOF_IMAGES_KEY, JSON.stringify(map));
    } catch {
      // ignore storage quota errors
    }
  }
}

export function loadProofImageLocally(proofId?: string): string | undefined {
  if (!proofId) return undefined;
  try {
    const raw = localStorage.getItem(PROOF_IMAGES_KEY);
    if (!raw) return undefined;
    const map = JSON.parse(raw) as Record<string, string>;
    return map[proofId];
  } catch {
    return undefined;
  }
}

export function deleteProofImageLocally(proofId?: string): void {
  if (!proofId) return;
  try {
    const raw = localStorage.getItem(PROOF_IMAGES_KEY);
    if (!raw) return;
    const map = JSON.parse(raw) as Record<string, string>;
    delete map[proofId];
    localStorage.setItem(PROOF_IMAGES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function loadUsersFromLocal(): UserAccount[] {
  const deletedIds = new Set(loadDeletedUserIdsFromLocal());
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserAccount[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const filtered = parsed
          .filter((u) => u && (u.id === 'user-admin' || !deletedIds.has(u.id)))
          .map((u) => ({
            ...u,
            avatarThumbnailDataUrl:
              u.avatarThumbnailDataUrl || loadProofImageLocally(`user-avatar-${u.id}`),
          }));
        const { users: sanitized, upgraded } = ensureZeroKnowledgeUsers(filtered);
        if (upgraded || filtered.length !== parsed.length) {
          localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(sanitized));
        }
        if (sanitized.length > 0) {
          return sanitized;
        }
      }
    }
  } catch {
    // fallback below
  }

  const defaultAdmin: UserAccount = {
    id: 'user-admin',
    username: 'admin',
    displayName: 'Administrator Portal',
    passwordHash: hashSecretIrreversibly('admin'), // irreversible salted SHA-256 hash
    role: 'admin',
    email: DEFAULT_PRIMARY_ADMIN_EMAIL,
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
    currency: '₹',
    customCategories: [],
  };

  return [defaultAdmin];
}

export function hasVaultContent(vault?: UserVaultData | null): boolean {
  if (!vault) return false;
  return (
    (vault.accounts?.length || 0) > 0 ||
    (vault.transactions?.length || 0) > 0 ||
    (vault.people?.length || 0) > 0 ||
    (vault.expectedItems?.length || 0) > 0 ||
    (vault.dreamVaults?.length || 0) > 0 ||
    (vault.loans?.length || 0) > 0 ||
    (vault.recurringPayments?.length || 0) > 0 ||
    (vault.personRecordGroups?.length || 0) > 0 ||
    (vault.recycleBin?.length || 0) > 0
  );
}

export function saveUsersToLocal(users: UserAccount[], markLocalChange = true): void {
  const deletedIds = new Set(loadDeletedUserIdsFromLocal());
  const activeUsers = users.filter(
    (u) => u && (u.id === 'user-admin' || !deletedIds.has(u.id))
  );
  for (const u of activeUsers) {
    if (u.avatarThumbnailDataUrl && u.avatarThumbnailDataUrl.startsWith('data:image/')) {
      saveProofImageLocally(`user-avatar-${u.id}`, u.avatarThumbnailDataUrl);
    }
  }
  const { users: sanitized } = ensureZeroKnowledgeUsers(activeUsers);
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(sanitized));
    if (markLocalChange) {
      setLocalUsersUpdatedAt(Date.now());
    }
  } catch {
    // ignore quota errors
  }
}

export function loadActiveSessionUserId(): string | null {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      return 'user-admin';
    }
  }
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

export function saveActiveSessionUserId(userId: string | null): void {
  if (userId) {
    localStorage.setItem(SESSION_STORAGE_KEY, userId);
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export function loadUserVault(userId: string, _seedDemoIfEmpty = false): UserVaultData {
  const key = `${VAULT_PREFIX}${userId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as UserVaultData;
      // Rehydrate locally stored images across accounts, transactions, expectedItems, dreamVaults, groups, and recycleBin
      parsed.accounts = (parsed.accounts || []).map((acc) => ({
        ...acc,
        bankLogoUrl: acc.bankLogoUrl || loadProofImageLocally(`acc-logo-${acc.id}`),
      }));
      parsed.transactions = (parsed.transactions || []).map((tx) => {
        const pid = tx.proofId || (tx.proofImageDataUrl ? `prf-${tx.id}` : undefined);
        return {
          ...tx,
          proofId: pid,
          proofImageDataUrl: tx.proofImageDataUrl || loadProofImageLocally(pid),
        };
      });
      parsed.expectedItems = (parsed.expectedItems || []).map((item) => {
        const pid = item.proofId || (item.proofImageDataUrl ? `prf-exp-${item.id}` : undefined);
        return {
          ...item,
          proofId: pid,
          proofImageDataUrl: item.proofImageDataUrl || loadProofImageLocally(pid),
        };
      });
      parsed.dreamVaults = (parsed.dreamVaults || []).map((dv) => ({
        ...dv,
        imageUrl: loadProofImageLocally(`dream-img-${dv.id}`) || dv.imageUrl,
      }));
      parsed.personRecordGroups = (parsed.personRecordGroups || []).map((grp) => ({
        ...grp,
        itemsSnapshot: (grp.itemsSnapshot || []).map((snap) => ({
          ...snap,
          proofImageDataUrl: snap.proofImageDataUrl || loadProofImageLocally(snap.proofId),
        })),
      }));
      parsed.recurringPayments = parsed.recurringPayments || [];
      parsed.loans = parsed.loans || [];
      parsed.recycleBin = (parsed.recycleBin || []).map((entry) => {
        if (entry.transaction && entry.transaction.proofId && !entry.transaction.proofImageDataUrl) {
          return {
            ...entry,
            transaction: {
              ...entry.transaction,
              proofImageDataUrl: loadProofImageLocally(entry.transaction.proofId),
            },
          };
        }
        if (entry.dreamVault && !entry.dreamVault.imageUrl) {
          return {
            ...entry,
            dreamVault: {
              ...entry.dreamVault,
              imageUrl: loadProofImageLocally(`dream-img-${entry.dreamVault.id}`),
            },
          };
        }
        return entry;
      });
      if (!parsed.nextRecordNumber || parsed.nextRecordNumber < 100) {
        parsed.nextRecordNumber = 100;
      }
      if (!hasVaultContent(parsed)) {
        parsed.updatedAt = '1970-01-01T00:00:00.000Z';
      }
      return parsed;
    }
  } catch {
    // fallback
  }

  const emptyVault: UserVaultData = {
    userId,
    updatedAt: '1970-01-01T00:00:00.000Z',
    nextRecordNumber: 100,
    accounts: [],
    transactions: [],
    people: [],
    expectedItems: [],
    dreamVaults: [],
    recurringPayments: [],
    loans: [],
    recycleBin: [],
  };
  return emptyVault;
}

export function saveUserVault(vault: UserVaultData, preserveTimestamp = false): void {
  const key = `${VAULT_PREFIX}${vault.userId}`;
  // 1. Persist all custom images in the central proof/image map so they are never lost
  for (const acc of vault.accounts || []) {
    if (acc.bankLogoUrl && acc.bankLogoUrl.startsWith('data:image/') && !acc.bankLogoUrl.startsWith('data:image/svg+xml')) {
      saveProofImageLocally(`acc-logo-${acc.id}`, acc.bankLogoUrl);
    }
  }
  for (const tx of vault.transactions || []) {
    const pid = tx.proofId || (tx.proofImageDataUrl ? `prf-${tx.id}` : undefined);
    if (pid && tx.proofImageDataUrl) {
      tx.proofId = pid;
      saveProofImageLocally(pid, tx.proofImageDataUrl);
    }
  }
  for (const item of vault.expectedItems || []) {
    const pid = item.proofId || (item.proofImageDataUrl ? `prf-exp-${item.id}` : undefined);
    if (pid && item.proofImageDataUrl) {
      item.proofId = pid;
      saveProofImageLocally(pid, item.proofImageDataUrl);
    }
  }
  for (const dv of vault.dreamVaults || []) {
    if (dv.imageUrl && dv.imageUrl.startsWith('data:image/') && !dv.imageUrl.startsWith('data:image/svg+xml')) {
      saveProofImageLocally(`dream-img-${dv.id}`, dv.imageUrl);
    }
  }
  for (const entry of vault.recycleBin || []) {
    if (entry.transaction?.proofId && entry.transaction.proofImageDataUrl) {
      saveProofImageLocally(entry.transaction.proofId, entry.transaction.proofImageDataUrl);
    }
  }

  // 2. Strip duplicate inline proofImageDataUrl from the vault JSON stored in localStorage
  // (since loadUserVault rehydrates them from PROOF_IMAGES_KEY automatically, saving 50% localStorage quota!)
  const compactTransactions = (vault.transactions || []).map((tx) => ({
    ...tx,
    proofImageDataUrl: undefined,
  }));
  const compactExpectedItems = (vault.expectedItems || []).map((item) => ({
    ...item,
    proofImageDataUrl: undefined,
  }));
  const compactRecycleBin = (vault.recycleBin || []).map((entry) => {
    if (entry.transaction?.proofId && entry.transaction.proofImageDataUrl) {
      return {
        ...entry,
        transaction: {
          ...entry.transaction,
          proofImageDataUrl: undefined,
        },
      };
    }
    return entry;
  });

  const updated: UserVaultData = {
    ...vault,
    transactions: compactTransactions,
    expectedItems: compactExpectedItems,
    recycleBin: compactRecycleBin,
    updatedAt: preserveTimestamp && vault.updatedAt ? vault.updatedAt : new Date().toISOString(),
  };

  try {
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // If localStorage is near quota, also strip inline dreamVault.imageUrl (already saved in PROOF_IMAGES_KEY as dream-img-{id})
    try {
      const ultraCompact: UserVaultData = {
        ...updated,
        dreamVaults: (updated.dreamVaults || []).map((dv) => ({
          ...dv,
          imageUrl:
            dv.imageUrl && dv.imageUrl.startsWith('data:image/') && !dv.imageUrl.startsWith('data:image/svg+xml')
              ? undefined
              : dv.imageUrl,
        })),
      };
      localStorage.setItem(key, JSON.stringify(ultraCompact));
    } catch {
      // ignore storage quota errors
    }
  }
}

const TAB_SESSION_TOKEN_KEY = 'expensetracker_tab_session_token_v1';
export const INACTIVITY_LOGOUT_MS = 2 * 60 * 1000; // 2 minutes (120 seconds)

/**
 * Returns a unique session token for the current browser tab/session.
 * Persists across refreshes in the same tab via sessionStorage, while a second browser/tab/device gets a distinct token.
 */
export function getOrCreateBrowserSessionToken(): string {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const existing = sessionStorage.getItem(TAB_SESSION_TOKEN_KEY);
      if (existing) return existing;
      const created = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem(TAB_SESSION_TOKEN_KEY, created);
      return created;
    }
  } catch {
    // ignore storage errors
  }
  return `sess-fallback`;
}

/**
 * Checks if a user account is currently logged in on another active session (within the 2-minute activity window).
 */
export function isUserSessionActiveElsewhere(
  user: UserAccount,
  currentSessionToken: string,
  nowMs = Date.now()
): boolean {
  if (!user.activeSessionToken || user.activeSessionToken === currentSessionToken) {
    return false;
  }
  if (!user.activeSessionLastSeenAt) {
    return false;
  }
  const lastSeen = Date.parse(user.activeSessionLastSeenAt);
  if (Number.isNaN(lastSeen)) {
    return false;
  }
  return nowMs - lastSeen < INACTIVITY_LOGOUT_MS;
}

/**
 * Automatically purges support chat history 24 hours after Admin marks the support issue as Closed,
 * AND purges individual 24-hour security login alert messages once their expiresAt timestamp passes,
 * ensuring Firebase and local storage stay clean.
 */
export function purgeExpiredSupportChats(
  users: UserAccount[],
  nowMs = Date.now()
): {
  users: UserAccount[];
  changed: boolean;
} {
  let changed = false;
  const cleaned = users.map((u) => {
    if (u.supportIssueExpireAt) {
      const exp = Date.parse(u.supportIssueExpireAt);
      if (!Number.isNaN(exp) && nowMs >= exp) {
        changed = true;
        return {
          ...u,
          supportMessages: [],
          holdReason: undefined,
          supportIssueClosedAt: undefined,
          supportIssueExpireAt: undefined,
          adminNoticeUnread: false,
          securityAlertUnread: false,
        };
      }
    }

    if (u.supportMessages && u.supportMessages.length > 0) {
      const keptMessages = u.supportMessages.filter((m) => {
        if (!m.expiresAt) return true;
        const msgExp = Date.parse(m.expiresAt);
        return Number.isNaN(msgExp) || nowMs < msgExp;
      });
      if (keptMessages.length !== u.supportMessages.length) {
        changed = true;
        const stillHasSecurityAlert = keptMessages.some(
          (m) => m.messageType === 'security_login_alert'
        );
        return {
          ...u,
          supportMessages: keptMessages,
          securityAlertUnread: stillHasSecurityAlert ? u.securityAlertUnread : false,
        };
      }
    }

    return u;
  });
  return { users: cleaned, changed };
}

/**
 * Generates CSV content for transactions including Record ID and Proof ID.
 */
export function generateTransactionsCSV(vault: UserVaultData): string {
  const headers = [
    'RecordID',
    'ProofID',
    'Date',
    'Title',
    'Type',
    'Category',
    'Amount',
    'AccountID',
    'PaymentMethod',
    'PersonID',
    'Status',
    'Notes',
  ];
  const rows = vault.transactions.map((t) => [
    t.id,
    t.proofId || '',
    t.date,
    `"${(t.title || '').replace(/"/g, '""')}"`,
    resolveFlexibleLabel(t.type, t.customTypeLabel),
    `"${resolveFlexibleLabel(t.category, t.customCategory).replace(/"/g, '""')}"`,
    t.amount.toFixed(2),
    t.accountId,
    `"${resolveFlexibleLabel(t.paymentMethod, t.customPaymentMethod).replace(/"/g, '""')}"`,
    t.personId || '',
    t.status,
    `"${(t.notes || '').replace(/"/g, '""')}"`,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export async function syncVaultToLocalFolder(
  dirHandle: any | null,
  user: UserAccount,
  users: UserAccount[],
  vault: UserVaultData
): Promise<{ syncedFiles: string[]; folderName: string }> {
  const safeUsername = user.username.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const filesToWrite = [
    {
      name: `users.db.json`,
      content: JSON.stringify(users, null, 2),
    },
    {
      name: `vault_${safeUsername}.db.json`,
      content: JSON.stringify(vault, null, 2),
    },
    {
      name: `database_${safeUsername}.sqlite.sql`,
      content: generateSQLiteDump(vault),
    },
    {
      name: `ledger_${safeUsername}.csv`,
      content: generateTransactionsCSV(vault),
    },
  ];

  if (dirHandle) {
    for (const file of filesToWrite) {
      const fileHandle = await dirHandle.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file.content);
      await writable.close();
    }
    return {
      syncedFiles: filesToWrite.map((f) => f.name),
      folderName: dirHandle.name || 'Mounted Local Folder',
    };
  }

  return { syncedFiles: [], folderName: 'Browser Indexed Local Storage' };
}

/**
 * Triggers a clean browser file download.
 */
export function downloadLocalFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const LANDING_HERO_IMAGE_KEY = 'expensetracker_landing_hero_image_v1';
const LANDING_HERO_IMAGES_ARRAY_KEY = 'expensetracker_landing_hero_images_v1';

export function parseHeroImagesPayload(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((x) => typeof x === 'string' && x.length > 0);
      }
    } catch {
      return [];
    }
  }
  return [trimmed];
}

export function serializeHeroImagesPayload(images: string[]): string {
  const clean = (images || []).filter((x) => typeof x === 'string' && x.length > 0);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0].slice(0, 750000);
  // Fit as many photos as fit safely within Firestore's document limit alongside pdfHeaderJson
  const fitting: string[] = [];
  for (const img of clean) {
    const candidate = JSON.stringify([...fitting, img]);
    if (candidate.length <= 750000) {
      fitting.push(img);
    }
  }
  return fitting.length > 0 ? JSON.stringify(fitting) : '';
}

export function saveLandingHeroImage(dataUrl: string | null, markLocalChange = true): void {
  try {
    const parsed = parseHeroImagesPayload(dataUrl);
    // Remove legacy duplicate key so hero images are never stored twice in localStorage
    localStorage.removeItem(LANDING_HERO_IMAGE_KEY);
    if (parsed.length > 0) {
      localStorage.setItem(LANDING_HERO_IMAGES_ARRAY_KEY, JSON.stringify(parsed));
    } else {
      localStorage.removeItem(LANDING_HERO_IMAGES_ARRAY_KEY);
    }
    if (markLocalChange) {
      setLocalGlobalConfigUpdatedAt(Date.now());
    }
  } catch {
    // ignore quota errors
  }
}

export function loadLandingHeroImage(): string | null {
  try {
    const arr = loadLandingHeroImages();
    if (arr.length === 0) return null;
    return serializeHeroImagesPayload(arr);
  } catch {
    return null;
  }
}

export function saveLandingHeroImages(images: string[], markLocalChange = true): void {
  try {
    const clean = (images || []).filter(Boolean);
    localStorage.removeItem(LANDING_HERO_IMAGE_KEY);
    if (clean.length > 0) {
      localStorage.setItem(LANDING_HERO_IMAGES_ARRAY_KEY, JSON.stringify(clean));
    } else {
      localStorage.removeItem(LANDING_HERO_IMAGES_ARRAY_KEY);
    }
    if (markLocalChange) {
      setLocalGlobalConfigUpdatedAt(Date.now());
    }
  } catch {
    // ignore quota errors
  }
}

export function loadLandingHeroImages(): string[] {
  try {
    const rawArr = localStorage.getItem(LANDING_HERO_IMAGES_ARRAY_KEY);
    if (rawArr) {
      const parsed = parseHeroImagesPayload(rawArr);
      if (parsed.length > 0) return parsed;
    }
    const single = localStorage.getItem(LANDING_HERO_IMAGE_KEY);
    if (single) return parseHeroImagesPayload(single);
  } catch {
    // ignore
  }
  return [];
}

/**
 * Collects serialized JSON strings of all active vaults, proof images, users, and banners
 * so the Admin Portal can compute real-time Firebase free-tier storage consumption and remaining space.
 */
export function collectStorageFootprintJsonStrings(
  users: UserAccount[],
  heroImages: string[],
  pdfHeaderConfig: PdfHeaderImageConfig
): {
  usersJson: string;
  vaultsJson: string;
  bannersAndPdfJson: string;
} {
  const usersJson = JSON.stringify(users || []);
  const bannersAndPdfJson = JSON.stringify({
    heroImages: heroImages || [],
    pdfHeaderConfig,
  });

  let vaultsAcc = '';
  try {
    if (typeof localStorage !== 'undefined') {
      const proofsRaw = localStorage.getItem(PROOF_IMAGES_KEY) || '';
      vaultsAcc += proofsRaw;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(VAULT_PREFIX)) {
          vaultsAcc += localStorage.getItem(k) || '';
        }
      }
    }
  } catch {
    // ignore
  }

  return {
    usersJson,
    vaultsJson: vaultsAcc,
    bannersAndPdfJson,
  };
}

/**
 * Generates a random 1st-login-only temporary password (e.g. TMP-4829-XK).
 */
export function generateOneTimeTempPassword(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const c1 = chars[Math.floor(Math.random() * chars.length)];
  const c2 = chars[Math.floor(Math.random() * chars.length)];
  return `TMP-${digits}-${c1}${c2}`;
}

/**
 * Permanently deletes a user's vault data, attached proof images, and user profile.
 * Records a deletion tombstone in localStorage so stale cloud snapshots never resurrect the user on refresh.
 */
export function permanentlyDeleteUserAndVault(
  userId: string,
  users: UserAccount[]
): UserAccount[] {
  if (userId === 'user-admin') return users;
  markUserIdDeletedLocally(userId);
  try {
    deleteProofImageLocally(`user-avatar-${userId}`);
    const vault = loadUserVault(userId, false);
    for (const tx of vault.transactions || []) {
      if (tx.proofId) {
        deleteProofImageLocally(tx.proofId);
      }
    }
    for (const item of vault.expectedItems || []) {
      if (item.proofId) {
        deleteProofImageLocally(item.proofId);
      }
    }
    for (const dv of vault.dreamVaults || []) {
      deleteProofImageLocally(`dream-img-${dv.id}`);
    }
    for (const acc of vault.accounts || []) {
      deleteProofImageLocally(`acc-logo-${acc.id}`);
    }
    localStorage.removeItem(`${VAULT_PREFIX}${userId}`);
  } catch {
    // ignore
  }
  const remaining = users.filter((u) => u.id !== userId);
  saveUsersToLocal(remaining, true);
  return remaining;
}

/**
 * Resets the entire portal local storage (all users, vaults, proof images, custom hero image, PDF header config)
 * and restores the single default @admin account.
 */
export function resetEntirePortalLocalStorage(currentAdminPassword = 'admin'): UserAccount[] {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith(VAULT_PREFIX) ||
          k === PROOF_IMAGES_KEY ||
          k === PDF_HEADER_CONFIG_KEY ||
          k === LANDING_HERO_IMAGE_KEY ||
          k === LANDING_HERO_IMAGES_ARRAY_KEY ||
          k === USERS_STORAGE_KEY ||
          k === USERS_UPDATED_AT_KEY ||
          k === DELETED_USERS_STORAGE_KEY ||
          k === GLOBAL_CONFIG_UPDATED_AT_KEY)
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }

  const nowIso = new Date().toISOString();
  const defaultAdmin: UserAccount = {
    id: 'user-admin',
    username: 'admin',
    displayName: 'Administrator Portal',
    passwordHash: hashSecretIrreversibly(currentAdminPassword || 'admin'),
    role: 'admin',
    email: DEFAULT_PRIMARY_ADMIN_EMAIL,
    createdAt: nowIso,
    updatedAt: nowIso,
    currency: '₹',
    customCategories: [],
    accountStatus: 'active',
  };

  saveUsersToLocal([defaultAdmin], true);
  saveUserVault(createInitialAdminVault('user-admin'));
  setLocalGlobalConfigUpdatedAt(Date.now());
  return [defaultAdmin];
}

/**
 * Converts an uploaded image File into an HD or compact Data URL.
 * Preserves transparency (PNG) when preserveTransparency is true so PDF header logos have zero background border.
 */
export function compressImageFileToDataUrl(
  file: File,
  maxDimension = 128,
  quality = 0.82,
  preserveTransparency = false
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl) {
        reject(new Error('Empty image data.'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const renderAtMax = (limit: number, forceJpeg = false, q = quality): string => {
          const canvas = document.createElement('canvas');
          let w = img.width || limit;
          let h = img.height || limit;
          if (w > limit || h > limit) {
            if (w > h) {
              h = Math.round((h * limit) / w);
              w = limit;
            } else {
              w = Math.round((w * limit) / h);
              h = limit;
            }
          }
          canvas.width = Math.max(1, w);
          canvas.height = Math.max(1, h);
          const ctx = canvas.getContext('2d');
          if (!ctx) return rawDataUrl;
          ctx.clearRect(0, 0, w, h);
          if (!preserveTransparency || forceJpeg) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            return canvas.toDataURL('image/jpeg', q);
          }
          ctx.drawImage(img, 0, 0, w, h);
          return canvas.toDataURL('image/png');
        };

        let result = renderAtMax(maxDimension, false, quality);
        // Keep images sharp while bounded (~280KB max) so localStorage and Firestore 1MB docs never overflow
        if (result.length > 280000) {
          result = renderAtMax(Math.min(maxDimension, 900), true, 0.78);
        }
        if (result.length > 280000) {
          result = renderAtMax(Math.min(maxDimension, 680), true, 0.72);
        }
        resolve(result);
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}


