content = open('index.js', encoding='utf-8').read()
old = "const tempPassword = Math.floor(1000 + Math.random() * 9000).toString();"
new = "const tempPassword = Math.floor(100000 + Math.random() * 900000).toString();"
count = content.count(old)
print(f"match: {count}")
if count == 1:
    content = content.replace(old, new, 1)
    open('index.js', 'w', encoding='utf-8').write(content)
    print('OK')
else:
    print('NOT FOUND')
