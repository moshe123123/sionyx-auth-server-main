content = open('index.js', encoding='utf-8').read()

# הוסף admin SDK בראש הקובץ
old_top = "const express = require('express');\nconst axios = require('axios');"
new_top = "const express = require('express');\nconst axios = require('axios');\nconst admin = require('firebase-admin');\nif (!admin.apps.length) {\n  admin.initializeApp({\n    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),\n    databaseURL: process.env.FIREBASE_DATABASE_URL\n  });\n}"

count = content.count(old_top)
print(f"top match: {count}")
if count == 1:
    content = content.replace(old_top, new_top, 1)
    open('index.js', 'w', encoding='utf-8').write(content)
    print('OK')
else:
    print('NOT FOUND')
