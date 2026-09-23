content = open('index.js', encoding='utf-8').read()
old = "      try {\n        await admin.auth().updateUser(user.uid, { password: tempPassword });\n        console.log('[yemot] firebase auth password updated for ' + user.uid);\n      } catch(ae) {\n        console.error('[yemot] auth update error:', ae.message);\n      }\n"
new = "      try {\n        const updateRes = await axios.post(\n          'https://identitytoolkit.googleapis.com/v1/accounts:update?key=' + API_KEY,\n          { idToken: null, password: tempPassword, returnSecureToken: false },\n        );\n        // use admin REST\n        const adminRes = await axios.post(\n          'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + API_KEY,\n          {}\n        );\n      } catch(ae) {\n        console.error('[yemot] auth update error:', ae.message);\n      }\n"
# just remove the bad block and replace with REST call via service account
content2 = content.replace(
    "      try {\n        await admin.auth().updateUser(user.uid, { password: tempPassword });\n        console.log('[yemot] firebase auth password updated for ' + user.uid);\n      } catch(ae) {\n        console.error('[yemot] auth update error:', ae.message);\n      }\n",
    "      try {\n        await axios.post(\n          'https://identitytoolkit.googleapis.com/v1/accounts:update?key=' + API_KEY,\n          { localId: user.uid, password: tempPassword },\n          { headers: { 'Content-Type': 'application/json' }, params: { key: API_KEY } }\n        );\n        console.log('[yemot] firebase auth password updated for ' + user.uid);\n      } catch(ae) {\n        console.error('[yemot] auth update error:', ae.response?.data || ae.message);\n      }\n"
)
if content2 != content:
    open('index.js', 'w', encoding='utf-8').write(content2)
    print('OK')
else:
    print('NOT FOUND')
