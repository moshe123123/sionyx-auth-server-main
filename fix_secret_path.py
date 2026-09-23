content = open('index.js', encoding='utf-8').read()
old = "credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),"
new = "credential: admin.credential.cert('/etc/secrets/serviceAccount.json'),"
count = content.count(old)
print(f"match: {count}")
if count == 1:
    content = content.replace(old, new, 1)
    open('index.js', 'w', encoding='utf-8').write(content)
    print('OK')
else:
    print('NOT FOUND')
