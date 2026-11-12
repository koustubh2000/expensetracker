import React, { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  FileText,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  X,
} from 'lucide-react';
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
} from '../utils/financeRules';
import {
  loadPdfHeaderConfig,
  loadProofImageLocally,
  savePdfHeaderConfig,
} from '../utils/localVaultStorage';
import {
  generateLedgerRecordsPdf,
  generatePersonBillPdf,
  getHeaderBannerHeightPt,
} from '../utils/pdfExporter';

export interface PdfPreviewModalProps {
  isOpen?: boolean;
  onClose: () => void;
  mode: 'records' | 'person_bill' | 'bill';
  currency?: string;
  issuedBy?: string;
  userName?: string;
  role?: 'admin' | 'user';
  roleLabel?: string;
  headerConfig?: PdfHeaderImageConfig;
  headerImageConfig?: PdfHeaderImageConfig;
  periodLabel?: string;
  selectedMonth?: string;
  transactions: TransactionRecord[];
  accounts?: WalletAccount[];
  people?: PersonProfile[];
  person?: PersonProfile;
  expectedItems?: ExpectedItem[];
  personRecordGroups?: PersonRecordGroup[];
  onHeaderConfigChange?: (config: PdfHeaderImageConfig) => void;
  onDownloadPdf?: (orientation: 'portrait' | 'landscape', updatedConfig?: PdfHeaderImageConfig) => void;
  onDownloadExcel?: () => void;
  onDownloaded?: () => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  isOpen = true,
  onClose,
  mode,
  issuedBy,
  userName,
  role = 'user',
  roleLabel,
  headerConfig,
  headerImageConfig,
  periodLabel,
  selectedMonth,
  transactions,
  accounts = [],
  person,
  expectedItems = [],
  personRecordGroups = [],
  onHeaderConfigChange,
  onDownloadPdf,
  onDownloadExcel,
  onDownloaded,
}) => {
  const baseCfg = headerConfig || headerImageConfig || loadPdfHeaderConfig();
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(
    baseCfg.orientation || 'portrait'
  );
  const [selectedBgColor, setSelectedBgColor] = useState<string>(
    baseCfg.headerBgColor || '#162d59'
  );

  React.useEffect(() => {
    const fresh = headerConfig || headerImageConfig || loadPdfHeaderConfig();
    if (fresh.headerBgColor) {
      setSelectedBgColor(fresh.headerBgColor);
    }
  }, [headerConfig, headerImageConfig]);

  if (!isOpen) return null;

  const cfg: PdfHeaderImageConfig = {
    ...baseCfg,
    orientation,
    headerBgColor: selectedBgColor || baseCfg.headerBgColor || '#162d59',
  };

  const handleBgColorChange = (newHex: string) => {
    setSelectedBgColor(newHex);
    const updatedCfg: PdfHeaderImageConfig = {
      ...cfg,
      headerBgColor: newHex,
    };
    savePdfHeaderConfig(updatedCfg);
    if (onHeaderConfigChange) {
      onHeaderConfigChange(updatedCfg);
    }
  };

  const isRecordsMode = mode === 'records';
  const issuerDisplay = issuedBy || userName || 'Account Holder';
  const periodDisplay = periodLabel || selectedMonth || 'All Time';
  const isAdmin = role === 'admin' || (roleLabel || '').toLowerCase().includes('admin');
  const displayRole = roleLabel || (isAdmin ? 'Admin Portal' : 'Customer Portal');

  const getAccountName = (accId: string) =>
    accounts.find((a) => a.id === accId)?.name || 'Primary Account';

  const totalIncome = transactions
    .filter(
      (t) =>
        t.type === 'income' || t.type === 'borrowing_in' || t.type === 'expected_incoming'
    )
    .reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = transactions
    .filter(
      (t) =>
        t.type === 'expense' || t.type === 'lending_out' || t.type === 'dream_investment'
    )
    .reduce((acc, t) => acc + t.amount, 0);

  const personLedger = person
    ? calculatePersonLedger(person, expectedItems, transactions, personRecordGroups)
    : null;

  const activeTransactionsForProofs =
    !isRecordsMode && personLedger ? personLedger.linkedTransactions : transactions;

  const transactionsWithProofs = activeTransactionsForProofs
    .map((tx) => ({
      tx,
      dataUrl: tx.proofImageDataUrl || loadProofImageLocally(tx.proofId),
    }))
    .filter((item): item is { tx: TransactionRecord; dataUrl: string } => Boolean(item.dataUrl));

  const handleDownloadClick = () => {
    savePdfHeaderConfig(cfg);
    if (onHeaderConfigChange) {
      onHeaderConfigChange(cfg);
    }
    if (onDownloadPdf) {
      onDownloadPdf(orientation, cfg);
    } else if (isRecordsMode) {
      generateLedgerRecordsPdf({
        transactions,
        accounts,
        currency: '₹',
        issuedBy: issuerDisplay,
        role: isAdmin ? 'admin' : 'user',
        periodLabel: periodDisplay,
        headerConfig: cfg,
        orientation,
        triggerDownload: true,
      });
    } else if (person) {
      generatePersonBillPdf({
        person,
        expectedItems,
        transactions,
        personRecordGroups,
        currency: '₹',
        issuedBy: issuerDisplay,
        role: isAdmin ? 'admin' : 'user',
        headerConfig: cfg,
        orientation,
        triggerDownload: true,
      });
    }
    if (onDownloaded) {
      onDownloaded();
    }
  };

  // Exact A4 point dimensions matching jsPDF
  const pageWidthPt = orientation === 'portrait' ? 595.28 : 841.89;
  const pageMinHeightPt = orientation === 'portrait' ? 841.89 : 595.28;
  const marginPt = 36;
  const imgUrl = cfg.imageUrl || (cfg as any).dataUrl;
  const hasImg = Boolean(imgUrl);
  const imgW = Math.max(24, Math.min(pageWidthPt - marginPt * 2, cfg.width || 110));
  const imgH = Math.max(24, cfg.height || 68);
  const bannerHeightPt = getHeaderBannerHeightPt(cfg);

  let imgLeftPt = pageWidthPt - marginPt - imgW;
  if (cfg.align === 'left') {
    imgLeftPt = marginPt;
  } else if (cfg.align === 'center') {
    imgLeftPt = (pageWidthPt - imgW) / 2;
  }
  imgLeftPt = Math.max(0, Math.min(pageWidthPt - imgW, imgLeftPt + (cfg.offsetX || 0)));
  const imgTopPt = Math.max(0, Math.max(0, bannerHeightPt - imgH) + (cfg.offsetY || 0));

  const textLeftPt = hasImg && cfg.align === 'left' ? marginPt + imgW + 16 : marginPt;
  const bannerBgHex = cfg.headerBgColor || (isAdmin ? '#e11d48' : '#162d59');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="A4 HD Print Preview"
    >
      <div className="w-full max-w-5xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                A4 HD Print Preview
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                  <Sparkles className="w-3 h-3" /> 1:1 Exact PDF Match
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Preview matches the downloaded A4 PDF header, margins (36pt), and background color.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Header Background Color Selector (Auto-Saved for PDF Export) */}
            <label
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
              title="Select & Save PDF Header Background Color"
            >
              <span>PDF BG:</span>
              <input
                type="color"
                value={bannerBgHex}
                onChange={(e) => handleBgColorChange(e.target.value)}
                aria-label="Select PDF Header Background Color"
                className="w-6 h-5 rounded cursor-pointer border-0 bg-transparent p-0"
              />
            </label>

            {/* Orientation Toggle */}
            <div className="inline-flex rounded-xl bg-slate-200/80 p-1 border border-slate-300">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  orientation === 'portrait'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <RectangleVertical className="w-3.5 h-3.5 text-emerald-600" />
                Portrait (A4)
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  orientation === 'landscape'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <RectangleHorizontal className="w-3.5 h-3.5 text-emerald-600" />
                Landscape (A4)
              </button>
            </div>

            {onDownloadExcel && (
              <button
                type="button"
                onClick={onDownloadExcel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-sm transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export Excel (.xls)
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadClick}
              data-testid="modal-download-hd-pdf-btn"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Download HD PDF
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Preview"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable A4 Sheet Canvas */}
        <div className="flex-1 overflow-auto bg-slate-200/70 p-4 sm:p-8 flex justify-center items-start">
          <div
            style={{
              width: `${pageWidthPt}px`,
              minHeight: `${pageMinHeightPt}px`,
            }}
            className="bg-white shadow-xl border border-slate-300 text-slate-900 shrink-0 transition-all duration-200 flex flex-col justify-between"
          >
            <div>
              {/* 1:1 Exact PDF Header Banner */}
              <div
                style={{
                  height: `${bannerHeightPt}px`,
                  backgroundColor: bannerBgHex,
                }}
                className="relative w-full overflow-hidden text-white"
              >
                <div
                  style={{
                    left: `${textLeftPt}px`,
                    bottom: '10px',
                  }}
                  className="absolute z-10 pr-4"
                >
                  <h1 className="text-[20px] font-black tracking-tight leading-tight">
                    Expense Tracker
                  </h1>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/95 mt-0.5">
                    {isRecordsMode
                      ? 'HD LEDGER STATEMENT & PROOF REPORT'
                      : 'STATEMENT OF ACCOUNT & BILL'}
                  </p>
                  <p className="text-[9px] text-white/90 mt-1">
                    {isRecordsMode
                      ? `Account Holder: ${issuerDisplay} (${displayRole})   |   Period: ${periodDisplay}   |   Date: ${new Date()
                          .toISOString()
                          .slice(0, 10)}`
                      : `Issued By: ${issuerDisplay}   |   Date: ${new Date()
                          .toISOString()
                          .slice(0, 10)}`}
                  </p>
                </div>

                {hasImg && imgUrl && (
                  <img
                    src={imgUrl}
                    alt="Header Visual"
                    style={{
                      width: `${imgW}px`,
                      height: `${imgH}px`,
                      left: `${imgLeftPt}px`,
                      top: `${imgTopPt}px`,
                      objectFit: 'contain',
                    }}
                    className="absolute pointer-events-none select-none"
                  />
                )}
              </div>

              {/* A4 Margin Body (36pt exact match with jsPDF margin = 36) */}
              <div style={{ padding: `${marginPt}px` }} className="space-y-5">
                {/* Summary Box */}
                {isRecordsMode ? (
                  <div className="rounded-xl bg-slate-50 border border-slate-300 p-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        Total Records: {transactions.length}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Attached Proof Screenshots: {transactionsWithProofs.length} &nbsp;|&nbsp; Net
                        Period Cashflow:{' '}
                        <span className="font-mono font-bold">
                          {totalIncome - totalExpense >= 0 ? '+' : '-'}Rs.{' '}
                          {Math.abs(totalIncome - totalExpense).toLocaleString('en-IN')}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-6">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">
                          Total Inflow
                        </span>
                        <span className="text-sm font-mono font-bold text-emerald-600">
                          +Rs. {totalIncome.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">
                          Total Outflow
                        </span>
                        <span className="text-sm font-mono font-bold text-rose-600">
                          -Rs. {totalExpense.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  person &&
                  personLedger && (
                    <div className="rounded-xl bg-slate-50 border border-slate-300 p-4 grid grid-cols-4 gap-4">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">
                          Billed To Recipient
                        </span>
                        <span className="text-sm font-bold text-slate-900 block mt-0.5">
                          {person.name}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {resolveFlexibleLabel(person.relationship, person.customRelationship)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">
                          Total Billed / Lent
                        </span>
                        <span className="text-sm font-mono font-bold text-slate-900 block mt-1">
                          Rs. {personLedger.totalExpectingFromPerson.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">
                          Total Settled
                        </span>
                        <span className="text-sm font-mono font-bold text-emerald-600 block mt-1">
                          Rs. {personLedger.totalSettledByPerson.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">
                          Net Payable Balance
                        </span>
                        <span className="text-sm font-mono font-bold text-rose-600 block mt-1">
                          Rs. {personLedger.netReceivable.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  )
                )}

                {/* Section 1: Itemized Table */}
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-2">
                    {isRecordsMode
                      ? '1. ITEMIZED TRANSACTION RECORDS (WITH RECORD ID & PROOF ID)'
                      : '1. ITEMIZED BILL & LINKED RECORDS (WITH RECORD ID & PROOF ID)'}
                  </h2>
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white text-[10px] uppercase tracking-wider">
                          <th className="py-2 px-2.5 font-bold">Record ID</th>
                          <th className="py-2 px-2.5 font-bold">Proof ID</th>
                          <th className="py-2 px-2.5 font-bold">Date</th>
                          <th className="py-2 px-2.5 font-bold">Title / Description</th>
                          {isRecordsMode && (
                            <th className="py-2 px-2.5 font-bold">Category & Account</th>
                          )}
                          <th className="py-2 px-2.5 font-bold">Status</th>
                          <th className="py-2 px-2.5 font-bold text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-[11px]">
                        {!isRecordsMode &&
                          personLedger &&
                          personLedger.items.map((exp) => {
                            const statusLabel = formatStatusDisplayLabel(exp.status);
                            return (
                              <tr key={exp.id} className="bg-amber-50/40">
                                <td className="py-2 px-2.5 font-mono font-bold text-slate-700">
                                  #{exp.id.slice(0, 10)}
                                </td>
                                <td className="py-2 px-2.5 font-mono text-amber-700 font-bold">
                                  {exp.proofId || 'SCHEDULED'}
                                </td>
                                <td className="py-2 px-2.5 text-slate-600">{exp.dueDate}</td>
                                <td className="py-2 px-2.5 font-bold text-slate-900">
                                  {exp.title}
                                </td>
                                <td className="py-2 px-2.5 uppercase font-bold text-amber-700">
                                  {statusLabel}
                                </td>
                                <td className="py-2 px-2.5 font-mono font-bold text-right text-rose-600">
                                  Rs. {exp.amount.toLocaleString('en-IN')}
                                </td>
                              </tr>
                            );
                          })}
                        {(isRecordsMode
                          ? transactions
                          : personLedger?.linkedTransactions || []
                        ).map((tx, idx) => {
                          const statusLabel = formatStatusDisplayLabel(tx.status);
                          const isInflow =
                            tx.type === 'income' ||
                            tx.type === 'borrowing_in' ||
                            tx.type === 'expected_incoming';
                          return (
                            <tr
                              key={tx.id}
                              className={idx % 2 === 0 ? 'bg-slate-50/80' : 'bg-white'}
                            >
                              <td className="py-2 px-2.5 font-mono font-bold text-slate-700">
                                #{tx.id.slice(0, 10)}
                              </td>
                              <td className="py-2 px-2.5 font-mono font-bold">
                                {tx.proofId ? (
                                  <span className="text-emerald-600">{tx.proofId}</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-2 px-2.5 text-slate-600">{tx.date}</td>
                              <td className="py-2 px-2.5 font-bold text-slate-900">{tx.title}</td>
                              {isRecordsMode && (
                                <td className="py-2 px-2.5 text-slate-600">
                                  {resolveFlexibleLabel(tx.category, tx.customCategory)} |{' '}
                                  {getAccountName(tx.accountId)}
                                </td>
                              )}
                              <td className="py-2 px-2.5 uppercase font-bold whitespace-normal break-words max-w-[96px]">
                                <span
                                  className={
                                    statusLabel.startsWith('PENDING')
                                      ? 'text-amber-600'
                                      : 'text-slate-600'
                                  }
                                >
                                  {statusLabel}
                                </span>
                              </td>
                              <td
                                className={`py-2 px-2.5 font-mono font-bold text-right ${
                                  isRecordsMode && isInflow ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                              >
                                {isRecordsMode ? (isInflow ? '+' : '-') : ''}Rs.{' '}
                                {tx.amount.toLocaleString('en-IN')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Section 2: Compact 3-Column HD Proof Screenshots Grid */}
                {transactionsWithProofs.length > 0 && (
                  <div className="pt-1">
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-2.5">
                      2. ATTACHED HD PROOF SCREENSHOTS & RECEIPTS ({transactionsWithProofs.length}{' '}
                      ATTACHED — ZOOM FOR HD TEXT)
                    </h2>
                    <div className="grid grid-cols-3 gap-3">
                      {transactionsWithProofs.map(({ tx, dataUrl }) => (
                        <div
                          key={tx.id}
                          className="rounded-lg bg-slate-50 border border-slate-300 p-2.5 flex flex-col justify-between"
                        >
                          <div className="mb-1.5">
                            <p className="text-[9px] font-mono font-bold text-emerald-700 truncate">
                              {tx.proofId || 'PRF'} | #{tx.id.slice(0, 8)}
                            </p>
                            <p className="text-[10px] font-bold text-slate-900 truncate mt-0.5">
                              {tx.title} — Rs. {tx.amount.toLocaleString('en-IN')}
                            </p>
                          </div>
                          <div className="bg-white rounded border border-slate-200 p-1.5 flex justify-center items-center h-28 overflow-hidden">
                            <img
                              src={dataUrl}
                              alt={tx.title}
                              className="max-h-full w-auto object-contain"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* A4 Page Footer */}
            <div className="px-8 py-3 border-t border-slate-200 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Expense Tracker • High-Definition A4 Financial Statement</span>
              <span>Orientation: {orientation.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
