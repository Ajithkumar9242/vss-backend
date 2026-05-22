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

module.exports = {
  sendFlowSMS
};
