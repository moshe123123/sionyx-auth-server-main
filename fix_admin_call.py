content = open('index.js', encoding='utf-8').read()
old = "      try {\n        await axios.post(\n          'https://identitytoolkit.googleapis.com/v1/accounts:update?key=' + API_KEY,\n          { localId: user.uid, password: tempPassword },\n          { headers: { 'Content-Type': 'application/json' }, params: { key: API_KEY } }\n        );\n        console.log('[yemot] firebase auth password updated for ' + user.uid);\n      } catch(ae) {\n        console.error('[yemot] auth update error:', ae.response?.data || ae.message);\n      }\n"
new = "      try {\n        await admin.auth().updateUser(user.uid, { password: tempPassword });\n        console.log('[yemot] firebase auth password updated for ' + user.uid);\n      } catch(ae) {\n        console.error('[yemot] auth update error:', ae.message);\n      }\n"
count = content.count(old)
print(f"match: {count}")
if count == 1:
    content = content.replace(old, new, 1)
    open('index.js', 'w', encoding='utf-8').write(content)
    print('OK')
else:
    print('NOT FOUND')
