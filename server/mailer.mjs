import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM ?? "Peppelinos Bar <onboarding@resend.dev>";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export async function sendPasswordResetEmail(toEmail, resetUrl) {
  if (!resend) {
    console.log(`\n[Lösenordsåterställning] RESEND_API_KEY saknas — länk för ${toEmail}:\n${resetUrl}\n`);
    return;
  }

  const { error } = await resend.emails.send({
    from: MAIL_FROM,
    to: toEmail,
    subject: "Återställ ditt lösenord",
    html: `
      <p>Hej!</p>
      <p>Klicka på länken nedan för att återställa ditt lösenord. Länken är giltig i 1 timme.</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>Om du inte begärde detta kan du ignorera mejlet.</p>
    `,
  });

  if (error) {
    throw new Error(`Kunde inte skicka e-post: ${error.message ?? error}`);
  }
}
