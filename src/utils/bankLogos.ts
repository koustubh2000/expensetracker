// Official ExpenseTracker PNG Brand Assets & Internet Bank Thumbnail Resolver

const rawBase =
  typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL
    ? (import.meta as any).env.BASE_URL
    : '/';
const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;

export const EXPENSE_TRACKER_FULL_LOGO = `${normalizedBase}assets/aistudio/logo-full-light.png`;
export const EXPENSE_TRACKER_FULL_LOGO_DARK = `${normalizedBase}assets/aistudio/logo-full-dark.png`;
export const EXPENSE_TRACKER_SQUARE_ICON = `${normalizedBase}assets/aistudio/icon-square-clean.png`;

export interface CardColorOption {
  id: string;
  label: string;
  hex: string;
  gradientCss: string;
}

export const CARD_COLOR_SWATCHES: CardColorOption[] = [
  {
    id: 'emerald',
    label: 'Emerald Vault',
    hex: '#059669',
    gradientCss: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
  },
  {
    id: 'royal-navy',
    label: 'Royal Navy',
    hex: '#1e3a8a',
    gradientCss: 'linear-gradient(135deg, #1e3a8a 0%, #172554 100%)',
  },
  {
    id: 'indigo',
    label: 'Executive Indigo',
    hex: '#4338ca',
    gradientCss: 'linear-gradient(135deg, #4338ca 0%, #312e81 100%)',
  },
  {
    id: 'crimson',
    label: 'Crimson Burgundy',
    hex: '#be123c',
    gradientCss: 'linear-gradient(135deg, #be123c 0%, #881337 100%)',
  },
  {
    id: 'amber-gold',
    label: 'Saffron / Gold',
    hex: '#d97706',
    gradientCss: 'linear-gradient(135deg, #d97706 0%, #92400e 100%)',
  },
  {
    id: 'teal',
    label: 'Ocean Teal',
    hex: '#0d9488',
    gradientCss: 'linear-gradient(135deg, #0d9488 0%, #115e59 100%)',
  },
  {
    id: 'violet',
    label: 'Royal Plum',
    hex: '#7c3aed',
    gradientCss: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
  },
  {
    id: 'sky',
    label: 'Sapphire Sky',
    hex: '#0284c7',
    gradientCss: 'linear-gradient(135deg, #0284c7 0%, #075985 100%)',
  },
  {
    id: 'slate',
    label: 'Obsidian Slate',
    hex: '#0f172a',
    gradientCss: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
  },
  {
    id: 'copper',
    label: 'Bronze Copper',
    hex: '#ea580c',
    gradientCss: 'linear-gradient(135deg, #ea580c 0%, #9a3412 100%)',
  },
];

const BANK_DOMAIN_DIRECTORY: Array<{ keywords: string[]; domain: string; defaultColor: string }> = [
  { keywords: ['sbi', 'state bank'], domain: 'onlinesbi.sbi', defaultColor: '#1e3a8a' },
  { keywords: ['hdfc'], domain: 'hdfcbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['icici'], domain: 'icicibank.com', defaultColor: '#ea580c' },
  { keywords: ['bob', 'bank of baroda', 'baroda'], domain: 'bankofbaroda.in', defaultColor: '#ea580c' },
  { keywords: ['axis'], domain: 'axisbank.com', defaultColor: '#be123c' },
  { keywords: ['kotak'], domain: 'kotak.com', defaultColor: '#be123c' },
  { keywords: ['pnb', 'punjab national'], domain: 'pnbindia.in', defaultColor: '#be123c' },
  { keywords: ['canara'], domain: 'canarabank.com', defaultColor: '#0284c7' },
  { keywords: ['union bank', 'ubi'], domain: 'unionbankofindia.co.in', defaultColor: '#be123c' },
  { keywords: ['idfc'], domain: 'idfcfirstbank.com', defaultColor: '#be123c' },
  { keywords: ['indusind'], domain: 'indusind.com', defaultColor: '#be123c' },
  { keywords: ['yes bank'], domain: 'yesbank.in', defaultColor: '#1e3a8a' },
  { keywords: ['federal'], domain: 'federalbank.co.in', defaultColor: '#1e3a8a' },
  { keywords: ['bandhan'], domain: 'bandhanbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['indian bank', 'allahabad'], domain: 'indianbank.in', defaultColor: '#1e3a8a' },
  { keywords: ['bank of india', 'boi'], domain: 'bankofindia.co.in', defaultColor: '#1e3a8a' },
  { keywords: ['central bank', 'cbi'], domain: 'centralbankofindia.co.in', defaultColor: '#0284c7' },
  { keywords: ['idbi'], domain: 'idbibank.in', defaultColor: '#059669' },
  { keywords: ['rbl'], domain: 'rblbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['au small', 'au bank'], domain: 'aubank.in', defaultColor: '#7c3aed' },
  { keywords: ['maharashtra', 'bom', 'bank of maharashtra'], domain: 'bankofmaharashtra.in', defaultColor: '#0284c7' },
  { keywords: ['indian overseas', 'iob'], domain: 'iob.in', defaultColor: '#1e3a8a' },
  { keywords: ['uco'], domain: 'ucobank.com', defaultColor: '#0284c7' },
  { keywords: ['punjab & sind', 'punjab and sind', 'psb'], domain: 'punjabandsindbank.co.in', defaultColor: '#059669' },
  { keywords: ['south indian', 'sib'], domain: 'southindianbank.com', defaultColor: '#be123c' },
  { keywords: ['karur vysya', 'kvb'], domain: 'kvb.co.in', defaultColor: '#059669' },
  { keywords: ['city union', 'cub'], domain: 'cityunionbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['tamilnad mercantile', 'tmb'], domain: 'tmb.in', defaultColor: '#be123c' },
  { keywords: ['karnataka bank', 'ktk'], domain: 'karnatakabank.com', defaultColor: '#7c3aed' },
  { keywords: ['dhanlaxmi'], domain: 'dhanbank.com', defaultColor: '#7c3aed' },
  { keywords: ['jammu', 'j&k', 'jk bank'], domain: 'jkbank.com', defaultColor: '#059669' },
  { keywords: ['csb', 'catholic syrian'], domain: 'csb.co.in', defaultColor: '#ea580c' },
  { keywords: ['dcb'], domain: 'dcbbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['nainital'], domain: 'nainitalbank.co.in', defaultColor: '#059669' },
  { keywords: ['ujjivan'], domain: 'ujjivansfb.in', defaultColor: '#0d9488' },
  { keywords: ['equitas'], domain: 'equitasbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['jana small', 'jana bank'], domain: 'janabank.com', defaultColor: '#be123c' },
  { keywords: ['esaf'], domain: 'esafbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['utkarsh'], domain: 'utkarsh.bank', defaultColor: '#7c3aed' },
  { keywords: ['fincare'], domain: 'fincarebank.com', defaultColor: '#ea580c' },
  { keywords: ['suryoday'], domain: 'suryodaybank.com', defaultColor: '#d97706' },
  { keywords: ['shivalik'], domain: 'shivalikbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['unity small', 'unity bank'], domain: 'theunitybank.com', defaultColor: '#4338ca' },
  { keywords: ['saraswat'], domain: 'saraswatbank.com', defaultColor: '#ea580c' },
  { keywords: ['cosmos'], domain: 'cosmosbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['svc', 'shamrao'], domain: 'svcbank.com', defaultColor: '#0284c7' },
  { keywords: ['tjsb', 'thane janata'], domain: 'tjsbbank.co.in', defaultColor: '#be123c' },
  { keywords: ['abhyudaya'], domain: 'abhyudayabank.co.in', defaultColor: '#1e3a8a' },
  { keywords: ['apna sahakari', 'apna bank'], domain: 'apnabank.co.in', defaultColor: '#be123c' },
  { keywords: ['bharat bank', 'bharat co'], domain: 'bharatbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['nkgsb'], domain: 'nkgsb-bank.com', defaultColor: '#be123c' },
  { keywords: ['kalupur'], domain: 'kalupurbank.com', defaultColor: '#ea580c' },
  { keywords: ['mehsana'], domain: 'mucbank.com', defaultColor: '#1e3a8a' },
  { keywords: ['airtel'], domain: 'airtel.in', defaultColor: '#be123c' },
  { keywords: ['jio', 'jiopay'], domain: 'jio.com', defaultColor: '#1e3a8a' },
  { keywords: ['fino'], domain: 'finobank.com', defaultColor: '#1e3a8a' },
  { keywords: ['ippb', 'post office', 'indiapost'], domain: 'indiapost.gov.in', defaultColor: '#be123c' },
  { keywords: ['paytm'], domain: 'paytm.com', defaultColor: '#0284c7' },
  { keywords: ['phonepe', 'phone pe'], domain: 'phonepe.com', defaultColor: '#7c3aed' },
  { keywords: ['gpay', 'google pay', 'upi'], domain: 'pay.google.com', defaultColor: '#0284c7' },
  { keywords: ['bhim'], domain: 'bhimupi.org.in', defaultColor: '#ea580c' },
  { keywords: ['mobikwik'], domain: 'mobikwik.com', defaultColor: '#0284c7' },
  { keywords: ['freecharge'], domain: 'freecharge.in', defaultColor: '#ea580c' },
  { keywords: ['amazon pay', 'amazon'], domain: 'amazon.in', defaultColor: '#d97706' },
  { keywords: ['cred'], domain: 'cred.club', defaultColor: '#0f172a' },
  { keywords: ['slice'], domain: 'sliceit.com', defaultColor: '#7c3aed' },
  { keywords: ['jupiter'], domain: 'jupiter.money', defaultColor: '#ea580c' },
  { keywords: ['fi money', 'epifi'], domain: 'fi.money', defaultColor: '#0d9488' },
  { keywords: ['niyo'], domain: 'goniyo.com', defaultColor: '#1e3a8a' },
  { keywords: ['zerodha'], domain: 'zerodha.com', defaultColor: '#0284c7' },
  { keywords: ['groww'], domain: 'groww.in', defaultColor: '#059669' },
  { keywords: ['upstox'], domain: 'upstox.com', defaultColor: '#7c3aed' },
  { keywords: ['angel one', 'angel broking'], domain: 'angelone.in', defaultColor: '#ea580c' },
  { keywords: ['dbs', 'digibank'], domain: 'dbs.com', defaultColor: '#be123c' },
  { keywords: ['chase', 'jpmorgan'], domain: 'chase.com', defaultColor: '#1e3a8a' },
  { keywords: ['citi', 'citibank'], domain: 'citi.com', defaultColor: '#0284c7' },
  { keywords: ['hsbc'], domain: 'hsbc.com', defaultColor: '#be123c' },
  { keywords: ['standard chartered', 'scb'], domain: 'sc.com', defaultColor: '#059669' },
  { keywords: ['amex', 'american express'], domain: 'americanexpress.com', defaultColor: '#0284c7' },
  { keywords: ['barclays'], domain: 'barclays.co.uk', defaultColor: '#0284c7' },
  { keywords: ['deutsche'], domain: 'db.com', defaultColor: '#1e3a8a' },
  { keywords: ['bank of america', 'bofa'], domain: 'bankofamerica.com', defaultColor: '#be123c' },
  { keywords: ['wells fargo'], domain: 'wellsfargo.com', defaultColor: '#be123c' },
  { keywords: ['revolut'], domain: 'revolut.com', defaultColor: '#0f172a' },
  { keywords: ['wise', 'transferwise'], domain: 'wise.com', defaultColor: '#059669' },
  { keywords: ['paypal'], domain: 'paypal.com', defaultColor: '#1e3a8a' },
];

/**
 * Masks a bank account or card number cleanly for dashboard cards (e.g., "•••• 4821").
 */
export function maskAccountNumber(accountNumber?: string): string {
  const clean = (accountNumber || '').trim();
  if (!clean) return '•••• 0000';
  const digitsOnly = clean.replace(/\s+/g, '');
  if (digitsOnly.length <= 4) {
    return `•••• ${digitsOnly}`;
  }
  const last4 = digitsOnly.slice(-4);
  return `•••• ${last4}`;
}

/**
 * Curated high-resolution official brand SVG logos for major Indian & global banks and digital wallets.
 */
function generateCuratedBrandSvgDataUrl(brandKey: string, defaultColor: string): string | null {
  let svg = '';
  switch (brandKey) {
    case 'sbi':
      // Iconic SBI Blue Circle with Keyhole
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#ffffff"/>
        <circle cx="32" cy="32" r="24" fill="#004c8f"/>
        <circle cx="32" cy="27" r="7.5" fill="#ffffff"/>
        <rect x="29" y="31" width="6" height="26" fill="#ffffff"/>
      </svg>`;
      break;
    case 'hdfc':
      // Iconic HDFC Red Square with Blue Center & White Crossbars
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#ffffff"/>
        <rect x="10" y="10" width="44" height="44" rx="4" fill="#ed232a"/>
        <rect x="18" y="18" width="28" height="28" fill="#ffffff"/>
        <rect x="29" y="10" width="6" height="44" fill="#ffffff"/>
        <rect x="10" y="29" width="44" height="6" fill="#ffffff"/>
        <rect x="22" y="22" width="20" height="20" fill="#004c8f"/>
      </svg>`;
      break;
    case 'icici':
      // Iconic ICICI Orange/Burgundy Dynamic Crest
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#f37021"/>
        <path d="M16 46 L28 16 L38 16 L26 46 Z" fill="#ffffff"/>
        <circle cx="36" cy="18" r="5" fill="#97144d"/>
        <path d="M32 46 L42 24 L50 24 L40 46 Z" fill="#97144d"/>
        <text x="32" y="57" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="9" fill="#ffffff" letter-spacing="1">ICICI</text>
      </svg>`;
      break;
    case 'axis':
      // Iconic Axis Bank Burgundy 'A' Monogram
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#97144d"/>
        <path d="M32 12 L50 46 L40 46 L32 30 L24 46 L14 46 Z" fill="#ffffff"/>
        <polygon points="26,38 38,38 35,44 29,44" fill="#97144d"/>
        <text x="32" y="57" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="8.5" fill="#ffffff" letter-spacing="1.5">AXIS</text>
      </svg>`;
      break;
    case 'kotak':
      // Iconic Kotak Red & Navy Infinity Symbol
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#003366"/>
        <rect x="6" y="6" width="52" height="52" rx="11" fill="#ed1c24"/>
        <path d="M22 24 C15 24 15 36 22 36 C26 36 29 33 32 30 C35 27 38 24 42 24 C49 24 49 36 42 36 C38 36 35 33 32 30 C29 27 26 24 22 24 Z" fill="none" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round"/>
        <text x="32" y="51" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="9" fill="#ffffff" letter-spacing="1">KOTAK</text>
      </svg>`;
      break;
    case 'bob':
      // Bank of Baroda Dual-B Rising Sun Orange Emblem
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#f26522"/>
        <circle cx="32" cy="28" r="14" fill="#ffffff"/>
        <circle cx="32" cy="28" r="8" fill="#f26522"/>
        <rect x="18" y="14" width="5" height="28" rx="2" fill="#ffffff"/>
        <text x="32" y="54" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="9" fill="#ffffff" letter-spacing="1">BARODA</text>
      </svg>`;
      break;
    case 'pnb':
      // Punjab National Bank Maroon & Gold Emblem
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#a20a3a"/>
        <circle cx="32" cy="27" r="13" fill="#fbbf24"/>
        <text x="32" y="32" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="12" fill="#a20a3a">PNB</text>
        <rect x="16" y="46" width="32" height="5" rx="2.5" fill="#fbbf24"/>
      </svg>`;
      break;
    case 'canara':
      // Canara Bank Blue & Gold Triangle Interlock
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#0091da"/>
        <polygon points="32,12 48,40 16,40" fill="none" stroke="#fbbf24" stroke-width="4.5" stroke-linejoin="round"/>
        <text x="32" y="54" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="8.5" fill="#ffffff" letter-spacing="1">CANARA</text>
      </svg>`;
      break;
    case 'idfc':
      // IDFC First Bank Maroon & White Monogram
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#9d1d27"/>
        <rect x="14" y="14" width="36" height="36" rx="6" fill="none" stroke="#ffffff" stroke-width="3.5"/>
        <text x="32" y="37" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="12" fill="#ffffff">IDFC</text>
      </svg>`;
      break;
    case 'yes':
      // Yes Bank Blue & Red Checkmark Crest
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#002ed2"/>
        <path d="M18 30 L28 40 L46 18" fill="none" stroke="#ed1c24" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="32" y="54" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="9" fill="#ffffff" letter-spacing="1.2">YES BANK</text>
      </svg>`;
      break;
    case 'indusind':
      // IndusInd Burgundy & Gold Crest
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#832625"/>
        <circle cx="32" cy="26" r="11" fill="none" stroke="#fbbf24" stroke-width="4"/>
        <circle cx="32" cy="26" r="4" fill="#fbbf24"/>
        <text x="32" y="52" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="8" fill="#ffffff" letter-spacing="0.8">INDUSIND</text>
      </svg>`;
      break;
    case 'chase':
      // JPMorgan Chase Blue Octagon
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#117aca"/>
        <polygon points="24,12 40,12 52,24 52,40 40,52 24,52 12,40 12,24" fill="none" stroke="#ffffff" stroke-width="4.5"/>
        <rect x="25" y="25" width="14" height="14" fill="#ffffff"/>
      </svg>`;
      break;
    case 'citi':
      // Citibank Blue with Red Umbrella Arc
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#003b70"/>
        <path d="M22 25 A12 10 0 0 1 46 25" fill="none" stroke="#ed1c24" stroke-width="4.5" stroke-linecap="round"/>
        <text x="32" y="44" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="18" fill="#ffffff">citi</text>
      </svg>`;
      break;
    case 'hsbc':
      // HSBC Red & White Hexagonal Bowtie
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#ffffff"/>
        <rect x="18" y="18" width="28" height="28" fill="#ffffff"/>
        <polygon points="18,18 32,32 18,46" fill="#db0011"/>
        <polygon points="46,18 32,32 46,46" fill="#db0011"/>
        <polygon points="18,18 32,32 46,18" fill="#db0011" opacity="0.85"/>
        <polygon points="18,46 32,32 46,46" fill="#db0011" opacity="0.85"/>
        <polygon points="6,32 18,18 18,46" fill="#db0011"/>
        <polygon points="58,32 46,18 46,46" fill="#db0011"/>
      </svg>`;
      break;
    case 'paytm':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#002970"/>
        <text x="32" y="38" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#00baf2">Paytm</text>
      </svg>`;
      break;
    case 'phonepe':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#5f259f"/>
        <text x="32" y="42" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="28" fill="#ffffff">पे</text>
      </svg>`;
      break;
    case 'gpay':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
        <rect width="64" height="64" rx="14" fill="#ffffff"/>
        <circle cx="32" cy="32" r="24" fill="#1a73e8"/>
        <text x="32" y="38" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="15" fill="#ffffff">GPay</text>
      </svg>`;
      break;
    default:
      return null;
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Generates a crisp SVG bank crest / monogram symbol Data URL for any bank or wallet
 * so that even regional/co-op banks or offline favicons always show a rich vector symbol.
 */
export function generateBankFallbackSvgDataUrl(
  accountName: string,
  accentHex = '#1e3a8a'
): string {
  const clean = (accountName || 'Bank').trim();
  const words = clean
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let initials = 'BK';
  if (words.length >= 2) {
    initials = `${words[0][0]}${words[1][0]}`.toUpperCase();
  } else if (words.length === 1 && words[0].length >= 2) {
    initials = words[0].slice(0, 3).toUpperCase();
  } else if (words.length === 1) {
    initials = words[0].toUpperCase();
  }
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : '#1e3a8a';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
    <rect width="64" height="64" rx="14" fill="${safeHex}"/>
    <path d="M32 8 L54 18 L54 22 L10 22 L10 18 Z" fill="#ffffff" opacity="0.92"/>
    <rect x="14" y="25" width="5" height="19" rx="1.5" fill="#ffffff" opacity="0.35"/>
    <rect x="45" y="25" width="5" height="19" rx="1.5" fill="#ffffff" opacity="0.35"/>
    <rect x="8" y="48" width="48" height="6" rx="2" fill="#ffffff" opacity="0.92"/>
    <text x="32" y="41" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="${
      initials.length > 2 ? '13' : '16'
    }" fill="#ffffff">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Syncs a bank or digital wallet's official brand logo dynamically based on the account name,
 * resolving curated high-res SVG logos for major Indian & global banks (SBI, HDFC, ICICI, Axis, Kotak, etc.)
 * as well as Google Favicon / Clearbit domain metadata and fallback crests.
 */
export function resolveBankLogoFromName(accountName: string): {
  logoUrl?: string;
  fallbackLogoUrl?: string;
  remoteFaviconUrl?: string;
  domain?: string;
  suggestedColor?: string;
} {
  const lower = (accountName || '').trim().toLowerCase();
  if (!lower) return {};

  const brandKeyMap: Array<{ keywords: string[]; key: string }> = [
    { keywords: ['sbi', 'state bank'], key: 'sbi' },
    { keywords: ['hdfc'], key: 'hdfc' },
    { keywords: ['icici'], key: 'icici' },
    { keywords: ['axis'], key: 'axis' },
    { keywords: ['kotak'], key: 'kotak' },
    { keywords: ['bob', 'bank of baroda', 'baroda'], key: 'bob' },
    { keywords: ['pnb', 'punjab national'], key: 'pnb' },
    { keywords: ['canara'], key: 'canara' },
    { keywords: ['idfc'], key: 'idfc' },
    { keywords: ['yes bank'], key: 'yes' },
    { keywords: ['indusind'], key: 'indusind' },
    { keywords: ['chase', 'jpmorgan'], key: 'chase' },
    { keywords: ['citi', 'citibank'], key: 'citi' },
    { keywords: ['hsbc'], key: 'hsbc' },
    { keywords: ['paytm'], key: 'paytm' },
    { keywords: ['phonepe', 'phone pe'], key: 'phonepe' },
    { keywords: ['gpay', 'google pay'], key: 'gpay' },
  ];

  for (const entry of BANK_DOMAIN_DIRECTORY) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      const matchedBrand = brandKeyMap.find((b) =>
        b.keywords.some((kw) => lower.includes(kw))
      );
      const curatedSvg = matchedBrand
        ? generateCuratedBrandSvgDataUrl(matchedBrand.key, entry.defaultColor)
        : null;
      const emblemSvg =
        curatedSvg || generateBankFallbackSvgDataUrl(accountName, entry.defaultColor);
      const remoteFaviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        entry.domain
      )}&sz=128`;
      return {
        logoUrl: emblemSvg,
        fallbackLogoUrl: emblemSvg,
        remoteFaviconUrl,
        domain: entry.domain,
        suggestedColor: entry.defaultColor,
      };
    }
  }

  // Always return a crisp SVG bank crest symbol for any custom/regional/cooperative bank or wallet
  const fallbackSvg = generateBankFallbackSvgDataUrl(accountName, '#1e3a8a');
  return {
    logoUrl: fallbackSvg,
    fallbackLogoUrl: fallbackSvg,
    suggestedColor: '#1e3a8a',
  };
}

/**
 * Samples an uploaded image Data URL and extracts its dominant saturated/brand color
 * (e.g., royal navy blue from the saree in the uploaded photo) to use as the PDF Header background color.
 */
export function extractDominantColorFromImageDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !dataUrl) {
      resolve('#162d59');
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const sampleSize = 48;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('#162d59');
          return;
        }
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let weightSum = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 140) continue; // skip transparent pixels

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          // Skip near-white backgrounds and near-black outlines, and skip skin tones to prefer garment/brand colors
          if (luma > 225 || luma < 18) continue;
          const isLikelySkinTone = r > 150 && g > 100 && b > 70 && r > g && g > b && r - b < 110;
          if (isLikelySkinTone) continue;

          const saturation = max === 0 ? 0 : (max - min) / max;
          const weight = 0.35 + saturation * 2.5;
          rSum += r * weight;
          gSum += g * weight;
          bSum += b * weight;
          weightSum += weight;
        }

        if (weightSum <= 0) {
          resolve('#162d59');
          return;
        }

        // Slightly deepen the sampled color so white text on the PDF header banner always has crisp contrast
        let rFinal = Math.round(rSum / weightSum);
        let gFinal = Math.round(gSum / weightSum);
        let bFinal = Math.round(bSum / weightSum);
        const finalLuma = 0.299 * rFinal + 0.587 * gFinal + 0.114 * bFinal;
        if (finalLuma > 135) {
          const darken = 125 / finalLuma;
          rFinal = Math.round(rFinal * darken);
          gFinal = Math.round(gFinal * darken);
          bFinal = Math.round(bFinal * darken);
        }

        const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
        resolve(`#${toHex(rFinal)}${toHex(gFinal)}${toHex(bFinal)}`);
      } catch {
        resolve('#162d59');
      }
    };
    img.onerror = () => resolve('#162d59');
    img.src = dataUrl;
  });
}
