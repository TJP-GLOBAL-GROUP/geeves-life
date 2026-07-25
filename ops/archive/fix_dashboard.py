path = '/home/ubuntu/geeves-shopping/client/src/components/DashboardLayout.tsx'
with open(path, 'r') as f:
    lines = f.readlines()

start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if '// Build nav items with dynamic groupName' in line:
        start_idx = i
    if start_idx is not None and 'const resolvedBottomNavItems = bottomNavItems;' in line:
        end_idx = i
        break

print(f'start_idx={start_idx}, end_idx={end_idx}')
if start_idx is None or end_idx is None:
    print('Could not find markers')
    exit(1)

new_block = (
    '  // \u2500\u2500 Role-based nav filtering (P-39) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n'
    '  const myPerms = trpc.accessControl.getMyEffectivePermissions.useQuery(undefined, { retry: false });\n'
    '  const memberRole = myPerms.data?.role;\n'
    '  const isAdminOrEA = memberRole === "household_admin" || memberRole === "ea";\n'
    '  const verticalAccessQuery = trpc.household.verticalAccess.getMyAccess.useQuery(undefined, {\n'
    '    enabled: !isAdminOrEA && memberRole !== undefined,\n'
    '    retry: false,\n'
    '  });\n'
    '  const hasVerticalAccess = isAdminOrEA || (verticalAccessQuery.data?.length ?? 0) > 0;\n'
    '  // Build nav items with dynamic groupName and role-based filtering\n'
    '  const resolvedTopNavItems = topNavItems\n'
    '    .map(item => item.path === "/household" ? { ...item, label: groupName } : item)\n'
    '    .filter(item => {\n'
    '      if (item.path === "/properties" && !hasVerticalAccess) return false;\n'
    '      if (item.path === "/member-permissions" && !isAdminOrEA) return false;\n'
    '      if (item.path === "/custom-roles" && !isAdminOrEA) return false;\n'
    '      if (item.path === "/verticals" && !isAdminOrEA) return false;\n'
    '      return true;\n'
    '    });\n'
    '  const resolvedBottomNavItems = bottomNavItems.filter(item => {\n'
    '    if ((item.path === "/expenses" || item.path === "/accounts") && !hasVerticalAccess) return false;\n'
    '    return true;\n'
    '  });\n'
)

lines[start_idx:end_idx+1] = [new_block]
with open(path, 'w') as f:
    f.writelines(lines)
print('Done - replaced lines', start_idx+1, 'to', end_idx+1)
