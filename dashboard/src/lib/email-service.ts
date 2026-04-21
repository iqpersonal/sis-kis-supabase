import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailOptions) {
  const user = process.env.SMTP_USER;
  if (!user) {
    console.warn("SMTP_USER not configured — skipping email send");
    return { sent: false, reason: "SMTP not configured" };
  }

  const from = `Khaled International Schools <${user}>`;

  try {
    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      ...(text && { text }),
      ...(replyTo && { replyTo }),
    });
    return { sent: true };
  } catch (err) {
    console.error("Email send failed:", err);
    return {
      sent: false,
      reason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
