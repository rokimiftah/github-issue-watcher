// convex/sendamatic/SendamaticOTPPasswordReset.ts

import { Email } from "@convex-dev/auth/providers/Email";
import { customAlphabet } from "nanoid";

import { renderPasswordResetEmail } from "./emailRenderer";
import { createSendamaticClient } from "./SendamaticClient";

export const SendamaticOTPPasswordReset = Email({
  id: "sendamatic-pw-reset",
  apiKey: `${process.env.SENDAMATIC_USER}-${process.env.SENDAMATIC_PASS}`,
  async generateVerificationToken() {
    const nanoid = customAlphabet("0123456789", 6);
    const token = nanoid();
    return token;
  },
  async sendVerificationRequest({ identifier: email, token, expires }) {
    const minutesUntilExpiry = Math.floor((+expires - Date.now()) / (60 * 1000));
    const sendamatic = createSendamaticClient();

    const htmlEmail = await renderPasswordResetEmail({
      code: token,
      expires,
      minutesUntilExpiry,
    });

    const result = await sendamatic.sendEmail({
      from: "GitHub Issue Watcher <accounts@giw.web.id>",
      to: email,
      subject: "Reset Your Password for GIW",
      html: htmlEmail,
    });

    if (!result.success) {
      throw new Error(`Could not send email: ${result.error}`);
    }
  },
});
