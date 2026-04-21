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
import { sendEmail } from "@/lib/email-service";

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

interface AdmissionStudent {
  name?: string;
  gender?: string;
  desired_grade?: string;
}

interface AdmissionSession {
  flow: "admission_enquiry";
  step: "ask_admission" | "parent_name" | "email" | "student_count" | "student_name" | "student_gender" | "student_grade" | "confirm";
  current_child: number;
  total_children: number;
  data: {
    parent_name?: string;
    email?: string;
    students: AdmissionStudent[];
  };
  created_at: string;
  expires_at: string;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

const GRADE_OPTIONS = [
  "KG1", "KG2", "KG3",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12",
];

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

  // 0. Check for active admission session
  const session = await getSession(phone);
  if (session) {
    await handleAdmissionFlow(phone, text.trim(), session);
    console.log(`[WA Bot] Admission flow handled: ${Date.now() - t0}ms total`);
    return;
  }

  // 1. Identify parent by phone (parallel queries)
  const family = await lookupFamilyByPhone(phone);
  const t1 = Date.now();
  console.log(`[WA Bot] Phone lookup: ${t1 - t0}ms`);

  if (!family) {
    // Check if this phone already submitted an admission enquiry
    const existingEnquiry = await lookupExistingEnquiry(phone);
    if (existingEnquiry) {
      await reply(phone, [
        `🏫 *Khaled International Schools*`,
        `مدارس خالد العالمية`,
        ``,
        `✅ We already have your admission enquiry on file.`,
        `لديك استفسار قبول مسجل بالفعل.`,
        ``,
        `📋 *Ref: ${existingEnquiry.ref_number}*`,
        `👤 ${existingEnquiry.parent_name}`,
        `📅 Submitted: ${new Date(existingEnquiry.created_at).toLocaleDateString("en-GB")}`,
        ``,
        `Our admissions team will contact you soon.`,
        `سيتواصل معكم فريق القبول قريباً.`,
        ``,
        `📧 info@kis-riyadh.com`,
        `📞 Registration: +966 9200 33901`,
      ].join("\n"));
      console.log(`[WA Bot] Existing enquiry reply: ${Date.now() - t0}ms total`);
      logBotInteraction(phone, text, "existing_enquiry").catch(() => {});
      return;
    }

    // Create session so next reply routes to admission flow
    await setSession(phone, {
      flow: "admission_enquiry",
      step: "ask_admission",
      current_child: 0,
      total_children: 0,
      data: { students: [] },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    });
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
    `🎓 *هل ترغب في الاستفسار عن القبول؟*`,
    `Interested in admission?`,
    ``,
    `1️⃣ *Yes | نعم*`,
    `2️⃣ *No | لا*`,
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

/* ═══════════════════════════════════════════════════════════════
 *  Admission Enquiry — session management
 * ═══════════════════════════════════════════════════════════════ */

async function getSession(phone: string): Promise<AdmissionSession | null> {
  try {
    const doc = await adminDb.collection("whatsapp_sessions").doc(phone).get();
    if (!doc.exists) return null;
    const session = doc.data() as AdmissionSession;
    if (new Date(session.expires_at) < new Date()) {
      await adminDb.collection("whatsapp_sessions").doc(phone).delete();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

async function setSession(phone: string, session: AdmissionSession): Promise<void> {
  session.expires_at = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await adminDb.collection("whatsapp_sessions").doc(phone).set(session);
}

async function clearSession(phone: string): Promise<void> {
  try {
    await adminDb.collection("whatsapp_sessions").doc(phone).delete();
  } catch { /* ignore */ }
}

/* ═══════════════════════════════════════════════════════════════
 *  Admission Enquiry — multi-step flow handler
 * ═══════════════════════════════════════════════════════════════ */

async function handleAdmissionFlow(
  phone: string,
  text: string,
  session: AdmissionSession
): Promise<void> {
  const input = text.trim();

  switch (session.step) {
    /* ── Ask if interested in admission ── */
    case "ask_admission": {
      if (input === "1") {
        session.step = "parent_name";
        await setSession(phone, session);
        await reply(phone, [
          `📝 *Admission Enquiry*`,
          `استمارة استفسار القبول`,
          ``,
          `Step 1/3: Enter parent/guardian full name`,
          `الخطوة 1/3: أدخل اسم ولي الأمر الكامل`,
        ].join("\n"));
      } else if (input === "2") {
        await clearSession(phone);
        await reply(phone, [
          `Thank you for contacting us! 🙏`,
          `شكراً لتواصلكم معنا!`,
          ``,
          `� info@kis-riyadh.com`,
          `📞 Registration: +966 9200 33901`,
          `📞 +966 11 493 9197`,
          `📞 +966 11 496 0252`,
        ].join("\n"));
      } else {
        await reply(phone, [
          `Please reply:`,
          `1️⃣ *Yes | نعم* — Admission enquiry`,
          `2️⃣ *No | لا* — Exit`,
        ].join("\n"));
      }
      return;
    }

    /* ── Step 1: Parent name ── */
    case "parent_name": {
      if (input.length < 3) {
        await reply(phone, `⚠️ Name too short. Please enter your full name (min 3 characters).\nالاسم قصير جداً. يرجى إدخال الاسم الكامل.`);
        return;
      }
      session.data.parent_name = input;
      session.step = "email";
      await setSession(phone, session);
      await reply(phone, [
        `✅ Name: *${input}*`,
        ``,
        `Step 2/3: Enter your email address`,
        `الخطوة 2/3: أدخل بريدك الإلكتروني`,
      ].join("\n"));
      return;
    }

    /* ── Step 2: Email (mandatory) ── */
    case "email": {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(input)) {
        await reply(phone, `⚠️ Invalid email format. Please enter a valid email address.\nصيغة البريد غير صحيحة. يرجى إدخال بريد إلكتروني صالح.`);
        return;
      }
      session.data.email = input.toLowerCase();
      session.step = "student_count";
      await setSession(phone, session);
      await reply(phone, [
        `✅ Email: *${input.toLowerCase()}*`,
        ``,
        `Step 3/3: How many students to enroll? (1-5)`,
        `الخطوة 3/3: كم عدد الطلاب للتسجيل؟ (1-5)`,
      ].join("\n"));
      return;
    }

    /* ── Step 3: Student count ── */
    case "student_count": {
      const count = parseInt(input, 10);
      if (isNaN(count) || count < 1 || count > 5) {
        await reply(phone, `⚠️ Please enter a number between 1 and 5.\nيرجى إدخال رقم بين 1 و 5.`);
        return;
      }
      session.total_children = count;
      session.current_child = 1;
      session.data.students = [];
      session.step = "student_name";
      await setSession(phone, session);
      await reply(phone, [
        `✅ Students: *${count}*`,
        ``,
        `━━━━━━━━━━━━━━━━━━━━━`,
        `👦 *Student 1 of ${count}*`,
        `Enter student full name:`,
        `أدخل اسم الطالب الكامل:`,
      ].join("\n"));
      return;
    }

    /* ── Per-child: Name ── */
    case "student_name": {
      if (input.length < 3) {
        await reply(phone, `⚠️ Name too short. Please enter student's full name.\nالاسم قصير جداً. يرجى إدخال اسم الطالب الكامل.`);
        return;
      }
      const idx = session.current_child - 1;
      if (!session.data.students[idx]) session.data.students[idx] = {};
      session.data.students[idx].name = input;
      session.step = "student_gender";
      await setSession(phone, session);
      await reply(phone, [
        `✅ Name: *${input}*`,
        ``,
        `Select gender | اختر الجنس:`,
        ``,
        `1️⃣ Male | ذكر`,
        `2️⃣ Female | أنثى`,
      ].join("\n"));
      return;
    }

    /* ── Per-child: Gender ── */
    case "student_gender": {
      let gender: string;
      if (input === "1" || /^(male|ذكر|boy)$/i.test(input)) {
        gender = "Male";
      } else if (input === "2" || /^(female|أنثى|girl)$/i.test(input)) {
        gender = "Female";
      } else {
        await reply(phone, `⚠️ Please reply 1 for Male or 2 for Female.\nيرجى الرد 1 للذكر أو 2 للأنثى.`);
        return;
      }
      const idx = session.current_child - 1;
      session.data.students[idx].gender = gender;
      session.step = "student_grade";
      await setSession(phone, session);

      const gradeList = GRADE_OPTIONS.map((g, i) => `${i + 1}. ${g}`).join("\n");
      await reply(phone, [
        `✅ Gender: *${gender}*`,
        ``,
        `Select desired grade | اختر المرحلة:`,
        ``,
        gradeList,
      ].join("\n"));
      return;
    }

    /* ── Per-child: Grade ── */
    case "student_grade": {
      const gradeIdx = parseInt(input, 10) - 1;
      if (isNaN(gradeIdx) || gradeIdx < 0 || gradeIdx >= GRADE_OPTIONS.length) {
        await reply(phone, `⚠️ Please enter a number between 1 and ${GRADE_OPTIONS.length}.\nيرجى إدخال رقم بين 1 و ${GRADE_OPTIONS.length}.`);
        return;
      }
      const grade = GRADE_OPTIONS[gradeIdx];
      const idx = session.current_child - 1;
      session.data.students[idx].desired_grade = grade;

      // More children?
      if (session.current_child < session.total_children) {
        session.current_child++;
        session.step = "student_name";
        await setSession(phone, session);
        await reply(phone, [
          `✅ Grade: *${grade}*`,
          ``,
          `━━━━━━━━━━━━━━━━━━━━━`,
          `👦 *Student ${session.current_child} of ${session.total_children}*`,
          `Enter student full name:`,
          `أدخل اسم الطالب الكامل:`,
        ].join("\n"));
      } else {
        // All children collected — show confirmation
        session.step = "confirm";
        await setSession(phone, session);
        await reply(phone, buildConfirmationMessage(phone, session));
      }
      return;
    }

    /* ── Confirmation ── */
    case "confirm": {
      if (input === "1") {
        const refNumber = await saveAdmissionEnquiry(phone, session);
        await clearSession(phone);

        // Send confirmation email in background
        sendAdmissionEmail(
          session.data.email!,
          session.data.parent_name!,
          refNumber,
          phone,
          session.data.students as { name: string; gender: string; desired_grade: string }[]
        ).catch(err => console.error("[WA Bot] Admission email failed:", err));

        await reply(phone, [
          `✅ *Enquiry Submitted Successfully!*`,
          `تم تقديم الاستفسار بنجاح!`,
          ``,
          `📋 Reference: *${refNumber}*`,
          `الرقم المرجعي: *${refNumber}*`,
          ``,
          `📧 Confirmation email sent to:`,
          `*${session.data.email}*`,
          ``,
          `📞 Our admissions team will contact`,
          `you shortly on your WhatsApp number.`,
          `سيتواصل معكم فريق القبول قريباً.`,
        ].join("\n"));
        logBotInteraction(phone, `admission_submit:${refNumber}`, "admission_submit").catch(() => {});
      } else if (input === "2") {
        session.step = "parent_name";
        session.current_child = 0;
        session.total_children = 0;
        session.data = { students: [] };
        await setSession(phone, session);
        await reply(phone, [
          `🔄 *Starting over...*`,
          `إعادة البدء...`,
          ``,
          `Step 1/3: Enter parent/guardian full name`,
          `الخطوة 1/3: أدخل اسم ولي الأمر الكامل`,
        ].join("\n"));
      } else if (input === "3") {
        await clearSession(phone);
        await reply(phone, [
          `❌ *Enquiry cancelled.*`,
          `تم إلغاء الاستفسار.`,
          ``,
          `You can start again anytime by sending a message.`,
          `يمكنك البدء مجدداً في أي وقت بإرسال رسالة.`,
        ].join("\n"));
      } else {
        await reply(phone, [
          `Please reply:`,
          `1️⃣ *Confirm & Submit* | تأكيد`,
          `2️⃣ *Start Over* | إعادة`,
          `3️⃣ *Cancel* | إلغاء`,
        ].join("\n"));
      }
      return;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
 *  Admission — confirmation message builder
 * ═══════════════════════════════════════════════════════════════ */

function buildConfirmationMessage(phone: string, session: AdmissionSession): string {
  const lines: string[] = [
    `━━━━━━━━━━━━━━━━━━━━━`,
    `📋 *Admission Enquiry Summary*`,
    `ملخص استفسار القبول`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `👤 *Parent:* ${session.data.parent_name}`,
    `📧 *Email:* ${session.data.email}`,
    `📱 *Phone:* ${phone}`,
    ``,
  ];

  for (let i = 0; i < session.data.students.length; i++) {
    const s = session.data.students[i];
    const icon = s.gender === "Male" ? "👦" : "👧";
    lines.push(`${icon} *Student ${i + 1}:* ${s.name}`);
    lines.push(`   Gender: ${s.gender} | Grade: ${s.desired_grade}`);
    lines.push(``);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Reply:`);
  lines.push(`1️⃣ *Confirm & Submit* | تأكيد`);
  lines.push(`2️⃣ *Start Over* | إعادة`);
  lines.push(`3️⃣ *Cancel* | إلغاء`);

  return lines.join("\n");
}

/* ═══════════════════════════════════════════════════════════════
 *  Admission — check if phone already submitted an enquiry
 * ═══════════════════════════════════════════════════════════════ */

async function lookupExistingEnquiry(phone: string): Promise<{
  ref_number: string; parent_name: string; created_at: string;
} | null> {
  try {
    const snap = await adminDb
      .collection("admission_enquiries")
      .where("phone", "==", phone)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const d = snap.docs[0].data();
    return { ref_number: d.ref_number, parent_name: d.parent_name, created_at: d.created_at };
  } catch (err) {
    console.error("[WA Bot] Error looking up existing enquiry:", err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════
 *  Admission — save to Firestore
 * ═══════════════════════════════════════════════════════════════ */

async function saveAdmissionEnquiry(phone: string, session: AdmissionSession): Promise<string> {
  // Atomic counter for ref number
  const counterRef = adminDb.collection("admission_config").doc("counter");
  const newNum = await adminDb.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()?.last_number || 1000) : 1000;
    const next = current + 1;
    tx.set(counterRef, { last_number: next });
    return next;
  });
  const refNumber = `ADM-${newNum}`;

  await adminDb.collection("admission_enquiries").doc(refNumber).set({
    ref_number: refNumber,
    phone,
    parent_name: session.data.parent_name,
    email: session.data.email,
    students: session.data.students,
    student_count: session.data.students.length,
    status: "new",
    email_sent: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return refNumber;
}

/* ═══════════════════════════════════════════════════════════════
 *  Admission — confirmation email
 * ═══════════════════════════════════════════════════════════════ */

async function sendAdmissionEmail(
  email: string,
  parentName: string,
  refNumber: string,
  phone: string,
  students: { name: string; gender: string; desired_grade: string }[]
): Promise<void> {
  const studentRows = students
    .map(
      (s, i) =>
        `<tr>
          <td style="padding:8px 12px;border:1px solid #e0e0e0;text-align:center">${i + 1}</td>
          <td style="padding:8px 12px;border:1px solid #e0e0e0">${s.name}</td>
          <td style="padding:8px 12px;border:1px solid #e0e0e0;text-align:center">${s.gender}</td>
          <td style="padding:8px 12px;border:1px solid #e0e0e0;text-align:center">${s.desired_grade}</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <div style="background:#1a5632;color:white;padding:20px;text-align:center;border-radius:8px 8px 0 0">
        <h1 style="margin:0;font-size:22px">🏫 Khaled International Schools</h1>
        <p style="margin:4px 0 0;font-size:14px;opacity:0.9">مدارس خالد العالمية</p>
      </div>

      <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px">
        <h2 style="color:#1a5632;margin-top:0">Admission Enquiry Received</h2>
        <p>Dear <strong>${parentName}</strong>,</p>
        <p>Thank you for your interest in Khaled International Schools. We have received your admission enquiry.</p>

        <div style="background:#f5f5f5;padding:12px 16px;border-radius:6px;margin:16px 0">
          <strong>Reference Number:</strong> <span style="color:#1a5632;font-size:18px">${refNumber}</span><br/>
          <strong>Phone:</strong> ${phone}
        </div>

        <h3 style="color:#1a5632">Student Details</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
          <thead>
            <tr style="background:#1a5632;color:white">
              <th style="padding:8px 12px;text-align:center">#</th>
              <th style="padding:8px 12px;text-align:left">Name</th>
              <th style="padding:8px 12px;text-align:center">Gender</th>
              <th style="padding:8px 12px;text-align:center">Grade</th>
            </tr>
          </thead>
          <tbody>${studentRows}</tbody>
        </table>

        <p>Our admissions team will review your enquiry and contact you shortly.</p>

        <hr style="border:none;border-top:1px solid #e0e0e0;margin:20px 0"/>
        <p style="color:#888;font-size:12px;text-align:center">
          Khaled International Schools — Admissions Office<br/>
          For questions, reply to this email or call us.
        </p>
      </div>
    </div>
  `;

  const textBody = [
    `Dear ${parentName},`,
    ``,
    `Thank you for your interest in Khaled International Schools.`,
    `Your admission enquiry has been received.`,
    ``,
    `Reference Number: ${refNumber}`,
    `Phone: ${phone}`,
    ``,
    `Students:`,
    ...students.map((s, i) => `  ${i + 1}. ${s.name} — ${s.gender} — ${s.desired_grade}`),
    ``,
    `Our admissions team will contact you shortly.`,
    ``,
    `Khaled International Schools`,
  ].join("\n");

  const result = await sendEmail({
    to: email,
    subject: `Your Admission Enquiry ${refNumber} - Khaled International Schools`,
    html,
    text: textBody,
    replyTo: process.env.SMTP_USER,
  });

  if (result.sent) {
    try {
      await adminDb.collection("admission_enquiries").doc(refNumber).update({
        email_sent: true,
        updated_at: new Date().toISOString(),
      });
    } catch { /* non-critical */ }
  }
}
