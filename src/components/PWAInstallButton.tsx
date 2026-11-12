import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Share, PlusSquare, X, CheckCircle2, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../utils/usePWAInstall';
import {
  EXPENSE_TRACKER_SQUARE_ICON,
  EXPENSE_TRACKER_FULL_LOGO,
  EXPENSE_TRACKER_FULL_LOGO_DARK,
} from '../utils/bankLogos';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (!accepted) {
        setShowGuideModal(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        data-testid="pwa-install-app-btn"
        title="Install ExpenseTracker as an App with Website Symbol"
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-extrabold transition-colors cursor-pointer shrink-0 ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
        }`}
      >
        <img
          src={EXPENSE_TRACKER_SQUARE_ICON}
          alt="ExpenseTracker App Symbol"
          className="w-4 h-4 object-contain rounded-xs shrink-0"
        />
        <Download className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0 hidden sm:inline" />
        <span className="whitespace-nowrap">Install App</span>
      </button>

      {showGuideModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-modal-title"
          >
            {/* Proper Compact App-Sized Centered Modal (max-w-sm) with Centered ExpenseTracker Brand Symbols */}
            <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-fade-up relative">
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Close Install Guide"
                className="absolute top-3.5 right-3.5 z-10 p-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Centered Header Banner with Official Symbols */}
              <div className="px-6 pt-6 pb-5 bg-gradient-to-b from-emerald-600 to-emerald-700 text-white flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-white p-2 shadow-lg flex items-center justify-center mb-3">
                  <img
                    src={EXPENSE_TRACKER_SQUARE_ICON}
                    alt="ExpenseTracker App Icon"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="bg-white/95 dark:bg-slate-950/90 px-4 py-1.5 rounded-xl shadow-xs mb-2 flex items-center justify-center">
                  <img
                    src={EXPENSE_TRACKER_FULL_LOGO}
                    alt="ExpenseTracker"
                    className="h-5 w-auto object-contain block dark:hidden"
                  />
                  <img
                    src={EXPENSE_TRACKER_FULL_LOGO_DARK}
                    alt="ExpenseTracker"
                    className="h-5 w-auto object-contain hidden dark:block"
                  />
                </div>
                <h3
                  id="pwa-install-modal-title"
                  className="text-base font-extrabold tracking-tight text-center"
                >
                  ExpenseTracker Mobile &amp; Desktop App
                </h3>
                <p className="text-[11px] text-emerald-100 font-semibold mt-0.5">
                  Full-Screen Standalone App · Mobile PIN Ready
                </p>
              </div>

              <div className="p-5 space-y-4 text-xs text-slate-700 dark:text-slate-300 text-center">
                {isInstallable && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await install();
                      if (ok) setShowGuideModal(false);
                    }}
                    className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Install ExpenseTracker App Now</span>
                  </button>
                )}

                <p className="font-medium leading-relaxed text-center">
                  Install <strong>ExpenseTracker</strong> at the center of your home screen to open
                  it in proper native app size with <strong>Mobile PIN</strong>{' '}
                  login:
                </p>

                {isIOS ? (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-left">
                    <div className="font-extrabold text-slate-900 dark:text-white text-center">
                      iPhone / iPad (Safari):
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Share className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        1. Tap the <strong>Share</strong> button in your browser bar.
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <PlusSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        2. Tap <strong>&ldquo;Add to Home Screen&rdquo;</strong> →{' '}
                        <strong>Add</strong>.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5 text-left">
                    <div className="font-extrabold text-slate-900 dark:text-white text-center flex items-center justify-center gap-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                      <span>Android / Chrome / Desktop App:</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Download className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        1. Tap the browser menu (<strong>⋮</strong>) at the top-right.
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        2. Tap <strong>&ldquo;Install app&rdquo;</strong> or{' '}
                        <strong>&ldquo;Add to Home screen&rdquo;</strong> to launch ExpenseTracker
                        centered in full-screen app size.
                      </span>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowGuideModal(false)}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
