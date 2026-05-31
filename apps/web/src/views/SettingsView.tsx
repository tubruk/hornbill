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
} from "lucide-react";
import { useAppCtx } from "../context/AppContext";
import {
  useAccounts,
  useTriggerSync,
  useUpdateAccount,
  useDeleteAccount,
  useCreateAccount,
} from "../api/queries";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { useAuth } from "../context/AuthContext";
import { ISO_4217_CURRENCIES, type Account } from "@hornbill/core";

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

  const syncMut = useTriggerSync();
  const updateAccountMut = useUpdateAccount();
  const deleteAccountMut = useDeleteAccount();
  const createAccountMut = useCreateAccount();

  // --- Active Account Configuration States ---
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState(7);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState("");

  // Autocomplete search states
  const [currencySearch, setCurrencySearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // New account form states
  const [newAccName, setNewAccName] = useState("");
  const [showNewAccInput, setShowNewAccInput] = useState(false);

  // Sync form inputs when current selected account changes
  useEffect(() => {
    if (currentAccount) {
      setName(currentAccount.name);
      setThreshold(currentAccount.upcoming_threshold_days);
      setSelectedCurrencies(currentAccount.currencies ?? ["IDR", "USD"]);
      setDefaultCurrency(currentAccount.default_currency ?? "IDR");
    }
  }, [currentAccount]);

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
      onError: (err: any) => notify(err.message ?? "Sync failed.", "error"),
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
      },
      {
        onSuccess: () => {
          notify(`Account configurations saved successfully.`, "success");
        },
        onError: (err: any) => notify(err.message ?? "Failed to save configurations.", "error"),
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
      onError: (err: any) => notify(err.message ?? "Failed to create account.", "error"),
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
        onError: (err: any) => notify(err.message ?? "Action failed.", "error"),
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
      onError: (err: any) => notify(err.message ?? "Failed to delete account.", "error"),
    });
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
    <div className="space-y-8 animate-fadeIn">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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

      {/* --- Rest of General Settings (Muted) --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
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
