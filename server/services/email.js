const nodemailer = require('nodemailer');

let transporter = null;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    const port = parseInt(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
}

async function sendWelcomeEmail({ to, name, setupUrl }) {
  if (!isConfigured()) return false;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f1225;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1225;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#1a1f36;border-radius:12px;border:1px solid #252b45;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background:#252b45;padding:24px 32px;text-align:center;">
            <span style="font-size:28px;font-weight:700;color:#22d3ee;letter-spacing:2px;">A.R.I.S.</span>
            <br>
            <span style="font-size:12px;color:#94a3b8;letter-spacing:1px;">Asistente Corporativo</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="color:#e2e8f0;font-size:16px;margin:0 0 16px;">Hola <strong>${name}</strong>,</p>
            <p style="color:#94a3b8;font-size:14px;margin:0 0 8px;line-height:1.6;">
              Se ha creado tu cuenta en <strong style="color:#22d3ee;">A.R.I.S.</strong>.
            </p>
            <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;line-height:1.6;">
              Para empezar a usar tu cuenta, haz clic en el botón de abajo para establecer tu contraseña. Este enlace es válido durante 48 horas.
            </p>
            <!-- Button -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="${setupUrl}" style="display:inline-block;background:#22d3ee;color:#0f1225;font-weight:600;font-size:14px;padding:12px 32px;border-radius:8px;text-decoration:none;">
                  Configurar mi Contraseña
                </a>
              </td></tr>
            </table>
            <p style="color:#64748b;font-size:12px;margin:24px 0 0;line-height:1.5;">
              Si no solicitaste esta cuenta, puedes ignorar este correo.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#252b45;padding:16px 32px;text-align:center;">
            <span style="color:#64748b;font-size:11px;">A.R.I.S. — Asistente Corporativo de SmartGroup</span>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: 'Bienvenido a A.R.I.S. — Configura tu contraseña',
      html
    });
    console.log(`Welcome email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`Failed to send welcome email to ${to}:`, err.message);
    return false;
  }
}

module.exports = { isConfigured, sendWelcomeEmail };
