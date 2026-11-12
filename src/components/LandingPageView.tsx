import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Award,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  LogIn,
  Moon,
  PiggyBank,
  PieChart,
  Sparkles,
  Sun,
  UserCheck,
  UserPlus,
  Vault,
  Zap,
} from 'lucide-react';
import {
  EXPENSE_TRACKER_SQUARE_ICON,
  EXPENSE_TRACKER_FULL_LOGO,
  EXPENSE_TRACKER_FULL_LOGO_DARK,
} from '../utils/bankLogos';
import { parseHeroImagesPayload } from '../utils/localVaultStorage';
import { PWAInstallButton } from './PWAInstallButton';

interface LandingPageViewProps {
  darkMode: boolean;
  onSetDarkMode: (dark: boolean) => void;
  customHeroImageUrl: string | null;
  onStartApp: (initialMode: 'login' | 'register') => void;
}

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  darkMode,
  onSetDarkMode,
  customHeroImageUrl,
  onStartApp,
}) => {
  const heroPhotos = parseHeroImagesPayload(customHeroImageUrl);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);

  useEffect(() => {
    if (heroPhotos.length <= 1) {
      setActiveSlideIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setActiveSlideIndex((prev) => (prev + 1) % heroPhotos.length);
    }, 3600);
    return () => clearInterval(timer);
  }, [heroPhotos.length]);

  const safeSlideIndex = heroPhotos.length > 0 ? activeSlideIndex % heroPhotos.length : 0;

  return (
    <div
      className={`min-h-screen overflow-x-hidden transition-colors duration-300 ${
        darkMode ? 'bg-slate-950 text-slate-50' : 'bg-slate-50/60 text-slate-900'
      }`}
    >
      {/* STICKY HEADER WITH MINIMAL MOON/SUN ICON TOGGLE, PWA INSTALL & LOGIN + REGISTER BUTTONS */}
      <header
        className={`sticky top-0 z-40 backdrop-blur-md border-b transition-colors ${
          darkMode
            ? 'bg-slate-950/85 border-slate-800'
            : 'bg-white/95 border-slate-200 shadow-xs'
        }`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand Title with Official Transparent PNG Symbols */}
          <div className="flex items-center gap-2 sm:gap-3 select-none shrink-0 min-w-0">
            <img
              src={EXPENSE_TRACKER_SQUARE_ICON}
              alt="ExpenseTracker Icon"
              className="w-8 h-8 sm:w-10 sm:h-10 object-contain drop-shadow-xs shrink-0"
            />
            <img
              src={darkMode ? EXPENSE_TRACKER_FULL_LOGO_DARK : EXPENSE_TRACKER_FULL_LOGO}
              alt="ExpenseTracker"
              className="h-6 sm:h-8 w-auto max-w-[130px] sm:max-w-none object-contain block shrink-0"
            />
          </div>

          {/* Right Controls: Install App + Minimal Moon/Sun Symbol Toggle + Login & Register Buttons */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 shrink-0">
            <PWAInstallButton compact />

            <button
              type="button"
              onClick={() => onSetDarkMode(!darkMode)}
              aria-label={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center border transition cursor-pointer shrink-0 ${
                darkMode
                  ? 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200/80'
              }`}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Login Button */}
            <button
              type="button"
              onClick={() => onStartApp('login')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-xl shadow-md shadow-emerald-600/20 hover:scale-105 active:scale-95 transition flex items-center gap-1 sm:gap-1.5 cursor-pointer shrink-0"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Login</span>
            </button>

            <button
              type="button"
              onClick={() => onStartApp('register')}
              className="shimmer-btn bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 font-extrabold text-xs sm:text-sm px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-xl shadow-md hover:scale-105 active:scale-95 transition flex items-center gap-1 sm:gap-1.5 cursor-pointer shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 hidden sm:inline shrink-0" />
              <span>Register</span>
            </button>
          </div>
        </div>
      </header>

      {/* 3. HERO FRONT PAGE WITH BANNERS & ANIMATED MULTI-PHOTO SCROLLING HERO BANNER */}
      <section className="relative z-10 pt-8 pb-16 lg:py-16 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            {/* Left Column: Hero Copy & Clickable CTA Buttons */}
            <div className="lg:col-span-6 space-y-6 text-center lg:text-left animate-fade-up">
              <div className="inline-flex flex-wrap items-center justify-center lg:justify-start gap-2">
                <span className="px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <PiggyBank className="w-3.5 h-3.5" /> Save Money
                </span>
                <span className="px-3.5 py-1.5 rounded-full bg-slate-200/80 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> Track Money
                </span>
                <span className="px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase tracking-wider">
                  🇮🇳 Family Smart Guide
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="font-extrabold text-4xl sm:text-6xl tracking-tight leading-[1.08]">
                  Your Expense{' '}
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Tracker
                  </span>
                </h1>
                <div className="inline-block">
                  <p className="font-extrabold text-2xl sm:text-4xl text-slate-700 dark:text-slate-200 tracking-tight">
                    “Penny penny makes many.”
                  </p>
                  <div className="h-1.5 w-full bg-emerald-600 rounded-full mt-1.5" />
                </div>
              </div>

              <p
                className={`text-base sm:text-lg max-w-xl mx-auto lg:mx-0 leading-relaxed font-medium ${
                  darkMode ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Little savings every single day build your family&apos;s biggest milestones!
                Discover a complete all-in-one expense companion designed for{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">Dream Money goals</strong>,{' '}
                <strong className="text-slate-900 dark:text-white">
                  Expense Records with Image proof
                </strong>
                , and{' '}
                <strong className="text-emerald-700 dark:text-emerald-300">
                  Pending Money Bills with ready-made Info Titles
                </strong>
                .
              </p>

              {/* 3 Info Highlight Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div
                  className={`info-hover-card rounded-2xl p-3.5 flex items-center gap-3 border ${
                    darkMode
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Vault className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-xs sm:text-sm">Dream Money</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Milestone Vaults</p>
                  </div>
                </div>

                <div
                  className={`info-hover-card rounded-2xl p-3.5 flex items-center gap-3 border ${
                    darkMode
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
                    <Camera className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-xs sm:text-sm">Photo Records</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Bills with Image</p>
                  </div>
                </div>

                <div
                  className={`info-hover-card rounded-2xl p-3.5 flex items-center gap-3 border ${
                    darkMode
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-xs sm:text-sm">Pending Bills</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Smart Info Titles</p>
                  </div>
                </div>
              </div>

              {/* MAIN CTA BUTTONS — PROCEEDS DIRECTLY TO EXPENSETRACKER LOGIN / REGISTER */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-3">
                <button
                  type="button"
                  onClick={() => onStartApp('login')}
                  className="shimmer-btn w-full sm:w-auto px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-base sm:text-lg shadow-lg shadow-emerald-600/25 hover:scale-105 active:scale-95 transition flex items-center justify-center gap-3 group cursor-pointer"
                >
                  <span>Click Here to Start</span>
                  <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center group-hover:translate-x-1 transition-transform">
                    <ArrowRight className="w-4 h-4" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onStartApp('register')}
                  className={`w-full sm:w-auto px-7 py-4 rounded-2xl border border-slate-300 dark:border-slate-700 hover:border-emerald-600 font-extrabold text-base sm:text-lg hover:scale-105 active:scale-95 transition flex items-center justify-center gap-2.5 cursor-pointer ${
                    darkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-900 shadow-xs'
                  }`}
                >
                  <UserCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Register Now</span>
                </button>
              </div>
            </div>

            {/* Right Column: Animated Multi-Photo Scrolling Hero Banner & Carousel */}
            <div className="lg:col-span-6 relative">
              <div className="absolute -inset-4 bg-emerald-500/10 rounded-3xl blur-2xl -z-10" />

              <div
                className={`rounded-3xl p-3 sm:p-4 border border-slate-200 dark:border-slate-800 relative shadow-xl ${
                  darkMode ? 'bg-slate-900' : 'bg-white'
                }`}
              >
                {/* Top Advertising Ribbon */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white border border-slate-700 font-extrabold text-[11px] sm:text-xs uppercase tracking-widest px-5 py-1.5 rounded-full shadow-md flex items-center gap-2 whitespace-nowrap">
                  <Award className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {heroPhotos.length > 1
                      ? `LIVE BANNER GALLERY (${safeSlideIndex + 1} / ${heroPhotos.length})`
                      : 'SAVE MONEY • TRACK MONEY'}
                  </span>
                </div>

                {/* Studio Portrait / Multi-Photo Carousel Container */}
                <div
                  className={`relative rounded-2xl overflow-hidden border pt-6 px-2 pb-2 ${
                    darkMode
                      ? 'bg-slate-950 border-slate-800'
                      : 'bg-slate-50 border-slate-200/80'
                  }`}
                >
                  {heroPhotos.length > 0 ? (
                    <div className="space-y-3 mb-3" data-testid="hero-multi-photo-carousel">
                      {/* Main Animated Slide Frame */}
                      <div className="relative w-full h-[280px] sm:h-[380px] rounded-xl overflow-hidden bg-slate-900/5 dark:bg-slate-950 flex items-center justify-center group">
                        <img
                          key={safeSlideIndex}
                          src={heroPhotos[safeSlideIndex]}
                          alt={`ExpenseTracker Feature Banner ${safeSlideIndex + 1}`}
                          className="w-full h-full object-contain mx-auto rounded-xl transition-all duration-500 animate-fade-up"
                        />

                        {heroPhotos.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setActiveSlideIndex(
                                  (prev) => (prev - 1 + heroPhotos.length) % heroPhotos.length
                                )
                              }
                              aria-label="Previous banner photo"
                              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/75 hover:bg-slate-900 text-white flex items-center justify-center shadow-lg cursor-pointer transition"
                            >
                              <ChevronLeft className="w-5 h-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setActiveSlideIndex((prev) => (prev + 1) % heroPhotos.length)
                              }
                              aria-label="Next banner photo"
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-900/75 hover:bg-slate-900 text-white flex items-center justify-center shadow-lg cursor-pointer transition"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>

                            {/* Slide Indicator Dots */}
                            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/70 backdrop-blur-xs">
                              {heroPhotos.map((_, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setActiveSlideIndex(idx)}
                                  aria-label={`Show banner photo ${idx + 1}`}
                                  className={`h-2 rounded-full transition-all cursor-pointer ${
                                    idx === safeSlideIndex
                                      ? 'w-6 bg-emerald-400'
                                      : 'w-2 bg-white/50 hover:bg-white/80'
                                  }`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <svg
                      viewBox="0 0 680 540"
                      className="w-full h-auto max-h-[460px] mx-auto drop-shadow-xl select-none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <defs>
                        <linearGradient id="royalBlueSaree" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#1e3a8a" />
                          <stop offset="45%" stopColor="#1e40af" />
                          <stop offset="100%" stopColor="#172554" />
                        </linearGradient>
                        <linearGradient id="royalBlueHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#2563eb" />
                          <stop offset="50%" stopColor="#3b82f6" />
                          <stop offset="100%" stopColor="#1e3a8a" />
                        </linearGradient>
                        <linearGradient id="goldZari" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#fef08a" />
                          <stop offset="50%" stopColor="#f59e0b" />
                          <stop offset="100%" stopColor="#b45309" />
                        </linearGradient>
                        <linearGradient id="skinLady" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#f6cbb6" />
                          <stop offset="100%" stopColor="#e5a98c" />
                        </linearGradient>
                        <linearGradient id="skinHusband" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#eab69f" />
                          <stop offset="100%" stopColor="#d49478" />
                        </linearGradient>
                        <linearGradient id="husbandJacket" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#0f766e" />
                          <stop offset="100%" stopColor="#115e59" />
                        </linearGradient>
                        <linearGradient id="childOutfit" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f59e0b" />
                          <stop offset="100%" stopColor="#d97706" />
                        </linearGradient>
                      </defs>

                      <circle cx="340" cy="240" r="210" fill="#10b981" opacity="0.06" />
                      <circle cx="340" cy="240" r="145" fill="#0f172a" opacity="0.06" />

                      {/* Floating Rupee Coins */}
                      <g>
                        <circle cx="82" cy="95" r="24" fill="url(#goldZari)" />
                        <circle
                          cx="82"
                          cy="95"
                          r="19"
                          fill="none"
                          stroke="#78350f"
                          strokeWidth="1.5"
                          strokeDasharray="3,3"
                        />
                        <text
                          x="82"
                          y="103"
                          textAnchor="middle"
                          fontSize="22"
                          fontWeight="800"
                          fill="#451a03"
                        >
                          ₹
                        </text>
                      </g>
                      <g>
                        <circle cx="595" cy="90" r="22" fill="url(#goldZari)" />
                        <circle
                          cx="595"
                          cy="90"
                          r="17"
                          fill="none"
                          stroke="#78350f"
                          strokeWidth="1.5"
                          strokeDasharray="3,3"
                        />
                        <text
                          x="595"
                          y="98"
                          textAnchor="middle"
                          fontSize="20"
                          fontWeight="800"
                          fill="#451a03"
                        >
                          ₹
                        </text>
                      </g>

                      {/* 1. Husband (Left) */}
                      <g transform="translate(15, 18)">
                        <path
                          d="M55 475 C58 345 95 305 165 305 C235 305 268 345 272 475 Z"
                          fill="#fef3c7"
                        />
                        <path
                          d="M68 475 C72 350 102 310 165 310 C228 310 258 350 262 475 Z"
                          fill="url(#husbandJacket)"
                        />
                        <path d="M142 310 L165 365 L188 310 Z" fill="#fef3c7" />
                        <path
                          d="M136 310 L165 372 L194 310"
                          fill="none"
                          stroke="url(#goldZari)"
                          strokeWidth="4"
                        />
                        <circle cx="165" cy="390" r="4" fill="url(#goldZari)" />
                        <circle cx="165" cy="412" r="4" fill="url(#goldZari)" />
                        <circle cx="165" cy="434" r="4" fill="url(#goldZari)" />
                        <path d="M105 365 L125 355 L128 372 L105 372 Z" fill="url(#goldZari)" />
                        <rect
                          x="143"
                          y="258"
                          width="44"
                          height="58"
                          rx="18"
                          fill="url(#skinHusband)"
                        />
                        <ellipse cx="105" cy="205" rx="10" ry="18" fill="url(#skinHusband)" />
                        <ellipse cx="225" cy="205" rx="10" ry="18" fill="url(#skinHusband)" />
                        <path
                          d="M110 175 C110 120 220 120 220 175 C220 242 198 274 165 274 C132 274 110 242 110 175 Z"
                          fill="url(#skinHusband)"
                        />
                        <path
                          d="M106 185 C102 130 135 102 172 105 C212 108 230 138 223 185 C218 158 205 142 165 140 C128 138 114 158 106 185 Z"
                          fill="#171717"
                        />
                        <path
                          d="M126 178 Q142 170 155 176"
                          fill="none"
                          stroke="#171717"
                          strokeWidth="4.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M175 176 Q188 170 204 178"
                          fill="none"
                          stroke="#171717"
                          strokeWidth="4.5"
                          strokeLinecap="round"
                        />
                        <ellipse cx="141" cy="193" rx="9" ry="6" fill="#ffffff" />
                        <circle cx="141" cy="193" r="4.5" fill="#291811" />
                        <ellipse cx="189" cy="193" rx="9" ry="6" fill="#ffffff" />
                        <circle cx="189" cy="193" r="4.5" fill="#291811" />
                        <path
                          d="M165 195 L161 218 Q165 223 171 218"
                          fill="none"
                          stroke="#b9775c"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        <path
                          d="M140 232 Q165 223 190 232"
                          fill="none"
                          stroke="#262626"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                        <path d="M143 235 Q165 260 187 235 Z" fill="#7f1d1d" />
                        <path d="M146 236 Q165 244 184 236 Z" fill="#ffffff" />
                        <circle cx="92" cy="395" r="24" fill="url(#skinHusband)" />
                        <rect
                          x="84"
                          y="405"
                          width="14"
                          height="44"
                          rx="7"
                          fill="url(#skinHusband)"
                        />
                      </g>

                      {/* 2. Child (Right) */}
                      <g transform="translate(435, 95)">
                        <path
                          d="M25 400 C30 300 58 270 112 270 C166 270 192 300 198 400 Z"
                          fill="url(#childOutfit)"
                        />
                        <path
                          d="M88 270 L112 315 L136 270"
                          fill="none"
                          stroke="#fef08a"
                          strokeWidth="4"
                        />
                        <rect
                          x="95"
                          y="235"
                          width="34"
                          height="42"
                          rx="14"
                          fill="url(#skinLady)"
                        />
                        <circle cx="112" cy="188" r="48" fill="url(#skinLady)" />
                        <path
                          d="M62 185 C60 132 90 120 118 122 C148 124 166 145 162 185 C154 160 135 150 110 150 C85 150 70 162 62 185 Z"
                          fill="#171717"
                        />
                        <circle cx="94" cy="186" r="5.5" fill="#1f120d" />
                        <circle cx="130" cy="186" r="5.5" fill="#1f120d" />
                        <path d="M95 210 Q112 232 129 210 Z" fill="#881337" />
                        <path d="M98 211 Q112 217 126 211 Z" fill="#ffffff" />
                        <g transform="translate(55, 295)">
                          <ellipse
                            cx="62"
                            cy="48"
                            rx="44"
                            ry="34"
                            fill="url(#goldZari)"
                            stroke="#78350f"
                            strokeWidth="2"
                          />
                          <rect x="50" y="16" width="22" height="4" rx="2" fill="#451a03" />
                          <text
                            x="60"
                            y="58"
                            textAnchor="middle"
                            fontSize="24"
                            fontWeight="900"
                            fill="#451a03"
                          >
                            ₹
                          </text>
                        </g>
                      </g>

                      {/* 3. Center Lady in Royal Blue Saree */}
                      <g transform="translate(155, 10)">
                        <path
                          d="M102 125 C85 190 78 255 82 305 C120 315 250 315 288 305 C292 255 285 190 268 125 Z"
                          fill="#1c1613"
                        />
                        <path
                          d="M48 495 C52 340 82 288 185 288 C288 288 318 340 322 495 Z"
                          fill="url(#royalBlueSaree)"
                        />
                        <path
                          d="M122 286 L128 348 Q185 375 242 348 L248 286 Z"
                          fill="url(#skinLady)"
                        />
                        <rect
                          x="155"
                          y="225"
                          width="60"
                          height="75"
                          rx="24"
                          fill="url(#skinLady)"
                        />
                        <path
                          d="M139 283 Q185 313 231 283"
                          fill="none"
                          stroke="url(#goldZari)"
                          strokeWidth="8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M68 495 L112 375 L292 292 L332 345 L295 495 Z"
                          fill="url(#royalBlueHighlight)"
                        />
                        <path
                          d="M98 402 L292 292 L302 310 L106 422 Z"
                          fill="url(#goldZari)"
                          opacity="0.92"
                        />
                        <path
                          d="M120 142 C120 75 250 75 250 142 C250 215 222 252 185 252 C148 252 120 215 120 142 Z"
                          fill="url(#skinLady)"
                        />
                        <circle cx="185" cy="133" r="2.5" fill="#1e3a8a" />
                        <ellipse cx="154" cy="154" rx="11" ry="7.5" fill="#ffffff" />
                        <circle cx="154" cy="154" r="5.5" fill="#2b170e" />
                        <ellipse cx="216" cy="154" rx="11" ry="7.5" fill="#ffffff" />
                        <circle cx="216" cy="154" r="5.5" fill="#2b170e" />
                        <path
                          d="M185 154 L181 180 Q185 186 193 180"
                          fill="none"
                          stroke="#c57f64"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                        <path
                          d="M156 195 Q185 189 214 195 Q208 234 185 234 Q162 234 156 195 Z"
                          fill="#c25953"
                        />
                        <path
                          d="M163 198 Q185 195 207 198 L204 207 Q185 205 166 207 Z"
                          fill="#ffffff"
                        />
                        <path
                          d="M114 162 C108 92 145 58 185 62 C225 58 262 92 256 162 C248 118 225 94 185 88 C145 94 122 118 114 162 Z"
                          fill="#1c1613"
                        />
                      </g>
                    </svg>
                  )}

                  {/* Bottom Advertising Caption Inside Poster */}
                  <div className="relative z-20 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center shadow-lg">
                    <p className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-400 mb-1">
                      👇 Look Below at What Your Expense Tracker Includes 👇
                    </p>
                    <p className="font-bold text-sm sm:text-base text-white">
                      “Save Money • Track Money — Every Single Rupee Counts for Our Family!”
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. PROMOTIONAL GRAPHIC BANNERS: SAVE MONEY & TRACK MONEY */}
      <section className="relative z-10 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div
              className={`info-hover-card rounded-3xl p-6 sm:p-8 border border-l-4 border-l-emerald-600 relative overflow-hidden ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs uppercase tracking-widest">
                  Banner 01 • Save Money
                </span>
                <h2 className="font-extrabold text-2xl sm:text-3xl">
                  Turn Spare Change into{' '}
                  <span className="text-emerald-600 dark:text-emerald-400">Dream Wealth</span>
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Whether it is ₹50 saved from daily commute or ₹500 from weekend shopping, our{' '}
                  <strong>Dream Money</strong> tracker visually shows how small coins build lakhs
                  over time.
                </p>
              </div>
            </div>

            <div
              className={`info-hover-card rounded-3xl p-6 sm:p-8 border border-l-4 border-l-slate-700 relative overflow-hidden ${
                darkMode
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              <div className="space-y-2">
                <span className="px-3 py-1 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-xs uppercase tracking-widest">
                  Banner 02 • Track Money
                </span>
                <h2 className="font-extrabold text-2xl sm:text-3xl">
                  Zero Forgotten Bills &amp;{' '}
                  <span className="text-emerald-600 dark:text-emerald-400">Photo Proof</span>
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Every rupee spent gets a photo receipt, and every rupee lent to a friend gets a
                  smart <strong>Pending Money Bill with Info Titles</strong> so you never lose track
                  of your hard-earned cash.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. COMPLETE TEMPLATE SHOWCASE — 3 FLAGSHIP MODULES WITH DAILY TRACKER RECEIPT PHOTOS */}
      <section className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">
          <div className="text-center max-w-3xl mx-auto space-y-3">
            <span className="px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs uppercase tracking-widest">
              Complete Feature Information Guide
            </span>
            <h2 className="font-extrabold text-3xl sm:text-5xl">
              What <span className="text-emerald-600 dark:text-emerald-400">ExpenseTracker</span>{' '}
              Includes
            </h2>
            <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400">
              Here is a complete visual look at the 3 powerhouse features waiting inside your
              account when you click <strong>Start</strong> or <strong>Register</strong>.
            </p>
          </div>

          {/* MODULE 01: DREAM MONEY */}
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="space-y-1.5">
                <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs uppercase">
                  Included Feature 01
                </span>
                <h3 className="font-extrabold text-2xl sm:text-4xl">
                  🌟 Dream Money — Goal &amp; Milestone Vaults
                </h3>
              </div>
              <p className="text-xs sm:text-sm max-w-md text-slate-500 dark:text-slate-400">
                Create dedicated visual vaults with custom photos for your family&apos;s biggest
                dreams and watch your progress bar fill up!
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div
                className={`info-hover-card rounded-3xl p-6 space-y-4 border ${
                  darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🏍️</span>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                    82% Saved • Dream Money
                  </span>
                </div>
                <div>
                  <h4 className="font-extrabold text-xl">Dream Bike &amp; Family Car Fund</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Shows how daily small deposits build up toward your dream vehicle without heavy
                    loan stress.
                  </p>
                </div>
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400">Saved: ₹98,400</span>
                    <span className="text-slate-400">Target: ₹1,20,000</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full w-[82%] rounded-full bg-emerald-600" />
                  </div>
                </div>
              </div>

              <div
                className={`info-hover-card rounded-3xl p-6 space-y-4 border ${
                  darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🏡</span>
                  <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">
                    64% Saved • Dream Money
                  </span>
                </div>
                <div>
                  <h4 className="font-extrabold text-xl">Dream Family Home Downpayment</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Track monthly family contributions, festival bonuses, and gold savings in one
                    unified goal card.
                  </p>
                </div>
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-900 dark:text-white">Saved: ₹3,20,000</span>
                    <span className="text-slate-400">Target: ₹5,00,000</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full w-[64%] rounded-full bg-teal-600" />
                  </div>
                </div>
              </div>

              <div
                className={`info-hover-card rounded-3xl p-6 space-y-4 border ${
                  darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-3xl">🎓</span>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                    91% Saved • Dream Money
                  </span>
                </div>
                <div>
                  <h4 className="font-extrabold text-xl">Kids Higher Education &amp; Gold Vault</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    “Penny penny makes many” in action—turning everyday discipline into your
                    child&apos;s bright future.
                  </p>
                </div>
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400">Saved: ₹1,82,000</span>
                    <span className="text-slate-400">Target: ₹2,00,000</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full w-[91%] rounded-full bg-emerald-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* MODULE 02: DAILY TRACKER EXPENSE RECORDS WITH IMAGE PROOF */}
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="space-y-1.5">
                <span className="px-3 py-1 rounded-lg bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-xs uppercase">
                  Included Feature 02
                </span>
                <h3 className="font-extrabold text-2xl sm:text-4xl">
                  📷 Expense Records with Image Proof
                </h3>
              </div>
              <p className="text-xs sm:text-sm max-w-md text-slate-500 dark:text-slate-400">
                Never wonder “Where did my money go?” Every expense record supports attaching a real
                bill photo, shopping receipt, or UPI payment screenshot!
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Record Image Card 1 */}
              <div
                className={`info-hover-card rounded-3xl overflow-hidden flex flex-col border ${
                  darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="relative h-48 overflow-hidden bg-slate-900">
                  <img
                    src="https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=900&q=80"
                    alt="Supermarket Grocery Bill Receipt Photo"
                    className="w-full h-full object-cover opacity-90 hover:scale-105 transition duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                  <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-emerald-600 text-white font-extrabold text-xs shadow">
                    📷 Receipt Image Attached
                  </span>
                  <span className="absolute bottom-3 right-3 px-3 py-1 rounded-xl bg-slate-950/90 text-white font-extrabold text-base border border-slate-700">
                    ₹2,450
                  </span>
                </div>
                <div className="p-5 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Category: Family Groceries &amp; Ration
                    </span>
                    <h4 className="font-extrabold text-lg mt-0.5">
                      Monthly Supermarket Grocery Bill
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Includes full photo of itemised grocery receipt, date/time stamp, and payment
                      mode (UPI / Cash).
                    </p>
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>🗓️ 12 May • Paid via UPI</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      ✓ Verified Record
                    </span>
                  </div>
                </div>
              </div>

              {/* Record Image Card 2 */}
              <div
                className={`info-hover-card rounded-3xl overflow-hidden flex flex-col border ${
                  darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="relative h-48 overflow-hidden bg-slate-900">
                  <img
                    src="https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=900&q=80"
                    alt="Electricity and Home Utility Bill Photo"
                    className="w-full h-full object-cover opacity-90 hover:scale-105 transition duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                  <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-900 text-white font-extrabold text-xs shadow border border-slate-700">
                    📷 Meter &amp; Bill Photo
                  </span>
                  <span className="absolute bottom-3 right-3 px-3 py-1 rounded-xl bg-slate-950/90 text-white font-extrabold text-base border border-slate-700">
                    ₹1,890
                  </span>
                </div>
                <div className="p-5 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Category: Electricity &amp; Home Bills
                    </span>
                    <h4 className="font-extrabold text-lg mt-0.5">
                      Home Utility &amp; Wi-Fi Bill Snapshot
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Store paper electricity bills and warranty slips safely inside your expense
                      record forever.
                    </p>
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>🗓️ 10 May • Auto-Tracked</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      ✓ Verified Record
                    </span>
                  </div>
                </div>
              </div>

              {/* Record Image Card 3 */}
              <div
                className={`info-hover-card rounded-3xl overflow-hidden flex flex-col border ${
                  darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="relative h-48 overflow-hidden bg-slate-900">
                  <img
                    src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=80"
                    alt="UPI Payment & Restaurant Bill Photo"
                    className="w-full h-full object-cover opacity-90 hover:scale-105 transition duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                  <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-teal-600 text-white font-extrabold text-xs shadow">
                    📷 POS / Card Slip Image
                  </span>
                  <span className="absolute bottom-3 right-3 px-3 py-1 rounded-xl bg-slate-950/90 text-white font-extrabold text-base border border-slate-700">
                    ₹1,400
                  </span>
                </div>
                <div className="p-5 space-y-2 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                      Category: Family Outing &amp; Dining
                    </span>
                    <h4 className="font-extrabold text-lg mt-0.5">
                      Weekend Family Dinner Receipt
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Snap the restaurant bill in 1 second so your monthly budget summary stays 100%
                      accurate.
                    </p>
                  </div>
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>🗓️ 08 May • Card / UPI</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      ✓ Verified Record
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* MODULE 03: PENDING MONEY — CREATE & SEND BILL WITH INFO TITLES */}
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="space-y-1.5">
                <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs uppercase">
                  Included Feature 03
                </span>
                <h3 className="font-extrabold text-2xl sm:text-4xl">
                  🧾 Pending Money — Create &amp; Send Bill with Info Titles
                </h3>
              </div>
              <p className="text-xs sm:text-sm max-w-md text-slate-500 dark:text-slate-400">
                Someone owes you money? Pick a smart <strong>Bill Info Title</strong>, generate a
                clean Pending Money Bill with their name and details, and export HD PDF or Excel!
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* Left 7 Cols: Ready-to-Use Pending Bill Info Titles */}
              <div
                className={`lg:col-span-7 rounded-3xl p-6 sm:p-8 space-y-5 border ${
                  darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-lg sm:text-xl">
                    ✨ Smart “Bill Info Titles” Included for Pending Money:
                  </h4>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                    6+ Ready Templates
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-start gap-3">
                    <span className="text-xl">🍽️</span>
                    <div>
                      <p className="font-bold text-sm">Dinner &amp; Outing Split</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        “Weekend Group Dinner &amp; Cab Share Bill”
                      </p>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-start gap-3">
                    <span className="text-xl">🏠</span>
                    <div>
                      <p className="font-bold text-sm">Room Rent &amp; Electricity Share</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        “Monthly Flat Rent + Wi-Fi Pending Bill”
                      </p>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-start gap-3">
                    <span className="text-xl">🤝</span>
                    <div>
                      <p className="font-bold text-sm">Emergency Friendly Hand-Loan</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        “Urgent Cash Lent — Polite Due Reminder”
                      </p>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-start gap-3">
                    <span className="text-xl">🎁</span>
                    <div>
                      <p className="font-bold text-sm">Festival Gift &amp; Shopping Pool</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        “Family Festival Combined Purchase Bill”
                      </p>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-start gap-3">
                    <span className="text-xl">⛽</span>
                    <div>
                      <p className="font-bold text-sm">Travel &amp; Fuel Contribution</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        “Highway Toll &amp; Petrol Trip Split Bill”
                      </p>
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-start gap-3">
                    <span className="text-xl">📦</span>
                    <div>
                      <p className="font-bold text-sm">Shop / Client Udhaar Due</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        “Pending Invoice &amp; Balance Settlement”
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right 5 Cols: Sample Generated Pending Bill Card */}
              <div
                className={`lg:col-span-5 rounded-3xl p-6 border border-slate-300 dark:border-slate-700 flex flex-col justify-between space-y-4 ${
                  darkMode ? 'bg-slate-900' : 'bg-white shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                      SAMPLE GENERATED BILL CARD
                    </span>
                    <h4 className="font-extrabold text-lg">🧾 Pending Money Bill</h4>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-slate-900 text-white dark:bg-slate-800 font-extrabold text-xs">
                    PENDING: ₹1,200
                  </span>
                </div>

                <div className="space-y-2.5 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">
                      Bill To (Friend / Contact):
                    </span>
                    <span className="font-bold">Rahul Sharma</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Bill Info Title:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Weekend Dinner &amp; Cab Split
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Attached Proof:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      📷 Restaurant_Bill_08May.jpg
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Due Date:</span>
                    <span className="font-bold">15 May 2026</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-xs">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                    💬 Ready Message: “Hi Rahul! Sharing our Weekend Dinner &amp; Cab Split bill of
                    ₹1,200 from ExpenseTracker. Remember: Penny penny makes many! 😊”
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. BOTTOM CALL-TO-ACTION BANNER & FOOTER */}
      <section className="relative z-10 py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`rounded-3xl p-8 sm:p-12 border border-slate-200 dark:border-slate-800 text-center space-y-6 ${
              darkMode ? 'bg-slate-900' : 'bg-white shadow-sm'
            }`}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs uppercase tracking-widest">
              <Sparkles className="w-3.5 h-3.5" /> Start Your Family Savings Journey
            </div>
            <h2 className="font-extrabold text-3xl sm:text-5xl">
              Ready to Save Money &amp; Track Money?
            </h2>
            <p className="text-base sm:text-lg max-w-2xl mx-auto text-slate-500 dark:text-slate-400">
              Join <strong className="text-emerald-600 dark:text-emerald-400">ExpenseTracker</strong>{' '}
              today—because{' '}
              <strong className="text-slate-900 dark:text-white">“Penny penny makes many!”</strong>
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => onStartApp('login')}
                className="shimmer-btn w-full sm:w-auto px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-base sm:text-lg shadow-lg shadow-emerald-600/25 hover:scale-105 transition flex items-center justify-center gap-3 cursor-pointer"
              >
                <span>Click Here to Start</span>
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => onStartApp('register')}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-950 font-extrabold text-base sm:text-lg shadow-md hover:scale-105 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-5 h-5" />
                <span>Register Free</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-bold">
            © 2026 <span className="text-emerald-600 dark:text-emerald-400">ExpenseTracker</span> —
            “Penny penny makes many.”
          </p>
          <p>
            <CheckCircle2 className="w-3.5 h-3.5 inline text-emerald-600 mr-1" />
            Dream Money • Records with Image • Pending Money Bill Info Titles •{' '}
            <Zap className="w-3.5 h-3.5 inline text-emerald-600 mx-0.5" />
            koustubhjuvekar.in/expensetracker
          </p>
        </div>
      </footer>
    </div>
  );
};
