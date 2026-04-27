"use client";

/**
 * Diploma print template – exact replica of KIS High School Diploma.
 *
 * Font specifications:
 *  - "Khaled International Schools" → Old English Text MT, 100pt bold (curved arc)
 *  - "High School Diploma"          → Old English Text MT, 60pt bold
 *  - "This is to Certify that"      → CAC Champagne, 60pt
 *  - Student name                   → CAC Champagne, 60pt bold
 *  - Other body text                → CAC Champagne, 50pt
 *  - Signature labels               → Old English Text MT, 18pt
 */

import QRCode from "qrcode";

export interface DiplomaStudent {
  fullName: string;
  studentNumber: string;
}

export async function printDiplomas(
  students: DiplomaStudent[],
  ceremonyDate: string // e.g. "June 11, 2026"
) {
  if (students.length === 0) return;

  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) {
    alert("Pop-up blocked. Please allow pop-ups for this site.");
    return;
  }

  /* ---- Generate verification codes & QR data URLs ---- */
  const siteUrl = window.location.origin;
  const verifyBase = "https://sis-kis.web.app";
  const qrMap = new Map<string, string>(); // studentNumber → QR dataUrl

  try {
    const verifications: { id: string; studentName: string; studentNumber: string; ceremonyDate: string }[] = [];
    await Promise.all(
      students.map(async (s) => {
        const code = crypto.randomUUID();
        const verifyUrl = `${verifyBase}/verify/${code}`;
        const dataUrl = await QRCode.toDataURL(verifyUrl, { width: 150, margin: 1 });
        qrMap.set(s.studentNumber, dataUrl);
        verifications.push({ id: code, studentName: s.fullName, studentNumber: s.studentNumber, ceremonyDate });
      })
    );
    await fetch("/api/diploma-verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verifications }),
    });
  } catch (err) {
    console.error("QR/verification error:", err);
    alert("Error generating verification codes: " + (err instanceof Error ? err.message : String(err)));
    w.close();
    return;
  }

  /* ---- build ordinal suffix for date ---- */
  const dateParts = ceremonyDate.match(
    /^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/
  );
  let formattedDate = ceremonyDate;
  if (dateParts) {
    const day = parseInt(dateParts[2], 10);
    const suffix =
      day === 1 || day === 21 || day === 31
        ? "st"
        : day === 2 || day === 22
          ? "nd"
          : day === 3 || day === 23
            ? "rd"
            : "th";
    formattedDate = `${dateParts[1]} ${day}<sup>${suffix}</sup>. ${dateParts[3]}`;
  }

  const diplomaHTML = (student: DiplomaStudent) => {
    const qrDataUrl = qrMap.get(student.studentNumber) || "";
    return `
    <div class="diploma-page">
      <div class="diploma-inner">

        <!-- School Name — curved arc via SVG textPath -->
        <svg class="school-name-svg" viewBox="0 0 1400 160" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <path id="curve-${student.studentNumber}" d="M 50,145 Q 700,5 1350,145" fill="transparent" />
          </defs>
          <text class="school-name-text" text-anchor="middle">
            <textPath href="#curve-${student.studentNumber}" startOffset="50%">Khaled International Schools</textPath>
          </text>
        </svg>
        <p class="school-location">Riyadh - Saudi Arabia</p>

        <!-- Logos: KIS crest absolutely centered, LWIS & Cognia flanking -->
        <div class="logos-wrapper">
          <img src="${siteUrl}/logos/lwis-logo.png"  alt="LWIS"   class="logo-lwis" />
          <img src="${siteUrl}/kis-logo.png"         alt="KIS"    class="logo-crest" />
          <img src="${siteUrl}/logos/cognia-logo.png" alt="Cognia" class="logo-cognia" />
        </div>

        <!-- Body -->
        <p class="cert-line certify-line">This is to Certify that</p>

        <h2 class="student-name">${student.fullName}</h2>

        <p class="cert-line">Has completed the course of Study prescribed</p>
        <p class="cert-line">for High School and is entitled to this</p>

        <h2 class="diploma-title">High School Diploma</h2>

        <p class="cert-line">And has earned all rights and privileges pertaining therein</p>

        <p class="cert-line date-line">This ${formattedDate}</p>

        <!-- Signatures -->
        <div class="signatures">
          <div class="sig-block">
            <div class="sig-line"></div>
            <p class="sig-label">School Director</p>
          </div>
          <div class="sig-block">
            <div class="sig-line"></div>
            <p class="sig-label">School Principal</p>
          </div>
        </div>

        <!-- QR Verification -->
        ${qrDataUrl ? `<div class="qr-verification">
          <img src="${qrDataUrl}" alt="Verify" class="qr-code" />
          <span class="qr-label">Scan to verify</span>
        </div>` : ""}
      </div>
    </div>`;
  };

  w.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Diplomas — Khaled International Schools</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=UnifrakturMaguntia&family=Great+Vibes&family=IM+Fell+English+SC&display=swap" rel="stylesheet"/>
<style>
  @page {
    size: A4 landscape;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #e5e5e5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── A4 Landscape page ─────────────────────────────────────────  */
  .diploma-page {
    width: 297mm;
    height: 210mm;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    page-break-after: always;
    margin: 0 auto;
    overflow: hidden;
    position: relative;
  }
  .diploma-page:last-child { page-break-after: auto; }

  .diploma-inner {
    width: 100%;
    height: 100%;
    padding: 8mm 8mm 8mm;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  /* ── "Khaled International Schools" — Old English Text, 100pt bold, curved arc */
  .school-name-svg {
    width: 100%;
    height: 120px;
    margin-bottom: -8px;
    overflow: visible;
  }
  .school-name-text {
    font-family: 'Old English Text MT', 'UnifrakturMaguntia', cursive;
    font-size: 100px;
    font-weight: bold;
    fill: #000;
  }

  /* ── "Riyadh - Saudi Arabia" ───────────────────────────────────  */
  .school-location {
    font-family: 'Old English Text MT', 'UnifrakturMaguntia', cursive;
    font-size: 24px;
    font-weight: normal;
    color: #000;
    letter-spacing: 3px;
    margin-top: 0;
    margin-bottom: 4px;
  }

  /* ── Logos — KIS crest absolutely centered, LWIS & Cognia flanking ─  */
  .logos-wrapper {
    position: relative;
    width: 100%;
    height: 95px;
    margin-bottom: 4px;
  }
  .logo-lwis {
    position: absolute;
    left: 18mm;
    top: 50%;
    transform: translateY(-50%);
    height: 59px;
    object-fit: contain;
  }
  .logo-crest {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    height: 91px;
    object-fit: contain;
  }
  .logo-cognia {
    position: absolute;
    right: 18mm;
    top: 50%;
    transform: translateY(-50%);
    height: 91px;
    object-fit: contain;
  }

  /* ── "This is to Certify that" — CAC Champagne, 45pt ───────────  */
  .certify-line {
    font-family: 'CAC Champagne', 'Great Vibes', cursive;
    font-size: 47px !important;
    margin-top: 2px;
  }

  /* ── Other body text — CAC Champagne, 36pt ─────────────────────  */
  .cert-line {
    font-family: 'CAC Champagne', 'Great Vibes', cursive;
    font-size: 38px;
    font-weight: normal;
    color: #222;
    text-align: center;
    line-height: 1.35;
    margin: 0;
  }

  .date-line {
    margin-top: 4px;
  }
  .date-line sup {
    font-size: 22px;
    vertical-align: super;
  }

  /* ── Student Name — CAC Champagne, 44pt bold ───────────────────  */
  .student-name {
    font-family: 'Book Antiqua', 'Palatino Linotype', 'Palatino', serif;
    font-size: 46px;
    font-weight: bold;
    color: #8F0177;
    text-align: center;
    margin: 0;
    line-height: 1.25;
    white-space: nowrap;
  }

  /* ── "High School Diploma" — Old English Text, 50pt bold ───────  */
  .diploma-title {
    font-family: 'Old English Text MT', 'UnifrakturMaguntia', cursive;
    font-size: 52px;
    font-weight: bold;
    color: #000;
    text-align: center;
    margin: 2px 0 0;
    line-height: 1.15;
  }

  /* ── Signatures — Old English Text, 18pt ───────────────────────  */
  .signatures {
    display: flex;
    justify-content: space-between;
    width: 100%;
    margin-top: auto;
    padding: 0 10mm;
  }
  .sig-block {
    text-align: center;
    width: 180px;
  }
  .sig-line {
    border-top: 1px solid #333;
    margin-bottom: 4px;
  }
  .sig-label {
    font-family: 'Old English Text MT', 'UnifrakturMaguntia', cursive;
    font-size: 18px;
    color: #111;
  }

  /* ── QR Verification ───────────────────────────────────────────  */
  .qr-verification {
    position: absolute;
    bottom: 8mm;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .qr-code {
    width: 80px;
    height: 80px;
  }
  .qr-label {
    font-family: system-ui, sans-serif;
    font-size: 8px;
    color: #666;
    margin-top: 2px;
  }

  /* ── Print ─────────────────────────────────────────────────────  */
  @media print {
    body { background: #fff; }
    .diploma-page { margin: 0; box-shadow: none; }
    .no-print { display: none !important; }
  }

  /* ── Screen: toolbar ───────────────────────────────────────────  */
  .print-toolbar {
    position: fixed; top: 0; left: 0; right: 0;
    background: #0f172a; color: #fff;
    display: flex; align-items: center; justify-content: center;
    gap: 16px; padding: 12px; z-index: 999;
    font-family: system-ui, sans-serif;
  }
  .print-toolbar button {
    background: #2563eb; color: #fff; border: none;
    padding: 8px 24px; border-radius: 6px;
    font-size: 14px; font-weight: 600; cursor: pointer;
  }
  .print-toolbar button:hover { background: #1d4ed8; }
  .print-toolbar span { font-size: 14px; opacity: .8; }

  /* ── Screen: page spacing ──────────────────────────────────────  */
  @media screen {
    .diploma-page {
      margin: 60px auto 20px;
      box-shadow: 0 4px 24px rgba(0,0,0,.18);
    }
    .diploma-page:first-of-type { margin-top: 72px; }
  }
</style>
</head>
<body>
  <div class="print-toolbar no-print">
    <span>${students.length} diploma${students.length > 1 ? "s" : ""} ready</span>
    <button onclick="window.print()">🖨️ Print All</button>
    <button onclick="window.close()" style="background:#475569">✕ Close</button>
  </div>
  ${students.map((s) => diplomaHTML(s)).join("\n")}
<script>
  window.addEventListener('load', function() {
    document.querySelectorAll('.student-name').forEach(function(el) {
      var container = el.closest('.diploma-page');
      if (!container) return;
      var maxWidth = container.clientWidth - 40;
      var fontSize = 46;
      while (el.scrollWidth > maxWidth && fontSize > 16) {
        fontSize--;
        el.style.fontSize = fontSize + 'px';
      }
    });
  });
</script>
</body>
</html>`);

  w.document.close();
}
