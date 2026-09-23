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

async function findUserByPhone(phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  const search = (users, path) => {
    if (!users) return null;
    const uid = Object.keys(users).find(key => {
      const userPhone = (users[key].phoneNumber || '').replace(/\D/g, '');
      return userPhone === cleanPhone || userPhone.endsWith(cleanPhone) || cleanPhone.endsWith(userPhone);
    });
    return uid ? { uid, _path: path, ...users[uid] } : null;
  };
  const u1 = await dbGet('users');
  const r1 = search(u1, 'users');
  if (r1) return r1;
  const u2 = await dbGet('organizations/sionov/users');
  return search(u2, 'organizations/sionov/users');
}

const TEXTS = {
  '000': 'להקשת אחד לאימות הקישו אחד לאיפוס סיסמה הקישו שניים',
  '001': 'אומת בהצלחה תודה',
  '002': 'מספר לא נמצא במערכת',
  '003': 'שגיאה נסה שנית',
  '004': 'הסיסמה החדשה שלך היא',
  '005': 'לחזרה הקישו כוכבית'
};

function msg(name) {
  return { type: 'text', data: TEXTS[name] || name };
}

const yemotRouter = YemotRouter({ printLog: true });

yemotRouter.get('/yemot', async (call) => {
  const phone = call.phone;
  console.log('[yemot] call from: ' + phone);

  try {
    const digit = await call.read(
      [msg('000')],
      'tap',
      { max_digits: 1, sec_wait: 25, allow_empty: true }
    );

    if (digit === '1') {
      console.log('[yemot] verify: ' + phone);
      const user = await findUserByPhone(phone);
      if (!user) {
        console.log('[yemot] not found: ' + phone);
        await call.read([msg('002')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });
        return;
      }
      await dbSet('users/' + user.uid + '/phoneVerified', true);
      await dbSet('users/' + user.uid + '/phoneVerifiedAt', new Date().toISOString());
      console.log('[yemot] verified: ' + user.uid);
      await call.read([msg('001')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });

    } else if (digit === '2') {
      console.log('[yemot] reset: ' + phone);
      let user;
      try { user = await findUserByPhone(phone); } catch(fe) { console.error('[yemot] findUser error:', fe.message); }
      console.log('[yemot] reset user found:', user ? user.uid : 'null');
      if (!user) {
        await call.read([msg('002')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });
        return;
      }
      const tempPassword = Math.floor(100000 + Math.random() * 900000).toString();
      console.log('[yemot] password for ' + user.uid + ': ' + tempPassword);
      try {
        await admin.auth().updateUser(user.uid, { password: tempPassword });
        console.log('[yemot] firebase auth password updated for ' + user.uid);
      } catch(ae) {
        console.error('[yemot] auth update error:', ae.message);
      }
      await dbSet((user._path||'users') + '/' + user.uid + '/passwordReset', {
        tempPassword,
        expiresAt: Date.now() + 10 * 60 * 1000,
        createdAt: new Date().toISOString()
      });
      await dbSet('organizations/sionov/passwordResets/' + user.uid, {
        tempPassword,
        expiresAt: Date.now() + 10 * 60 * 1000,
        createdAt: new Date().toISOString()
      });
      const digits = tempPassword.split('');
      const numTexts = { '0':'אפס','1':'אחד','2':'שניים','3':'שלוש','4':'ארבע','5':'חמש','6':'שש','7':'שבע','8':'שמונה','9':'תשע' };
      const numMsgs = digits.map(d => ({ type: 'text', data: numTexts[d] }));
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
