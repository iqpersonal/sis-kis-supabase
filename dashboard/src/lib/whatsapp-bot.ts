/**
 * WhatsApp Parent Bot — command handlers.
 *
 * Identifies the parent by phone number → families collection,
 * then serves data from Firestore (credentials, fees, grades, attendance).
 *
 * All replies use sendText() which works within the 24h service window
 * (the parent already messaged us first).
 */

import { adminDb } from "@/lib/firebase-admin";
import { sendText, normalizePhone, isWhatsAppConfigured } from "@/lib/whatsapp";

/* ═══════════════════════════════════════════════════════════════
 *  Types
 * ═══════════════════════════════════════════════════════════════ */

interface FamilyDoc {
  family_number: string;
  username: string;
  password: string;
  father_name: string;
  family_name: string;
  father_phone: string;
  mother_phone: string;
  children: {
    student_number: string;
    child_name: string;
    gender: string;
    current_class: string;
    current_section: string;
    current_year: string;
  }[];
}

interface ChildFinancials {
  total_charged: number;
  total_paid: number;
  total_discount: number;
  balance: number;
}

interface SubjectGrade {
  subject: string;
  grade: number;
}

interface YearData {
  class_name?: string;
  section_name?: string;
  overall_avg?: number;
  rank?: number;
  class_size?: number;
  subjects?: SubjectGrade[];
}

/* ═══════════════════════════════════════════════════════════════
 *  Main entry — called from webhook
 * ═══════════════════════════════════════════════════════════════ */

export async function handleInboundMessage(from: string, text: string): Promise<void> {
  if (!isWhatsAppConfigured()) {
    console.log(`[WA Bot] API not configured — skipping reply to ${from}`);
    return;
  }

  const phone = normalizePhone(from);

  // 1. Identify parent by phone
  const family = await lookupFamilyByPhone(phone);
  if (!family) {
    await reply(phone, unregisteredMessage());
    await logBotInteraction(phone, text, "unregistered");
    return;
  }

  // 2. Parse command
  const cmd = parseCommand(text);

  // 3. Handle command
  let response: string;
  let action: string;

  switch (cmd) {
    case "login":
      response = handleLogin(family);
      action = "login";
      break;
    case "fees":
      response = await handleFees(family);
      action = "fees";
      break;
    case "grades":
      response = await handleGrades(family);
      action = "grades";
      break;
    case "attendance":
      response = await handleAttendance(family);
      action = "attendance";
      break;
    default:
      response = menuMessage(family.father_name);
      action = "menu";
      break;
  }

  await reply(phone, response);
  await logBotInteraction(phone, text, action, family.family_number);
}

/* ═══════════════════════════════════════════════════════════════
 *  Command parsing — supports Arabic + English + numbers
 * ═══════════════════════════════════════════════════════════════ */

type Command = "login" | "fees" | "grades" | "attendance" | "menu";

const COMMAND_MAP: Record<string, Command> = {
  // Numbers
  "1": "login",
  "2": "fees",
  "3": "grades",
  "4": "attendance",
  "5": "menu",

  // English
  "login": "login",
  "password": "login",
  "credentials": "login",
  "account": "login",
  "fees": "fees",
  "fee": "fees",
  "balance": "fees",
  "payment": "fees",
  "invoice": "fees",
  "grades": "grades",
  "grade": "grades",
  "results": "grades",
  "marks": "grades",
  "score": "grades",
  "scores": "grades",
  "attendance": "attendance",
  "absence": "attendance",
  "absent": "attendance",
  "tardy": "attendance",
  "late": "attendance",
  "help": "menu",
  "menu": "menu",
  "hi": "menu",
  "hello": "menu",
  "start": "menu",

  // Arabic
  "دخول": "login",
  "تسجيل": "login",
  "كلمة المرور": "login",
  "حساب": "login",
  "الرسوم": "fees",
  "رسوم": "fees",
  "مالية": "fees",
  "الرصيد": "fees",
  "دفع": "fees",
  "فاتورة": "fees",
  "الدرجات": "grades",
  "درجات": "grades",
  "نتائج": "grades",
  "علامات": "grades",
  "الحضور": "attendance",
  "حضور": "attendance",
  "غياب": "attendance",
  "تأخر": "attendance",
  "مساعدة": "menu",
  "القائمة": "menu",
  "مرحبا": "menu",
  "السلام عليكم": "menu",
  "اهلا": "menu",
};

function parseCommand(text: string): Command {
  const cleaned = text.trim().toLowerCase();

  // Exact match first
  if (COMMAND_MAP[cleaned]) return COMMAND_MAP[cleaned];

  // Partial match — check if any keyword appears in the message
  for (const [keyword, cmd] of Object.entries(COMMAND_MAP)) {
    if (keyword.length > 1 && cleaned.includes(keyword)) return cmd;
  }

  return "menu";
}

/* ═══════════════════════════════════════════════════════════════
 *  Command handlers
 * ═══════════════════════════════════════════════════════════════ */

function handleLogin(family: FamilyDoc): string {
  return [
    `🔐 *بيانات الدخول | Login Credentials*`,
    ``,
    `👤 *اسم المستخدم | Username:* ${family.username}`,
    `🔑 *كلمة المرور | Password:* ${family.password}`,
    ``,
    `📱 استخدم هذه البيانات لتسجيل الدخول في تطبيق المدرسة`,
    `Use these to log in to the school app`,
  ].join("\n");
}

async function handleFees(family: FamilyDoc): Promise<string> {
  const lines: string[] = [`💰 *الرسوم المالية | Fee Balance*`, ``];

  for (const child of family.children) {
    const progress = await getStudentProgress(child.student_number);
    const year = child.current_year || "25-26";
    const financials: ChildFinancials | undefined =
      (progress?.financials as Record<string, ChildFinancials> | undefined)?.[year];

    lines.push(`👤 *${child.child_name}* (${child.current_class} - ${child.current_section})`);

    if (financials) {
      const balance = financials.balance;
      const statusIcon = balance <= 0 ? "✅" : "⚠️";
      lines.push(`   💵 المستحق | Charged: ${formatCurrency(financials.total_charged)}`);
      lines.push(`   💳 المدفوع | Paid: ${formatCurrency(financials.total_paid)}`);
      if (financials.total_discount > 0) {
        lines.push(`   🏷️ الخصم | Discount: ${formatCurrency(financials.total_discount)}`);
      }
      lines.push(`   ${statusIcon} الرصيد | Balance: ${formatCurrency(balance)}`);
    } else {
      lines.push(`   📋 لا توجد بيانات مالية | No fee data available`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

async function handleGrades(family: FamilyDoc): Promise<string> {
  const lines: string[] = [`📊 *الدرجات | Grades*`, ``];

  for (const child of family.children) {
    const progress = await getStudentProgress(child.student_number);
    const year = child.current_year || "25-26";
    const yearData: YearData | undefined =
      (progress?.years as Record<string, YearData> | undefined)?.[year];

    lines.push(`👤 *${child.child_name}* (${yearData?.class_name || child.current_class} - ${yearData?.section_name || child.current_section})`);

    if (yearData?.overall_avg != null) {
      lines.push(`   📈 المعدل | Average: *${yearData.overall_avg.toFixed(1)}*`);
      if (yearData.rank) {
        lines.push(`   🏅 الترتيب | Rank: ${yearData.rank}/${yearData.class_size || "?"}`);
      }

      // Top 5 subjects
      const subjects = yearData.subjects || [];
      if (subjects.length > 0) {
        const sorted = [...subjects].sort((a, b) => b.grade - a.grade);
        const top = sorted.slice(0, 5);
        lines.push(`   📚 أعلى المواد | Top subjects:`);
        for (const s of top) {
          const emoji = s.grade >= 90 ? "🌟" : s.grade >= 75 ? "👍" : s.grade >= 60 ? "📗" : "⚠️";
          lines.push(`      ${emoji} ${s.subject}: ${s.grade}`);
        }
      }
    } else {
      lines.push(`   📋 لا توجد درجات بعد | No grades available yet`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

async function handleAttendance(family: FamilyDoc): Promise<string> {
  const lines: string[] = [`📅 *الحضور والغياب | Attendance*`, ``];
  const currentYear = "25-26";

  for (const child of family.children) {
    lines.push(`👤 *${child.child_name}* (${child.current_class} - ${child.current_section})`);

    // Count absences for current year
    const absenceSnap = await adminDb
      .collection("student_absence")
      .where("Student_Number", "==", Number(child.student_number) || child.student_number)
      .limit(500)
      .get();

    const absences = absenceSnap.docs.filter((d) => {
      const data = d.data();
      const year = data.Academic_Year || data.Year_Code || "";
      return String(year) === currentYear;
    });

    const totalAbsenceDays = absences.reduce((sum, d) => sum + (d.data().No_of_Days ?? 1), 0);

    // Count tardies for current year
    const tardySnap = await adminDb
      .collection("student_tardy")
      .where("Student_Number", "==", Number(child.student_number) || child.student_number)
      .limit(500)
      .get();

    const tardies = tardySnap.docs.filter((d) => {
      const data = d.data();
      const year = data.Academic_Year || data.Academic_year || "";
      return String(year) === currentYear;
    });

    lines.push(`   ❌ أيام الغياب | Absent days: *${totalAbsenceDays}*`);
    lines.push(`   ⏰ مرات التأخر | Late arrivals: *${tardies.length}*`);

    // Show last 3 absences
    if (absences.length > 0) {
      const recent = absences
        .map((d) => d.data().Absence_Date || "")
        .filter(Boolean)
        .sort()
        .reverse()
        .slice(0, 3);
      if (recent.length > 0) {
        lines.push(`   📋 آخر غياب | Recent: ${recent.join(", ")}`);
      }
    }

    lines.push(``);
  }

  return lines.join("\n");
}

/* ═══════════════════════════════════════════════════════════════
 *  Message templates
 * ═══════════════════════════════════════════════════════════════ */

function menuMessage(parentName: string): string {
  return [
    `مرحباً بك في مدارس خالد العالمية 🏫`,
    `Welcome to Khaled International Schools`,
    ``,
    `أهلاً *${parentName}*`,
    ``,
    `اختر من القائمة | Choose from the menu:`,
    ``,
    `1️⃣  بيانات الدخول | Login Credentials`,
    `2️⃣  الرسوم المالية | Fee Balance`,
    `3️⃣  الدرجات | Grades`,
    `4️⃣  الحضور والغياب | Attendance`,
    `5️⃣  المساعدة | Help`,
    ``,
    `أرسل رقم الخيار أو اكتب الكلمة`,
    `Send the option number or type the keyword`,
  ].join("\n");
}

function unregisteredMessage(): string {
  return [
    `مرحباً بك في مدارس خالد العالمية 🏫`,
    `Welcome to Khaled International Schools`,
    ``,
    `⚠️ لم يتم التعرف على رقمك`,
    `Your phone number is not registered in our system.`,
    ``,
    `يرجى التواصل مع إدارة المدرسة لتحديث بياناتك`,
    `Please contact the school administration to update your records.`,
  ].join("\n");
}

/* ═══════════════════════════════════════════════════════════════
 *  Helpers
 * ═══════════════════════════════════════════════════════════════ */

async function lookupFamilyByPhone(phone: string): Promise<FamilyDoc | null> {
  // Normalize the input phone for matching
  const normalized = normalizePhone(phone);

  // Try matching father_phone first, then mother_phone
  // We check all families since phone format may vary in DB
  const snap = await adminDb.collection("families").get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const fatherPhone = data.father_phone ? normalizePhone(String(data.father_phone)) : "";
    const motherPhone = data.mother_phone ? normalizePhone(String(data.mother_phone)) : "";

    if (
      (fatherPhone && fatherPhone === normalized) ||
      (motherPhone && motherPhone === normalized)
    ) {
      return data as FamilyDoc;
    }
  }

  return null;
}

async function getStudentProgress(studentNumber: string): Promise<Record<string, unknown> | null> {
  try {
    const doc = await adminDb.collection("student_progress").doc(studentNumber).get();
    return doc.exists ? (doc.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function formatCurrency(amount: number): string {
  return `${amount.toLocaleString("en-SA")} ر.س`;
}

async function logBotInteraction(
  phone: string,
  message: string,
  action: string,
  familyNumber?: string
): Promise<void> {
  try {
    await adminDb.collection("whatsapp_bot_log").add({
      phone,
      message: message.slice(0, 500),
      action,
      family_number: familyNumber || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Failed to log bot interaction:", err);
  }
}

async function reply(to: string, text: string): Promise<void> {
  try {
    await sendText({ to, text });
  } catch (err) {
    console.error(`[WA Bot] Failed to reply to ${to}:`, err);
  }
}
