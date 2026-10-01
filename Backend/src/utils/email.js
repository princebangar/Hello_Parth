import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from './logger.js';

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    const { emailHost, emailPort, emailUser, emailPass } = config;
    if (!emailHost || !emailUser || !emailPass) {
        logger.warn('Email not configured: EMAIL_HOST, EMAIL_USER, EMAIL_PASS required');
        return null;
    }
    transporter = nodemailer.createTransport({
        host: emailHost,
        port: emailPort || 587,
        secure: emailPort === 465,
        auth: {
            user: emailUser,
            pass: emailPass
        }
    });
    return transporter;
}

/**
 * Send OTP email for admin forgot password.
 * @param {string} to - Recipient email
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<boolean>} true if sent, false if skipped/failed
 */
export async function sendAdminResetOtpEmail(to, otp) {
    const trans = getTransporter();
    if (!trans) {
        logger.warn('Admin OTP email skipped: SMTP not configured');
        return false;
    }
    const from = config.emailFrom || config.emailUser;
    const subject = 'Your password reset code â€“ Hello Parth Admin';
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 480px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #111;">Password reset code</h2>
  <p>Use the code below to reset your admin password. It is valid for 10 minutes.</p>
  <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; background: #f5f5f5; padding: 12px 16px; border-radius: 8px;">${otp}</p>
  <p style="color: #666; font-size: 14px;">If you did not request this, you can ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">Hello Parth Admin</p>
</body>
</html>`;
    const text = `Your password reset code is: ${otp}. It is valid for 10 minutes. If you did not request this, ignore this email.`;

    try {
        await trans.sendMail({
            from: typeof from === 'string' && from.includes('<') ? from : `Hello Parth <${from}>`,
            to,
            subject,
            text,
            html
        });
        logger.info(`Admin reset OTP email sent to ${to}`);
        return true;
    } catch (err) {
        logger.error(`Failed to send admin OTP email to ${to}:`, err.message);
        return false;
    }
}

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

async function sendSimpleEmail({ to, subject, heading, paragraphs = [], label }) {
    const trans = getTransporter();
    if (!trans || !to) {
        logger.warn(`${label} email skipped: ${!trans ? 'SMTP not configured' : 'no recipient'}`);
        return false;
    }
    const from = config.emailFrom || config.emailUser;
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 520px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #111;">${escapeHtml(heading)}</h2>
  ${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n  ')}
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">Hello Parth</p>
</body>
</html>`;
    try {
        await trans.sendMail({
            from: typeof from === 'string' && from.includes('<') ? from : `Hello Parth <${from}>`,
            to,
            subject,
            text: [heading, ...paragraphs].join('\n\n'),
            html,
        });
        logger.info(`${label} email sent to ${to}`);
        return true;
    } catch (err) {
        logger.error(`Failed to send ${label} email to ${to}: ${err.message}`);
        return false;
    }
}

// Called by admin approve/reject for restaurants and delivery partners — these
// were imported there but never existed, so no approval email ever went out.
export function sendRestaurantApprovalEmail({ to, restaurantName, isChangesApproval }) {
    const name = restaurantName || 'your restaurant';
    return sendSimpleEmail({
        to,
        label: 'Restaurant approval',
        subject: isChangesApproval
            ? `Profile changes approved – ${name}`
            : `Your restaurant "${name}" is approved – Hello Parth`,
        heading: isChangesApproval ? 'Profile changes approved' : 'Congratulations! Your restaurant is approved 🎉',
        paragraphs: isChangesApproval
            ? [`The profile changes for "${name}" have been approved and are now live.`]
            : [
                `Your restaurant "${name}" has been approved on Hello Parth.`,
                'Open the Hello Parth restaurant app to go online and start receiving orders.',
            ],
    });
}

export function sendRestaurantRejectionEmail({ to, restaurantName, reason, isChangesRejection }) {
    const name = restaurantName || 'your restaurant';
    return sendSimpleEmail({
        to,
        label: 'Restaurant rejection',
        subject: isChangesRejection
            ? `Profile changes not approved – ${name}`
            : `Update on your restaurant registration – ${name}`,
        heading: isChangesRejection ? 'Profile changes not approved' : 'Registration update',
        paragraphs: [
            isChangesRejection
                ? `The profile changes for "${name}" were not approved.`
                : `Your restaurant registration for "${name}" was not approved.`,
            `Reason: ${reason || 'Not specified'}`,
            'You can fix the details in the Hello Parth restaurant app and submit again.',
        ],
    });
}

export function sendDeliveryApprovalEmail({ to, partnerName, isChangesApproval }) {
    return sendSimpleEmail({
        to,
        label: 'Delivery approval',
        subject: isChangesApproval
            ? 'Profile changes approved – Hello Parth Delivery'
            : 'Your delivery partner account is approved – Hello Parth',
        heading: isChangesApproval ? 'Profile changes approved' : `Welcome aboard, ${partnerName || 'Partner'}! 🛵`,
        paragraphs: isChangesApproval
            ? ['Your delivery profile changes have been approved.']
            : [
                'Your delivery partner application has been approved.',
                'Open the Hello Parth delivery app to go online and start earning.',
            ],
    });
}

export function sendDeliveryRejectionEmail({ to, partnerName, reason, isChangesRejection }) {
    return sendSimpleEmail({
        to,
        label: 'Delivery rejection',
        subject: isChangesRejection
            ? 'Profile changes not approved – Hello Parth Delivery'
            : 'Update on your delivery partner application – Hello Parth',
        heading: `Hi ${partnerName || 'Partner'},`,
        paragraphs: [
            isChangesRejection
                ? 'Your delivery profile changes were not approved.'
                : 'Your delivery partner application was not approved.',
            `Reason: ${reason || 'Not specified'}`,
            'You can update your details in the Hello Parth delivery app and apply again.',
        ],
    });
}

