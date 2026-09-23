content = open(r'C:\Users\user\Desktop\sionyx-auth-server\index.js', encoding='utf-8').read()
old = "await dbSet('users/' + user.uid + '/phoneVerifiedAt', new Date().toISOString());"
new = "await dbSet('organizations/sionov/users/' + user.uid + '/phoneVerifiedAt', new Date().toISOString());"
count = content.count(old)
print(f"Found {count} matches")
if count >= 1:
    content = content.replace(old, new)
    open(r'C:\Users\user\Desktop\sionyx-auth-server\index.js', 'w', encoding='utf-8').write(content)
    print('OK')
else:
    print('NOT FOUND')
