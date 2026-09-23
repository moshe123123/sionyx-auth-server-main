content = open('index.js', encoding='utf-8').read()
print(repr(content[content.find('findUserByPhone'):content.find('findUserByPhone')+200]))
