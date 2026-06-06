import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  Shield,
  Activity,
  RefreshCw,
  User,
  Coins,
  Settings as SettingsIcon,
  Archive,
  Trash2,
  Plus,
  X,
  Search,
  Key,
  Copy,
  Check,
} from "lucide-react";
import { useAppCtx } from "../context/AppContext";
import {
  useAccounts,
  useTriggerAccountSync,
  useUpdateAccount,
  useDeleteAccount,
  useCreateAccount,
  useImportAccount,
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
} from "../api/queries";
import { exportAccount } from "../api/client";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useAuth } from "../context/AuthContext";
import { ISO_4217_CURRENCIES, type Account, type ExportPayload } from "@hornbill/core";

function getCurrencyFlag(code: string): string {
  const flags: Record<string, string> = {
    AED: "🇦🇪", AFN: "🇦🇫", ALL: "🇦🇱", AMD: "🇦🇲", ANG: "🇳🇱", AOA: "🇦🇴", ARS: "🇦🇷", AUD: "🇦🇺", AWG: "🇦🇼", AZN: "🇦🇿",
    BAM: "🇧🇦", BBD: "🇧🇧", BDT: "🇧🇩", BGN: "🇧🇬", BHD: "🇧🇭", BIF: "🇧🇮", BMD: "🇧🇲", BND: "🇧🇳", BOB: "🇧🇴", BRL: "🇧🇷",
    BSD: "🇧🇸", BTN: "🇧🇹", BWP: "🇧🇼", BYN: "🇧🇾", BZD: "🇧🇿", CAD: "🇨🇦", CDF: "🇨🇩", CHF: "🇨🇭", CLP: "🇨🇱", CNY: "🇨🇳",
    COP: "🇨🇴", CRC: "🇨🇷", CUC: "🇨🇺", CUP: "🇨🇺", CVE: "🇨🇻", CZK: "🇨🇿", DJF: "🇩🇯", DKK: "🇩🇰", DOP: "🇩🇴", DZD: "🇩🇿",
    EGP: "🇪🇬", ERN: "🇪🇷", ETB: "🇪🇹", EUR: "🇪🇺", FJD: "🇫🇯", FKP: "🇫🇰", GBP: "🇬🇧", GEL: "🇬🇪", GGP: "🇬🇬", GHS: "🇬🇭",
    GIP: "🇬🇮", GMD: "🇬🇲", GNF: "🇬🇳", GTQ: "🇬🇹", GYD: "🇬🇾", HKD: "🇭🇰", HNL: "🇭🇳", HRK: "🇭🇷", HTG: "🇭🇹", HUF: "🇭🇺",
    IDR: "🇮🇩", ILS: "🇮🇱", IMP: "🇮🇲", INR: "🇮🇳", IQD: "🇮🇶", IRR: "🇮🇷", ISK: "🇮🇸", JEP: "🇯🇪", JMD: "🇯🇲", JOD: "🇯🇴",
    JPY: "🇯🇵", KES: "🇰🇪", KGS: "🇰🇬", KHR: "🇰🇭", KMF: "🇰🇲", KPW: "🇰🇵", KRW: "🇰🇷", KWD: "🇰🇼", KYD: "🇰🇾", KZT: "🇰🇿",
    LAK: "🇱🇦", LBP: "🇱🇧", LKR: "🇱🇰", LRD: "🇱🇷", LSL: "🇱🇸", LYD: "🇱🇾", MAD: "🇲🇦", MDL: "🇲🇩", MGA: "🇲🇬", MKD: "🇲🇰",
    MMK: "🇲🇲", MNT: "🇲🇳", MOP: "🇲🇴", MRU: "🇲🇷", MUR: "🇲🇺", MVR: "🇲🇻", MWK: "🇲🇼", MXN: "🇲🇽", MYR: "🇲🇾", MZN: "🇲🇿",
    NAD: "🇳🇦", NGN: "🇳🇬", NIO: "🇳🇮", NOK: "🇳🇴", NPR: "🇳🇵", NZD: "🇳🇿", OMR: "🇴🇲", PAB: "🇵🇦", PEN: "🇵🇪", PGK: "🇵🇬",
    PHP: "🇵🇭", PKR: "🇵🇰", PLN: "🇵🇱", PYG: "🇵🇾", QAR: "🇶🇦", RON: "🇷🇴", RSD: "🇷🇸", RUB: "🇷🇺", RWF: "🇷🇼", SAR: "🇸🇦",
    SBD: "🇸🇧", SCR: "🇸🇨", SDG: "🇸🇩", SEK: "🇸🇪", SGD: "🇸🇬", SHP: "🇸🇭", SLL: "🇸🇱", SOS: "🇸🇴", SRD: "🇸🇷", SSP: "🇸🇸",
    STN: "🇸🇹", SVC: "🇸🇻", SYP: "🇸🇾", SZL: "🇸🇿", THB: "🇹🇭", TJS: "🇹🇯", TMT: "🇹🇲", TND: "🇹🇳", TOP: "🇹🇴", TRY: "🇹🇷",
    TTD: "🇹🇹", TWD: "🇹🇼", TZS: "🇹🇿", UAH: "🇺🇦", UGX: "🇺🇬", USD: "🇺🇸", UYU: "🇺🇾", UZS: "🇺🇿", VES: "🇻🇪", VND: "🇻🇳",
    VUV: "🇻🇺", WST: "🇼🇸", XAF: "🇨🇲", XCD: "🇦🇬", XOF: "🇸🇳", XPF: "🇵🇫", YER: "🇾🇪", ZAR: "🇿🇦", ZMW: "🇿🇲", ZWL: "🇿🇼"
  };
  return flags[code.toUpperCase()] || "";
}

export function SettingsView() {
  const { currentAccount, setCurrentAccount, notify } = useAppCtx();
  const { email, logout } = useAuth();
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];
  const isApiConnected = !accountsQuery.isError;

  const syncMut = useTriggerAccountSync(currentAccount?.id ?? "");
  const updateAccountMut = useUpdateAccount();
  const deleteAccountMut = useDeleteAccount();
  const createAccountMut = useCreateAccount();
  const importAccountMut = useImportAccount();

  const apiKeysQuery = useApiKeys();
  const apiKeys = apiKeysQuery.data ?? [];
  const createApiKeyMut = useCreateApiKey();
  const deleteApiKeyMut = useDeleteApiKey();

  const [exporting, setExporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [regenerateIds, setRegenerateIds] = useState(true);

  // --- Active Account Configuration States ---
  const [name, setName] = useState(currentAccount?.name ?? "");
  const [threshold, setThreshold] = useState(currentAccount?.upcoming_threshold_days ?? 7);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(currentAccount?.currencies ?? ["IDR", "USD"]);
  const [defaultCurrency, setDefaultCurrency] = useState(currentAccount?.default_currency ?? "IDR");

  // --- Notification Reminder States ---
  const [reminderEnabled, setReminderEnabled] = useState(currentAccount?.notification_reminder?.enabled ?? false);
  const [reminderDays, setReminderDays] = useState(currentAccount?.notification_reminder?.days_before_due ?? 3);
  const [reminderTime, setReminderTime] = useState(currentAccount?.notification_reminder?.time ?? "09:00");
  const [reminderTimezone, setReminderTimezone] = useState(currentAccount?.notification_reminder?.timezone ?? "UTC");

  const [providerType, setProviderType] = useState<Account["notification_provider"]["type"]>(currentAccount?.notification_provider?.type ?? "webhook");
  const [webhookUrl, setWebhookUrl] = useState(currentAccount?.notification_provider?.config?.webhookUrl ?? "");
  const [botToken, setBotToken] = useState(currentAccount?.notification_provider?.config?.botToken ?? "");
  const [chatId, setChatId] = useState(currentAccount?.notification_provider?.config?.chatId ?? "");
  const [gotifyUrl, setGotifyUrl] = useState(currentAccount?.notification_provider?.config?.gotifyUrl ?? "");
  const [gotifyToken, setGotifyToken] = useState(currentAccount?.notification_provider?.config?.gotifyToken ?? "");
  const [ntfyUrl, setNtfyUrl] = useState(currentAccount?.notification_provider?.config?.ntfyUrl ?? "");
  const [ntfyToken, setNtfyToken] = useState(currentAccount?.notification_provider?.config?.ntfyToken ?? "");

  // Autocomplete search states
  const [currencySearch, setCurrencySearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // New state for Trailbase data directory fetched from API status
  const [dataDir, setDataDir] = useState<string>("");

  // Fetch data directory on component mount
  useEffect(() => {
    fetch("/api/v1/status")
      .then((res) => res.json())
      .then((json) => setDataDir(json.data_dir || "./data/hornbill"))
      .catch(() => setDataDir("./data/hornbill"));
  }, []);

  // New account form states
  const [newAccName, setNewAccName] = useState("");
  const [showNewAccInput, setShowNewAccInput] = useState(false);

  // API Keys state
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"general" | "reminders" | "api" | "backup" | "system">("general");

  // Sync form inputs when current selected account changes during render
  const [prevAccount, setPrevAccount] = useState(currentAccount);
  if (currentAccount?.id !== prevAccount?.id) {
    setPrevAccount(currentAccount);
    setName(currentAccount?.name ?? "");
    setThreshold(currentAccount?.upcoming_threshold_days ?? 7);
    setSelectedCurrencies(currentAccount?.currencies ?? ["IDR", "USD"]);
    setDefaultCurrency(currentAccount?.default_currency ?? "IDR");
    setReminderEnabled(currentAccount?.notification_reminder?.enabled ?? false);
    setReminderDays(currentAccount?.notification_reminder?.days_before_due ?? 3);
    setReminderTime(currentAccount?.notification_reminder?.time ?? "09:00");
    setReminderTimezone(currentAccount?.notification_reminder?.timezone ?? "UTC");
    setProviderType(currentAccount?.notification_provider?.type ?? "webhook");
    setWebhookUrl(currentAccount?.notification_provider?.config?.webhookUrl ?? "");
    setBotToken(currentAccount?.notification_provider?.config?.botToken ?? "");
    setChatId(currentAccount?.notification_provider?.config?.chatId ?? "");
    setGotifyUrl(currentAccount?.notification_provider?.config?.gotifyUrl ?? "");
    setGotifyToken(currentAccount?.notification_provider?.config?.gotifyToken ?? "");
    setNtfyUrl(currentAccount?.notification_provider?.config?.ntfyUrl ?? "");
    setNtfyToken(currentAccount?.notification_provider?.config?.ntfyToken ?? "");
  }

  // Click outside listener to close search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Handlers ---
  function handleSync() {
    syncMut.mutate(undefined, {
      onSuccess: (stats) =>
        notify(
          `Sync complete. Processed ${stats.processed} bills, generated ${stats.generated} payments.`,
          "success"
        ),
      onError: (err: unknown) => notify(err instanceof Error ? err.message : "Sync failed.", "error"),
    });
  }

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!currentAccount) return;
    if (!name.trim()) {
      notify("Account name is required.", "error");
      return;
    }
    if (selectedCurrencies.length === 0) {
      notify("At least one currency is required.", "error");
      return;
    }
    if (!selectedCurrencies.includes(defaultCurrency)) {
      notify("Default currency must be in the currencies list.", "error");
      return;
    }

    updateAccountMut.mutate(
      {
        id: currentAccount.id,
        name,
        upcoming_threshold_days: Number(threshold),
        currencies: selectedCurrencies,
        default_currency: defaultCurrency,
        notification_reminder: {
          enabled: reminderEnabled,
          days_before_due: Number(reminderDays),
          time: reminderTime,
          timezone: reminderTimezone,
        },
        notification_provider: {
          type: providerType,
          config: {
            webhookUrl: (providerType === "webhook" || providerType === "slack" || providerType === "discord") ? webhookUrl : undefined,
            botToken: providerType === "telegram" ? botToken : undefined,
            chatId: providerType === "telegram" ? chatId : undefined,
            gotifyUrl: providerType === "gotify" ? gotifyUrl : undefined,
            gotifyToken: providerType === "gotify" ? gotifyToken : undefined,
            ntfyUrl: providerType === "ntfy" ? ntfyUrl : undefined,
            ntfyToken: providerType === "ntfy" ? ntfyToken : undefined,
          },
        },
      },
      {
        onSuccess: () => {
          notify(`Account configurations saved successfully.`, "success");
        },
        onError: (err: unknown) => notify(err instanceof Error ? err.message : "Failed to save configurations.", "error"),
      }
    );
  }

  function handleCreateAccount() {
    const trimmedName = newAccName.trim();
    if (!trimmedName) return;
    createAccountMut.mutate(trimmedName, {
      onSuccess: (newAcc) => {
        setCurrentAccount(newAcc);
        setNewAccName("");
        setShowNewAccInput(false);
        notify(`Account "${trimmedName}" created.`, "success");
      },
      onError: (err: unknown) => notify(err instanceof Error ? err.message : "Failed to create account.", "error"),
    });
  }

  function handleArchiveToggle(acc: Account) {
    updateAccountMut.mutate(
      {
        id: acc.id,
        archived: !acc.archived,
      },
      {
        onSuccess: (updated) => {
          notify(
            `Account "${acc.name}" ${updated.archived ? "archived" : "unarchived"}.`,
            "success"
          );
        },
        onError: (err: unknown) => notify(err instanceof Error ? err.message : "Action failed.", "error"),
      }
    );
  }

  function handleDeleteAccount(acc: Account) {
    const confirmation = confirm(
      `WARNING: Deleting account "${acc.name}" will permanently erase all associated bills and payments! This action cannot be undone.\n\nAre you sure you want to delete this account?`
    );
    if (!confirmation) return;

    deleteAccountMut.mutate(acc.id, {
      onSuccess: () => {
        notify(`Account "${acc.name}" deleted.`, "success");
      },
        onError: (err: unknown) => notify(err instanceof Error ? err.message : "Failed to delete account.", "error"),
    });
  }

  // API Keys Handlers
  function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newKeyName.trim();
    if (!trimmed) return;
    createApiKeyMut.mutate(trimmed, {
      onSuccess: (data) => {
        setGeneratedToken(data.token);
        setNewKeyName("");
        notify("API Key created successfully. Copy it now!", "success");
      },
      onError: (err: unknown) => {
        notify(err instanceof Error ? err.message : "Failed to create API key.", "error");
      },
    });
  }

  function handleDeleteKey(id: string, keyName: string) {
    const confirmation = confirm(`Are you sure you want to revoke the API key "${keyName}"? External scripts using this key will fail.`);
    if (!confirmation) return;
    deleteApiKeyMut.mutate(id, {
      onSuccess: () => {
        notify("API Key revoked successfully.", "success");
      },
      onError: (err: unknown) => {
        notify(err instanceof Error ? err.message : "Failed to revoke API key.", "error");
      },
    });
  }

  function handleCopy() {
    if (!generatedToken) return;
    navigator.clipboard.writeText(generatedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleExport() {
    if (!currentAccount) return;
    setExporting(true);
    try {
      const payload = await exportAccount(currentAccount.id);
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(payload, null, 2)
      )}`;
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", jsonString);
      const safeName = currentAccount.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      downloadAnchor.setAttribute("download", `hornbill-backup-${safeName}-${payload.exported_at}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      
      notify(`Backup JSON file generated for "${currentAccount.name}"`, "success");
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : "Failed to export account", "error");
    } finally {
      setExporting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  }

  async function handleImport() {
    if (!selectedFile) return;
    try {
      const text = await selectedFile.text();
      let parsedPayload: ExportPayload;
      try {
        parsedPayload = JSON.parse(text) as ExportPayload;
      } catch {
        notify("Invalid JSON file format", "error");
        return;
      }
      
      importAccountMut.mutate(
        { payload: parsedPayload, regenerateIds },
        {
          onSuccess: (newAccount) => {
            notify(`Account "${newAccount.name}" successfully imported and created!`, "success");
            setCurrentAccount(newAccount);
            setSelectedFile(null);
          },
          onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : "";
            if (message.includes("Conflict")) {
              notify("Conflict detected: Some database records matching these IDs already exist. Please check 'Regenerate IDs / Avoid Conflicts' and try again.", "error");
            } else {
              notify(message || "Import failed.", "error");
            }
          },
        }
      );
    } catch (err: unknown) {
      notify(`Failed to read backup file: ${err instanceof Error ? err.message : "unknown error"}`, "error");
    }
  }

  // --- Currency Autocomplete Filtering ---
  const queryClean = currencySearch.trim().toUpperCase();

  const filteredCurrencies = ISO_4217_CURRENCIES.filter(
    (c) =>
      (c.code.includes(queryClean) || c.name.toLowerCase().includes(currencySearch.toLowerCase())) &&
      !selectedCurrencies.includes(c.code)
  ).slice(0, 8);

  const showCustomOption =
    queryClean.length === 3 &&
    /^[A-Z]{3}$/.test(queryClean) &&
    !selectedCurrencies.includes(queryClean) &&
    !ISO_4217_CURRENCIES.some((c) => c.code === queryClean);

  function addCurrencyCode(code: string) {
    if (!selectedCurrencies.includes(code)) {
      const updated = [...selectedCurrencies, code];
      setSelectedCurrencies(updated);
      if (updated.length === 1) {
        setDefaultCurrency(code);
      }
    }
    setCurrencySearch("");
    setShowDropdown(false);
  }

  function removeCurrencyCode(code: string) {
    if (selectedCurrencies.length <= 1) {
      notify("At least one currency is required.", "error");
      return;
    }
    const updated = selectedCurrencies.filter((c) => c !== code);
    setSelectedCurrencies(updated);
    if (defaultCurrency === code) {
      setDefaultCurrency(updated[0]);
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Tabs list */}
      <div className="flex border-b border-border-warm gap-2 mb-6 overflow-x-auto scrollbar-none">
        {([
          { id: "general", label: "General" },
          { id: "reminders", label: "Reminders" },
          { id: "api", label: "API Keys" },
          { id: "backup", label: "Backup" },
          { id: "system", label: "System" },
        ] as { id: typeof activeTab; label: string }[]).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-[15px] font-semibold transition-ember focus:outline-none -mb-[1px] whitespace-nowrap cursor-pointer ${
                isActive
                  ? "text-primary border-b-2 border-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-raised rounded-t-sm"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "general" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
          {/* --- Active Account Configurations Form --- */}
          <div className="lg:col-span-2 space-y-6">
            <Card hoverable={false} className="p-6 relative">
              <h4 className="font-display font-semibold text-[20px] text-text-primary mb-5 flex items-center gap-2 pb-3 border-b border-border-warm">
                <SettingsIcon className="w-5 h-5 text-primary" />
                Account Settings
                {currentAccount?.archived && (
                  <span className="text-[12px] font-bold px-2 py-0.5 rounded-pill bg-surface-raised border border-border-warm text-neutral-muted">
                    Archived
                  </span>
                )}
              </h4>

              {currentAccount ? (
                <form onSubmit={handleSaveSettings} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <Input
                      label="Account Name"
                      placeholder="e.g. Personal Expenses, Business Co"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />

                    <Input
                      label="Due Threshold (Days)"
                      placeholder="e.g. 7"
                      type="number"
                      min="1"
                      value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                    />
                  </div>

                  {/* Pill-based Autocomplete Currencies Field */}
                  <div className="space-y-2">
                    <label className="font-body text-[14px] font-semibold text-text-primary block">
                      Currencies
                    </label>
                    
                    {/* Selected Pills */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {selectedCurrencies.map((code) => {
                        const currencyObj = ISO_4217_CURRENCIES.find((c) => c.code === code);
                        const fullName = currencyObj ? currencyObj.name : "Custom Currency";
                        const flag = getCurrencyFlag(code);
                        return (
                          <div
                            key={code}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-warm border border-border-warm text-[13px] font-semibold text-text-primary group animate-scaleIn"
                            title={fullName}
                          >
                            {flag ? (
                              <span className="text-[16px] leading-none shrink-0 select-none mr-0.5">{flag}</span>
                            ) : (
                              <Coins className="w-3.5 h-3.5 text-primary shrink-0" />
                            )}
                            <span>{code}</span>
                            {selectedCurrencies.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeCurrencyCode(code)}
                                className="text-text-secondary hover:text-error shrink-0 transition-colors focus:outline-none"
                                aria-label={`Remove ${code}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Autocomplete Input Box */}
                    <div ref={dropdownRef} className="relative">
                      <div className="relative flex items-center">
                        <Search className="w-4 h-4 text-text-secondary absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Search currency code or full name..."
                          value={currencySearch}
                          onChange={(e) => {
                            setCurrencySearch(e.target.value);
                            setShowDropdown(true);
                          }}
                          onFocus={() => setShowDropdown(true)}
                          className="w-full rounded-sm pl-9 pr-3 py-2.5 text-[15px] font-body bg-surface-warm border border-border-warm hover:border-primary/60 focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary outline-none transition-ember h-10"
                        />
                        {currencySearch && (
                          <button
                            type="button"
                            onClick={() => setCurrencySearch("")}
                            className="absolute right-3 text-text-secondary hover:text-text-primary focus:outline-none"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Suggestions Dropdown */}
                      {showDropdown && (currencySearch.trim() !== "" || filteredCurrencies.length > 0) && (
                        <div className="absolute left-0 right-0 top-full mt-1.5 bg-background-warm border border-border-warm rounded-sm shadow-lg z-30 max-h-60 overflow-y-auto overflow-x-hidden divide-y divide-border-warm">
                          {filteredCurrencies.map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => addCurrencyCode(c.code)}
                              className="w-full px-4 py-2.5 text-left text-[14px] font-semibold text-text-secondary hover:bg-surface-warm hover:text-text-primary transition-colors flex justify-between items-center gap-3"
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                {getCurrencyFlag(c.code) && (
                                  <span className="text-[16px] leading-none shrink-0 select-none">{getCurrencyFlag(c.code)}</span>
                                )}
                                <span className="truncate text-text-primary font-mono bg-surface-raised border border-border-warm px-1.5 py-0.5 rounded-sm shrink-0">
                                  {c.code}
                                </span>
                              </span>
                              <span className="truncate text-right text-[13px] text-text-secondary">
                                {c.name}
                              </span>
                            </button>
                          ))}
                          {showCustomOption && (
                            <button
                              type="button"
                              onClick={() => addCurrencyCode(queryClean)}
                              className="w-full px-4 py-2.5 text-left text-[14px] font-semibold text-primary hover:bg-surface-warm transition-colors flex items-center gap-2"
                            >
                              <Plus className="w-4 h-4 shrink-0" />
                              <span>Add custom: <span className="font-mono font-bold bg-surface-raised border border-border-warm px-1.5 py-0.5 rounded-sm text-text-primary">{queryClean}</span></span>
                            </button>
                          )}
                          {filteredCurrencies.length === 0 && !showCustomOption && (
                            <p className="px-4 py-3 text-[13px] text-text-secondary font-medium">
                              No currencies found.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dynamic Default Currency Dropdown */}
                  <div className="space-y-2">
                    <label className="font-body text-[14px] font-semibold text-text-primary block">
                      Default Currency
                    </label>
                    <select
                      value={defaultCurrency}
                      onChange={(e) => setDefaultCurrency(e.target.value)}
                      className="w-full md:w-60 rounded-sm p-3 text-[15px] font-body border border-border-warm h-[46px] bg-surface-warm hover:border-primary/60 focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary outline-none transition-ember"
                    >
                      {selectedCurrencies.map((code) => {
                        const currencyObj = ISO_4217_CURRENCIES.find((c) => c.code === code);
                        const name = currencyObj ? ` (${currencyObj.name})` : "";
                        return (
                          <option key={code} value={code}>
                            {code}{name}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-4 border-t border-border-warm">
                    <Button
                      type="submit"
                      variant="primary"
                      size="medium"
                      disabled={updateAccountMut.isPending || !isApiConnected}
                      className="gap-2 shrink-0"
                    >
                      {updateAccountMut.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Save Settings"
                      )}
                    </Button>
                  </div>
                </form>
              ) : (
                <p className="text-[14px] text-text-secondary py-10 text-center font-medium">
                  Please select or create an account to begin.
                </p>
              )}
            </Card>
          </div>

          {/* --- Manage Accounts List Pane --- */}
          <div className="space-y-6">
            <Card hoverable={false} className="p-6 flex flex-col h-full">
              <h4 className="font-display font-semibold text-[20px] text-text-primary mb-4 flex items-center justify-between pb-3 border-b border-border-warm">
                <span className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Manage Accounts
                </span>
              </h4>

              {/* List of accounts */}
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[360px] pr-1">
                {accounts.map((acc) => {
                  const isSelected = currentAccount?.id === acc.id;
                  return (
                    <div
                      key={acc.id}
                      className={`p-3 rounded-sm border transition-ember flex flex-col gap-2 relative ${
                        isSelected
                          ? "border-primary bg-surface-warm border-l-[3px] border-l-primary"
                          : "border-border-warm bg-background-warm hover:bg-surface-warm"
                      } ${acc.archived ? "opacity-60 bg-surface-warm/40" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span
                            className={`text-[15px] font-semibold block truncate ${
                              acc.archived
                                ? "text-text-secondary line-through decoration-neutral-muted"
                                : "text-text-primary"
                            }`}
                          >
                            {acc.name}
                          </span>
                          {acc.archived && (
                            <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-neutral-muted bg-surface-raised border border-border-warm px-1.5 py-0.5 rounded-sm mt-0.5">
                              Archived
                            </span>
                          )}
                        </div>
                        
                        {/* Active Indicator */}
                        {isSelected && (
                          <span className="text-[11px] font-bold text-primary bg-primary/8 px-2 py-0.5 rounded-pill border border-primary/20 shrink-0 select-none">
                            Active
                          </span>
                        )}
                      </div>

                      {/* Quick Info */}
                      <div className="text-[12px] font-medium text-text-secondary flex flex-wrap gap-x-3 gap-y-1">
                        <span>Threshold: {acc.upcoming_threshold_days} days</span>
                        <span>Currencies: {acc.currencies.join(", ")}</span>
                      </div>

                      {/* Account Actions Bar */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-warm/50 mt-1">
                        {/* Switch Active Account */}
                        {!isSelected && !acc.archived && (
                          <button
                            onClick={() => setCurrentAccount(acc)}
                            className="text-[12px] font-bold text-primary hover:underline cursor-pointer py-1 px-1.5 focus:outline-none"
                          >
                            Activate
                          </button>
                        )}

                        {/* Archive / Unarchive Toggle */}
                        <button
                          onClick={() => handleArchiveToggle(acc)}
                          className="p-1.5 rounded-sm border border-border-warm hover:border-primary/40 hover:bg-surface-raised text-text-secondary hover:text-text-primary focus:outline-none transition-ember shrink-0"
                          title={acc.archived ? "Unarchive account" : "Archive account"}
                          aria-label={acc.archived ? "Unarchive account" : "Archive account"}
                        >
                          <Archive className={`w-3.5 h-3.5 ${acc.archived ? "text-primary fill-primary/10" : ""}`} />
                        </button>

                        {/* Delete Account */}
                        <button
                          onClick={() => handleDeleteAccount(acc)}
                          className="p-1.5 rounded-sm border border-border-warm hover:border-error/40 hover:bg-red-50 text-text-secondary hover:text-error focus:outline-none transition-ember shrink-0"
                          title="Delete account (deletes all bills & payments)"
                          aria-label="Delete account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {accounts.length === 0 && (
                  <p className="text-[13px] text-text-secondary py-4 text-center font-medium">
                    No accounts found.
                  </p>
                )}
              </div>

              {/* Create Account Box */}
              <div className="pt-4 border-t border-border-warm mt-4">
                {showNewAccInput ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="New Account Name..."
                      value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          setShowNewAccInput(false);
                          setNewAccName("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="small"
                        onClick={handleCreateAccount}
                        disabled={!newAccName.trim() || createAccountMut.isPending}
                      >
                        {createAccountMut.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          "Create"
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="medium"
                    onClick={() => setShowNewAccInput(true)}
                    className="w-full gap-2 text-[13px]"
                  >
                    <Plus className="w-4 h-4" />
                    Add New Account
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "reminders" && (
        <div className="space-y-6 animate-fadeIn">
          <Card hoverable={false} className="p-6">
            <h4 className="font-display font-semibold text-[20px] text-text-primary mb-5 flex items-center gap-2 pb-3 border-b border-border-warm">
              <Activity className="w-5 h-5 text-primary" />
              Due Payment Reminders
            </h4>

            {currentAccount ? (
              <form onSubmit={handleSaveSettings} className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-display font-semibold text-[17px] text-text-primary">
                      Due Payment Reminders
                    </h5>
                    <p className="text-[13px] text-text-secondary">
                      Receive aggregated daily reminder notifications for unpaid payments.
                    </p>
                  </div>
                  {/* Toggle Switch */}
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={reminderEnabled}
                      onChange={(e) => setReminderEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-raised rounded-full peer peer-focus:outline-none relative after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border-warm after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5 peer-checked:bg-primary"></div>
                  </label>
                </div>

                {reminderEnabled && (
                  <div className="space-y-5 animate-slideDown">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Input
                        label="Days Before Due"
                        placeholder="e.g. 3"
                        type="number"
                        min="0"
                        value={reminderDays}
                        onChange={(e) => setReminderDays(Number(e.target.value))}
                        helperText="0 means remind on due date only"
                      />

                      {/* Reminder Time */}
                      <div className="space-y-2">
                        <label className="font-body text-[14px] font-semibold text-text-primary block">
                          Reminder Time (HH:MM)
                        </label>
                        <input
                          type="time"
                          value={reminderTime}
                          onChange={(e) => setReminderTime(e.target.value)}
                          className="w-full rounded-sm px-3 py-2.5 text-[15px] font-body bg-surface-warm border border-border-warm hover:border-primary/60 focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary outline-none transition-ember h-[46px]"
                        />
                      </div>

                      {/* Timezone */}
                      <div className="space-y-2">
                        <label className="font-body text-[14px] font-semibold text-text-primary block">
                          Timezone
                        </label>
                        <select
                          value={reminderTimezone}
                          onChange={(e) => setReminderTimezone(e.target.value)}
                          className="w-full rounded-sm p-3 text-[15px] font-body border border-border-warm h-[46px] bg-surface-warm hover:border-primary/60 focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary outline-none transition-ember"
                        >
                          <option value="UTC">UTC (Coordinated Universal Time)</option>
                          <option value="GMT">GMT (Greenwich Time)</option>
                          <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                          <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                          <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                          <option value="America/New_York">America/New_York (EST/EDT)</option>
                          <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                          <option value="America/Denver">America/Denver (MST/MDT)</option>
                          <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                          <option value="Europe/London">Europe/London (GMT/BST)</option>
                          <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                          <option value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</option>
                        </select>
                      </div>
                    </div>

                    {/* Notification Provider */}
                    <div className="border-t border-border-warm/50 pt-5 space-y-4">
                      <div className="space-y-2">
                        <label className="font-body text-[14px] font-semibold text-text-primary block">
                          Notification Channel
                        </label>
                        <select
                          value={providerType}
                          onChange={(e) => setProviderType(e.target.value as Account["notification_provider"]["type"])}
                          className="w-full md:w-60 rounded-sm p-3 text-[15px] font-body border border-border-warm h-[46px] bg-surface-warm hover:border-primary/60 focus:border-primary focus:ring-3 focus:ring-primary/12 text-text-primary outline-none transition-ember"
                        >
                          <option value="discord">Discord Webhook</option>
                          <option value="slack">Slack Webhook</option>
                          <option value="telegram">Telegram Bot</option>
                          <option value="webhook">Generic Webhook</option>
                          <option value="gotify">Gotify</option>
                          <option value="ntfy">ntfy</option>
                          <option value="console">Console Log</option>
                        </select>
                      </div>

                      {providerType === "webhook" || providerType === "slack" || providerType === "discord" ? (
                        <Input
                          label="Webhook URL"
                          placeholder="https://..."
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                        />
                      ) : providerType === "telegram" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                          <Input
                            label="Telegram Bot Token"
                            placeholder="123456789:ABCdefGhI..."
                            type="password"
                            value={botToken}
                            onChange={(e) => setBotToken(e.target.value)}
                          />
                          <Input
                            label="Telegram Chat ID"
                            placeholder="-100123456789 or @channelname"
                            value={chatId}
                            onChange={(e) => setChatId(e.target.value)}
                          />
                        </div>
                      ) : providerType === "gotify" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                          <Input
                            label="Gotify Server URL"
                            placeholder="https://gotify.example.com"
                            value={gotifyUrl}
                            onChange={(e) => setGotifyUrl(e.target.value)}
                          />
                          <Input
                            label="Gotify App Token"
                            placeholder="A1b2C3d4E5f..."
                            type="password"
                            value={gotifyToken}
                            onChange={(e) => setGotifyToken(e.target.value)}
                          />
                        </div>
                      ) : providerType === "ntfy" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                          <Input
                            label="ntfy Server Topic URL"
                            placeholder="https://ntfy.sh/my-topic"
                            value={ntfyUrl}
                            onChange={(e) => setNtfyUrl(e.target.value)}
                          />
                          <Input
                            label="ntfy Access Token (Optional)"
                            placeholder="tk_..."
                            type="password"
                            value={ntfyToken}
                            onChange={(e) => setNtfyToken(e.target.value)}
                          />
                        </div>
                      ) : (
                        <p className="text-[13px] text-text-secondary italic">
                          Console Log provider requires no configurations. Output will be piped directly to the Hornbill API process stdout.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-between gap-4 border-t border-border-warm">
                  <Button
                    type="submit"
                    variant="primary"
                    size="medium"
                    disabled={updateAccountMut.isPending || !isApiConnected}
                    className="gap-2 shrink-0"
                  >
                    {updateAccountMut.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Save Reminders"
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-[14px] text-text-secondary py-10 text-center font-medium">
                Please select or create an account to begin.
              </p>
            )}
          </Card>
        </div>
      )}

      {activeTab === "api" && (
        <div className="space-y-6 animate-fadeIn">
          {currentAccount ? (
            <Card hoverable={false} className="p-6">
              <h4 className="font-display font-semibold text-[20px] text-text-primary mb-2 flex items-center gap-2 pb-3 border-b border-border-warm">
                <Key className="w-5 h-5 text-primary" />
                API Access & Tokens
              </h4>
              <p className="text-[14px] text-text-secondary mb-5 leading-relaxed">
                Generate static tokens to securely authorize external tools (such as Home Assistant, custom scripts, or CLI cron syncs) to query or update your Hornbill account.
              </p>

              {/* Raw Token Success Banner */}
              {generatedToken && (
                <div className="mb-6 p-4 rounded-sm bg-success/8 border border-success/20 text-success-dark animate-fadeIn">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <span className="text-[12px] font-bold uppercase tracking-wider block text-success">
                        Key Generated Successfully
                      </span>
                      <p className="text-[13px] text-text-secondary">
                        Please copy this key now. For security reasons, you will not be able to view it again.
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-3 py-1.5 rounded-sm bg-surface border border-border-warm text-[14px] text-text-primary font-mono select-all truncate">
                          {generatedToken}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="p-1.5 rounded-sm border border-border-warm hover:border-primary/40 hover:bg-surface text-text-secondary hover:text-primary transition-ember cursor-pointer"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGeneratedToken(null)}
                      className="text-text-secondary hover:text-text-primary p-1 rounded-sm focus:outline-none"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {/* Form to generate new key */}
                <form onSubmit={handleCreateKey} className="flex flex-col sm:flex-row items-end gap-3 pb-6 border-b border-border-warm/50">
                  <div className="flex-1 w-full">
                    <Input
                      label="New API Key Name"
                      placeholder="e.g., Home Assistant Dashboard"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    size="medium"
                    disabled={createApiKeyMut.isPending || !newKeyName.trim()}
                    className="w-full sm:w-auto shrink-0 gap-2"
                  >
                    {createApiKeyMut.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Generate Token"
                    )}
                  </Button>
                </form>

                {/* List of active keys */}
                <div className="space-y-4">
                  <h5 className="font-body font-semibold text-[15px] text-text-primary">
                    Active API Keys
                  </h5>

                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                    {apiKeysQuery.isPending ? (
                      <div className="py-4 text-center">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-text-secondary" />
                      </div>
                    ) : apiKeys.length === 0 ? (
                      <p className="text-[13px] text-text-secondary italic">
                        No active API keys generated yet.
                      </p>
                    ) : (
                      apiKeys.map((k) => (
                        <div
                          key={k.id}
                          className="flex items-center justify-between gap-4 p-3 rounded-sm border border-border-warm bg-background-warm"
                        >
                          <div className="min-w-0">
                            <span className="text-[14px] font-semibold text-text-primary block truncate">
                              {k.name}
                            </span>
                            <span className="text-[11px] text-text-secondary block mt-0.5">
                              Created: {new Date(k.created_at * 1000).toLocaleDateString()}
                              {k.last_used_at ? ` • Last used: ${new Date(k.last_used_at * 1000).toLocaleDateString()}` : " • Never used"}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteKey(k.id, k.name)}
                            className="p-1.5 rounded-sm border border-border-warm hover:border-error hover:bg-red-50 text-text-secondary hover:text-error transition-ember shrink-0 focus:outline-none"
                            title="Revoke key"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Docs Link section */}
                <div className="p-4 rounded-sm bg-surface-raised border border-border-warm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-4">
                  <div className="text-[13px] text-text-secondary leading-relaxed font-medium">
                    <span className="block font-semibold text-text-primary mb-0.5">Interactive API Documentation</span>
                    Ready to start coding? Browse endpoint schemas, request payloads, and test operations directly using our interactive documentation.
                  </div>
                  <a
                    href="/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[13px] font-bold text-primary hover:underline flex items-center gap-1.5 border border-primary/20 hover:bg-primary/4 px-3 py-1.5 rounded-sm focus:outline-none"
                  >
                    Open API Reference &rarr;
                  </a>
                </div>
              </div>
            </Card>
          ) : (
            <Card hoverable={false} className="p-6">
              <p className="text-[14px] text-text-secondary py-10 text-center font-medium">
                Please select or create an account to begin.
              </p>
            </Card>
          )}
        </div>
      )}

      {activeTab === "backup" && (
        <div className="space-y-6 animate-fadeIn">
          {currentAccount ? (
            <Card hoverable={false} className="p-6">
              <h4 className="font-display font-semibold text-[20px] text-text-primary mb-2 flex items-center gap-2 pb-3 border-b border-border-warm">
                <RefreshCw className="w-5 h-5 text-primary" />
                Data Portability
              </h4>
              <p className="text-[14px] text-text-secondary mb-5 leading-relaxed">
                Export settings, bills, and payments for the active account <span className="font-semibold text-text-primary">&quot;{currentAccount.name}&quot;</span>, or import a JSON backup file to create a new account.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-border-warm">
                {/* Export Column */}
                <div className="space-y-4 pb-4 md:pb-0">
                  <h5 className="font-body font-semibold text-[15px] text-text-primary flex items-center gap-2">
                    Export Account Backup
                  </h5>
                  <p className="text-[13px] text-text-secondary leading-relaxed">
                    Download a secure JSON file containing all settings, bills, and payment records for this account.
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    size="medium"
                    onClick={handleExport}
                    disabled={exporting}
                    className="w-full md:w-auto gap-2"
                  >
                    {exporting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Export Account Data"
                    )}
                  </Button>
                </div>

                {/* Import Column */}
                <div className="space-y-4 pt-4 md:pt-0 md:pl-6">
                  <h5 className="font-body font-semibold text-[15px] text-text-primary flex items-center gap-2">
                    Import Account Backup
                  </h5>
                  <p className="text-[13px] text-text-secondary leading-relaxed">
                    Upload a previously exported JSON backup file. This creates a new account under your profile with the imported data.
                  </p>
                  
                  <div className="space-y-3">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileChange}
                      className="w-full text-[13px] file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border file:border-border-warm file:bg-surface-raised file:text-text-primary file:font-semibold hover:file:bg-surface-warm file:cursor-pointer text-text-secondary font-medium"
                    />

                    <label className="flex items-start gap-2.5 cursor-pointer text-[13px] font-semibold text-text-primary select-none">
                      <input
                        type="checkbox"
                        checked={regenerateIds}
                        onChange={(e) => setRegenerateIds(e.target.checked)}
                        className="mt-0.5 rounded-sm border-border-warm text-primary focus:ring-primary/12 cursor-pointer"
                      />
                      <span className="leading-tight">
                        Regenerate IDs / Avoid Conflicts
                        <span className="block text-[11px] font-normal text-text-secondary mt-0.5">
                          Create as a new independent copy if the backup already exists in this database.
                        </span>
                      </span>
                    </label>

                    <Button
                      type="button"
                      variant="secondary"
                      size="medium"
                      onClick={handleImport}
                      disabled={importAccountMut.isPending || !selectedFile}
                      className="w-full md:w-auto gap-2"
                    >
                      {importAccountMut.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Upload & Import Data"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card hoverable={false} className="p-6">
              <p className="text-[14px] text-text-secondary py-10 text-center font-medium">
                Please select or create an account to begin.
              </p>
            </Card>
          )}
        </div>
      )}

      {activeTab === "system" && (
        <div className="space-y-6 animate-fadeIn">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
            <Card hoverable={false} className="p-5 md:col-span-2">
              <h4 className="font-display font-semibold text-[18px] text-text-primary mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                System Properties
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    {dataDir}
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
        </div>
      )}
    </div>
  );
}
