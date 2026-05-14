const User = require('../models/User');

let firebaseAdmin = null;
let firebaseReady = false;

const initFirebaseAdmin = () => {
  if (firebaseReady) return firebaseAdmin;
  firebaseReady = true;

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;

  try {
    // Optional runtime dependency. Push delivery is skipped cleanly when it is not installed.
    // Install firebase-admin and set FIREBASE_SERVICE_ACCOUNT_JSON to enable real FCM sends.
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    firebaseAdmin = admin;
    return firebaseAdmin;
  } catch (error) {
    console.warn('[FCM] Firebase Admin unavailable:', error.message);
    return null;
  }
};

const sendToUser = async (userId, { title, body, url = '/', data = {} }) => {
  const admin = initFirebaseAdmin();
  if (!admin) return { sent: 0, failed: 0, skipped: true };

  const user = await User.findById(userId).select('fcmTokens').lean();
  const tokens = [...new Set(user?.fcmTokens || [])].filter(Boolean);
  if (!tokens.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const invalidTokens = [];

  for (const token of tokens) {
    try {
      await admin.messaging().send({
        token,
        notification: { title, body },
        data: Object.fromEntries(Object.entries({ url, ...data }).map(([k, v]) => [k, String(v ?? '')])),
        webpush: { fcmOptions: { link: url } },
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      if (
        error.code === 'messaging/registration-token-not-registered' ||
        error.code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(token);
      } else {
        console.warn('[FCM] send failed:', error.message);
      }
    }
  }

  if (invalidTokens.length) {
    await User.findByIdAndUpdate(userId, { $pull: { fcmTokens: { $in: invalidTokens } } });
  }

  return { sent, failed };
};

const sendToUsers = async (userIds, payload) => {
  const results = await Promise.all((userIds || []).map((id) => sendToUser(id, payload)));
  return results.reduce((acc, item) => ({
    sent: acc.sent + (item.sent || 0),
    failed: acc.failed + (item.failed || 0),
    skipped: acc.skipped && item.skipped,
  }), { sent: 0, failed: 0, skipped: true });
};

module.exports = { sendToUser, sendToUsers };
