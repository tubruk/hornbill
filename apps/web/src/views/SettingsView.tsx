import { Loader2, Shield, Activity, RefreshCw, User } from "lucide-react";
import { useAppCtx } from "../context/AppContext";
import { useAccounts, useTriggerSync } from "../api/queries";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { useAuth } from "../context/AuthContext";

export function SettingsView() {
  const { notify } = useAppCtx();
  const { email, logout } = useAuth();
  const accountsQuery = useAccounts();
  const isApiConnected = !accountsQuery.isError;

  const syncMut = useTriggerSync();

  function handleSync() {
    syncMut.mutate(undefined, {
      onSuccess: (stats) =>
        notify(
          `Sync complete. Processed ${stats.processed} bills, generated ${stats.generated} payments.`,
          "success"
        ),
      onError: (err: any) =>
        notify(err.message ?? "Sync failed.", "error"),
    });
  }

  return (
    <div className="space-y-7">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-7">

        {/* Account & Session */}
        <Card hoverable={false} className="p-5">
          <h4 className="font-display font-semibold text-[18px] text-text-primary mb-2 flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Account Session
          </h4>
          <p className="text-[14px] text-text-secondary font-medium leading-relaxed mb-5">
            You are logged in as <span className="font-semibold text-text-primary">{email}</span>. Clear your active session and log out of the application.
          </p>
          <Button
            variant="destructive"
            size="medium"
            onClick={() => {
              if (confirm("Are you sure you want to log out?")) {
                logout();
              }
            }}
          >
            Log Out
          </Button>
        </Card>

        {/* Database Maintenance */}
        <Card hoverable={false} className="p-5">
          <h4 className="font-display font-semibold text-[18px] text-text-primary mb-2 flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Database Maintenance
          </h4>
          <p className="text-[14px] text-text-secondary font-medium leading-relaxed mb-5">
            Reset the local development database cache. SQLite data configurations remain intact — only the in-memory cache is flushed.
          </p>
          <Button
            variant="secondary"
            size="medium"
            onClick={() => {
              if (confirm("Flush local cache configurations?")) {
                notify("Run 'make db-reset' in your terminal to flush the local cache.", "info");
              }
            }}
          >
            Clear Local Cache
          </Button>
        </Card>

        {/* System Properties */}
        <Card hoverable={false} className="p-5">
          <h4 className="font-display font-semibold text-[18px] text-text-primary mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            System Properties
          </h4>
          <div className="space-y-4">
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-text-secondary uppercase tracking-wide">
                API Gateway
              </span>
              <div className="flex items-center gap-2">
                <span className="flex-1 px-3 py-2 rounded-sm bg-surface-raised border border-border-warm text-[14px] text-text-primary font-mono select-all truncate">
                  {isApiConnected ? "http://localhost:3000" : "Offline / Mock"}
                </span>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isApiConnected ? "bg-success" : "bg-warning animate-pulse"}`} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-text-secondary uppercase tracking-wide">
                Data Directory
              </span>
              <span className="px-3 py-2 rounded-sm bg-surface-raised border border-border-warm text-[14px] text-text-primary font-mono select-all">
                packages/db/traildepot/
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-text-secondary uppercase tracking-wide">
                Accounts Loaded
              </span>
              <span className="px-3 py-2 rounded-sm bg-surface-raised border border-border-warm text-[14px] text-text-primary font-mono">
                {accountsQuery.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin inline" />
                ) : (
                  `${accountsQuery.data?.length ?? 0} account(s)`
                )}
              </span>
            </div>
          </div>
        </Card>

      </div>

      {/* Sync Panel */}
      <Card
        hoverable={false}
        className="border border-border-warm bg-surface-warm p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5"
      >
        <div>
          <h4 className="font-display font-semibold text-[17px] text-text-primary mb-1 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            Manual Sync
          </h4>
          <p className="text-[14px] text-text-secondary font-medium">
            Immediately trigger the billing cron job to generate upcoming payment records for all active bills.
          </p>
        </div>
        <Button
          variant="primary"
          size="medium"
          onClick={handleSync}
          disabled={syncMut.isPending || !isApiConnected}
          className="shrink-0 gap-2"
        >
          {syncMut.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Syncing…</>
          ) : (
            "Sync Now"
          )}
        </Button>
      </Card>

      {!isApiConnected && (
        <p className="text-[13px] text-text-secondary font-medium text-center">
          Manual sync is only available when the API is connected.
        </p>
      )}
    </div>
  );
}
