// convex/sendamatic/emailRenderer.ts

interface VerificationCodeProps {
  code: string;
  expires: Date;
  minutesUntilExpiry: number;
}

interface PasswordResetProps {
  code: string;
  expires: Date;
  minutesUntilExpiry: number;
}

export async function renderVerificationCodeEmail({ code, minutesUntilExpiry }: VerificationCodeProps): Promise<string> {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Verify Your Email Address</title>
  <style>
    body {
      background-color: #f4f7fa;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Helvetica Neue', sans-serif;
      color: #1a202c;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      width: 100%;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .content {
      padding: 40px 30px;
      background-color: #ffffff;
    }
    h1 {
      color: #1a202c;
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 20px;
      text-align: center;
    }
    .main-text {
      color: #4a5568;
      font-size: 16px;
      line-height: 24px;
      margin: 0 0 20px;
      text-align: center;
    }
    .verification-section {
      background-color: #f7fafc;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }
    .verify-text {
      color: #2d3748;
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 10px;
    }
    .code-text {
      color: #4a90e2;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 4px;
      margin: 10px 0;
      text-align: center;
    }
    .validity-text {
      color: #718096;
      font-size: 14px;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      <h1>Verify Your Email Address</h1>
      <p class="main-text">
        Thanks for starting the new GIW account creation process. We want to make sure it's really you. Please enter the
        following verification code when prompted. If you don't want to create an account, you can ignore this message.
      </p>
      <div class="verification-section">
        <p class="verify-text">Your Verification Code</p>
        <p class="code-text">${code}</p>
        <p class="validity-text">This code expires in ${minutesUntilExpiry} minutes.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

export async function renderPasswordResetEmail({ code, minutesUntilExpiry }: PasswordResetProps): Promise<string> {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Reset Your Password</title>
  <style>
    body {
      background-color: #f4f7fa;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Helvetica Neue', sans-serif;
      color: #1a202c;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      width: 100%;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    .content {
      padding: 40px 30px;
      background-color: #ffffff;
    }
    h1 {
      color: #1a202c;
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 20px;
      text-align: center;
    }
    .main-text {
      color: #4a5568;
      font-size: 16px;
      line-height: 24px;
      margin: 0 0 20px;
      text-align: center;
    }
    .verification-section {
      background-color: #f7fafc;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }
    .verify-text {
      color: #2d3748;
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 10px;
    }
    .code-text {
      color: #4a90e2;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: 4px;
      margin: 10px 0;
      text-align: center;
    }
    .validity-text {
      color: #718096;
      font-size: 14px;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      <h1>Reset Your Password</h1>
      <p class="main-text">
        We received a request to reset your password for your GIW account. Please enter the following verification code when prompted.
      </p>
      <div class="verification-section">
        <p class="verify-text">Your Password Reset Code</p>
        <p class="code-text">${code}</p>
        <p class="validity-text">This code expires in ${minutesUntilExpiry} minutes.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}
