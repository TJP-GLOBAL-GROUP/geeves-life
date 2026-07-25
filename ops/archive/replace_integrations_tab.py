"""
Replace the IntegrationsTab function in Settings.tsx (lines 1806–2163 inclusive)
with the new unified health-based version.
"""

NEW_TAB = r'''function IntegrationsTab() {
  const utils = trpc.useUtils();

  // ── Primary data source: unified health (accounts + email warnings) ──────────
  const healthQuery = trpc.integrations.getUnifiedHealth.useQuery(undefined, {
    staleTime: 30000,
    refetchInterval: 60000,
  });
  const health = healthQuery.data;
  const accounts = health?.accounts ?? [];
  const emailWarnings = health?.emailWarnings ?? [];
  const totalIssues = health?.totalIssues ?? 0;

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const getConnectUrlMutation = trpc.integrations.getConnectUrl.useMutation({
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err) => toast.error(err.message),
  });
  const updatePurposesMutation = trpc.integrations.updatePurposes.useMutation({
    onSuccess: () => {
      utils.integrations.getUnifiedHealth.invalidate();
      utils.integrations.list.invalidate();
      utils.calendar.listGoogleAccounts.invalidate();
      setEditingAccount(null);
      toast.success("Account purposes updated");
    },
    onError: (err) => toast.error(err.message),
  });
  const removeMutation = trpc.integrations.remove.useMutation({
    onSuccess: () => {
      utils.integrations.getUnifiedHealth.invalidate();
      utils.integrations.list.invalidate();
      utils.calendar.listGoogleAccounts.invalidate();
      toast.success("Account disconnected");
    },
    onError: (err) => toast.error(err.message),
  });
  const getReconnectUrlMutation = trpc.integrations.getReconnectUrl.useMutation({
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err) => toast.error(`Reconnect failed: ${err.message}`),
  });
  const getEmailReconnectUrlMutation = trpc.integrations.getEmailReconnectUrl.useMutation({
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (err) => toast.error(`Reconnect failed: ${err.message}`),
  });

  // ── Local state ───────────────────────────────────────────────────────────────
  const [editingAccount, setEditingAccount] = useState<typeof accounts[0] | null>(null);
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const { shouldOpen: reconnectShouldOpen } = useReconnectSequenceResume();

  // Open modal when page-level hook detects returning OAuth redirect or saved sequence
  useEffect(() => {
    if (reconnectShouldOpen) setShowReconnectModal(true);
  }, [reconnectShouldOpen]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function handleConnect(purposes: string[], displayName: string) {
    getConnectUrlMutation.mutate({
      provider: "google",
      purposes: purposes as any,
      origin: window.location.origin,
      returnPath: "/settings?tab=integrations",
      displayName: displayName || undefined,
    });
  }
  function handleSavePurposes(purposes: string[], displayName: string) {
    if (!editingAccount) return;
    updatePurposesMutation.mutate({
      tokenId: editingAccount.id,
      purposes: purposes as any,
      displayName: displayName || null,
    });
  }
  function handleReconnect(accountEmail: string) {
    getReconnectUrlMutation.mutate({
      accountEmail,
      origin: window.location.origin,
      returnPath: "/settings?tab=integrations",
    });
  }
  function handleEmailReconnect(accountEmail: string) {
    getEmailReconnectUrlMutation.mutate({
      accountEmail,
      origin: window.location.origin,
      returnPath: "/settings?tab=integrations",
    });
  }

  // Accounts that need reconnecting (expired/revoked or missing gmail scope)
  const needsReconnect = accounts.filter(a => a.health !== "connected");

  return (
    <div className="space-y-6">
      {/* Edit purposes dialog */}
      {editingAccount && (
        <EditPurposesDialog
          account={editingAccount}
          onSave={handleSavePurposes}
          onClose={() => setEditingAccount(null)}
        />
      )}
      {/* Reconnect sequence modal */}
      {showReconnectModal && (
        <ReconnectSequenceModal
          onClose={() => setShowReconnectModal(false)}
          onAllDone={() => {
            setShowReconnectModal(false);
            utils.integrations.getUnifiedHealth.invalidate();
            utils.integrations.list.invalidate();
            toast.success("All accounts reconnected — sync is active");
          }}
        />
      )}

      {/* ── Attention banner ─────────────────────────────────────────────────── */}
      {totalIssues > 0 && (
        <div className="flex items-center gap-4 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {totalIssues === 1 ? "1 integration needs attention" : `${totalIssues} integrations need attention`}
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5">
              {needsReconnect.map(a => a.displayName || a.accountEmail).join(", ")}
              {emailWarnings.length > 0 && needsReconnect.length > 0 && " · "}
              {emailWarnings.length > 0 && `${emailWarnings.length} email scraping issue${emailWarnings.length > 1 ? "s" : ""}`}
            </p>
          </div>
          {needsReconnect.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
              onClick={() => setShowReconnectModal(true)}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reconnect All ({needsReconnect.length})
            </Button>
          )}
        </div>
      )}

      {/* ── Connected Accounts ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-5 w-5" />
                Connected Accounts
              </CardTitle>
              <CardDescription className="mt-1">
                Connect external accounts to Geeves. Each account can serve one or more purposes — only the permissions required for your chosen purposes will be requested.
              </CardDescription>
            </div>
            <AddAccountDialog onConnect={handleConnect} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {healthQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Plug className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No accounts connected</p>
              <p className="text-xs mt-1">Connect a Google account to get started.</p>
            </div>
          ) : (
            accounts.map(account => {
              const purposes = account.purposes || [];
              const isExpiredOrRevoked = account.health === "expired";
              const needsEmailReconnect = account.needsEmailReconnect;
              const healthColor =
                account.health === "connected" ? "bg-green-500" :
                account.health === "needs_attention" ? "bg-amber-500" :
                "bg-red-500";
              const healthTitle =
                account.health === "connected" ? "Connected" :
                account.health === "needs_attention" ? "Needs attention — missing permissions" :
                "Expired or revoked — reconnect required";

              return (
                <div
                  key={account.id}
                  className={`flex items-start gap-4 p-4 border rounded-lg bg-card ${
                    isExpiredOrRevoked ? "border-destructive/40" :
                    needsEmailReconnect ? "border-amber-500/40" : ""
                  }`}
                >
                  {/* Google icon with health dot */}
                  <div className="relative flex-shrink-0 mt-0.5">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${healthColor}`}
                      title={healthTitle}
                    />
                  </div>

                  {/* Account info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{account.accountEmail}</span>
                      {account.displayName && (
                        <Badge variant="outline" className="text-xs">{account.displayName}</Badge>
                      )}
                      {/* Health badge */}
                      {account.health === "connected" ? (
                        <Badge className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/15">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      ) : account.health === "needs_attention" ? (
                        <Badge variant="outline" className="text-xs border-amber-500/60 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Needs Attention
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Expired
                        </Badge>
                      )}
                    </div>

                    {/* Purpose badges */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {purposes.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">No purposes assigned</span>
                      ) : (
                        purposes.map(p => {
                          const meta = PURPOSE_META[p];
                          if (!meta) return null;
                          return (
                            <span
                              key={p}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${meta.color}`}
                            >
                              {meta.icon}
                              {meta.label}
                            </span>
                          );
                        })
                      )}
                    </div>

                    {/* Email scraping sub-warning */}
                    {needsEmailReconnect && account.health === "needs_attention" && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 dark:text-amber-400">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span>Missing <code className="font-mono text-xs">gmail.readonly</code> permission — reconnect to grant email access</span>
                      </div>
                    )}

                    {account.lastRefreshedAt && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Last refreshed {new Date(account.lastRefreshedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Reconnect button — shown for expired/revoked OR missing-scope accounts */}
                    {(isExpiredOrRevoked || needsEmailReconnect) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                        title="Reconnect this account — all settings preserved"
                        onClick={() => needsEmailReconnect && !isExpiredOrRevoked
                          ? handleEmailReconnect(account.accountEmail)
                          : handleReconnect(account.accountEmail)
                        }
                        disabled={getReconnectUrlMutation.isPending || getEmailReconnectUrlMutation.isPending}
                      >
                        {(getReconnectUrlMutation.isPending || getEmailReconnectUrlMutation.isPending) ? (
                          <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <RotateCcw className="h-3 w-3 mr-1" />
                        )}
                        Reconnect
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Edit purposes"
                      onClick={() => setEditingAccount(account)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Disconnect account"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect Account</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will revoke Geeves' access to <strong>{account.accountEmail}</strong>. Any calendars from this account will stop syncing but won't be deleted.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => removeMutation.mutate({ tokenId: account.id })}
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ── Email Scraping Issues ─────────────────────────────────────────────── */}
      {emailWarnings.length > 0 && (
        <Card className="border-amber-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Mail className="h-4 w-4" />
              Email Scraping Issues
            </CardTitle>
            <CardDescription>
              The following property platforms need Gmail access to import booking confirmations from email.
              Reconnect the affected account to grant <code className="text-xs font-mono">gmail.readonly</code> permission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {emailWarnings.map((w: any) => (
              <div
                key={w.platformId}
                className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5"
              >
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {w.propertyName} — <span className="capitalize">{w.platform.replace("_", ".")}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Account: <span className="font-mono">{w.notificationEmail}</span>
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-shrink-0 h-8 text-xs border-amber-500/50 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                  onClick={() => handleEmailReconnect(w.notificationEmail)}
                  disabled={getEmailReconnectUrlMutation.isPending}
                >
                  {getEmailReconnectUrlMutation.isPending ? (
                    <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <RotateCcw className="h-3 w-3 mr-1" />
                  )}
                  Reconnect
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Purpose reference card ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" />
            About Purposes & Permissions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {ALL_PURPOSES.map(p => {
              const meta = PURPOSE_META[p];
              return (
                <div key={p} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                  <span className={`mt-0.5 flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full border ${meta.color}`}>
                    {meta.icon}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
            Changing purposes on an existing account updates the metadata only. If you add a purpose that requires new permissions not yet granted, you'll need to reconnect the account to re-authorise with the expanded scope.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
'''

with open('client/src/pages/Settings.tsx', 'r') as f:
    content = f.read()
    lines = content.split('\n')

# Find the exact start and end lines (0-indexed)
start_line = 1806 - 1  # line 1806 (0-indexed = 1805)
end_line = 2163 - 1    # line 2163 (0-indexed = 2162)

# Build new content
before = '\n'.join(lines[:start_line])
after = '\n'.join(lines[end_line + 1:])
new_content = before + '\n' + NEW_TAB + after

with open('client/src/pages/Settings.tsx', 'w') as f:
    f.write(new_content)

# Verify
with open('client/src/pages/Settings.tsx', 'r') as f:
    new_lines = f.readlines()
print(f"New total lines: {len(new_lines)}")

# Check the replacement worked
import subprocess
result = subprocess.run(['grep', '-n', 'getUnifiedHealth', 'client/src/pages/Settings.tsx'], capture_output=True, text=True)
print("getUnifiedHealth occurrences:", result.stdout)
