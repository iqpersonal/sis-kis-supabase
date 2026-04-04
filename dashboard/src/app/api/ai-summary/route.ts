import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/api-auth";

/**
 * POST /api/ai-summary
 *
 * Accepts report data and returns an AI-generated summary of the
 * current month's performance.
 *
 * Uses the Google Generative AI (Gemini) REST API so no extra SDK is needed.
 * Set GOOGLE_AI_API_KEY in .env.local.
 *
 * Falls back to a simple heuristic summary if no API key is configured.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { reports } = (await req.json()) as {
      reports: {
        date: string;
        category: string;
        revenue: number;
        units: number;
        profit: number;
        status: string;
      }[];
    };

    // Build a concise text representation
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const thisMonth = reports.filter((r) => r.date.startsWith(currentMonth));
    const totalRevenue = reports.reduce((s, r) => s + r.revenue, 0);
    const totalProfit = reports.reduce((s, r) => s + r.profit, 0);
    const monthRevenue = thisMonth.reduce((s, r) => s + r.revenue, 0);
    const monthProfit = thisMonth.reduce((s, r) => s + r.profit, 0);
    const monthUnits = thisMonth.reduce((s, r) => s + r.units, 0);

    const prompt = `You are a business analyst. Given the following data, write a concise 3-4 sentence executive summary of this month's performance compared to the overall dataset. Be specific with numbers.

Current month (${currentMonth}):
- Reports: ${thisMonth.length}
- Revenue: $${monthRevenue.toLocaleString()}
- Profit: $${monthProfit.toLocaleString()}
- Units sold: ${monthUnits.toLocaleString()}
- Categories: ${[...new Set(thisMonth.map((r) => r.category))].join(", ") || "N/A"}

Overall totals (${reports.length} reports):
- Revenue: $${totalRevenue.toLocaleString()}
- Profit: $${totalProfit.toLocaleString()}
- Avg profit margin: ${((totalProfit / totalRevenue) * 100).toFixed(1)}%`;

    const apiKey = process.env.GOOGLE_AI_API_KEY;

    if (apiKey) {
      // Call Gemini API
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Gemini API error: ${res.status}`);
      }

      const json = await res.json();
      const text =
        json?.candidates?.[0]?.content?.parts?.[0]?.text ??
        "Unable to generate summary.";

      return NextResponse.json({ summary: text });
    }

    // Fallback: generate a basic summary without AI
    const margin = monthRevenue
      ? ((monthProfit / monthRevenue) * 100).toFixed(1)
      : "0";

    const fallback = `This month (${currentMonth}) recorded ${thisMonth.length} report(s) totaling $${monthRevenue.toLocaleString()} in revenue and $${monthProfit.toLocaleString()} in profit (${margin}% margin). ${
      thisMonth.length
        ? `Key categories include ${[...new Set(thisMonth.map((r) => r.category))].join(" and ")}. Units sold reached ${monthUnits.toLocaleString()}.`
        : "No data has been recorded for this month yet."
    } Overall, the dataset contains ${reports.length} reports with $${totalRevenue.toLocaleString()} total revenue.`;

    return NextResponse.json({ summary: fallback });
  } catch (err) {
    console.error("AI summary error:", err);
    return NextResponse.json(
      { summary: "Unable to generate summary at this time." },
      { status: 500 }
    );
  }
}
