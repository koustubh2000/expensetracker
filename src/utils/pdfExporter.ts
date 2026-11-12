import { jsPDF } from 'jspdf';
import {
  ExpectedItem,
  PdfHeaderImageConfig,
  PersonProfile,
  PersonRecordGroup,
  TransactionRecord,
  WalletAccount,
} from '../types/finance';
import {
  calculatePersonLedger,
  formatStatusDisplayLabel,
  resolveFlexibleLabel,
} from './financeRules';
import {
  downloadLocalFile,
  loadPdfHeaderConfig,
  loadProofImageLocally,
} from './localVaultStorage';

function detectImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

function hexToRgbTuple(
  hexColor?: string,
  fallback: [number, number, number] = [22, 45, 89]
): [number, number, number] {
  if (!hexColor || !/^#?[0-9a-fA-F]{6}$/.test(hexColor.trim())) {
    return fallback;
  }
  const clean = hexColor.trim().replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

export function sanitizePdfText(input: string): string {
  return String(input || '')
    .replace(/₹/g, 'Rs. ')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/·/g, '|')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatPdfCurrency(currencySymbol: string, amount: number): string {
  const formatted = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currencySymbol === '₹' || currencySymbol.toLowerCase() === 'inr') {
    return `Rs. ${formatted}`;
  }
  return `${sanitizePdfText(currencySymbol) || '$'}${formatted}`;
}

export function getHeaderBannerHeightPt(cfg: PdfHeaderImageConfig): number {
  const textHeight = 68;
  const imgUrl = cfg.imageUrl || (cfg as any).dataUrl;
  if (!imgUrl) return textHeight;
  const imgH = Math.max(24, cfg.height || 68);
  const offsetY = cfg.offsetY || 0;
  return Math.max(textHeight, imgH + Math.max(0, offsetY));
}

function drawCustomHeaderImage(
  doc: jsPDF,
  cfg: PdfHeaderImageConfig,
  pageWidth: number,
  margin: number,
  bannerHeight: number
) {
  const imgUrl = cfg.imageUrl || (cfg as any).dataUrl;
  if (!imgUrl) return;
  try {
    const imgW = Math.max(24, Math.min(pageWidth - margin * 2, cfg.width || 110));
    const imgH = Math.max(24, cfg.height || 68);
    let x = pageWidth - margin - imgW;
    if (cfg.align === 'left') {
      x = margin;
    } else if (cfg.align === 'center') {
      x = (pageWidth - imgW) / 2;
    }
    x += cfg.offsetX || 0;
    x = Math.max(0, Math.min(pageWidth - imgW, x));

    const defaultY = Math.max(0, bannerHeight - imgH);
    const y = Math.max(0, defaultY + (cfg.offsetY || 0));

    let drawW = imgW;
    let drawH = imgH;
    let drawX = x;
    let drawY = y;
    try {
      const props = doc.getImageProperties(imgUrl);
      if (props && props.width > 0 && props.height > 0) {
        const ratio = Math.min(imgW / props.width, imgH / props.height);
        drawW = props.width * ratio;
        drawH = props.height * ratio;
        drawX = x + (imgW - drawW) / 2;
        drawY = y + (imgH - drawH) / 2;
      }
    } catch {
      // Fallback to box dimensions if image properties cannot be parsed
    }

    doc.addImage(imgUrl, detectImageFormat(imgUrl), drawX, drawY, drawW, drawH, undefined, 'SLOW');
  } catch {
    // Ignore invalid custom header image format
  }
}

export interface GenerateLedgerRecordsPdfOptions {
  transactions: TransactionRecord[];
  accounts: WalletAccount[];
  people?: PersonProfile[];
  currency: string;
  issuedBy: string;
  role?: 'admin' | 'user';
  periodLabel: string;
  headerConfig?: PdfHeaderImageConfig;
  orientation?: 'portrait' | 'landscape';
  triggerDownload?: boolean;
}

export function generateLedgerRecordsPdf(options: GenerateLedgerRecordsPdfOptions): {
  filename: string;
  recordCount: number;
  pdfRowCount: number;
  screenshotCount: number;
  rawPdfHeader: string;
} {
  const {
    transactions,
    accounts,
    issuedBy,
    role = 'user',
    periodLabel,
    headerConfig,
    orientation,
    triggerDownload = true,
  } = options;

  const cfg = headerConfig || loadPdfHeaderConfig();
  const finalOrientation = orientation || cfg.orientation || 'portrait';
  const doc = new jsPDF({
    orientation: finalOrientation,
    unit: 'pt',
    format: 'a4',
    compress: false,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  let y = 36;

  const getAccountName = (accId: string) =>
    accounts.find((a) => a.id === accId)?.name || 'Primary Account';

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 42) {
      doc.addPage();
      y = 40;
    }
  };

  // Header Banner — default height strictly for text (68pt) or user-uploaded image height
  const isAdmin = role === 'admin';
  const defaultRgb: [number, number, number] = isAdmin ? [225, 29, 72] : [22, 45, 89];
  const [r, g, b] = hexToRgbTuple(cfg.headerBgColor, defaultRgb);

  const bannerHeight = getHeaderBannerHeightPt(cfg);
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');

  const hasImg = Boolean(cfg.imageUrl || (cfg as any).dataUrl);
  const textX = hasImg && cfg.align === 'left' ? margin + (cfg.width || 90) + 16 : margin;
  const textBaseY = bannerHeight - 40;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('Expense Tracker', textX, textBaseY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('HD LEDGER STATEMENT & PROOF REPORT', textX, textBaseY + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const roleLabel = isAdmin ? 'Admin Portal' : 'Customer Portal';
  doc.text(
    `Account Holder: ${issuedBy} (${roleLabel})   |   Period: ${periodLabel}   |   Date: ${new Date()
      .toISOString()
      .slice(0, 10)}`,
    textX,
    textBaseY + 29
  );

  // Draw Custom Header Image (No border, user-controlled height & position)
  drawCustomHeaderImage(doc, cfg, pageWidth, margin, bannerHeight);

  y = bannerHeight + 18;

  // Totals Summary Box
  const totalIncome = transactions
    .filter((t) => t.type === 'income' || t.type === 'borrowing_in' || t.type === 'expected_incoming')
    .reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions
    .filter((t) => t.type === 'expense' || t.type === 'lending_out' || t.type === 'dream_investment')
    .reduce((acc, t) => acc + t.amount, 0);

  const transactionsWithProofs = transactions
    .map((tx) => ({
      tx,
      dataUrl: tx.proofImageDataUrl || loadProofImageLocally(tx.proofId),
    }))
    .filter((item): item is { tx: TransactionRecord; dataUrl: string } => Boolean(item.dataUrl));

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 50, 6, 6, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`Total Records: ${transactions.length}`, margin + 14, y + 20);
  doc.setTextColor(16, 185, 129);
  doc.text(
    `Total Inflow: +Rs. ${totalIncome.toLocaleString('en-IN')}`,
    margin + contentWidth * 0.28,
    y + 20
  );
  doc.setTextColor(225, 29, 72);
  doc.text(
    `Total Outflow: -Rs. ${totalExpense.toLocaleString('en-IN')}`,
    margin + contentWidth * 0.62,
    y + 20
  );

  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Attached Proof Screenshots: ${transactionsWithProofs.length}   |   Net Period Cashflow: ${
      totalIncome - totalExpense >= 0 ? '+' : '-'
    }Rs. ${Math.abs(totalIncome - totalExpense).toLocaleString('en-IN')}`,
    margin + 14,
    y + 37
  );

  y += 66;

  // Section 1: Itemized Transactions Table
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('1. ITEMIZED TRANSACTION RECORDS (WITH RECORD ID & PROOF ID)', margin, y);
  y += 10;

  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, contentWidth, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text('RECORD ID', margin + 8, y + 14);
  doc.text('PROOF ID', margin + contentWidth * 0.13, y + 14);
  doc.text('DATE', margin + contentWidth * 0.25, y + 14);
  doc.text('TITLE / DESCRIPTION', margin + contentWidth * 0.36, y + 14);
  doc.text('CATEGORY & ACCOUNT', margin + contentWidth * 0.62, y + 14);
  doc.text('STATUS', margin + contentWidth * 0.8, y + 14);
  doc.text('AMOUNT', pageWidth - margin - 8, y + 14, { align: 'right' });
  y += 22;

  transactions.forEach((tx, idx) => {
    ensureSpace(24);
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 21, 'F');
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`#${tx.id.slice(0, 10)}`, margin + 8, y + 14);

    if (tx.proofId) {
      doc.setTextColor(16, 185, 129);
      doc.text(tx.proofId, margin + contentWidth * 0.13, y + 14);
    } else {
      doc.setTextColor(148, 163, 184);
      doc.text('—', margin + contentWidth * 0.13, y + 14);
    }

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(tx.date, margin + contentWidth * 0.25, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const maxTitleLen = finalOrientation === 'landscape' ? 38 : 24;
    const cleanTitle =
      tx.title.length > maxTitleLen ? tx.title.slice(0, maxTitleLen - 2) + '...' : tx.title;
    doc.text(cleanTitle, margin + contentWidth * 0.36, y + 14);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const catLabel = resolveFlexibleLabel(tx.category, tx.customCategory);
    const catAcc = `${catLabel.slice(0, 12)} | ${getAccountName(tx.accountId).slice(0, 10)}`;
    doc.text(catAcc, margin + contentWidth * 0.62, y + 14);

    doc.setFont('helvetica', 'bold');
    const statusLabel = formatStatusDisplayLabel(tx.status);
    if (statusLabel.startsWith('PENDING')) {
      doc.setTextColor(217, 119, 6);
    } else {
      doc.setTextColor(71, 85, 105);
    }
    const statusColMaxW = contentWidth * 0.11;
    const wrappedStatus = doc.splitTextToSize(statusLabel, statusColMaxW) as string[];
    doc.text(wrappedStatus.slice(0, 2), margin + contentWidth * 0.79, wrappedStatus.length > 1 ? y + 10 : y + 14);

    doc.setFont('helvetica', 'bold');
    const isInflow =
      tx.type === 'income' || tx.type === 'borrowing_in' || tx.type === 'expected_incoming';
    if (isInflow) {
      doc.setTextColor(16, 185, 129);
      doc.text(`+Rs. ${tx.amount.toLocaleString('en-IN')}`, pageWidth - margin - 8, y + 14, {
        align: 'right',
      });
    } else {
      doc.setTextColor(225, 29, 72);
      doc.text(`-Rs. ${tx.amount.toLocaleString('en-IN')}`, pageWidth - margin - 8, y + 14, {
        align: 'right',
      });
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 21, pageWidth - margin, y + 21);
    y += 21;
  });

  // Section 2: Compact 3-Column HD Proof Screenshots Grid (Minimum space, full HD zoomable image)
  if (transactionsWithProofs.length > 0) {
    y += 20;
    ensureSpace(155);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(
      `2. ATTACHED HD PROOF SCREENSHOTS & RECEIPTS (${transactionsWithProofs.length} ATTACHED — ZOOM FOR HD TEXT)`,
      margin,
      y
    );
    y += 10;

    const cols = 3;
    const gap = 10;
    const colWidth = (contentWidth - gap * (cols - 1)) / cols;
    const cardHeight = 128;

    for (let i = 0; i < transactionsWithProofs.length; i += cols) {
      ensureSpace(cardHeight + 10);
      const rowItems = transactionsWithProofs.slice(i, i + cols);

      rowItems.forEach(({ tx, dataUrl }, colIdx) => {
        const cardX = margin + colIdx * (colWidth + gap);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(cardX, y, colWidth, cardHeight, 5, 5, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(16, 185, 129);
        doc.text(`${tx.proofId || 'PRF'} | #${tx.id.slice(0, 8)}`, cardX + 6, y + 12);

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(7.2);
        const shortTitle = tx.title.length > 20 ? tx.title.slice(0, 18) + '..' : tx.title;
        doc.text(`${shortTitle} (Rs.${tx.amount.toLocaleString('en-IN')})`, cardX + 6, y + 23);

        try {
          const props = doc.getImageProperties(dataUrl);
          const maxImgW = colWidth - 12;
          const maxImgH = 92;
          const ratio = Math.min(maxImgW / props.width, maxImgH / props.height);
          const drawW = props.width * ratio;
          const drawH = props.height * ratio;
          const imgX = cardX + (colWidth - drawW) / 2;
          const imgY = y + 30 + (maxImgH - drawH) / 2;

          doc.addImage(
            dataUrl,
            detectImageFormat(dataUrl),
            imgX,
            imgY,
            drawW,
            drawH,
            undefined,
            'SLOW'
          );
        } catch {
          doc.setTextColor(225, 29, 72);
          doc.setFontSize(7);
          doc.text('Preview unavailable', cardX + 8, y + 60);
        }
      });

      y += cardHeight + 10;
    }
  }

  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `expensetracker_statement_${safePeriod}_${finalOrientation}.pdf`;
  if (triggerDownload) {
    doc.save(filename);
  }
  return {
    filename,
    recordCount: transactions.length,
    pdfRowCount: transactions.length,
    screenshotCount: transactionsWithProofs.length,
    rawPdfHeader: doc.output().slice(0, 16),
  };
}

export interface GeneratePersonBillPdfOptions {
  person: PersonProfile;
  expectedItems: ExpectedItem[];
  transactions: TransactionRecord[];
  personRecordGroups?: PersonRecordGroup[];
  currency: string;
  issuedBy: string;
  role?: 'admin' | 'user';
  headerConfig?: PdfHeaderImageConfig;
  orientation?: 'portrait' | 'landscape';
  triggerDownload?: boolean;
}

export function generatePersonBillPdf(options: GeneratePersonBillPdfOptions): {
  filename: string;
  itemCount: number;
  screenshotCount: number;
  rawPdfHeader: string;
} {
  const {
    person,
    expectedItems,
    transactions,
    personRecordGroups,
    issuedBy,
    headerConfig,
    orientation,
    triggerDownload = true,
  } = options;

  const cfg = headerConfig || loadPdfHeaderConfig();
  const finalOrientation = orientation || cfg.orientation || 'portrait';
  const doc = new jsPDF({
    orientation: finalOrientation,
    unit: 'pt',
    format: 'a4',
    compress: false,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;
  let y = 36;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 42) {
      doc.addPage();
      y = 40;
    }
  };

  // Header Banner — default height strictly for text (68pt) or user-uploaded image height
  const [r, g, b] = hexToRgbTuple(cfg.headerBgColor, [22, 45, 89]);
  const bannerHeight = getHeaderBannerHeightPt(cfg);

  doc.setFillColor(r, g, b);
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');

  const hasImg = Boolean(cfg.imageUrl || (cfg as any).dataUrl);
  const textX = hasImg && cfg.align === 'left' ? margin + (cfg.width || 90) + 16 : margin;
  const textBaseY = bannerHeight - 40;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('Expense Tracker', textX, textBaseY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('STATEMENT OF ACCOUNT & BILL', textX, textBaseY + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Issued By: ${issuedBy}   |   Date: ${new Date().toISOString().slice(0, 10)}`,
    textX,
    textBaseY + 29
  );

  // Draw Custom Header Image (No border, user-controlled height & position)
  drawCustomHeaderImage(doc, cfg, pageWidth, margin, bannerHeight);

  y = bannerHeight + 18;

  const ledger = calculatePersonLedger(
    person,
    expectedItems,
    transactions,
    personRecordGroups
  );
  const relLabel = resolveFlexibleLabel(person.relationship, person.customRelationship);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 58, 6, 6, 'FD');

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Billed To Recipient', margin + 14, y + 18);
  doc.text('Total Billed / Lent', margin + contentWidth * 0.3, y + 18);
  doc.text('Total Settled', margin + contentWidth * 0.56, y + 18);
  doc.text('Net Payable Balance', margin + contentWidth * 0.78, y + 18);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text(`${person.name}`, margin + 14, y + 35);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(relLabel, margin + 14, y + 48);

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Rs. ${ledger.totalExpectingFromPerson.toLocaleString('en-IN')}`,
    margin + contentWidth * 0.3,
    y + 36
  );

  doc.setTextColor(16, 185, 129);
  doc.text(
    `Rs. ${ledger.totalSettledByPerson.toLocaleString('en-IN')}`,
    margin + contentWidth * 0.56,
    y + 36
  );

  doc.setTextColor(225, 29, 72);
  doc.text(
    `Rs. ${ledger.netReceivable.toLocaleString('en-IN')}`,
    margin + contentWidth * 0.78,
    y + 36
  );

  y += 76;

  // Itemized Table
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('1. ITEMIZED BILL & LINKED RECORDS (WITH RECORD ID & PROOF ID)', margin, y);
  y += 10;

  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y, contentWidth, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text('RECORD ID', margin + 8, y + 14);
  doc.text('PROOF ID', margin + contentWidth * 0.16, y + 14);
  doc.text('DATE', margin + contentWidth * 0.3, y + 14);
  doc.text('TITLE / DESCRIPTION', margin + contentWidth * 0.42, y + 14);
  doc.text('STATUS', margin + contentWidth * 0.72, y + 14);
  doc.text('AMOUNT', pageWidth - margin - 8, y + 14, { align: 'right' });
  y += 22;

  const standaloneExpected = ledger.items;

  standaloneExpected.forEach((exp, idx) => {
    ensureSpace(24);
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 21, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`#${exp.id.slice(0, 10)}`, margin + 8, y + 14);
    doc.setTextColor(exp.proofId ? 16 : 148, exp.proofId ? 185 : 163, exp.proofId ? 129 : 184);
    doc.text(exp.proofId || 'SCHEDULED', margin + contentWidth * 0.16, y + 14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(exp.dueDate, margin + contentWidth * 0.3, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(exp.title.slice(0, 28), margin + contentWidth * 0.42, y + 14);
    const statusLabel = formatStatusDisplayLabel(exp.status);
    doc.setTextColor(
      statusLabel.startsWith('PENDING') ? 217 : 71,
      statusLabel.startsWith('PENDING') ? 119 : 85,
      statusLabel.startsWith('PENDING') ? 6 : 105
    );
    const expStatusWrapped = doc.splitTextToSize(statusLabel, contentWidth * 0.13) as string[];
    doc.text(expStatusWrapped.slice(0, 2), margin + contentWidth * 0.72, expStatusWrapped.length > 1 ? y + 10 : y + 14);
    doc.setTextColor(225, 29, 72);
    doc.text(`Rs. ${exp.amount.toLocaleString('en-IN')}`, pageWidth - margin - 8, y + 14, {
      align: 'right',
    });
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 21, pageWidth - margin, y + 21);
    y += 21;
  });

  ledger.linkedTransactions.forEach((tx, idx) => {
    ensureSpace(24);
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 21, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`#${tx.id.slice(0, 10)}`, margin + 8, y + 14);

    if (tx.proofId) {
      doc.setTextColor(16, 185, 129);
      doc.text(tx.proofId, margin + contentWidth * 0.16, y + 14);
    } else {
      doc.setTextColor(148, 163, 184);
      doc.text('—', margin + contentWidth * 0.16, y + 14);
    }

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(tx.date, margin + contentWidth * 0.3, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    const maxLen = finalOrientation === 'landscape' ? 40 : 28;
    doc.text(tx.title.slice(0, maxLen), margin + contentWidth * 0.42, y + 14);

    const statusLabel = formatStatusDisplayLabel(tx.status);
    if (statusLabel.startsWith('PENDING')) {
      doc.setTextColor(217, 119, 6);
    } else {
      doc.setTextColor(71, 85, 105);
    }
    const txStatusWrapped = doc.splitTextToSize(statusLabel, contentWidth * 0.13) as string[];
    doc.text(txStatusWrapped.slice(0, 2), margin + contentWidth * 0.72, txStatusWrapped.length > 1 ? y + 10 : y + 14);

    doc.setTextColor(225, 29, 72);
    doc.text(`Rs. ${tx.amount.toLocaleString('en-IN')}`, pageWidth - margin - 8, y + 14, {
      align: 'right',
    });

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 21, pageWidth - margin, y + 21);
    y += 21;
  });

  // Section 2: Compact 3-Column HD Proof Screenshots Grid
  const proofs = ledger.linkedTransactions
    .map((tx) => ({
      tx,
      dataUrl: tx.proofImageDataUrl || loadProofImageLocally(tx.proofId),
    }))
    .filter((item): item is { tx: TransactionRecord; dataUrl: string } => Boolean(item.dataUrl));

  if (proofs.length > 0) {
    y += 20;
    ensureSpace(155);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(
      `2. ATTACHED HD PROOF SCREENSHOTS (${proofs.length} ATTACHED — ZOOM FOR HD TEXT)`,
      margin,
      y
    );
    y += 10;

    const cols = 3;
    const gap = 10;
    const colWidth = (contentWidth - gap * (cols - 1)) / cols;
    const cardHeight = 128;

    for (let i = 0; i < proofs.length; i += cols) {
      ensureSpace(cardHeight + 10);
      const rowItems = proofs.slice(i, i + cols);

      rowItems.forEach(({ tx, dataUrl }, colIdx) => {
        const cardX = margin + colIdx * (colWidth + gap);

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(cardX, y, colWidth, cardHeight, 5, 5, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(16, 185, 129);
        doc.text(`${tx.proofId || 'PRF'} | #${tx.id.slice(0, 8)}`, cardX + 6, y + 12);

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(7.2);
        const shortTitle = tx.title.length > 20 ? tx.title.slice(0, 18) + '..' : tx.title;
        doc.text(`${shortTitle} (Rs.${tx.amount.toLocaleString('en-IN')})`, cardX + 6, y + 23);

        try {
          const props = doc.getImageProperties(dataUrl);
          const maxImgW = colWidth - 12;
          const maxImgH = 92;
          const ratio = Math.min(maxImgW / props.width, maxImgH / props.height);
          const drawW = props.width * ratio;
          const drawH = props.height * ratio;
          const imgX = cardX + (colWidth - drawW) / 2;
          const imgY = y + 30 + (maxImgH - drawH) / 2;

          doc.addImage(
            dataUrl,
            detectImageFormat(dataUrl),
            imgX,
            imgY,
            drawW,
            drawH,
            undefined,
            'SLOW'
          );
        } catch {
          doc.setTextColor(225, 29, 72);
          doc.setFontSize(7);
          doc.text('Preview unavailable', cardX + 8, y + 60);
        }
      });

      y += cardHeight + 10;
    }
  }

  const safeName = person.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filename = `expensetracker_bill_${safeName}_${finalOrientation}.pdf`;
  if (triggerDownload) {
    doc.save(filename);
  }
  return {
    filename,
    itemCount: standaloneExpected.length + ledger.linkedTransactions.length,
    screenshotCount: proofs.length,
    rawPdfHeader: doc.output().slice(0, 16),
  };
}

export interface ExportLedgerRecordsExcelOptions {
  transactions: TransactionRecord[];
  accounts: WalletAccount[];
  people?: PersonProfile[];
  currency: string;
  issuedBy: string;
  periodLabel: string;
}

export function exportLedgerRecordsToExcel(options: ExportLedgerRecordsExcelOptions): string {
  const { transactions, accounts, issuedBy, periodLabel } = options;
  const getAccountName = (accId: string) =>
    accounts.find((a) => a.id === accId)?.name || 'Primary Account';

  const header = [
    'Record ID',
    'Proof ID',
    'Date',
    'Title',
    'Category',
    'Account',
    'Status',
    'Type',
    'Amount',
  ].join('\t');

  const rows = transactions.map((tx) =>
    [
      tx.id,
      tx.proofId || 'NONE',
      tx.date,
      tx.title.replace(/\t/g, ' '),
      resolveFlexibleLabel(tx.category, tx.customCategory),
      getAccountName(tx.accountId),
      formatStatusDisplayLabel(tx.status),
      tx.type,
      tx.amount.toFixed(2),
    ].join('\t')
  );

  const content = [
    `ExpenseTracker Statement - Account Holder: ${issuedBy} - Period: ${periodLabel}`,
    header,
    ...rows,
  ].join('\n');

  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `expensetracker_records_${safePeriod}.xls`;
  downloadLocalFile(filename, content, 'application/vnd.ms-excel');
  return filename;
}

export interface ExportPersonBillExcelOptions {
  person: PersonProfile;
  expectedItems: ExpectedItem[];
  transactions: TransactionRecord[];
  personRecordGroups?: PersonRecordGroup[];
  currency: string;
  issuedBy: string;
}

export function exportPersonBillToExcel(options: ExportPersonBillExcelOptions): string {
  const { person, expectedItems, transactions, personRecordGroups, issuedBy } = options;
  const ledger = calculatePersonLedger(
    person,
    expectedItems,
    transactions,
    personRecordGroups
  );

  const header = ['Record ID', 'Proof ID', 'Date', 'Description', 'Status', 'Amount'].join('\t');
  const rows: string[] = [];

  ledger.items.forEach((exp) => {
    rows.push(
      [
        exp.id,
        exp.proofId || 'SCHEDULED',
        exp.dueDate,
        exp.title.replace(/\t/g, ' '),
        formatStatusDisplayLabel(exp.status),
        exp.amount.toFixed(2),
      ].join('\t')
    );
  });

  ledger.linkedTransactions.forEach((tx) => {
    rows.push(
      [
        tx.id,
        tx.proofId || 'NONE',
        tx.date,
        tx.title.replace(/\t/g, ' '),
        formatStatusDisplayLabel(tx.status),
        tx.amount.toFixed(2),
      ].join('\t')
    );
  });

  const content = [
    `ExpenseTracker Bill For: ${person.name} - Issued By: ${issuedBy}`,
    header,
    ...rows,
  ].join('\n');

  const safeName = person.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const filename = `expensetracker_bill_${safeName}.xls`;
  downloadLocalFile(filename, content, 'application/vnd.ms-excel');
  return filename;
}
