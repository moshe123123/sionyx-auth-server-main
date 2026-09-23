content = open('index.js', encoding='utf-8').read()
old = "const users = await dbGet('organizations/sionov/users');"
new = "const users = await dbGet('users');"
count = content.count(old)
print(f"match: {count}")
if count == 1:
    content = content.replace(old, new, 1)
    open('index.js', 'w', encoding='utf-8').write(content)
    print('OK')
else:
    print('NOT FOUND')
