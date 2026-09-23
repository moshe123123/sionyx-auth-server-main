content = open(r'C:\Users\user\Desktop\sionyx-auth-server\index.js', encoding='utf-8').read()
old = "async function dbSet(p, data) {\n  await axios.put(dbUrl(p), data);\n}"
new = "async function dbSet(p, data) {\n  await axios.put(dbUrl(p), JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });\n}"
count = content.count(old)
print(f"Found {count} matches")
if count >= 1:
    content = content.replace(old, new)
    open(r'C:\Users\user\Desktop\sionyx-auth-server\index.js', 'w', encoding='utf-8').write(content)
    print('OK')
else:
    print('NOT FOUND')
