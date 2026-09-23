content = open('index.js', encoding='utf-8').read()
old = "    } else if (digit === '2') {\n      console.log('[yemot] reset: ' + phone);\n      const user = await findUserByPhone(phone);\n      if (!user) {\n        await call.read([msg('002')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });\n        return;\n      }"
new = "    } else if (digit === '2') {\n      console.log('[yemot] reset: ' + phone);\n      let user;\n      try { user = await findUserByPhone(phone); } catch(fe) { console.error('[yemot] findUser error:', fe.message); }\n      console.log('[yemot] reset user found:', user ? user.uid : 'null');\n      if (!user) {\n        await call.read([msg('002')], 'tap', { max_digits: 1, sec_wait: 5, allow_empty: true });\n        return;\n      }"
count = content.count(old)
print(f"match: {count}")
if count == 1:
    content = content.replace(old, new, 1)
    open('index.js', 'w', encoding='utf-8').write(content)
    print('OK')
else:
    print('NOT FOUND')
