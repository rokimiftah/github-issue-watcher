// convex/sendamatic/SendamaticOTP.ts

import { Email } from "@convex-dev/auth/providers/Email";
import { customAlphabet } from "nanoid";

import { renderVerificationCodeEmail } from "./emailRenderer";
import { createSendamaticClient } from "./SendamaticClient";

export const SendamaticOTP = Email({
  id: "sendamatic-otp-v",
  apiKey: `${process.env.SENDAMATIC_USER}-${process.env.SENDAMATIC_PASS}`,
  maxAge: 10 * 60, // 10 minutes
  async generateVerificationToken() {
    const nanoid = customAlphabet("0123456789", 6);
    const token = nanoid();
    return token;
  },
  async sendVerificationRequest({ identifier: email, token, expires }) {
    const minutesUntilExpiry = Math.floor((+expires - Date.now()) / (60 * 1000));
    const sendamatic = createSendamaticClient();

    const htmlEmail = await renderVerificationCodeEmail({
      code: token,
      expires,
      minutesUntilExpiry,
    });

    const result = await sendamatic.sendEmail({
      from: "GitHub Issue Watcher <accounts@giw.web.id>",
      to: email,
      subject: "Verify Your Email for GIW",
      html: htmlEmail,
    });

    if (!result.success) {
      throw new Error(`Could not send email: ${result.error}`);
    }
  },
});
