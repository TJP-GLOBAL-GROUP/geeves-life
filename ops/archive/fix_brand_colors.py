"""
P-41 Brand Compliance Fix
Replace off-brand Tailwind colors with Geeves.Life brand equivalents:
  - emerald → teal (Vivid Teal = primary)
  - rose → coral (Coral Red = destructive)
  - sky → indigo (Indigo Blue)
  - #10b981 → #2AAFA9 (Vivid Teal)
  - #f43f5e → #E8624A (Coral Red)
  - #60A5FA → #4F7EC4 (Indigo Blue)
"""
import re
import os

files = [
    '/home/ubuntu/geeves-shopping/client/src/components/ConnectCalendarDialog.tsx',
    '/home/ubuntu/geeves-shopping/client/src/components/ReconnectSequenceModal.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/CalendarView.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/Household.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/OrderPrep.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/Properties.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/ScanList.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/Settings.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/ShopAgent.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/ShoppingListDetail.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/Verticals.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/WhatsAppImport.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/SuperAdmin.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/VerticalAccessMatrix.tsx',
    '/home/ubuntu/geeves-shopping/client/src/pages/PrivacyPolicy.tsx',
]

# Replacement rules: (pattern, replacement)
# emerald → teal (primary color)
# rose → coral (destructive/coral)
# sky → indigo
replacements = [
    # Hex colors
    (r'#10b981', '#2AAFA9'),
    (r'#f43f5e', '#E8624A'),
    (r'#60A5FA', '#4F7EC4'),
    # Tailwind emerald → teal (using primary CSS var)
    # emerald-500 → [#2AAFA9] (brand teal)
    (r'text-emerald-500', 'text-primary'),
    (r'text-emerald-400', 'text-primary'),
    (r'text-emerald-600', 'text-primary'),
    (r'text-emerald-700', 'text-primary'),
    (r'bg-emerald-500', 'bg-primary'),
    (r'bg-emerald-600', 'bg-primary'),
    (r'bg-emerald-400', 'bg-primary'),
    (r'bg-emerald-500/10', 'bg-primary/10'),
    (r'bg-emerald-500/20', 'bg-primary/20'),
    (r'bg-emerald-500/60', 'bg-primary/60'),
    (r'border-emerald-500', 'border-primary'),
    (r'border-emerald-400', 'border-primary'),
    (r'border-emerald-500/20', 'border-primary/20'),
    (r'border-emerald-500/30', 'border-primary/30'),
    (r'shadow-emerald-500/40', 'shadow-primary/40'),
    (r'hover:bg-emerald-500', 'hover:bg-primary'),
    (r'dark:text-emerald-400', 'dark:text-primary'),
    # rose → destructive (coral)
    (r'text-rose-500', 'text-destructive'),
    (r'text-rose-400', 'text-destructive'),
    (r'bg-rose-500', 'bg-destructive'),
    (r'bg-rose-500/10', 'bg-destructive/10'),
    (r'border-rose-500', 'border-destructive'),
    # sky → indigo (brand indigo)
    (r'text-sky-400', 'text-[#4F7EC4]'),
    (r'text-sky-500', 'text-[#4F7EC4]'),
    (r'bg-sky-500', 'bg-[#4F7EC4]'),
    (r'bg-sky-500/10', 'bg-[#4F7EC4]/10'),
    (r'border-sky-500', 'border-[#4F7EC4]'),
]

total_changes = 0
for filepath in files:
    if not os.path.exists(filepath):
        print(f'SKIP (not found): {filepath}')
        continue
    with open(filepath, 'r') as f:
        content = f.read()
    original = content
    for pattern, replacement in replacements:
        content = content.replace(pattern, replacement)
    if content != original:
        changes = sum(1 for p, r in replacements if p in original)
        with open(filepath, 'w') as f:
            f.write(content)
        print(f'Fixed: {os.path.basename(filepath)}')
        total_changes += 1
    else:
        print(f'Clean: {os.path.basename(filepath)}')

print(f'\nTotal files modified: {total_changes}')
