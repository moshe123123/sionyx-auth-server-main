content = open('index.js', encoding='utf-8').read()
old = "      const tempPassword = Math.floor(1000 + Math.random() * 9000).toString();\n      console.log('[yemot] password for ' + user.uid + ': ' + tempPassword);\n      await dbSet('organizations/sionov/passwordResets/' + user.uid, {"
new = "      const tempPassword = Math.floor(1000 + Math.random() * 9000).toString();\n      console.log('[yemot] password for ' + user.uid + ': ' + tempPassword);\n      try {\n        await admin.auth().updateUser(user.uid, { password: tempPassword });\n        console.log('[yemot] firebase auth password updated for ' + user.uid);\n      } catch(ae) {\n        console.error('[yemot] auth update error:', ae.message);\n      }\n      await dbSet((user._path||'users') + '/' + user.uid + '/passwordReset', {\n        tempPassword,\n        expiresAt: Date.now() + 10 * 60 * 1000,\n        createdAt: new Date().toISOString()\n      });\n      await dbSet('organizations/sionov/passwordResets/' + user.uid, {"
count = content.count(old)
print(f"match: {count}")
if count == 1:
    content = content.replace(old, new, 1)
    open('index.js', 'w', encoding='utf-8').write(content)
    print('OK')
else:
    print('NOT FOUND')
