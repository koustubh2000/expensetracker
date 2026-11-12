import React from 'react';
import { MonthlyCalculationSummary, TransactionRecord } from '../types/finance';
import { calculateMonthlySummary } from '../utils/financeRules';

interface ChartsPanelProps {
  transactions: TransactionRecord[];
  currentSummary: MonthlyCalculationSummary;
  currency: string;
}

const CHART_COLORS = [
  '#10b981', // emerald
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#ec4899', // pink
  '#14b8a6', // teal
  '#64748b', // slate
];

export const ChartsPanel: React.FC<ChartsPanelProps> = ({
  transactions,
  currentSummary,
  currency,
}) => {
  // Build a 4-month historical comparison ending at 2026-11
  const months = ['2026-08', '2026-09', '2026-10', '2026-11'];
  const monthLabels: Record<string, string> = {
    '2026-08': 'Aug 2026',
    '2026-09': 'Sep 2026',
    '2026-10': 'Oct 2026',
    '2026-11': 'Nov 2026',
  };

  const monthlySeries = months.map((m) => {
    const s = calculateMonthlySummary(transactions, m);
    return {
      month: m,
      label: monthLabels[m] || m,
      income: s.totalIncome,
      expense: s.totalExpense,
      dream: s.dreamInvestedThisMonth,
      lendingAndExpected: s.lendingOutThisMonth + s.expectedIncomingThisMonth,
    };
  });

  const maxBarValue = Math.max(
    1000,
    ...monthlySeries.map((d) => Math.max(d.income, d.expense + d.dream, d.lendingAndExpected))
  );

  // Donut geometry for Category Breakdown
  const breakdown = currentSummary.categoryBreakdown.slice(0, 6);
  const totalBreakdown = breakdown.reduce((acc, item) => acc + item.amount, 0);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let cumulativePercent = 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Cash Flow & Money Storage Comparison Chart */}
      <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Cash Flow, Dream Storage & Lending Trajectory
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Monthly comparison of Income vs Expenses, Dream Investments, and Lending/Receivables
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
                Expense
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-violet-500 inline-block" />
                Dream Vault
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                Lent / Expected
              </span>
            </div>
          </div>

          {/* Interactive SVG Grouped Bar Chart */}
          <div className="mt-4 pt-2">
            <svg
              viewBox="0 0 560 210"
              className="w-full h-52 overflow-visible"
              role="img"
              aria-label="Monthly Cash Flow and Storage Bar Chart"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = 170 - tick * 140;
                const val = Math.round(maxBarValue * tick);
                return (
                  <g key={tick}>
                    <line
                      x1="48"
                      y1={y}
                      x2="545"
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeDasharray={tick === 0 ? undefined : '3 3'}
                      strokeWidth="1"
                    />
                    <text
                      x="42"
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                    >
                      {currency}{val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                    </text>
                  </g>
                );
              })}

              {monthlySeries.map((item, idx) => {
                const groupX = 75 + idx * 120;
                const incH = Math.max(2, (item.income / maxBarValue) * 140);
                const expH = Math.max(2, (item.expense / maxBarValue) * 140);
                const drmH = Math.max(2, (item.dream / maxBarValue) * 140);
                const lndH = Math.max(2, (item.lendingAndExpected / maxBarValue) * 140);

                return (
                  <g key={item.month}>
                    {/* Income Bar */}
                    <rect
                      x={groupX}
                      y={170 - incH}
                      width="18"
                      height={incH}
                      rx="3"
                      fill="#10b981"
                    >
                      <title>{`${item.label} Income: ${currency}${item.income.toLocaleString()}`}</title>
                    </rect>
                    {/* Expense Bar */}
                    <rect
                      x={groupX + 22}
                      y={170 - expH}
                      width="18"
                      height={expH}
                      rx="3"
                      fill="#f43f5e"
                    >
                      <title>{`${item.label} Expense: ${currency}${item.expense.toLocaleString()}`}</title>
                    </rect>
                    {/* Dream Investment Bar */}
                    <rect
                      x={groupX + 44}
                      y={170 - drmH}
                      width="18"
                      height={drmH}
                      rx="3"
                      fill="#8b5cf6"
                    >
                      <title>{`${item.label} Dream Investment: ${currency}${item.dream.toLocaleString()}`}</title>
                    </rect>
                    {/* Lending & Expected Bar */}
                    <rect
                      x={groupX + 66}
                      y={170 - lndH}
                      width="18"
                      height={lndH}
                      rx="3"
                      fill="#f59e0b"
                    >
                      <title>{`${item.label} Lending & Expected: ${currency}${item.lendingAndExpected.toLocaleString()}`}</title>
                    </rect>

                    <text
                      x={groupX + 42}
                      y="192"
                      textAnchor="middle"
                      className="fill-slate-600 dark:fill-slate-400 text-[11px] font-medium"
                    >
                      {item.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
          <div>
            Savings & Investment Rate:{' '}
            <strong className="font-mono text-slate-900 dark:text-slate-100">
              {currentSummary.savingsRate.toFixed(1)}%
            </strong>
          </div>
          <div>
            Daily Average Spend:{' '}
            <strong className="font-mono text-slate-900 dark:text-slate-100">
              {currency}{currentSummary.dailyAverageExpense.toLocaleString()}
            </strong>
          </div>
          <div>
            Net Cashflow:{' '}
            <strong
              className={`font-mono ${
                currentSummary.netCashflow >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {currentSummary.netCashflow >= 0 ? '+' : ''}
              {currency}{currentSummary.netCashflow.toLocaleString()}
            </strong>
          </div>
        </div>
      </div>

      {/* Right: Category Breakdown Donut + Tabular List */}
      <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 p-5 flex flex-col justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Outflow & Dream Allocation Breakdown
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Includes standard categories and custom "Other" tracked items
          </p>

          {breakdown.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No expenses or dream allocations recorded for this period yet.
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
              <div className="sm:col-span-5 flex justify-center">
                <svg width="148" height="148" viewBox="0 0 148 148" aria-label="Category Donut Chart">
                  <circle
                    cx="74"
                    cy="74"
                    r={radius}
                    fill="transparent"
                    stroke="currentColor"
                    className="text-slate-100 dark:text-slate-800"
                    strokeWidth="18"
                  />
                  {breakdown.map((item, idx) => {
                    const pct = totalBreakdown > 0 ? item.amount / totalBreakdown : 0;
                    const strokeDasharray = `${pct * circumference} ${circumference}`;
                    const strokeDashoffset = -cumulativePercent * circumference;
                    cumulativePercent += pct;
                    return (
                      <circle
                        key={item.category}
                        cx="74"
                        cy="74"
                        r={radius}
                        fill="transparent"
                        stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                        strokeWidth="18"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        transform="rotate(-90 74 74)"
                      >
                        <title>{`${item.category}: ${currency}${item.amount.toLocaleString()} (${item.percentage}%)`}</title>
                      </circle>
                    );
                  })}
                  <text
                    x="74"
                    y="70"
                    textAnchor="middle"
                    className="fill-slate-500 dark:fill-slate-400 text-[10px]"
                  >
                    Total Outflow
                  </text>
                  <text
                    x="74"
                    y="86"
                    textAnchor="middle"
                    className="fill-slate-900 dark:fill-slate-100 text-xs font-mono font-semibold"
                  >
                    {currency}{totalBreakdown.toLocaleString()}
                  </text>
                </svg>
              </div>

              <div className="sm:col-span-7 space-y-2.5">
                {breakdown.map((item, idx) => (
                  <div key={item.category} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                        {item.category}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-900 dark:text-slate-100 shrink-0">
                      {currency}{item.amount.toLocaleString()}{' '}
                      <span className="text-slate-400">({item.percentage}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Active Categories: {currentSummary.categoryBreakdown.length}</span>
          <span>100% Local Calculation</span>
        </div>
      </div>
    </div>
  );
};
