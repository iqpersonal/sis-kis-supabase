import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/api-auth";
import { sendEmail } from "@/lib/email-service";
import { sendText } from "@/lib/whatsapp";

const BASE_URL = "https://sis-kis.web.app";

/* ── Shared email layout pieces ── */
function emailHeader() {
  return `
    <div style="background:#1a5632;padding:20px;text-align:center;border-radius:8px 8px 0 0">
      <img src="${BASE_URL}/kis-logo.png" alt="KIS Logo" style="height:60px;margin-bottom:8px" />
      <h1 style="margin:0;font-size:22px;color:#ffffff">Khaled International Schools</h1>
      <p style="margin:4px 0 0;font-size:14px;color:rgba(255,255,255,0.9)">مدارس خالد العالمية</p>
    </div>`;
}

function emailFooter() {
  return `
    <div style="background:#1a5632;padding:20px;text-align:center;border-radius:0 0 8px 8px">
      <p style="color:rgba(255,255,255,0.9);font-size:12px;margin:0 0 12px">
        Khaled International Schools — Admissions Office<br/>
        For questions, reply to this email or call us.
      </p>
      <p style="color:rgba(255,255,255,0.6);font-size:10px;margin:0 0 12px">Accredited &amp; Affiliated with</p>
      <div style="display:inline-block">
        <img src="${BASE_URL}/logos/moe-logo.png" alt="MOE" style="height:40px;margin:0 8px;vertical-align:middle" />
        <img src="${BASE_URL}/logos/cognia-logo.png" alt="Cognia" style="height:40px;margin:0 8px;vertical-align:middle" />
        <img src="${BASE_URL}/logos/ib-logo.png" alt="IB" style="height:40px;margin:0 8px;vertical-align:middle" />
        <img src="${BASE_URL}/logos/ap-logo.png" alt="AP" style="height:40px;margin:0 8px;vertical-align:middle" />
        <img src="${BASE_URL}/logos/lwis-logo.png" alt="LWIS" style="height:40px;margin:0 8px;vertical-align:middle" />
      </div>
    </div>`;
}

function whyKisSection() {
  return `
    <div style="background:#f0faf4;padding:20px;border-radius:6px;margin:20px 0;border-left:4px solid #1a5632">
      <h3 style="color:#1a5632;margin:0 0 12px">Why Khaled International Schools?</h3>
      <p style="color:#333;margin:0 0 8px;font-size:14px;line-height:1.6">
        At KIS, we offer a world-class education that nurtures every child's potential. Here's what sets us apart:
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#444">
        <tr>
          <td style="padding:6px 8px;vertical-align:top;width:20px">🎓</td>
          <td style="padding:6px 0"><strong>Internationally Accredited</strong> — Cognia-accredited with IB &amp; AP programs, recognized by the Saudi Ministry of Education.</td>
        </tr>
        <tr>
          <td style="padding:6px 8px;vertical-align:top">📚</td>
          <td style="padding:6px 0"><strong>American &amp; International Curriculum</strong> — A rigorous academic program from KG through Grade 12, preparing students for top universities worldwide.</td>
        </tr>
        <tr>
          <td style="padding:6px 8px;vertical-align:top">💻</td>
          <td style="padding:6px 0"><strong>Smart Parent &amp; Student Portal</strong> — Stay connected with your child's progress through our web app — access grades, attendance, report cards, and communicate with teachers in real time.</td>
        </tr>
        <tr>
          <td style="padding:6px 8px;vertical-align:top">👨‍🏫</td>
          <td style="padding:6px 0"><strong>Experienced International Faculty</strong> — Qualified teachers from around the world delivering personalized learning experiences.</td>
        </tr>
        <tr>
          <td style="padding:6px 8px;vertical-align:top">🏫</td>
          <td style="padding:6px 0"><strong>Modern Facilities</strong> — Science labs, libraries, sports courts, and dedicated KG play areas in a safe, supportive campus environment.</td>
        </tr>
        <tr>
          <td style="padding:6px 8px;vertical-align:top">🌍</td>
          <td style="padding:6px 0"><strong>Holistic Development</strong> — Beyond academics, we foster leadership, creativity, and social responsibility through clubs, competitions, and community service.</td>
        </tr>
      </table>
    </div>`;
}

function wrapEmail(bodyHtml: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff">${emailHeader()}<div style="padding:24px;border:1px solid #e0e0e0;border-top:none;background:#ffffff">${bodyHtml}</div>${emailFooter()}</div>`;
}

/* ── Build notification per type ── */

function buildContacted(p: NotifyPayload) {
  const whyKis = p.source === "whatsapp" ? whyKisSection() : "";
  const html = wrapEmail(`
    <h2 style="color:#1a5632;margin-top:0">Welcome to Khaled International Schools! / أهلاً بكم في مدارس خالد العالمية</h2>
    <p>Dear <strong>${p.parent_name}</strong>,</p>
    <p>Thank you for your interest in Khaled International Schools. We are delighted to begin the admissions process for your child. Your enquiry reference is <strong style="color:#1a5632">${p.ref_number}</strong>.</p>

    ${whyKis}

    <h3 style="color:#1a5632;margin-bottom:8px">📋 Application Checklist / المستندات المطلوبة</h3>
    <p style="font-size:14px;color:#444">Please prepare and submit the following documents to proceed with the application:</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0">
      <tr style="background:#f5f5f5"><td style="padding:8px;border:1px solid #e0e0e0">1</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Completed Application Form</strong> — available at the Admissions Office or will be sent separately</td></tr>
      <tr><td style="padding:8px;border:1px solid #e0e0e0">2</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Copy of Student's Passport</strong> (with valid residency / Iqama)</td></tr>
      <tr style="background:#f5f5f5"><td style="padding:8px;border:1px solid #e0e0e0">3</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Copy of Parent/Guardian's Passport &amp; Iqama</strong></td></tr>
      <tr><td style="padding:8px;border:1px solid #e0e0e0">4</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Previous School Report Cards / Transcripts</strong> (last 2 years)</td></tr>
      <tr style="background:#f5f5f5"><td style="padding:8px;border:1px solid #e0e0e0">5</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Transfer Certificate</strong> from previous school (if applicable)</td></tr>
      <tr><td style="padding:8px;border:1px solid #e0e0e0">6</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Birth Certificate</strong> (copy)</td></tr>
      <tr style="background:#f5f5f5"><td style="padding:8px;border:1px solid #e0e0e0">7</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Vaccination / Immunization Record</strong></td></tr>
      <tr><td style="padding:8px;border:1px solid #e0e0e0">8</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>4 Passport-size Photographs</strong> of the student</td></tr>
      <tr style="background:#f5f5f5"><td style="padding:8px;border:1px solid #e0e0e0">9</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Medical Records</strong> (if any special conditions)</td></tr>
    </table>

    <p style="font-size:14px;color:#444">You may submit the documents in person at our Admissions Office or email scanned copies to us. Once received, we will schedule the entrance test.</p>
    <p style="margin-top:16px;font-size:14px">We look forward to welcoming your family to our community!</p>
  `);

  const subject = `Application Documents Required — ${p.ref_number} — Khaled International Schools`;

  const text = [
    `Dear ${p.parent_name},`,
    ``,
    `Thank you for your interest in Khaled International Schools (Ref: ${p.ref_number}).`,
    ``,
    `Please prepare the following documents:`,
    `1. Completed Application Form`,
    `2. Student's Passport copy (with Iqama)`,
    `3. Parent's Passport & Iqama copy`,
    `4. Previous Report Cards / Transcripts (last 2 years)`,
    `5. Transfer Certificate (if applicable)`,
    `6. Birth Certificate copy`,
    `7. Vaccination / Immunization Record`,
    `8. 4 Passport-size Photographs`,
    `9. Medical Records (if any)`,
    ``,
    `Submit in person or email scanned copies.`,
    ``,
    `Khaled International Schools — Admissions Office`,
  ].join("\n");

  const waText = [
    `🏫 *Khaled International Schools*`,
    `مدارس خالد العالمية`,
    ``,
    `Dear *${p.parent_name}*,`,
    ``,
    `Thank you for your interest! Your enquiry ref: *${p.ref_number}*`,
    ``,
    `📋 *Required Documents:*`,
    `1️⃣ Application Form`,
    `2️⃣ Student's Passport & Iqama copy`,
    `3️⃣ Parent's Passport & Iqama copy`,
    `4️⃣ Report Cards / Transcripts (last 2 yrs)`,
    `5️⃣ Transfer Certificate (if applicable)`,
    `6️⃣ Birth Certificate copy`,
    `7️⃣ Vaccination Record`,
    `8️⃣ 4 Passport Photos`,
    `9️⃣ Medical Records (if any)`,
    ``,
    `Please submit in person or email scanned copies.`,
    `We will then schedule the entrance test.`,
    ``,
    `For questions, contact the Admissions Office.`,
  ].join("\n");

  return { html, text, subject, waText };
}

function buildSchedule(p: NotifyPayload) {
  const isTest = p.type === "test";
  const eventLabel = isTest ? "Entrance Test" : "Admission Interview";
  const eventLabelAr = isTest ? "اختبار القبول" : "المقابلة الشخصية";
  const whyKis = p.source === "whatsapp" ? whyKisSection() : "";

  const html = wrapEmail(`
    <h2 style="color:#1a5632;margin-top:0">${eventLabel} Scheduled / تم تحديد موعد ${eventLabelAr}</h2>
    <p>Dear <strong>${p.parent_name}</strong>,</p>
    <p>We are pleased to inform you that the <strong>${eventLabel.toLowerCase()}</strong> for your child has been scheduled.</p>

    <div style="background:#f5f5f5;padding:16px;border-radius:6px;margin:16px 0">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:6px 0;color:#666;width:140px"><strong>Reference:</strong></td>
          <td style="padding:6px 0;color:#1a5632;font-weight:bold">${p.ref_number}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666"><strong>Student:</strong></td>
          <td style="padding:6px 0">${p.student_name || "—"}${p.student_grade ? ` (${p.student_grade})` : ""}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666"><strong>Date:</strong></td>
          <td style="padding:6px 0">${p.date}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666"><strong>Time:</strong></td>
          <td style="padding:6px 0">${p.time}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666"><strong>Place:</strong></td>
          <td style="padding:6px 0">${p.place}</td>
        </tr>
        ${p.staff ? `<tr>
          <td style="padding:6px 0;color:#666"><strong>${isTest ? "Testing Teacher" : "Interviewer"}:</strong></td>
          <td style="padding:6px 0">${p.staff}</td>
        </tr>` : ""}
      </table>
    </div>

    <p>Please ensure you arrive <strong>15 minutes</strong> before the scheduled time. Bring the following:</p>
    <ul style="color:#444">
      <li>Student's passport copy</li>
      <li>Previous school report cards / transcripts</li>
      <li>Any relevant medical records</li>
    </ul>

    ${whyKis}

    <p style="margin-top:16px">If you need to reschedule, please contact us as soon as possible.</p>
  `);

  const subject = `${eventLabel} Scheduled — ${p.ref_number} — Khaled International Schools`;

  const text = [
    `Dear ${p.parent_name},`,
    ``,
    `Your child's ${eventLabel.toLowerCase()} has been scheduled:`,
    ``,
    `Reference: ${p.ref_number}`,
    `Student: ${p.student_name || "—"}${p.student_grade ? ` (${p.student_grade})` : ""}`,
    `Date: ${p.date}`,
    `Time: ${p.time}`,
    `Place: ${p.place}`,
    p.staff ? `${isTest ? "Testing Teacher" : "Interviewer"}: ${p.staff}` : "",
    ``,
    `Please arrive 15 minutes early and bring:`,
    `- Passport copy`,
    `- Previous school reports`,
    `- Medical records (if any)`,
    ``,
    `Khaled International Schools — Admissions Office`,
  ].filter(Boolean).join("\n");

  const waText = [
    `🏫 *Khaled International Schools*`,
    `مدارس خالد العالمية`,
    ``,
    `Dear *${p.parent_name}*,`,
    ``,
    `Your child's *${eventLabel.toLowerCase()}* has been scheduled:`,
    ``,
    `📋 *Ref:* ${p.ref_number}`,
    `👤 *Student:* ${p.student_name || "—"}${p.student_grade ? ` (${p.student_grade})` : ""}`,
    `📅 *Date:* ${p.date}`,
    `🕐 *Time:* ${p.time}`,
    `📍 *Place:* ${p.place}`,
    p.staff ? `👨‍🏫 *${isTest ? "Teacher" : "Interviewer"}:* ${p.staff}` : "",
    ``,
    `Please arrive 15 minutes early.`,
    `Bring: passport copy, previous reports, medical records.`,
    ``,
    `For questions, contact the Admissions Office.`,
  ].filter(Boolean).join("\n");

  return { html, text, subject, waText };
}

function buildOfferSent(p: NotifyPayload) {
  const html = wrapEmail(`
    <h2 style="color:#1a5632;margin-top:0">🎉 Admission Offer / عرض القبول</h2>
    <p>Dear <strong>${p.parent_name}</strong>,</p>
    <p>We are pleased to inform you that your child has been <strong style="color:#1a5632">offered admission</strong> to Khaled International Schools! Congratulations!</p>
    <p>Your reference number is <strong style="color:#1a5632">${p.ref_number}</strong>.</p>

    <div style="background:#fff8e1;padding:16px;border-radius:6px;margin:20px 0;border-left:4px solid #f59e0b">
      <h3 style="color:#b45309;margin:0 0 10px">📄 Original Documents Required / المستندات الأصلية المطلوبة</h3>
      <p style="font-size:14px;color:#444;margin:0 0 12px">To confirm your child's enrollment, please submit the following <strong>original documents</strong> to the Admissions Office:</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0">
        <tr style="background:#fef3c7"><td style="padding:8px;border:1px solid #e0e0e0">1</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Original Report Cards / Transcripts</strong> (last 2 years, stamped by previous school)</td></tr>
        <tr><td style="padding:8px;border:1px solid #e0e0e0">2</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Original Transfer Certificate</strong> (stamped &amp; attested)</td></tr>
        <tr style="background:#fef3c7"><td style="padding:8px;border:1px solid #e0e0e0">3</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Original Birth Certificate</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #e0e0e0">4</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Student's Passport</strong> (original for verification + copy to keep)</td></tr>
        <tr style="background:#fef3c7"><td style="padding:8px;border:1px solid #e0e0e0">5</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Parent/Guardian ID &amp; Iqama</strong> (original for verification)</td></tr>
        <tr><td style="padding:8px;border:1px solid #e0e0e0">6</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>Original Vaccination / Immunization Record</strong></td></tr>
        <tr style="background:#fef3c7"><td style="padding:8px;border:1px solid #e0e0e0">7</td><td style="padding:8px;border:1px solid #e0e0e0"><strong>4 Passport-size Photographs</strong></td></tr>
      </table>
    </div>

    <p style="font-size:14px;color:#444">Please visit the Admissions Office at your earliest convenience to submit the originals and complete the enrollment process. The offer is valid for <strong>7 working days</strong>.</p>
    <p style="margin-top:16px;font-size:14px">We look forward to welcoming your child to the KIS family!</p>
  `);

  const subject = `Admission Offer — ${p.ref_number} — Khaled International Schools`;

  const text = [
    `Dear ${p.parent_name},`,
    ``,
    `Congratulations! Your child has been offered admission to Khaled International Schools (Ref: ${p.ref_number}).`,
    ``,
    `To confirm enrollment, please submit the following ORIGINAL documents:`,
    `1. Original Report Cards / Transcripts (last 2 years)`,
    `2. Original Transfer Certificate (stamped & attested)`,
    `3. Original Birth Certificate`,
    `4. Student's Passport (original for verification)`,
    `5. Parent/Guardian ID & Iqama (original for verification)`,
    `6. Original Vaccination Record`,
    `7. 4 Passport-size Photographs`,
    ``,
    `Please visit the Admissions Office within 7 working days.`,
    ``,
    `Khaled International Schools — Admissions Office`,
  ].join("\n");

  const waText = [
    `🏫 *Khaled International Schools*`,
    `مدارس خالد العالمية`,
    ``,
    `Dear *${p.parent_name}*,`,
    ``,
    `🎉 *Congratulations!* Your child has been offered admission!`,
    `📋 *Ref:* ${p.ref_number}`,
    ``,
    `📄 *Please submit these ORIGINAL documents:*`,
    `1️⃣ Original Report Cards / Transcripts`,
    `2️⃣ Original Transfer Certificate (stamped)`,
    `3️⃣ Original Birth Certificate`,
    `4️⃣ Student's Passport (original)`,
    `5️⃣ Parent ID & Iqama (original)`,
    `6️⃣ Original Vaccination Record`,
    `7️⃣ 4 Passport Photos`,
    ``,
    `⏰ Please visit the Admissions Office within 7 working days.`,
    ``,
    `Welcome to the KIS family! 🎓`,
  ].join("\n");

  return { html, text, subject, waText };
}

/* ── Payload type ── */
interface NotifyPayload {
  type: "contacted" | "test" | "interview" | "offer_sent";
  parent_name: string;
  phone?: string;
  email?: string;
  ref_number: string;
  student_name?: string;
  student_grade?: string;
  date?: string;
  time?: string;
  place?: string;
  staff?: string;
  source?: string;
}

/**
 * POST /api/admissions/notify
 *
 * Sends email + WhatsApp notification based on admission status change.
 *
 * Body:
 *   type: "contacted" | "test" | "interview" | "offer_sent"
 *   parent_name, phone, email, ref_number, source
 *   (for test/interview) student_name, student_grade, date, time, place, staff
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const p: NotifyPayload = body;

    if (!p.type || !p.parent_name || !p.ref_number) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Scheduling types require date/time/place
    if ((p.type === "test" || p.type === "interview") && (!p.date || !p.time || !p.place)) {
      return NextResponse.json(
        { error: "Missing date, time, or place for scheduling" },
        { status: 400 }
      );
    }

    // Build content based on type
    let content: { html: string; text: string; subject: string; waText: string };
    switch (p.type) {
      case "contacted":
        content = buildContacted(p);
        break;
      case "test":
      case "interview":
        content = buildSchedule(p);
        break;
      case "offer_sent":
        content = buildOfferSent(p);
        break;
      default:
        return NextResponse.json({ error: "Invalid notification type" }, { status: 400 });
    }

    // ── Send email ──
    let emailResult: { sent: boolean; reason?: string } = { sent: false, reason: "no email" };
    if (p.email) {
      emailResult = await sendEmail({
        to: p.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
        replyTo: process.env.SMTP_USER,
      });
    }

    // ── Send WhatsApp ──
    let whatsappResult = { sent: false, reason: "no phone" };
    if (p.phone) {
      try {
        await sendText({ to: p.phone, text: content.waText });
        whatsappResult = { sent: true, reason: "" };
      } catch (err) {
        whatsappResult = {
          sent: false,
          reason: err instanceof Error ? err.message : "WhatsApp send failed",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      email: emailResult,
      whatsapp: whatsappResult,
    });
  } catch (err) {
    console.error("Admission notify error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
