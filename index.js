const crypto = require('crypto');
const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('/etc/secrets/serviceAccount.json'),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}
const { YemotRouter } = require('yemot-router2');

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.FIREBASE_API_KEY;

app.use(express.json());

// CORS - required so the dashboard (a browser origin) can call /health for
// the failover ServerResolver, and any other endpoint this server exposes
// to sionyx-web. Without this, the browser blocks the response entirely and
// the health check always reads as "unreachable", so failover to the local
// PC never activates. Same pattern as Understood's render-service/index.js.
const ALLOWED_ORIGINS = [
  'https://pc-sion.web.app',
  'https://pc-sion.firebaseapp.com',
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-sionyx-secret');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  console.log('[HTTP] ' + req.method + ' ' + req.url);
  next();
});

// Use the Admin SDK (service account) instead of the legacy Database Secret,
// which Firebase no longer accepts (that's what was causing the 401s).
function logDbError(context, p, err) {
  console.error(
    '[db] ' + context + ' failed for path "' + p + '": ' +
    err.message +
    ' | code=' + (err.code || 'n/a') +
    ' | name=' + (err.name || 'n/a') +
    (err.errorInfo ? ' | errorInfo=' + JSON.stringify(err.errorInfo) : '')
  );
}
async function dbGet(p) {
  try {
    const snap = await admin.database().ref(p).once('value');
    return snap.val();
  } catch (err) {
    logDbError('dbGet', p, err);
    throw err;
  }
}
async function dbSet(p, data) {
  try {
    await admin.database().ref(p).set(data);
  } catch (err) {
    logDbError('dbSet', p, err);
    throw err;
  }
}

// ---- phone handling -------------------------------------------------------
// The Firebase Auth login of every SIONYX user is "<digits>@sionyx.app" (same rule as the
// kiosk and the Cloud Functions), so the account is found by an EXACT email match - no more
// endsWith() guessing that could hit another person's account.
function digitsOnly(raw) { return String(raw || '').replace(/\D/g, ''); }
function normalizePhone(raw) {
  const d = digitsOnly(raw);
  return d.startsWith('972') ? '0' + d.slice(3) : d;
}
function maskPhone(raw) {
  const d = digitsOnly(raw);
  return d.length > 4 ? d.slice(0, 3) + '***' + d.slice(-2) : '***';
}
function phoneCandidates(raw) {
  return [...new Set([normalizePhone(raw), digitsOnly(raw)].filter(Boolean))];
}

async function findAuthUser(rawPhone) {
  for (const c of phoneCandidates(rawPhone)) {
    try {
      const u = await admin.auth().getUserByEmail(c + '@sionyx.app');
      return { uid: u.uid, phone: c };
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
    }
  }
  return null;
}

// Organization ids (shallow read - never downloads the users of every store).
let _orgIdCache = { at: 0, ids: [] };
async function listOrgIds() {
  if (Date.now() - _orgIdCache.at < 60 * 1000) return _orgIdCache.ids;
  const cred = admin.app().options.credential;
  const { access_token } = await cred.getAccessToken();
  const base = String(process.env.FIREBASE_DATABASE_URL).replace(/\/$/, '');
  const res = await axios.get(base + '/organizations.json', {
    params: { shallow: true },
    headers: { Authorization: 'Bearer ' + access_token },
    timeout: 10000
  });
  const ids = Object.keys(res.data || {});
  _orgIdCache = { at: Date.now(), ids };
  return ids;
}

// Every place where this account has a user record: one per organization it belongs to,
// plus the legacy root "users" node if it still exists.
async function findUserRecords(uid) {
  const records = [];
  for (const orgId of await listOrgIds()) {
    const v = await dbGet('organizations/' + orgId + '/users/' + uid);
    if (v) records.push({ orgId, path: 'organizations/' + orgId + '/users/' + uid });
  }
  const legacy = await dbGet('users/' + uid);
  if (legacy) records.push({ orgId: null, path: 'users/' + uid });
  return records;
}

// At most 3 password resets per phone per hour (in-memory; single Railway instance).
const _resetLog = new Map();
function allowReset(phone) {
  const now = Date.now();
  const recent = (_resetLog.get(phone) || []).filter(t => now - t < 60 * 60 * 1000);
  if (recent.length >= 3) { _resetLog.set(phone, recent); return false; }
  recent.push(now);
  _resetLog.set(phone, recent);
  return true;
}

const TEXTS = {
  '000': 'להקשת אחד לאימות הקישו אחד לאיפוס סיסמה הקישו שניים',
  '001': 'אומת בהצלחה תודה',
  '002': 'מספר לא נמצא במערכת',
  '003': 'שגיאה נסה שנית',
  '004': 'הסיסמה החדשה שלך היא',
  '005': 'לחזרה הקישו כוכבית',
  '006': 'בוצעו יותר מדי בקשות נסה שוב מאוחר יותר'
};

function msg(name) {
  return { type: 'text', data: TEXTS[name] || name };
}

const yemotRouter = YemotRouter({ printLog: true });

yemotRouter.get('/yemot', async (call) => {
  const phone = call.phone;
  console.log('[yemot] call from: ' + maskPhone(phone));

  try {
    const digit = await call.read(
      [msg('000')],
      'tap',
      { max_digits: 1, sec_wait: 25, allow_empty: true }
    );

    if (digit === '1') {
      console.log('[yemot] verify: ' + maskPhone(phone));
      const found = await findAuthUser(phone);
      const records = found ? await findUserRecords(found.uid) : [];
      if (!found || !records.length) {
        console.log('[yemot] not found: ' + maskPhone(phone));
        await call.read([msg('002')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });
        return;
      }
      const now = new Date().toISOString();
      // The same verification applies to every organization this account belongs to
      // (one global account per phone).
      for (const r of records) {
        await admin.database().ref(r.path).update({ phoneVerified: true, phoneVerifiedAt: now });
      }
      await dbSet('phoneVerifications/' + found.phone, {
        uid: found.uid,
        verifiedAt: now,
        orgIds: records.map(r => r.orgId).filter(Boolean)
      });
      console.log('[yemot] verified: ' + found.uid + ' in ' + records.length + ' place(s)');
      await call.read([msg('001')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });

    } else if (digit === '2') {
      console.log('[yemot] reset: ' + maskPhone(phone));
      const found = await findAuthUser(phone);
      if (!found) {
        await call.read([msg('002')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });
        return;
      }
      if (!allowReset(found.phone)) {
        console.warn('[yemot] reset rate-limited: ' + maskPhone(phone));
        await call.read([msg('006')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });
        return;
      }
      // Cryptographically random, never logged and never stored in the database.
      const tempPassword = String(crypto.randomInt(10000000, 100000000));
      try {
        await admin.auth().updateUser(found.uid, { password: tempPassword });
      } catch (ae) {
        // Do NOT read out a password that was not actually set.
        console.error('[yemot] auth update error: ' + ae.message);
        await call.read([msg('003')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });
        return;
      }
      await admin.database().ref('passwordResetLog/' + found.uid).push({ at: new Date().toISOString(), via: 'ivr' });
      const numTexts = { '0':'אפס','1':'אחד','2':'שניים','3':'שלוש','4':'ארבע','5':'חמש','6':'שש','7':'שבע','8':'שמונה','9':'תשע' };
      const numMsgs = tempPassword.split('').map(d => ({ type: 'text', data: numTexts[d] }));
      await call.read(
        [msg('004'), ...numMsgs, msg('005')],
        'tap',
        { max_digits: 1, sec_wait: 8, allow_empty: true }
      );
    } else {
      await call.read([msg('000')], 'tap', { max_digits: 1, sec_wait: 10, allow_empty: true });
    }

  } catch (e) {
    console.error('[yemot] error: ' + e.message);
    try {
      await call.read([msg('003')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });
    } catch {}
  }
});

app.use(yemotRouter);

app.get('/', (req, res) => {
  res.send('SIONYX Auth Server running');
});

// Lightweight liveness check for the local/Render failover ServerResolver.
app.get('/health', (req, res) => {
  res.status(200).json({status: 'ok'});
});

// Auto-update: write (called from upload_release.py)
app.post('/set-latest-version', async (req, res) => {
  try {
    const secret = req.headers['x-sionyx-secret'];
    if (secret !== process.env.SIONYX_ADMIN_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { version, downloadUrl, buildNumber, releasedAt } = req.body;
    if (!version || !downloadUrl) return res.status(400).json({ error: 'Missing fields' });
    await admin.database().ref('system/update').set({ version, downloadUrl, buildNumber, releasedAt });
    console.log('[update] set latest version:', version);
    res.json({ ok: true });
  } catch (e) {
    console.error('[update] set error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Auto-update endpoint
app.get('/latest-version', async (req, res) => {
  try {
    const data = await dbGet('system/update');
    if (!data || !data.version) {
      return res.json({ version: null, downloadUrl: null });
    }
    res.json({ version: data.version, downloadUrl: data.downloadUrl });
  } catch (e) {
    console.error('[update] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log('SIONYX Auth Server running on port ' + PORT);
});
