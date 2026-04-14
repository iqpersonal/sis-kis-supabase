/**
 * WhatsApp Parent Bot — command handlers.
 *
 * Identifies the parent by phone number → families collection,
 * then serves data from Firestore.
 *
 * Features:
 *  1. Eduflag (family) login credentials
 *  2. Online Books (per-student) login credentials
 *  3. Fee balance inquiry
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

/* ═══════════════════════════════════════════════════════════════
 *  Main entry — called from webhook
 * ═══════════════════════════════════════════════════════════════ */

export async function handleInboundMessage(from: string, text: string): Promise<void> {
  const t0 = Date.now();

  if (!isWhatsAppConfigured()) {
    console.log(`[WA Bot] API not configured — skipping reply to ${from}`);
    return;
  }

  const phone = normalizePhone(from);

  // 1. Identify parent by phone (parallel queries)
  const family = await lookupFamilyByPhone(phone);
  const t1 = Date.now();
  console.log(`[WA Bot] Phone lookup: ${t1 - t0}ms`);

  if (!family) {
    await reply(phone, unregisteredMessage());
    console.log(`[WA Bot] Unregistered reply sent: ${Date.now() - t0}ms total`);
    logBotInteraction(phone, text, "unregistered").catch(() => {});
    return;
  }

  // 2. Parse command
  const cmd = parseCommand(text);

  // 3. Pre-fetch all children's progress in parallel (needed for eduflag/books/fees)
  const progressMap = cmd !== "menu"
    ? await prefetchChildrenProgress(family.children.map(c => c.student_number))
    : new Map<string, Record<string, unknown>>();
  const t2 = Date.now();
  if (cmd !== "menu") console.log(`[WA Bot] Progress fetch: ${t2 - t1}ms`);

  // 4. Handle command
  let response: string;
  let action: string;

  switch (cmd) {
    case "eduflag":
      response = handleEduflag(family, progressMap);
      action = "eduflag";
      break;
    case "books":
      response = handleOnlineBooks(family, progressMap);
      action = "books";
      break;
    case "fees":
      response = handleFees(family, progressMap);
      action = "fees";
      break;
    default:
      response = menuMessage(family.father_name);
      action = "menu";
      break;
  }

  // Reply first, log in background (don't block the response)
  await reply(phone, response);
  console.log(`[WA Bot] Reply sent (${action}): ${Date.now() - t0}ms total`);
  logBotInteraction(phone, text, action, family.family_number).catch(() => {});
}

/* ═══════════════════════════════════════════════════════════════
 *  Command parsing — supports Arabic + English + numbers
 * ═══════════════════════════════════════════════════════════════ */

type Command = "eduflag" | "books" | "fees" | "menu";

const COMMAND_MAP: Record<string, Command> = {
  // Numbers
  "1": "eduflag",
  "2": "books",
  "3": "fees",
  "4": "menu",

  // English — Eduflag / family login
  "eduflag": "eduflag",
  "login": "eduflag",
  "password": "eduflag",
  "credentials": "eduflag",
  "account": "eduflag",
  "family": "eduflag",

  // English — Online books / student login
  "books": "books",
  "book": "books",
  "online": "books",
  "student": "books",
  "students": "books",

  // English — Fees
  "fees": "fees",
  "fee": "fees",
  "balance": "fees",
  "payment": "fees",
  "invoice": "fees",

  // English — Menu / help
  "help": "menu",
  "menu": "menu",
  "hi": "menu",
  "hello": "menu",
  "start": "menu",

  // Arabic — Eduflag / family login
  "دخول": "eduflag",
  "تسجيل": "eduflag",
  "كلمة المرور": "eduflag",
  "حساب": "eduflag",
  "بيانات": "eduflag",

  // Arabic — Online books
  "كتب": "books",
  "الكتب": "books",
  "كتب الكترونية": "books",
  "طالب": "books",
  "الطالب": "books",

  // Arabic — Fees
  "الرسوم": "fees",
  "رسوم": "fees",
  "مالية": "fees",
  "الرصيد": "fees",
  "دفع": "fees",
  "فاتورة": "fees",

  // Arabic — Menu / help
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
 *  Command handlers (synchronous — data already pre-fetched)
 * ═══════════════════════════════════════════════════════════════ */

/** Eduflag (family) credentials — username + password from raw SQL data */
function handleEduflag(family: FamilyDoc, progressMap: Map<string, Record<string, unknown>>): string {
  let plainPassword = "";
  if (family.children.length > 0) {
    const progress = progressMap.get(family.children[0].student_number);
    const rawFamily = progress?.raw_family as Record<string, unknown> | undefined;
    plainPassword = String(rawFamily?.Family_Password || "").trim();
  }

  if (!plainPassword) {
    plainPassword = "غير متوفر | Not available";
  }

  return [
    `━━━━━━━━━━━━━━━━━━━━━`,
    `🔐 *Eduflag Credentials*`,
    `     *بيانات الدخول*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `👤  *Username:*  ${family.username}`,
    `      *اسم المستخدم*`,
    ``,
    `🔑  *Password:*  ${plainPassword}`,
    `      *كلمة المرور*`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📱 Use these to log in to the`,
    `     Eduflag app / website`,
    ``,
    `     استخدم هذه البيانات لتسجيل`,
    `     الدخول في تطبيق Eduflag`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `🔢 Send *4* for menu | أرسل *4* للقائمة`,
  ].join("\n");
}

/** Online Books (student) credentials — per-child username + password */
function handleOnlineBooks(family: FamilyDoc, progressMap: Map<string, Record<string, unknown>>): string {
  const lines: string[] = [
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📚 *Online Books Credentials*`,
    `     *بيانات الكتب الإلكترونية*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
  ];

  for (const child of family.children) {
    const progress = progressMap.get(child.student_number);
    const rawStudent = progress?.raw_student as Record<string, unknown> | undefined;

    const username = String(rawStudent?.UserName || child.student_number).trim();
    let password = String(rawStudent?.Password || "").trim();

    if (!password || password.startsWith("$2")) {
      password = generateStudentPassword(child.child_name, child.student_number);
    }

    lines.push(`📌 *${child.child_name}*`);
    lines.push(`     📖 Class: ${child.current_class}`);
    lines.push(`     👤 Username: \`${username}\``);
    lines.push(`     🔑 Password: \`${password}\``);
    lines.push(`     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─`);
    lines.push(``);
  }

  lines.push(`🔢 Send *4* for menu | أرسل *4* للقائمة`);

  return lines.join("\n");
}

/** Fee balance per child */
function handleFees(family: FamilyDoc, progressMap: Map<string, Record<string, unknown>>): string {
  const lines: string[] = [
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💰 *Fee Balance*`,
    `     *الرسوم المالية*`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
  ];

  for (const child of family.children) {
    const progress = progressMap.get(child.student_number);
    const year = child.current_year || "25-26";
    const financials: ChildFinancials | undefined =
      (progress?.financials as Record<string, ChildFinancials> | undefined)?.[year];

    lines.push(`📌 *${child.child_name}*`);
    lines.push(`     📖 ${child.current_class} - ${child.current_section}`);

    if (financials) {
      const balance = financials.balance;
      const statusIcon = balance <= 0 ? "✅" : "🔴";
      const statusText = balance <= 0 ? "Paid | مسدد" : "Due | مستحق";
      lines.push(`     💵 Charged: ${formatCurrency(financials.total_charged)}`);
      lines.push(`     💳 Paid: ${formatCurrency(financials.total_paid)}`);
      if (financials.total_discount > 0) {
        lines.push(`     🏷️ Discount: ${formatCurrency(financials.total_discount)}`);
      }
      lines.push(`     ${statusIcon} *Balance: ${formatCurrency(balance)}* (${statusText})`);
    } else {
      lines.push(`     📋 No fee data available`);
      lines.push(`          لا توجد بيانات مالية`);
    }
    lines.push(`     ─ ─ ─ ─ ─ ─ ─ ─ ─ ─`);
    lines.push(``);
  }

  lines.push(`🔢 Send *4* for menu | أرسل *4* للقائمة`);

  return lines.join("\n");
}

/* ═══════════════════════════════════════════════════════════════
 *  Message templates
 * ═══════════════════════════════════════════════════════════════ */

function menuMessage(parentName: string): string {
  return [
    `🏫 *Khaled International Schools*`,
    `مدارس خالد العالمية`,
    ``,
    `مرحباً *${parentName}* 👋`,
    ``,
    `📋 *الخدمات المتاحة | Services:*`,
    ``,
    `1️⃣  🔐  *Eduflag Credentials*`,
    `      بيانات الدخول`,
    ``,
    `2️⃣  📚  *Online Books Credentials*`,
    `      بيانات الكتب الإلكترونية`,
    ``,
    `3️⃣  💰  *Fee Balance*`,
    `      الرسوم المالية`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `🔢 أرسل *رقم* الخيار`,
    `Send option *number*`,
  ].join("\n");
}

function unregisteredMessage(): string {
  return [
    `🏫 *Khaled International Schools*`,
    `مدارس خالد العالمية`,
    ``,
    `⚠️ *رقمك غير مسجل في النظام*`,
    `Your number is not registered.`,
    ``,
    `📞 يرجى التواصل مع إدارة المدرسة`,
    `Please contact administration`,
    `to update your records.`,
  ].join("\n");
}

/* ═══════════════════════════════════════════════════════════════
 *  Helpers
 * ═══════════════════════════════════════════════════════════════ */

/** Strip phone to digits only */
function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Build all plausible phone formats from the input so we can query Firestore
 * with exact .where() matches instead of loading all families.
 * DB stores phones as "966XXXXXXXXX" (digits, no +).
 */
function buildPhoneVariants(phone: string): string[] {
  const digits = phoneDigits(phone);
  const local9 = digits.length >= 9 ? digits.slice(-9) : digits;
  const variants = new Set<string>();

  variants.add("966" + local9);
  variants.add("+966" + local9);
  variants.add("0" + local9);
  variants.add(digits);

  return [...variants];
}

/**
 * Lookup family by phone — fires ALL variant queries in parallel for speed.
 * Previously did 8 sequential queries; now resolves in a single round-trip.
 */
async function lookupFamilyByPhone(phone: string): Promise<FamilyDoc | null> {
  const variants = buildPhoneVariants(phone);
  const fields = ["father_phone", "mother_phone"] as const;

  // Fire all queries in parallel
  const queries = fields.flatMap(field =>
    variants.map(variant =>
      adminDb.collection("families").where(field, "==", variant).limit(1).get()
    )
  );

  const results = await Promise.all(queries);

  for (const snap of results) {
    if (!snap.empty) {
      return snap.docs[0].data() as FamilyDoc;
    }
  }

  return null;
}

/**
 * Pre-fetch student_progress for all children in parallel.
 * Returns a Map for O(1) lookup by student_number.
 */
async function prefetchChildrenProgress(
  studentNumbers: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (studentNumbers.length === 0) return map;

  const fetches = studentNumbers.map(async (sn) => {
    try {
      const doc = await adminDb.collection("student_progress").doc(sn).get();
      if (doc.exists) map.set(sn, doc.data() as Record<string, unknown>);
    } catch { /* skip */ }
  });

  await Promise.all(fetches);
  return map;
}

/** Generate the default student password: first 3 latin letters of name + last 4 digits of student_number */
function generateStudentPassword(childName: string, studentNumber: string): string {
  const firstName = childName.split(/\s+/)[0] || "";
  let prefix = "";
  for (const ch of firstName.toLowerCase()) {
    if (/[a-z]/.test(ch)) prefix += ch;
    if (prefix.length === 3) break;
  }
  if (!prefix) prefix = "stu";
  const suffix = studentNumber.slice(-4);
  return prefix + suffix;
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
