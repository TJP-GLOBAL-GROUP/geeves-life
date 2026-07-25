"""Mark all P-37 through P-41 items as complete in todo.md"""
path = '/home/ubuntu/geeves-shopping/todo.md'
with open(path, 'r') as f:
    content = f.read()

# Mark all section headers as complete
content = content.replace(
    '## 🔴 IN PROGRESS — P-37: Integrations — Remove Account (Purge)',
    '## ✅ COMPLETE — P-37: Integrations — Remove Account (Purge)'
)
content = content.replace(
    '## 🔴 IN PROGRESS — P-38: Household — Remove Member (Admin + EA Scoped)',
    '## ✅ COMPLETE — P-38: Household — Remove Member (Admin + EA Scoped)'
)
content = content.replace(
    '## 🔴 IN PROGRESS — P-39: RBAC — Enforce Vertical Access on Properties, Financial Data, and Sidebar Nav',
    '## ✅ COMPLETE — P-39: RBAC — Enforce Vertical Access on Properties, Financial Data, and Sidebar Nav'
)
content = content.replace(
    '## 🔴 IN PROGRESS — P-40: Custom Role CRUD with Per-Permission and Widget/Domain Access',
    '## ✅ COMPLETE — P-40: Custom Role CRUD with Per-Permission and Widget/Domain Access'
)
content = content.replace(
    '## 🔴 IN PROGRESS — P-41: Design Audit — Brand Compliance Pass',
    '## ✅ COMPLETE — P-41: Design Audit — Brand Compliance Pass'
)

# Count how many [ ] items are in P-37 through P-41 sections and mark them done
import re

# Find all [ ] items and mark them [x] in the P-37 through P-41 sections
lines = content.split('\n')
in_p37_41 = False
new_lines = []
for line in lines:
    # Detect entering a P-37 to P-41 section
    if re.match(r'^## .*P-3[789]|^## .*P-4[01]', line):
        in_p37_41 = True
    # Detect leaving the section (new ## section that's not P-37-41)
    elif line.startswith('## ') and not re.match(r'^## .*P-3[789]|^## .*P-4[01]', line):
        in_p37_41 = False
    
    if in_p37_41 and line.strip().startswith('- [ ]'):
        line = line.replace('- [ ]', '- [x]', 1)
    new_lines.append(line)

content = '\n'.join(new_lines)

with open(path, 'w') as f:
    f.write(content)

print('Done - marked all P-37 through P-41 items as complete')
