/**
 * Recon Explorer — embeds the Maxfield reconciliation single-file explorer.
 * Served as a static asset at /recon-explorer.html (client/public/).
 */
export default function ReconExplorer() {
  return (
    <div style={{ width: "100%", height: "calc(100vh - 64px)" }}>
      <iframe
        src="/recon-explorer.html"
        title="Maxfield Reconciliation Explorer"
        style={{ width: "100%", height: "100%", border: "none", display: "block" }}
      />
    </div>
  );
}
