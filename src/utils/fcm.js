const User = require('../models/User');

let firebaseAdmin = null;
let firebaseReady = false;

const buildServiceAccount = () => {
  // Option 1: full JSON env (optional fallback)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (error) {
      console.warn('[FCM] Invalid FIREBASE_SERVICE_ACCOUNT_JSON:', error.message);
      return null;
    }
  }

  // Option 2: split env vars (your current setup)
  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_PRIVATE_KEY_ID,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_CLIENT_ID,
    FIREBASE_AUTH_URI,
    FIREBASE_TOKEN_URI,
    FIREBASE_AUTH_PROVIDER_CERT_URL,
    FIREBASE_CLIENT_CERT_URL,
  } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_PRIVATE_KEY || !FIREBASE_CLIENT_EMAIL) {
    return null;
  }

  return {
    type: 'service_account',
    project_id: FIREBASE_PROJECT_ID,
    private_key_id: FIREBASE_PRIVATE_KEY_ID || undefined,
    private_key: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: FIREBASE_CLIENT_EMAIL,
    client_id: FIREBASE_CLIENT_ID || undefined,
    auth_uri: FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
    token_uri: FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url:
      FIREBASE_AUTH_PROVIDER_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url:
      FIREBASE_CLIENT_CERT_URL ||
      `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(FIREBASE_CLIENT_EMAIL)}`,
  };
};

const initFirebaseAdmin = () => {
  if (firebaseReady) return firebaseAdmin;
  firebaseReady = true;

  try {
    const serviceAccount = buildServiceAccount();
    if (!serviceAccount) return null;

    // Optional runtime dependency. Push delivery is skipped cleanly when firebase-admin is not installed.
    const admin = require('firebase-admin');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    firebaseAdmin = admin;
    return firebaseAdmin;
  } catch (error) {
    console.warn('[FCM] Firebase Admin unavailable:', error.message);
    return null;
  }
};

const sendToUser = async (userId, { title, body, url = '/', data = {} }) => {
  console.log(`[FCM] sendToUser called for ${userId}`);

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
        data: Object.fromEntries(
          Object.entries({ url, ...data }).map(([k, v]) => [k, String(v ?? '')])
        ),
        webpush: {
          fcmOptions: { link: url },
        },
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
    await User.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { $in: invalidTokens } },
    });
  }

  return { sent, failed };
};

const sendToUsers = async (userIds, payload) => {
  const results = await Promise.all((userIds || []).map((id) => sendToUser(id, payload)));
  return results.reduce(
    (acc, item) => ({
      sent: acc.sent + (item.sent || 0),
      failed: acc.failed + (item.failed || 0),
      skipped: acc.skipped && item.skipped,
    }),
    { sent: 0, failed: 0, skipped: true }
  );
};

module.exports = { sendToUser, sendToUsers, initFirebaseAdmin };
