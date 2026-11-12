import React, { useMemo, useState } from 'react';
import { Calendar, PieChart, TrendingUp, Vault } from 'lucide-react';
import { DreamVault, TransactionRecord } from '../types/finance';
import { calculateMonthlySummary, resolveFlexibleLabel } from '../utils/financeRules';
import { InfoTip } from './InfoTip';

interface DashboardAnalyticsChartsProps {
  transactions: TransactionRecord[];
  dreamVaults: DreamVault[];
  currency: string;
  selectedMonth: string;
}

export type AnalyticsTimePeriod = 'week' | 'month' | 'year' | 'all';

const SLICE_COLORS = [
  '#10b981', // emerald
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f43f5e', // rose
  '#14b8a6', // teal
];

function buildDonutSegments(
  items: Array<{ label: string; value: number; color: string }>
): Array<{
  label: string;
  value: number;
  pct: number;
  color: string;
  strokeDasharray: string;
  strokeDashoffset: number;
}> {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  if (total <= 0) return [];
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPct = 0;

  return items
    .filter((i) => i.value > 0)
    .map((item) => {
      const pct = (item.value / total) * 100;
      const dashLen = (pct / 100) * circumference;
      const offset = -((accumulatedPct / 100) * circumference);
      accumulatedPct += pct;
      return {
        label: item.label,
        value: Math.round(item.value * 100) / 100,
        pct: Math.round(pct * 10) / 10,
        color: item.color,
        strokeDasharray: `${dashLen} ${circumference - dashLen}`,
        strokeDashoffset: offset,
      };
    });
}

function resolveAnchorDateIso(
  transactions: TransactionRecord[],
  selectedMonth: string
): string {
  const todayIso = new Date().toISOString().slice(0, 10);
  const validDates = (transactions || [])
    .map((t) => t.date)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  if (selectedMonth && selectedMonth !== 'ALL' && /^\d{4}-\d{2}$/.test(selectedMonth)) {
    const inSelectedMonth = validDates.filter((d) => d.startsWith(selectedMonth));
    if (inSelectedMonth.length > 0) {
      return inSelectedMonth[inSelectedMonth.length - 1];
    }
    return `${selectedMonth}-15`;
  }

  if (validDates.length > 0) {
    const currentMonthPrefix = todayIso.slice(0, 7);
    const hasCurrentMonth = validDates.some((d) => d.startsWith(currentMonthPrefix));
    if (hasCurrentMonth) {
      const monthMatches = validDates.filter((d) => d.startsWith(currentMonthPrefix));
      const latestInMonth = monthMatches[monthMatches.length - 1];
      return latestInMonth > todayIso ? latestInMonth : todayIso;
    }
    return validDates[validDates.length - 1];
  }

  return todayIso;
}

export function filterTransactionsByAnalyticsPeriod(
  transactions: TransactionRecord[],
  period: AnalyticsTimePeriod,
  selectedMonth: string
): {
  filtered: TransactionRecord[];
  periodBadgeLabel: string;
} {
  const list = transactions || [];
  if (period === 'all') {
    return {
      filtered: list,
      periodBadgeLabel: 'All Time',
    };
  }

  const anchorIso = resolveAnchorDateIso(list, selectedMonth);
  const anchorYear = anchorIso.slice(0, 4);
  const anchorMonth = anchorIso.slice(0, 7);

  if (period === 'year') {
    return {
      filtered: list.filter((tx) => (tx.date || '').startsWith(anchorYear)),
      periodBadgeLabel: `Year ${anchorYear}`,
    };
  }

  if (period === 'month') {
    return {
      filtered: list.filter((tx) => (tx.date || '').startsWith(anchorMonth)),
      periodBadgeLabel: `Month ${anchorMonth}`,
    };
  }

  // 'week': 7-day window ending on anchorIso (inclusive)
  const anchorMs = Date.parse(`${anchorIso}T00:00:00Z`);
  if (!Number.isFinite(anchorMs)) {
    return {
      filtered: list.filter((tx) => (tx.date || '').startsWith(anchorMonth)),
      periodBadgeLabel: 'This Week',
    };
  }
  const startMs = anchorMs - 6 * 24 * 60 * 60 * 1000;
  const startIso = new Date(startMs).toISOString().slice(0, 10);

  const weeklyFiltered = list.filter(
    (tx) => tx.date >= startIso && tx.date <= anchorIso
  );

  return {
    filtered: weeklyFiltered,
    periodBadgeLabel: `${startIso.slice(5)} to ${anchorIso.slice(5)}`,
  };
}

export const DashboardAnalyticsCharts: React.FC<DashboardAnalyticsChartsProps> = ({
  transactions,
  dreamVaults,
  currency,
  selectedMonth,
}) => {
  const [period, setPeriod] = useState<AnalyticsTimePeriod>('month');

  const { filtered: periodTransactions, periodBadgeLabel } = useMemo(
    () =>
      filterTransactionsByAnalyticsPeriod(
        transactions || [],
        period,
        selectedMonth || 'ALL'
      ),
    [transactions, period, selectedMonth]
  );

  // Use 'ALL' on the already-filtered period transactions so calculateMonthlySummary aggregates all of them accurately
  const periodSummary = useMemo(
    () => calculateMonthlySummary(periodTransactions, 'ALL'),
    [periodTransactions]
  );

  // 1. Expense Category Breakdown for Pie/Donut Chart
  const expenseCategories = periodSummary.categoryBreakdown.slice(0, 6).map((c, idx) => ({
    label: c.category,
    value: c.amount,
    color: SLICE_COLORS[idx % SLICE_COLORS.length],
  }));
  const expenseSegments = buildDonutSegments(expenseCategories);

  // 2. Investments & Dreams Breakdown by Type
  const investmentTypeMap = new Map<string, number>();
  for (const v of dreamVaults || []) {
    const label = resolveFlexibleLabel(v.storageType, v.customStorageType);
    const prev = investmentTypeMap.get(label) || 0;
    investmentTypeMap.set(label, prev + Math.max(0, Number(v.currentAmount) || 0));
  }
  const investmentItems = Array.from(investmentTypeMap.entries())
    .map(([label, value], idx) => ({
      label,
      value,
      color: SLICE_COLORS[(idx + 2) % SLICE_COLORS.length],
    }))
    .sort((a, b) => b.value - a.value);
  const investmentSegments = buildDonutSegments(investmentItems);
  const totalInvestments =
    Math.round(investmentItems.reduce((s, i) => s + i.value, 0) * 100) / 100;

  // 3. Period Income vs Expense Cashflow comparison
  const maxCashflow = Math.max(
    1,
    periodSummary.totalIncome,
    periodSummary.totalExpense,
    periodSummary.dreamInvestedThisMonth
  );
  const incomePct = Math.round((periodSummary.totalIncome / maxCashflow) * 100);
  const expensePct = Math.round((periodSummary.totalExpense / maxCashflow) * 100);

  const periodTitlePrefix =
    period === 'week'
      ? 'Weekly'
      : period === 'month'
      ? 'Monthly'
      : period === 'year'
      ? 'Yearly'
      : 'All-Time';

  const PERIOD_OPTIONS: Array<{ id: AnalyticsTimePeriod; label: string }> = [
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'year', label: 'This Year' },
    { id: 'all', label: 'All Time' },
  ];

  return (
    <section
      aria-labelledby="dashboard-analytics-charts-heading"
      data-testid="dashboard-analytics-charts-section"
      className="space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2
            id="dashboard-analytics-charts-heading"
            className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center"
          >
            <span>Visual Portfolio &amp; Cashflow Analytics</span>
            <InfoTip text="Interactive visual summary of your expenses by category, income vs. expense cashflow, and investments & dreams portfolio allocation across This Week, This Month, This Year, or All Time." />
          </h2>
          <span
            data-testid="analytics-active-period-badge"
            className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1"
          >
            <Calendar className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>{periodBadgeLabel}</span>
          </span>
        </div>

        {/* Time Period Selector (This Week / This Month / This Year / All Time) */}
        <div
          data-testid="analytics-period-filter-bar"
          className="inline-flex items-center rounded-xl bg-white dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-800 shadow-2xs"
        >
          {PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`analytics-period-btn-${opt.id}`}
                onClick={() => setPeriod(opt.id)}
                className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart Card 1: Period Expenses Pie / Donut Chart */}
        <div
          data-testid="dashboard-chart-monthly-expenses"
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between shadow-xs"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <PieChart className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center">
                  <span>{periodTitlePrefix} Expenses</span>
                  <InfoTip text="Category-wise distribution of your recorded expenses for the selected time period." />
                </h3>
              </div>
            </div>
            <span
              data-testid="analytics-expenses-total-value"
              className="text-xs font-extrabold font-mono text-rose-600 dark:text-rose-400"
            >
              {currency}
              {periodSummary.totalExpense.toLocaleString()}
            </span>
          </div>

          {expenseSegments.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No expense records logged for {periodBadgeLabel} yet.
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative w-28 h-28 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="12"
                    className="text-slate-100 dark:text-slate-800"
                  />
                  {expenseSegments.map((seg) => (
                    <circle
                      key={seg.label}
                      cx="50"
                      cy="50"
                      r="42"
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="12"
                      strokeDasharray={seg.strokeDasharray}
                      strokeDashoffset={seg.strokeDashoffset}
                      className="transition-all duration-500"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Spent</span>
                  <span className="text-xs font-extrabold font-mono text-slate-900 dark:text-white">
                    {expenseSegments.length} cats
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-1.5 min-w-0">
                {expenseSegments.map((seg) => (
                  <div
                    key={seg.label}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                        {seg.label}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">
                      {seg.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart Card 2: Investments & Dreams Portfolio Pie / Donut Chart */}
        <div
          data-testid="dashboard-chart-investments-portfolio"
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between shadow-xs"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                <Vault className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center">
                  <span>Investments &amp; Dreams Mix</span>
                  <InfoTip text="Portfolio breakdown across Fixed Deposits (FD), Gold, Mutual Funds, and Dream Goals." />
                </h3>
              </div>
            </div>
            <span className="text-xs font-extrabold font-mono text-violet-600 dark:text-violet-400">
              {currency}
              {totalInvestments.toLocaleString()}
            </span>
          </div>

          {investmentSegments.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No active investment or dream balances yet.
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative w-28 h-28 shrink-0">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="12"
                    className="text-slate-100 dark:text-slate-800"
                  />
                  {investmentSegments.map((seg) => (
                    <circle
                      key={seg.label}
                      cx="50"
                      cy="50"
                      r="42"
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="12"
                      strokeDasharray={seg.strokeDasharray}
                      strokeDashoffset={seg.strokeDashoffset}
                      className="transition-all duration-500"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Vaults</span>
                  <span className="text-xs font-extrabold font-mono text-slate-900 dark:text-white">
                    {dreamVaults.length}
                  </span>
                </div>
              </div>

              <div className="flex-1 space-y-1.5 min-w-0">
                {investmentSegments.map((seg) => (
                  <div
                    key={seg.label}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                        {seg.label}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white shrink-0">
                      {currency}
                      {seg.value.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart Card 3: Cashflow & Savings Rate Bar Visual */}
        <div
          data-testid="dashboard-chart-cashflow-bars"
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between shadow-xs"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center">
                  <span>{periodTitlePrefix} Income vs. Expense</span>
                  <InfoTip text="Comparison of total recorded income against expenses and savings rate for the selected period." />
                </h3>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono font-extrabold">
              {periodSummary.savingsRate}% Saved
            </span>
          </div>

          <div className="space-y-3 my-auto">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-400">
                  Total Income
                </span>
                <span
                  data-testid="analytics-cashflow-income-value"
                  className="font-mono font-bold text-emerald-600 dark:text-emerald-400"
                >
                  +{currency}
                  {periodSummary.totalIncome.toLocaleString()}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                  style={{ width: `${Math.max(4, incomePct)}%` }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-600 dark:text-slate-400">
                  Total Expenses
                </span>
                <span
                  data-testid="analytics-cashflow-expense-value"
                  className="font-mono font-bold text-rose-600 dark:text-rose-400"
                >
                  -{currency}
                  {periodSummary.totalExpense.toLocaleString()}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500"
                  style={{ width: `${Math.max(4, expensePct)}%` }}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500">Net Cashflow</span>
              <span
                data-testid="analytics-cashflow-net-value"
                className={`font-mono font-extrabold ${
                  periodSummary.netCashflow >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {periodSummary.netCashflow >= 0 ? '+' : ''}
                {currency}
                {periodSummary.netCashflow.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
