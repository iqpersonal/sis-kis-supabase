"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";

export interface TermFinancials {
  term: number; // 1, 2, 3 or 0 = "Other"
  label: string;
  totalCharges: number;
  totalPaid: number;
  totalDiscount: number;
  outstandingBalance: number;
}

interface Props {
  termData: TermFinancials[];
}

const formatSAR = (v: number) =>
  `SAR ${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function TermCard({ data }: { data: TermFinancials }) {
  const rate =
    data.totalCharges > 0
      ? ((data.totalPaid / data.totalCharges) * 100).toFixed(1)
      : "0";
  const isFullyPaid = data.outstandingBalance === 0 && data.totalCharges > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {data.label}
        </CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Charges */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Charges</span>
          <span className="text-sm font-semibold">{formatSAR(data.totalCharges)}</span>
        </div>
        {/* Paid */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-500" /> Paid
          </span>
          <span className="text-sm font-semibold text-green-600">
            {formatSAR(data.totalPaid)}
          </span>
        </div>
        {/* Discount */}
        {data.totalDiscount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Discount</span>
            <span className="text-sm text-orange-500">
              {formatSAR(data.totalDiscount)}
            </span>
          </div>
        )}
        {/* Outstanding */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-red-500" /> Balance
          </span>
          <span
            className={`text-sm font-semibold ${
              isFullyPaid ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatSAR(data.outstandingBalance)}
          </span>
        </div>
        {/* Collection rate */}
        <div className="pt-1 border-t">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Collection</span>
            <span className="text-xs font-medium">{rate}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min(parseFloat(rate), 100)}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TermFinancialCards({ termData }: Props) {
  // Compute grand totals
  const grand: TermFinancials = {
    term: -1,
    label: "Total",
    totalCharges: termData.reduce((s, t) => s + t.totalCharges, 0),
    totalPaid: termData.reduce((s, t) => s + t.totalPaid, 0),
    totalDiscount: termData.reduce((s, t) => s + t.totalDiscount, 0),
    outstandingBalance: termData.reduce((s, t) => s + t.outstandingBalance, 0),
  };

  const grandRate =
    grand.totalCharges > 0
      ? ((grand.totalPaid / grand.totalCharges) * 100).toFixed(1)
      : "0";

  // Terms with charges only
  const activeterms = termData.filter((t) => t.totalCharges > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Financial Summary by Installment</h2>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            Total: <strong className="text-foreground">{formatSAR(grand.totalCharges)}</strong>
          </span>
          <span>
            Paid: <strong className="text-green-600">{formatSAR(grand.totalPaid)}</strong>
          </span>
          <span>
            Balance: <strong className="text-red-600">{formatSAR(grand.outstandingBalance)}</strong>
          </span>
          <span>{grandRate}% collected</span>
        </div>
      </div>
      <div
        className={`grid gap-4 ${
          activeterms.length <= 3
            ? "sm:grid-cols-2 lg:grid-cols-3"
            : "sm:grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {activeterms.map((t) => (
          <TermCard key={t.term} data={t} />
        ))}
      </div>
    </div>
  );
}
