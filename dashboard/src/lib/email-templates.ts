/* KIS-branded email templates — inline CSS for email-client compatibility */

const KIS_BLUE = "#1a365d";
const KIS_GOLD = "#c9a84c";
const LOGO_URL = "https://sis-kis.web.app/KIS-Logo.png";
const DASHBOARD_URL = "https://sis-kis.web.app";

function baseLayout(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <!-- Header -->
    <tr><td style="background:${KIS_BLUE};padding:24px 32px;text-align:center;">
      <img src="${LOGO_URL}" alt="KIS Logo" width="80" style="display:inline-block;vertical-align:middle;">
      <span style="display:inline-block;vertical-align:middle;margin-left:16px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.5px;">
        Knowledge International School
      </span>
    </td></tr>
    <!-- Gold accent line -->
    <tr><td style="background:${KIS_GOLD};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
    <!-- Body -->
    <tr><td style="padding:32px;">
      ${body}
    </td></tr>
    <!-- Footer -->
    <tr><td style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6b7280;">
      Knowledge International School &middot; Riyadh, Saudi Arabia<br>
      <a href="${DASHBOARD_URL}" style="color:${KIS_BLUE};text-decoration:none;">sis-kis.web.app</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Teacher / Staff Welcome Email ──────────────────────────────

interface WelcomeEmailData {
  displayName: string;
  email: string;
  role: string;
  resetLink: string;
}

export function teacherWelcomeEmail(data: WelcomeEmailData) {
  const subject = "Welcome to KIS — Your SIS Account is Ready";

  const html = baseLayout(`
    <h2 style="margin:0 0 16px;color:${KIS_BLUE};font-size:20px;">Welcome, ${data.displayName}!</h2>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
      An account has been created for you on the <strong>Knowledge International School</strong> Student Information System.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <tr><td style="padding:10px 16px;background:#f9fafb;font-size:13px;color:#6b7280;width:100px;">Email</td>
          <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;">${data.email}</td></tr>
      <tr><td style="padding:10px 16px;background:#f9fafb;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Role</td>
          <td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #e5e7eb;">${data.role}</td></tr>
    </table>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
      Please set your password by clicking the button below. This link expires in 24 hours.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr><td style="background:${KIS_BLUE};border-radius:6px;padding:12px 32px;">
        <a href="${data.resetLink}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;">
          Set Your Password
        </a>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
      After setting your password, sign in at <a href="${DASHBOARD_URL}" style="color:${KIS_BLUE};text-decoration:underline;">${DASHBOARD_URL}</a>.
      <br>If you did not expect this email, please contact the school administration.
    </p>
  `);

  return { subject, html };
}

// ── Bulk Upload Welcome Email (password provided) ──────────────

interface BulkWelcomeData {
  displayName: string;
  email: string;
  password: string;
  role: string;
}

export function bulkWelcomeEmail(data: BulkWelcomeData) {
  const subject = "Welcome to KIS — Your SIS Account Credentials";

  const html = baseLayout(`
    <h2 style="margin:0 0 16px;color:${KIS_BLUE};font-size:20px;">Welcome, ${data.displayName}!</h2>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
      An account has been created for you on the <strong>Knowledge International School</strong> Student Information System.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <tr><td style="padding:10px 16px;background:#f9fafb;font-size:13px;color:#6b7280;width:100px;">Email</td>
          <td style="padding:10px 16px;font-size:14px;color:#111827;font-weight:600;">${data.email}</td></tr>
      <tr><td style="padding:10px 16px;background:#f9fafb;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Password</td>
          <td style="padding:10px 16px;font-size:14px;color:#111827;font-family:monospace;border-top:1px solid #e5e7eb;">${data.password}</td></tr>
      <tr><td style="padding:10px 16px;background:#f9fafb;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;">Role</td>
          <td style="padding:10px 16px;font-size:14px;color:#111827;border-top:1px solid #e5e7eb;">${data.role}</td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr><td style="background:${KIS_BLUE};border-radius:6px;padding:12px 32px;">
        <a href="${DASHBOARD_URL}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;">
          Sign In to SIS
        </a>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
      We recommend changing your password after your first sign-in.<br>
      If you did not expect this email, please contact the school administration.
    </p>
  `);

  return { subject, html };
}

// ── Password Reset Email ───────────────────────────────────────

interface PasswordResetData {
  displayName: string;
  resetLink: string;
}

export function passwordResetEmail(data: PasswordResetData) {
  const subject = "KIS SIS — Password Reset Request";

  const html = baseLayout(`
    <h2 style="margin:0 0 16px;color:${KIS_BLUE};font-size:20px;">Password Reset</h2>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">
      Hi ${data.displayName}, a password reset was requested for your KIS SIS account.
    </p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
      Click the button below to set a new password. This link expires in 24 hours.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      <tr><td style="background:${KIS_BLUE};border-radius:6px;padding:12px 32px;">
        <a href="${data.resetLink}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;">
          Reset Password
        </a>
      </td></tr>
    </table>
    <p style="margin:20px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
      If you did not request a password reset, you can safely ignore this email.
    </p>
  `);

  return { subject, html };
}
