import { z } from "zod";

// --- Recurrence Strategy Validation Schemas ---

export const MonthlyRecurrenceSchema = z.object({
  type: z.literal("monthly"),
  monthly: z.object({
    day: z.number().int().min(1).max(31),
  }),
});

export const YearlyRecurrenceSchema = z.object({
  type: z.literal("yearly"),
  yearly: z.object({
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
});

export const IntervalRecurrenceSchema = z.object({
  type: z.literal("interval"),
  interval: z.object({
    every: z.number().int().positive(),
    unit: z.enum(["days", "weeks", "months"]),
    from: z.enum(["due_date", "paid_at"]).default("paid_at"),
  }),
});

export const RecurrenceSchema = z.discriminatedUnion("type", [
  MonthlyRecurrenceSchema,
  YearlyRecurrenceSchema,
  IntervalRecurrenceSchema,
]);

export type Recurrence = z.infer<typeof RecurrenceSchema>;

// --- Core Entities Validation Schemas & Types ---

export const SUPPORTED_CURRENCIES = ["IDR", "USD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: SupportedCurrency = "IDR";
export const DEFAULT_UPCOMING_THRESHOLD_DAYS = 7;

export const ISO_4217_CURRENCIES = [
  { code: "AED", name: "United Arab Emirates Dirham" },
  { code: "AFN", name: "Afghan Afghani" },
  { code: "ALL", name: "Albanian Lek" },
  { code: "AMD", name: "Armenian Dram" },
  { code: "ANG", name: "Netherlands Antillean Guilder" },
  { code: "AOA", name: "Angolan Kwanza" },
  { code: "ARS", name: "Argentine Peso" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "AWG", name: "Aruban Florin" },
  { code: "AZN", name: "Azerbaijani Manat" },
  { code: "BAM", name: "Bosnia-Herzegovina Convertible Mark" },
  { code: "BBD", name: "Barbadian Dollar" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "BGN", name: "Bulgarian Lev" },
  { code: "BHD", name: "Bahraini Dinar" },
  { code: "BIF", name: "Burundian Franc" },
  { code: "BMD", name: "Bermudian Dollar" },
  { code: "BND", name: "Brunei Dollar" },
  { code: "BOB", name: "Bolivian Boliviano" },
  { code: "BRL", name: "Brazilian Real" },
  { code: "BSD", name: "Bahamian Dollar" },
  { code: "BTN", name: "Bhutanese Ngultrum" },
  { code: "BWP", name: "Botswanan Pula" },
  { code: "BYN", name: "Belarusian Ruble" },
  { code: "BZD", name: "Belize Dollar" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "CDF", name: "Congolese Franc" },
  { code: "CHF", name: "Swiss Franc" },
  { code: "CLP", name: "Chilean Peso" },
  { code: "CNY", name: "Chinese Yuan" },
  { code: "COP", name: "Colombian Peso" },
  { code: "CRC", name: "Costa Rican Colón" },
  { code: "CUC", name: "Cuban Convertible Peso" },
  { code: "CUP", name: "Cuban Peso" },
  { code: "CVE", name: "Cape Verdean Escudo" },
  { code: "CZK", name: "Czech Koruna" },
  { code: "DJF", name: "Djiboutian Franc" },
  { code: "DKK", name: "Danish Krone" },
  { code: "DOP", name: "Dominican Peso" },
  { code: "DZD", name: "Algerian Dinar" },
  { code: "EGP", name: "Egyptian Pound" },
  { code: "ERN", name: "Eritrean Nakfa" },
  { code: "ETB", name: "Ethiopian Birr" },
  { code: "EUR", name: "Euro" },
  { code: "FJD", name: "Fijian Dollar" },
  { code: "FKP", name: "Falkland Islands Pound" },
  { code: "GBP", name: "British Pound Sterling" },
  { code: "GEL", name: "Georgian Lari" },
  { code: "GGP", name: "Guernsey Pound" },
  { code: "GHS", name: "Ghanaian Cedi" },
  { code: "GIP", name: "Gibraltar Pound" },
  { code: "GMD", name: "Gambian Dalasi" },
  { code: "GNF", name: "Guinean Franc" },
  { code: "GTQ", name: "Guatemalan Quetzal" },
  { code: "GYD", name: "Guyanese Dollar" },
  { code: "HKD", name: "Hong Kong Dollar" },
  { code: "HNL", name: "Honduran Lempira" },
  { code: "HRK", name: "Croatian Kuna" },
  { code: "HTG", name: "Haitian Gourde" },
  { code: "HUF", name: "Hungarian Forint" },
  { code: "IDR", name: "Indonesian Rupiah" },
  { code: "ILS", name: "Israeli New Shekel" },
  { code: "IMP", name: "Manx Pound" },
  { code: "INR", name: "Indian Rupee" },
  { code: "IQD", name: "Iraqi Dinar" },
  { code: "IRR", name: "Iranian Rial" },
  { code: "ISK", name: "Icelandic Króna" },
  { code: "JEP", name: "Jersey Pound" },
  { code: "JMD", name: "Jamaican Dollar" },
  { code: "JOD", name: "Jordanian Dinar" },
  { code: "JPY", name: "Japanese Yen" },
  { code: "KES", name: "Kenyan Shilling" },
  { code: "KGS", name: "Kyrgystani Som" },
  { code: "KHR", name: "Cambodian Riel" },
  { code: "KMF", name: "Comorian Franc" },
  { code: "KPW", name: "North Korean Won" },
  { code: "KRW", name: "South Korean Won" },
  { code: "KWD", name: "Kuwaiti Dinar" },
  { code: "KYD", name: "Cayman Islands Dollar" },
  { code: "KZT", name: "Kazakhstani Tenge" },
  { code: "LAK", name: "Laotian Kip" },
  { code: "LBP", name: "Lebanese Pound" },
  { code: "LKR", name: "Sri Lankan Rupee" },
  { code: "LRD", name: "Liberian Dollar" },
  { code: "LSL", name: "Lesotho Loti" },
  { code: "LYD", name: "Libyan Dinar" },
  { code: "MAD", name: "Moroccan Dirham" },
  { code: "MDL", name: "Moldovan Leu" },
  { code: "MGA", name: "Malagasy Ariary" },
  { code: "MKD", name: "Macedonian Denar" },
  { code: "MMK", name: "Myanmar Kyat" },
  { code: "MNT", name: "Mongolian Tugrik" },
  { code: "MOP", name: "Macanese Pataca" },
  { code: "MRU", name: "Mauritanian Ouguiya" },
  { code: "MUR", name: "Mauritian Rupee" },
  { code: "MVR", name: "Maldivian Rufiyaa" },
  { code: "MWK", name: "Malawian Kwacha" },
  { code: "MXN", name: "Mexican Peso" },
  { code: "MYR", name: "Malaysian Ringgit" },
  { code: "MZN", name: "Mozambican Metical" },
  { code: "NAD", name: "Namibian Dollar" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "NIO", name: "Nicaraguan Córdoba" },
  { code: "NOK", name: "Norwegian Krone" },
  { code: "NPR", name: "Nepalese Rupee" },
  { code: "NZD", name: "New Zealand Dollar" },
  { code: "OMR", name: "Omani Rial" },
  { code: "PAB", name: "Panamanian Balboa" },
  { code: "PEN", name: "Peruvian Sol" },
  { code: "PGK", name: "Papua New Guinean Kina" },
  { code: "PHP", name: "Philippine Peso" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "PLN", name: "Polish Złoty" },
  { code: "PYG", name: "Paraguayan Guaraní" },
  { code: "QAR", name: "Qatari Riyal" },
  { code: "RON", name: "Romanian Leu" },
  { code: "RSD", name: "Serbian Dinar" },
  { code: "RUB", name: "Russian Ruble" },
  { code: "RWF", name: "Rwandan Franc" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "SBD", name: "Solomon Islands Dollar" },
  { code: "SCR", name: "Seychellois Rupee" },
  { code: "SDG", name: "Sudanese Pound" },
  { code: "SEK", name: "Swedish Krona" },
  { code: "SGD", name: "Singapore Dollar" },
  { code: "SHP", name: "Saint Helena Pound" },
  { code: "SLL", name: "Sierra Leonean Leone" },
  { code: "SOS", name: "Somali Shilling" },
  { code: "SRD", name: "Surinamese Dollar" },
  { code: "SSP", name: "South Sudanese Pound" },
  { code: "STN", name: "São Tomé & Príncipe Dobra" },
  { code: "SVC", name: "Salvadoran Colón" },
  { code: "SYP", name: "Syrian Pound" },
  { code: "SZL", name: "Swazi Lilangeni" },
  { code: "THB", name: "Thai Baht" },
  { code: "TJS", name: "Tajikistani Somoni" },
  { code: "TMT", name: "Turkmenistani Manat" },
  { code: "TND", name: "Tunisian Dinar" },
  { code: "TOP", name: "Tongan Paʻanga" },
  { code: "TRY", name: "Turkish Lira" },
  { code: "TTD", name: "Trinidad & Tobago Dollar" },
  { code: "TWD", name: "New Taiwan Dollar" },
  { code: "TZS", name: "Tanzanian Shilling" },
  { code: "UAH", name: "Ukrainian Hryvnia" },
  { code: "UGX", name: "Ugandan Shilling" },
  { code: "USD", name: "US Dollar" },
  { code: "UYU", name: "Uruguayan Peso" },
  { code: "UZS", name: "Uzbekistani Som" },
  { code: "VES", name: "Venezuelan Bolívar Soberano" },
  { code: "VND", name: "Vietnamese Đồng" },
  { code: "VUV", name: "Vanuatu Vatu" },
  { code: "WST", name: "Samoan Tālā" },
  { code: "XAF", name: "Central African CFA Franc" },
  { code: "XCD", name: "East Caribbean Dollar" },
  { code: "XOF", name: "West African CFA Franc" },
  { code: "XPF", name: "CFP Franc" },
  { code: "YER", name: "Yemeni Rial" },
  { code: "ZAR", name: "South African Rand" },
  { code: "ZMW", name: "Zambian Kwacha" },
  { code: "ZWL", name: "Zimbabwean Dollar" }
] as const;

export const NotificationProviderSchema = z.object({
  type: z.enum(["webhook", "slack", "discord", "telegram", "console", "gotify", "ntfy"]),
  config: z.object({
    webhookUrl: z.string().url().optional().or(z.literal("")),
    botToken: z.string().optional().or(z.literal("")),
    chatId: z.string().optional().or(z.literal("")),
    gotifyUrl: z.string().url().optional().or(z.literal("")),
    gotifyToken: z.string().optional().or(z.literal("")),
    ntfyUrl: z.string().url().optional().or(z.literal("")),
    ntfyToken: z.string().optional().or(z.literal("")),
  }),
});

export type NotificationProvider = z.infer<typeof NotificationProviderSchema>;

export const NotificationReminderSchema = z.object({
  enabled: z.boolean(),
  days_before_due: z.number().int().nonnegative(),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Must be in HH:MM format"),
  timezone: z.string().min(1),
  last_reminded_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format").nullable().optional(),
});

export type NotificationReminder = z.infer<typeof NotificationReminderSchema>;

export const AccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  upcoming_threshold_days: z.number().int().positive(),
  currencies: z.array(z.string().regex(/^[A-Z]{3}$/, "Must be a 3-character uppercase ISO 4217 code")).min(1, "At least one currency is required"),
  default_currency: z.string().regex(/^[A-Z]{3}$/, "Must be a 3-character uppercase ISO 4217 code"),
  archived: z.boolean(),
  notification_provider: NotificationProviderSchema.default({ type: "webhook", config: {} }),
  notification_reminder: NotificationReminderSchema.default({ enabled: false, days_before_due: 3, time: "09:00", timezone: "UTC", last_reminded_date: null }),
  created_at: z.number().int(),
  updated_at: z.number().int(),
}).refine(data => data.currencies.includes(data.default_currency), {
  message: "Default currency must be present in the currencies list",
  path: ["default_currency"]
});

export type Account = z.infer<typeof AccountSchema>;

export const BillSchema = z.object({
  id: z.string().min(1),
  account_id: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/, "Must be a 3-character uppercase ISO 4217 code"),
  amount_cents: z.number().int().nonnegative(),
  amount_type: z.enum(["fixed", "variable"]),
  recurrence: RecurrenceSchema,
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format"),
  active: z.boolean(),
  upcoming_threshold_days: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

export type Bill = z.infer<typeof BillSchema>;

export const PaymentSchema = z.object({
  id: z.string().min(1),
  bill_id: z.string().min(1),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be in YYYY-MM-DD format"),
  amount_cents: z.number().int().nonnegative(),
  paid_at: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.number().int(),
  updated_at: z.number().int(),
});

export type Payment = z.infer<typeof PaymentSchema>;

export const ExportPayloadSchema = z.object({
  version: z.literal(1),
  exported_at: z.number().int(),
  account: AccountSchema,
  bills: z.array(BillSchema),
  payments: z.array(PaymentSchema),
});

export type ExportPayload = z.infer<typeof ExportPayloadSchema>;

