const https = require('https');

/**
 * Send a flow-based SMS using MSG91 Flow API (v5).
 * 
 * @param {Object} params
 * @param {string} params.phone - 10-digit mobile number
 * @param {string} params.templateId - MSG91 template/flow ID
 * @param {Object} params.variables - template variables key-value pairs
 * @returns {Promise<Object>} API response payload
 */
async function sendFlowSMS({ phone, templateId, variables }) {
  const apiKey = process.env.MSG91_API_KEY;
  if (!apiKey) {
    console.log(`[MSG91 DEV] Suppressing flow SMS. MSG91_API_KEY not configured.`);
    return { success: true, message: 'Developer mode: API key missing' };
  }

  if (!phone || !templateId) {
    throw new Error('Phone number and templateId are required for sending SMS');
  }

  // Format mobile: strip non-digits, ensure country code 91 is prefixed if 10 digits
  let formattedPhone = phone.replace(/\D/g, '');
  if (formattedPhone.length === 10) {
    formattedPhone = '91' + formattedPhone;
  }

  const payload = {
    template_id: templateId,
    recipients: [
      {
        mobiles: formattedPhone,
        ...variables
      }
    ]
  };

  // Add optional sender ID if configured
  if (process.env.MSG91_SENDER_ID) {
    payload.sender = process.env.MSG91_SENDER_ID;
  }

  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'control.msg91.com',
        path: '/api/v5/flow',
        method: 'POST',
        headers: {
          'authkey': apiKey,
          'content-type': 'application/json',
          'accept': 'application/json',
          'content-length': Buffer.byteLength(body)
        },
      },
      (res) => {
        let d = '';
        res.on('data', c => (d += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(d);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(parsed.message || `MSG91 returned status ${res.statusCode}`));
            }
          } catch {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ raw: d });
            } else {
              reject(new Error(`MSG91 returned status ${res.statusCode}: ${d}`));
            }
          }
        });
      }
    );

    req.on('error', (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

/**
 * Sanitize and format a phone number for MSG91.
 * Prepends country code 91 if it's 10 digits, or keeps 12 digits if starts with 91.
 */
function sanitizePhone(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return '91' + cleaned;
  }
  return cleaned;
}

/**
 * Send OTP using MSG91 OTP API (v5).
 */
async function sendOtp(phone, otp = null) {
  const authKey = process.env.MSG91_AUTH_KEY || process.env.MSG91_API_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID_OTP || process.env.MSG91_TEMPLATE_ID;
  const senderId = process.env.MSG91_SENDER_ID;
  
  if (!authKey) {
    console.log(`[MSG91 OTP DEV] Suppressing send OTP. MSG91_AUTH_KEY not configured.`);
    return { success: true, message: 'Developer mode: Auth key missing' };
  }

  const cleanedPhone = sanitizePhone(phone);
  if (!cleanedPhone) {
    throw new Error('Valid phone number is required');
  }

  let path = `/api/v5/otp?mobile=${cleanedPhone}&authkey=${authKey}&otp_length=6`;
  if (templateId) {
    path += `&template_id=${templateId}`;
  }
  if (senderId) {
    path += `&sender=${senderId}`;
  }
  if (process.env.MSG91_WIDGET_ID) {
    path += `&widget_id=${process.env.MSG91_WIDGET_ID}`;
  }
  if (otp) {
    path += `&otp=${otp}`;
  }

  console.log(`[MSG91 OTP] Sending request to control.msg91.com${path}`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'control.msg91.com',
        path: path,
        method: 'POST',
        headers: {
          'Content-Length': '0'
        }
      },
      (res) => {
        let d = '';
        res.on('data', c => (d += c));
        res.on('end', () => {
          console.log(`[MSG91 OTP] Response status: ${res.statusCode}, body: ${d}`);
          try {
            const parsed = JSON.parse(d);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              if (parsed.type === 'success' || parsed.success === true) {
                resolve({ success: true, data: parsed });
              } else {
                reject(new Error(parsed.message || `MSG91 OTP send failed: ${JSON.stringify(parsed)}`));
              }
            } else {
              reject(new Error(parsed.message || `MSG91 returned status ${res.statusCode}`));
            }
          } catch {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, raw: d });
            } else {
              reject(new Error(`MSG91 returned status ${res.statusCode}: ${d}`));
            }
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('[MSG91 OTP] Request error:', err);
      reject(err);
    });

    req.end();
  });
}

/**
 * Verify OTP using MSG91 Verify OTP API (v5).
 */
async function verifyOtp(phone, otp) {
  const authKey = process.env.MSG91_AUTH_KEY || process.env.MSG91_API_KEY;
  if (!authKey) {
    console.log(`[MSG91 OTP DEV] Suppressing verify OTP. MSG91_AUTH_KEY not configured.`);
    return { success: true, message: 'Developer mode: Auth key missing' };
  }

  const cleanedPhone = sanitizePhone(phone);
  if (!cleanedPhone || !otp) {
    throw new Error('Phone and OTP are required');
  }

  const path = `/api/v5/otp/verify?mobile=${cleanedPhone}&otp=${otp}&authkey=${authKey}`;
  console.log(`[MSG91 OTP] Verifying request to control.msg91.com${path}`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'control.msg91.com',
        path: path,
        method: 'POST',
        headers: {
          'Content-Length': '0'
        }
      },
      (res) => {
        let d = '';
        res.on('data', c => (d += c));
        res.on('end', () => {
          console.log(`[MSG91 OTP Verify] Response status: ${res.statusCode}, body: ${d}`);
          try {
            const parsed = JSON.parse(d);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              if (parsed.type === 'success' || parsed.success === true) {
                resolve({ success: true, data: parsed });
              } else {
                reject(new Error(parsed.message || `MSG91 OTP verification failed: ${JSON.stringify(parsed)}`));
              }
            } else {
              reject(new Error(parsed.message || `MSG91 returned status ${res.statusCode}`));
            }
          } catch {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, raw: d });
            } else {
              reject(new Error(`MSG91 returned status ${res.statusCode}: ${d}`));
            }
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('[MSG91 OTP Verify] Request error:', err);
      reject(err);
    });

    req.end();
  });
}

module.exports = {
  sendFlowSMS,
  sendOtp,
  verifyOtp
};
