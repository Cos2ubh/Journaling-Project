const nodemailer = require('nodemailer');
const logger = require('./logger');

const sendEmail = async ({ to, subject, html, text, list, headers }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const mailOptions = {
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(list ? { list } : {}),
    ...(headers ? { headers } : {})
  };

  const info = await transporter.sendMail(mailOptions);
  logger.info(`Email sent: ${info.messageId}`);
  return info;
};

module.exports = sendEmail;
