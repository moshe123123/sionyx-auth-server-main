content = open('index.js', encoding='utf-8').read()
old = "async function findUserByPhone(phone) {\n  const cleanPhone = phone.replace(/\\D/g, '');\n  const users = await dbGet('users');\n  if (!users) return null;\n  const uid = Object.keys(users).find(key => {\n    const userPhone = (users[key].phoneNumber || '').replace(/\\D/g, '');\n    return userPhone === cleanPhone || userPhone.endsWith(cleanPhone) || cleanPhone.endsWith(userPhone);\n  });\n  return uid ? { uid, ...users[uid] } : null;\n}"
new = "async function findUserByPhone(phone) {\n  const cleanPhone = phone.replace(/\\D/g, '');\n  const search = (users, path) => {\n    if (!users) return null;\n    const uid = Object.keys(users).find(key => {\n      const userPhone = (users[key].phoneNumber || '').replace(/\\D/g, '');\n      return userPhone === cleanPhone || userPhone.endsWith(cleanPhone) || cleanPhone.endsWith(userPhone);\n    });\n    return uid ? { uid, _path: path, ...users[uid] } : null;\n  };\n  const u1 = await dbGet('users');\n  const r1 = search(u1, 'users');\n  if (r1) return r1;\n  const u2 = await dbGet('organizations/sionov/users');\n  return search(u2, 'organizations/sionov/users');\n}"
count = content.count(old)
print(f"match: {count}")
if count == 1:
    content = content.replace(old, new, 1)
    open('index.js', 'w', encoding='utf-8').write(content)
    print('OK')
else:
    print('NOT FOUND')
