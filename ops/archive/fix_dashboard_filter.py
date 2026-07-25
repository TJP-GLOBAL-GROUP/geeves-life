path = '/home/ubuntu/geeves-shopping/client/src/components/DashboardLayout.tsx'
with open(path, 'r') as f:
    content = f.read()

# First, remove the bad insertion that went into the activeLabel function
# Find the bad pattern
bad_start = '      // Hide Custom Roles from non-admin/EA members\n      if (item.path === "/custom-roles" && !isAdminOrEA) return false;\n    );\n    return match?.label ?? "Menu";\n  })();'
good_replacement = '    );\n    return match?.label ?? "Menu";\n  })();'

if bad_start in content:
    content = content.replace(bad_start, good_replacement, 1)
    print('Removed bad insertion')
else:
    print('Bad pattern not found - checking content around activeLabel')
    idx = content.find('activeLabel')
    if idx >= 0:
        print(repr(content[idx:idx+400]))

# Now find the correct filter location
# Look for the filter block
filter_marker = '      if (item.path === "/member-permissions" && !isAdminOrEA) return false;'
if filter_marker in content:
    idx = content.find(filter_marker)
    # Insert after this line
    insert_after = filter_marker
    new_line = '\n      // Hide Custom Roles from non-admin/EA members\n      if (item.path === "/custom-roles" && !isAdminOrEA) return false;'
    content = content.replace(insert_after, insert_after + new_line, 1)
    with open(path, 'w') as f:
        f.write(content)
    print('Added custom-roles filter in correct location')
else:
    print('Filter marker not found')
    idx = content.find('member-permissions')
    if idx >= 0:
        print(repr(content[idx-100:idx+300]))
