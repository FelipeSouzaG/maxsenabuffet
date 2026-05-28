import {
  BookUser,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  KeyRound,
  ListTree,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Soup,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiError, api } from "./api";
import type {
  BuffetType,
  Client,
  LicenseMeta,
  LicenseStatus,
  LocalUser,
  Quote,
  QuoteStatus,
} from "./types";

import { useQuotePDF } from "./useQuotePDF";

type TabKey =
  | "dashboard"
  | "clients"
  | "buffets"
  | "quotes"
  | "rules"
  | "team"
  | "license";

type QuoteModalMode = "create" | "edit" | "view";
type ClientModalMode = "create" | "edit" | "view";
type RuleModalMode = "create" | "edit" | "view";
type TeamModalMode = "create" | "edit" | "view";
type BuffetModalMode = "create" | "edit" | "details";

type CalendarTooltipState = {
  key: string;
  events: Quote[];
  left: number;
  top: number;
};

type BuffetSubtype = {
  id: string;
  name: string;
  items: string[];
};

type BuffetFormState = {
  id?: string;
  name: string;
  pricePerPerson: string;
  subtypes: BuffetSubtype[];
};

type BuffetTypeMeta = {
  subtypes: BuffetSubtype[];
};

type RuleTemplate = {
  id: string;
  text: string;
  createdAt: string;
};

const tabs: Array<{ key: TabKey; label: string; icon: ReactElement }> = [
  { key: "dashboard", label: "Painel", icon: <ShieldCheck size={15} /> },
  { key: "clients", label: "Clientes", icon: <BookUser size={15} /> },
  { key: "buffets", label: "Tipos Buffet", icon: <Soup size={15} /> },
  { key: "quotes", label: "Orçamentos", icon: <FileText size={15} /> },
  { key: "rules", label: "Regras", icon: <ClipboardList size={15} /> },
  { key: "team", label: "Equipe/Usuários", icon: <Users size={15} /> },
  { key: "license", label: "Licença", icon: <KeyRound size={15} /> },
];

const MAX_BUFFET_BRAND = {
  name: "Max Buffet",
  logoPath: "/img/logo.png",
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value || 0,
  );

const dateBr = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "-";

const dateTimeBr = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "-";

const BUFFET_META_PREFIX = "__MAX_BUFFET_META__";
const QUOTE_RULES_PREFIX = "__MAX_QUOTE_RULES__";
const RULES_STORAGE_KEY = "max-buffet-rules-v1";

const onlyDigits = (value: string) => value.replace(/\D/g, "");

const formatCpfCnpj = (value: string) => {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
};

const formatCep = (value: string) => {
  const digits = onlyDigits(value).slice(0, 8);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2-$3");
};

const formatPhone = (value: string) => {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/^(\(\d{2}\)\s\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/^(\(\d{2}\)\s\d)(\d{4})(\d)/, "$1 $2-$3");
};

const formatCurrencyFromDigits = (value: string) => {
  const digits = onlyDigits(value);
  if (!digits) return "";
  const cents = Number(digits);
  return money(cents / 100);
};

const formatCurrencyFromNumber = (value: number) => money(value || 0);

const parseCurrencyToNumber = (value: string) => {
  const digits = onlyDigits(value);
  if (!digits) return 0;
  return Number(digits) / 100;
};

const createSubtype = (): BuffetSubtype => ({
  id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  name: "",
  items: [""],
});

const emptyBuffetForm = (): BuffetFormState => ({
  name: "",
  pricePerPerson: "",
  subtypes: [createSubtype()],
});

const serializeBuffetMeta = (subtypes: BuffetSubtype[]): string =>
  `${BUFFET_META_PREFIX}${JSON.stringify({
    subtypes: subtypes.map((subtype) => ({
      id: subtype.id,
      name: subtype.name.trim(),
      items: subtype.items.map((item) => item.trim()).filter(Boolean),
    })),
  })}`;

const parseBuffetMeta = (
  description: string | null | undefined,
): BuffetTypeMeta => {
  const raw = String(description || "");
  if (!raw.startsWith(BUFFET_META_PREFIX)) return { subtypes: [] };

  try {
    const parsed = JSON.parse(raw.slice(BUFFET_META_PREFIX.length)) as {
      subtypes?: BuffetSubtype[];
    };
    return {
      subtypes: Array.isArray(parsed.subtypes)
        ? parsed.subtypes.map((subtype) => ({
            id:
              subtype.id ||
              globalThis.crypto?.randomUUID?.() ||
              `${Date.now()}-${Math.random()}`,
            name: String(subtype.name || ""),
            items: Array.isArray(subtype.items)
              ? subtype.items.map((item) => String(item || ""))
              : [],
          }))
        : [],
    };
  } catch {
    return { subtypes: [] };
  }
};

const parseQuoteRulesData = (
  notes: string | null | undefined,
): { rules: string[]; note: string } => {
  const raw = String(notes || "");

  // Tenta formato novo com prefixo
  if (raw.startsWith(QUOTE_RULES_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(QUOTE_RULES_PREFIX.length)) as {
        rules?: string[];
        note?: string;
      };
      return {
        rules: Array.isArray(parsed.rules)
          ? parsed.rules
              .map((rule) => String(rule || "").trim())
              .filter(Boolean)
          : [],
        note: String(parsed.note || ""),
      };
    } catch {
      return { rules: [], note: raw };
    }
  }

  // Backward compatibility: detecta se parece ser múltiplas regras separadas por \n
  // (formato antigo onde cada linha era uma regra diferente)
  if (raw.includes("\n") && raw.length > 50) {
    const lines = raw.split("\n");
    const potentialRules = lines
      .map((line) => line.trim())
      .filter((line) => {
        const len = line.length;
        // Filtra por tamanho razoável (regras típicas têm 30-500 caracteres)
        return len >= 20 && len <= 500;
      });

    // Se encontrou 2+ linhas que parecem ser regras válidas, trata como dados antigos
    if (potentialRules.length >= 2) {
      return {
        rules: potentialRules,
        note: "",
      };
    }
  }

  // Fallback: sem regras estruturadas, apenas notas livres
  return { rules: [], note: raw };
};

const serializeQuoteRules = (rules: string[], note: string): string =>
  `${QUOTE_RULES_PREFIX}${JSON.stringify({
    rules: rules.map((rule) => rule.trim()).filter(Boolean),
    note: note.trim() || undefined,
  })}`;

const getTabHeading = (tab: TabKey) => {
  if (tab === "dashboard")
    return {
      title: "Painel",
      subtitle: "Acompanhe competência, eventos e orçamentos.",
    };
  if (tab === "clients")
    return {
      title: "Clientes",
      subtitle: "Cadastre e consulte os clientes do buffet.",
    };
  if (tab === "buffets")
    return {
      title: "Tipos de Buffet",
      subtitle: "Monte tipos com sub-tipos e itens.",
    };
  if (tab === "quotes")
    return {
      title: "Orçamentos",
      subtitle: "Monte orçamentos com cliente, tipo, regras e valores.",
    };
  if (tab === "rules")
    return {
      title: "Regras",
      subtitle: "Frases prontas para agilizar o envio de orçamentos.",
    };
  if (tab === "team")
    return {
      title: "Equipe/Usuários",
      subtitle: "Gerencie acessos da equipe.",
    };
  return {
    title: "Painel de Operações e Licença",
    subtitle: "Status da licença e renovação do sistema.",
  };
};

const statusLabel: Record<QuoteStatus, string> = {
  DRAFT: "Rascunho",
  SENT: "Aguardando Aprovação",
  APPROVED: "Aprovado / Evento",
};

const getReferenceDateByStatus = (quote: Quote) => {
  if (quote.status === "DRAFT") return quote.updatedAt;
  if (quote.status === "SENT") return quote.responseDueDate;
  return quote.eventDate;
};

const getMonthKey = (dateValue?: string | null) => {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getDaysGrid = (year: number, monthIndexZero: number) => {
  const firstDay = new Date(year, monthIndexZero, 1);
  const lastDay = new Date(year, monthIndexZero + 1, 0);
  const startWeekDay = (firstDay.getDay() + 6) % 7;

  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < startWeekDay; i += 1) {
    cells.push({ day: null, key: `empty-start-${i}` });
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    cells.push({ day, key: `day-${day}` });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ day: null, key: `empty-end-${cells.length}` });
  }

  return cells;
};

type QuoteFormState = {
  id?: string;
  clientId: string;
  buffetTypeId: string;
  peopleCount: string;
  totalValue: string;
  status: "" | QuoteStatus;
  responseDueDate: string;
  eventDate: string;
  notes: string;

  eventLocationCep: string;
  eventLocationStreet: string;
  eventLocationNumber: string;
  eventLocationComplement: string;
  eventLocationDistrict: string;
  eventLocationCity: string;
  eventLocationState: string;
};

const emptyQuoteForm = (): QuoteFormState => ({
  clientId: "",
  buffetTypeId: "",
  peopleCount: "",
  totalValue: "",
  status: "",
  responseDueDate: "",
  eventDate: "",
  notes: "",
  eventLocationCep: "",
  eventLocationStreet: "",
  eventLocationNumber: "",
  eventLocationComplement: "",
  eventLocationDistrict: "",
  eventLocationCity: "",
  eventLocationState: "",
});

export default function App() {
  const [me, setMe] = useState<LocalUser | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [blockedByLicense, setBlockedByLicense] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [calendarTooltip, setCalendarTooltip] =
    useState<CalendarTooltipState | null>(null);

  // Ref para evitar boot duplicado no StrictMode
  const bootExecutedRef = useRef(false);
  const calendarTooltipRef = useRef<HTMLDivElement | null>(null);
  const calendarTooltipHideRef = useRef<number | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [buffetTypes, setBuffetTypes] = useState<BuffetType[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [users, setUsers] = useState<LocalUser[]>([]);

  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(
    null,
  );
  const [licenseMeta, setLicenseMeta] = useState<LicenseMeta | null>(null);

  const [highlightedQuoteId, setHighlightedQuoteId] = useState<string | null>(
    null,
  );

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });
  const [clientForm, setClientForm] = useState({
    id: "",
    name: "",
    phone: "",
    email: "",
    document: "",
    notes: "",
  });
  const [clientModalMode, setClientModalMode] =
    useState<ClientModalMode | null>(null);
  const [clientFilter, setClientFilter] = useState("");
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [buffetModalMode, setBuffetModalMode] =
    useState<BuffetModalMode | null>(null);
  const [buffetForm, setBuffetForm] =
    useState<BuffetFormState>(emptyBuffetForm());
  const [buffetModalError, setBuffetModalError] = useState("");
  const [staffForm, setStaffForm] = useState({
    id: "",
    name: "",
    email: "",
    password: "",
    role: "STAFF",
    isActive: true,
  });
  const [teamModalMode, setTeamModalMode] = useState<TeamModalMode | null>(
    null,
  );
  const [teamFilter, setTeamFilter] = useState("");
  const [licenseToken, setLicenseToken] = useState("");
  const [ruleTemplates, setRuleTemplates] = useState<RuleTemplate[]>([]);
  const [ruleDraft, setRuleDraft] = useState("");
  const [ruleModalMode, setRuleModalMode] = useState<RuleModalMode | null>(
    null,
  );
  const [ruleForm, setRuleForm] = useState({ id: "", text: "" });
  const [ruleFilter, setRuleFilter] = useState("");
  const [quoteRules, setQuoteRules] = useState<string[]>([]);

  const now = new Date();
  const [competency, setCompetency] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );

  const [filterStatus, setFilterStatus] = useState<"" | QuoteStatus>("");
  const [filterBuffetTypeId, setFilterBuffetTypeId] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const [quoteModalMode, setQuoteModalMode] = useState<QuoteModalMode | null>(
    null,
  );
  const [quoteForm, setQuoteForm] = useState<QuoteFormState>(emptyQuoteForm());
  const [clientSearch, setClientSearch] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");
  const [manualTotal, setManualTotal] = useState(false);

  const isLicensed =
    licenseStatus?.status === "active" || licenseStatus?.status === "grace";

  const buffetTypesWithMeta = useMemo(
    () =>
      buffetTypes.map((item) => {
        const meta = parseBuffetMeta(item.description);
        const subtypeCount = meta.subtypes.length;
        const itemCount = meta.subtypes.reduce(
          (sum, subtype) => sum + subtype.items.length,
          0,
        );
        return { ...item, meta, subtypeCount, itemCount };
      }),
    [buffetTypes],
  );

  const activeBuffetTypes = useMemo(
    () => buffetTypesWithMeta.filter((item) => item.isActive),
    [buffetTypesWithMeta],
  );

  // Carregar regras do backend apenas quando autenticado
  useEffect(() => {
    if (!me) return;

    const loadRules = async () => {
      try {
        const rules = await api<RuleTemplate[]>("/api/rules");
        setRuleTemplates(rules || []);
      } catch (err) {
        console.error("Erro ao carregar regras:", err);
        // Fallback para localStorage em caso de erro
        try {
          const raw = localStorage.getItem(RULES_STORAGE_KEY);
          if (!raw) return;
          const parsed = JSON.parse(raw) as RuleTemplate[];
          if (!Array.isArray(parsed)) return;
          setRuleTemplates(
            parsed
              .filter((item) => item?.id && item?.text)
              .map((item) => ({
                id: String(item.id),
                text: String(item.text),
                createdAt: String(item.createdAt || ""),
              })),
          );
        } catch {
          setRuleTemplates([]);
        }
      }
    };
    loadRules();
  }, [me]);

  // Sincronizar regras com localStorage como cache
  useEffect(() => {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(ruleTemplates));
  }, [ruleTemplates]);

  const openQuoteModal = (mode: QuoteModalMode, quote?: Quote) => {
    setQuoteModalMode(mode);
    setCepError("");
    setManualTotal(false);

    if (!quote) {
      setQuoteForm(emptyQuoteForm());
      setClientSearch("");
      setQuoteRules([]);
      return;
    }

    // Carregar as regras do quote a partir do array rules, não de parseQuoteRulesData
    const rulesTexts = quote.rules
      ? quote.rules
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((r) => r.text)
      : [];

    setQuoteForm({
      id: quote.id,
      clientId: quote.clientId,
      buffetTypeId: quote.buffetTypeId,
      peopleCount: String(quote.peopleCount),
      totalValue: formatCurrencyFromNumber(quote.totalValue),
      status: quote.status,
      responseDueDate: quote.responseDueDate || "",
      eventDate: quote.eventDate || "",
      notes: quote.notes || "",
      eventLocationCep: formatCep(quote.eventLocationCep),
      eventLocationStreet: quote.eventLocationStreet,
      eventLocationNumber: quote.eventLocationNumber,
      eventLocationComplement: quote.eventLocationComplement || "",
      eventLocationDistrict: quote.eventLocationDistrict,
      eventLocationCity: quote.eventLocationCity,
      eventLocationState: quote.eventLocationState,
    });
    setQuoteRules(rulesTexts);
    setClientSearch(quote.client?.name || "");
  };

  const closeQuoteModal = () => {
    setQuoteModalMode(null);
    setQuoteForm(emptyQuoteForm());
    setClientSearch("");
    setCepError("");
    setManualTotal(false);
    setQuoteRules([]);
  };

  const emptyClientForm = () => ({
    id: "",
    name: "",
    phone: "",
    email: "",
    document: "",
    notes: "",
  });

  const openClientModal = (mode: ClientModalMode, client?: Client) => {
    setClientModalMode(mode);
    if (!client) {
      setClientForm(emptyClientForm());
      return;
    }

    setClientForm({
      id: client.id,
      name: client.name,
      phone: client.phone ? formatPhone(client.phone) : "",
      email: client.email || "",
      document: client.document ? formatCpfCnpj(client.document) : "",
      notes: client.notes || "",
    });
  };

  const closeClientModal = () => {
    setClientModalMode(null);
    setClientForm(emptyClientForm());
  };

  const openRuleModal = (mode: RuleModalMode, rule?: RuleTemplate) => {
    setRuleModalMode(mode);
    setRuleForm({
      id: rule?.id || "",
      text: rule?.text || "",
    });
  };

  const closeRuleModal = () => {
    setRuleModalMode(null);
    setRuleForm({ id: "", text: "" });
  };

  const emptyStaffForm = () => ({
    id: "",
    name: "",
    email: "",
    password: "",
    role: "STAFF",
    isActive: true,
  });

  const openTeamModal = (mode: TeamModalMode, user?: LocalUser) => {
    setTeamModalMode(mode);
    if (!user) {
      setStaffForm(emptyStaffForm());
      return;
    }

    setStaffForm({
      id: user.id,
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      isActive: user.isActive,
    });
  };

  const closeTeamModal = () => {
    setTeamModalMode(null);
    setStaffForm(emptyStaffForm());
  };

  const clearCalendarTooltipTimer = () => {
    if (calendarTooltipHideRef.current !== null) {
      window.clearTimeout(calendarTooltipHideRef.current);
      calendarTooltipHideRef.current = null;
    }
  };

  const hideCalendarTooltip = (delay = 120) => {
    clearCalendarTooltipTimer();
    calendarTooltipHideRef.current = window.setTimeout(() => {
      setCalendarTooltip(null);
      calendarTooltipHideRef.current = null;
    }, delay);
  };

  const showCalendarTooltip = (
    anchor: HTMLElement,
    events: Quote[],
    key: string,
  ) => {
    if (!events.length) return;
    clearCalendarTooltipTimer();

    const rect = anchor.getBoundingClientRect();
    const gap = 8;
    const margin = 12;
    const preferredWidth = window.innerWidth < 520 ? window.innerWidth - 24 : 320;
    const tooltipWidth = Math.max(
      240,
      Math.min(preferredWidth, window.innerWidth - 24),
    );
    const estimatedHeight = Math.min(360, window.innerHeight - 24);
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const showAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

    const left = Math.min(
      Math.max(rect.left, margin),
      window.innerWidth - tooltipWidth - margin,
    );
    const top = showAbove
      ? Math.max(margin, rect.top - estimatedHeight - gap)
      : Math.min(rect.bottom + gap, window.innerHeight - margin - 120);

    setCalendarTooltip({ key, events, left, top });
  };

  useLayoutEffect(() => {
    if (!calendarTooltip || !calendarTooltipRef.current) return;

    const rect = calendarTooltipRef.current.getBoundingClientRect();
    const margin = 12;
    const nextLeft = Math.min(
      Math.max(rect.left, margin),
      window.innerWidth - rect.width - margin,
    );
    const nextTop = Math.min(
      Math.max(rect.top, margin),
      window.innerHeight - rect.height - margin,
    );

    if (
      Math.abs(nextLeft - calendarTooltip.left) > 0.5 ||
      Math.abs(nextTop - calendarTooltip.top) > 0.5
    ) {
      setCalendarTooltip((prev) =>
        prev ? { ...prev, left: nextLeft, top: nextTop } : prev,
      );
    }
  }, [calendarTooltip]);

  useEffect(
    () => () => {
      clearCalendarTooltipTimer();
    },
    [],
  );

  const selectedBuffet = useMemo(
    () =>
      buffetTypes.find((item) => item.id === quoteForm.buffetTypeId) || null,
    [buffetTypes, quoteForm.buffetTypeId],
  );

  const selectedClient = useMemo(
    () => clients.find((item) => item.id === quoteForm.clientId) || null,
    [clients, quoteForm.clientId],
  );

  const filteredClientOptions = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients.slice(0, 10);
    return clients
      .filter((client) =>
        [client.name, client.document || "", client.email || ""].some((part) =>
          part.toLowerCase().includes(q),
        ),
      )
      .slice(0, 12);
  }, [clientSearch, clients]);

  const filteredClients = useMemo(() => {
    const query = clientFilter.trim().toLowerCase();
    const digits = onlyDigits(clientFilter);
    if (!query && !digits) return clients;

    return clients.filter((client) => {
      const textFields = [
        client.name,
        client.email || "",
        client.document ? formatCpfCnpj(client.document) : "",
        client.phone ? formatPhone(client.phone) : "",
      ]
        .join(" ")
        .toLowerCase();
      const digitFields = [client.document || "", client.phone || ""]
        .map(onlyDigits)
        .join(" ");

      return (
        textFields.includes(query) || (!!digits && digitFields.includes(digits))
      );
    });
  }, [clientFilter, clients]);

  const filteredRules = useMemo(() => {
    const query = ruleFilter.trim().toLowerCase();
    if (!query) return ruleTemplates;
    return ruleTemplates.filter((rule) =>
      rule.text.toLowerCase().includes(query),
    );
  }, [ruleFilter, ruleTemplates]);

  const filteredUsers = useMemo(() => {
    const query = teamFilter.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.name, user.email, user.role, user.isActive ? "ativo" : "inativo"]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [teamFilter, users]);

  useEffect(() => {
    if (manualTotal) return;
    const people = Number(quoteForm.peopleCount);
    if (!selectedBuffet || !Number.isFinite(people) || people <= 0) return;

    const nextTotal = Number(
      (selectedBuffet.pricePerPerson * people).toFixed(2),
    );
    setQuoteForm((prev) => ({
      ...prev,
      totalValue: formatCurrencyFromNumber(nextTotal),
    }));
  }, [quoteForm.peopleCount, selectedBuffet, manualTotal]);

  const loadLicensePublic = async () => {
    const [status, meta] = await Promise.all([
      api<LicenseStatus>("/api/license/status"),
      api<LicenseMeta>("/api/license/current-meta"),
    ]);
    setLicenseStatus(status);
    setLicenseMeta(meta);
  };

  const loadProtected = async (user: LocalUser) => {
    try {
      const [clientsData, buffetData, quotesData, rulesData] =
        await Promise.all([
          api<Client[]>("/api/clients"),
          api<BuffetType[]>("/api/buffet-types"),
          api<Quote[]>("/api/quotes"),
          api<RuleTemplate[]>("/api/rules").catch(() => []),
        ]);
      setClients(clientsData);
      setBuffetTypes(buffetData);
      setQuotes(quotesData);
      setRuleTemplates(rulesData);

      if (user.role === "OWNER") {
        try {
          const usersData = await api<LocalUser[]>("/api/users");
          setUsers(usersData);
        } catch (err: any) {
          setUsers([]);
          setError(err?.message || "Falha ao carregar equipe");
        }
      } else {
        setUsers([]);
      }

      setBlockedByLicense(false);
    } catch (err) {
      if (
        err instanceof ApiError &&
        ["LICENSE_MISSING", "LICENSE_BLOCKED", "LICENSE_INVALID"].includes(
          err.code || "",
        )
      ) {
        setBlockedByLicense(true);
        setActiveTab("license");
        return;
      }
      throw err;
    }
  };

  const refreshAll = async (user = me) => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      await loadLicensePublic();
      await loadProtected(user);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Evitar execução duplicada no StrictMode (desenvolvimento)
    if (bootExecutedRef.current) return;
    bootExecutedRef.current = true;

    const boot = async () => {
      setError("");
      try {
        await loadLicensePublic();
      } catch (err: any) {
        setError(err?.message || "Falha ao carregar status de licença");
      }

      try {
        const meResp = await api<{ user: LocalUser }>("/api/auth/me");
        setMe(meResp.user);
        await loadProtected(meResp.user);
      } catch (err: any) {
        if (err instanceof ApiError && err.status === 401) setMe(null);
        else setError(err?.message || "Falha ao iniciar aplicação");
      } finally {
        setBootLoading(false);
      }
    };

    boot();
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });
      const meResp = await api<{ user: LocalUser }>("/api/auth/me");
      setMe(meResp.user);
      await refreshAll(meResp.user);
    } catch (err: any) {
      setError(err?.message || "Falha no login");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setMe(null);
    setIsMobileNavOpen(false);
  };

  const visibleTabs = useMemo(() => {
    if (!isLicensed) return tabs.filter((tab) => tab.key === "license");
    return tabs.filter(
      (tab) =>
        tab.key !== "license" &&
        (me?.role === "STAFF" ? tab.key !== "team" : true),
    );
  }, [isLicensed, me?.role]);

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(visibleTabs[0]?.key || "license");
    }
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (!me) return;
    setProfileForm({ name: me.name, email: me.email, password: "" });
  }, [me]);

  const saveClient = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      name: clientForm.name,
      phone: clientForm.phone ? onlyDigits(clientForm.phone) : "",
      email: clientForm.email,
      document: clientForm.document ? onlyDigits(clientForm.document) : "",
      notes: clientForm.notes,
    };

    await api<Client>(
      clientModalMode === "edit" && clientForm.id
        ? `/api/clients/${clientForm.id}`
        : "/api/clients",
      {
        method: clientModalMode === "edit" && clientForm.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    closeClientModal();
    await refreshAll();
  };

  const deleteClient = async (client: Client) => {
    const confirmed = confirm(
      `Excluir o cliente "${client.name}"?\n\nClientes com orçamentos vinculados não podem ser excluídos.`,
    );
    if (!confirmed) return;

    try {
      await api(`/api/clients/${client.id}`, {
        method: "DELETE",
      });
      await refreshAll();
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir o cliente.",
      );
    }
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!me) return;
    setProfileError("");
    try {
      const payload: Record<string, string> = {
        name: profileForm.name.trim(),
        email: profileForm.email.trim().toLowerCase(),
      };
      if (profileForm.password.trim())
        payload.password = profileForm.password.trim();

      await api(`/api/users/${me.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setProfileModalOpen(false);
      setProfileForm((prev) => ({ ...prev, password: "" }));
      await refreshAll();
    } catch (err: any) {
      setProfileError(err?.message || "Falha ao atualizar dados do usuário.");
    }
  };

  const openBuffetModal = (mode: BuffetModalMode, buffet?: BuffetType) => {
    setBuffetModalError("");
    setBuffetModalMode(mode);
    if (!buffet) {
      setBuffetForm(emptyBuffetForm());
      return;
    }

    const meta = parseBuffetMeta(buffet.description);
    setBuffetForm({
      id: buffet.id,
      name: buffet.name,
      pricePerPerson: formatCurrencyFromNumber(buffet.pricePerPerson),
      subtypes: meta.subtypes.length ? meta.subtypes : [createSubtype()],
    });
  };

  const closeBuffetModal = () => {
    setBuffetModalMode(null);
    setBuffetModalError("");
    setBuffetForm(emptyBuffetForm());
  };

  const addSubtype = () => {
    setBuffetForm((prev) => ({
      ...prev,
      subtypes: [...prev.subtypes, createSubtype()],
    }));
  };

  const removeSubtype = (subtypeId: string) => {
    setBuffetForm((prev) => ({
      ...prev,
      subtypes: prev.subtypes.filter((subtype) => subtype.id !== subtypeId),
    }));
  };

  const updateSubtypeName = (subtypeId: string, value: string) => {
    setBuffetForm((prev) => ({
      ...prev,
      subtypes: prev.subtypes.map((subtype) =>
        subtype.id === subtypeId ? { ...subtype, name: value } : subtype,
      ),
    }));
  };

  const addSubtypeItem = (subtypeId: string) => {
    setBuffetForm((prev) => ({
      ...prev,
      subtypes: prev.subtypes.map((subtype) =>
        subtype.id === subtypeId
          ? { ...subtype, items: [...subtype.items, ""] }
          : subtype,
      ),
    }));
  };

  const removeSubtypeItem = (subtypeId: string, itemIndex: number) => {
    setBuffetForm((prev) => ({
      ...prev,
      subtypes: prev.subtypes.map((subtype) => {
        if (subtype.id !== subtypeId) return subtype;
        return {
          ...subtype,
          items: subtype.items.filter((_, idx) => idx !== itemIndex),
        };
      }),
    }));
  };

  const updateSubtypeItem = (
    subtypeId: string,
    itemIndex: number,
    value: string,
  ) => {
    setBuffetForm((prev) => ({
      ...prev,
      subtypes: prev.subtypes.map((subtype) => {
        if (subtype.id !== subtypeId) return subtype;
        return {
          ...subtype,
          items: subtype.items.map((item, idx) =>
            idx === itemIndex ? value : item,
          ),
        };
      }),
    }));
  };

  const validateBuffetForm = () => {
    const name = buffetForm.name.trim();
    const price = parseCurrencyToNumber(buffetForm.pricePerPerson);
    if (!name) return "Informe o nome do Tipo.";
    if (!Number.isFinite(price) || price <= 0)
      return "Informe um valor por pessoa válido.";
    if (!buffetForm.subtypes.length) return "Inclua pelo menos um Sub-Tipo.";

    for (const subtype of buffetForm.subtypes) {
      if (!subtype.name.trim()) return "Todos os Sub-Tipos devem ter nome.";
      const validItems = subtype.items
        .map((item) => item.trim())
        .filter(Boolean);
      if (!validItems.length)
        return `O Sub-Tipo "${subtype.name}" precisa ter ao menos um item.`;
    }

    return "";
  };

  const saveBuffetType = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateBuffetForm();
    if (validationError) {
      setBuffetModalError(validationError);
      return;
    }

    const payload = {
      name: buffetForm.name.trim(),
      pricePerPerson: parseCurrencyToNumber(buffetForm.pricePerPerson),
      description: serializeBuffetMeta(buffetForm.subtypes),
    };

    if (buffetModalMode === "edit" && buffetForm.id) {
      await api(`/api/buffet-types/${buffetForm.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await api("/api/buffet-types", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }

    closeBuffetModal();
    await refreshAll();
  };

  const deactivateBuffetType = async (buffet: BuffetType) => {
    const ok = window.confirm(`Deseja excluir o Tipo "${buffet.name}"?`);
    if (!ok) return;

    await api(`/api/buffet-types/${buffet.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: false }),
    });
    await refreshAll();
  };

  const saveRuleTemplate = async (event: FormEvent) => {
    event.preventDefault();
    const text = ruleForm.text.trim();
    if (!text) return;
    if (
      ruleTemplates.some(
        (item) =>
          item.id !== ruleForm.id &&
          item.text.toLowerCase() === text.toLowerCase(),
      )
    )
      return;

    try {
      const savedRule = await api<RuleTemplate>(
        ruleModalMode === "edit" && ruleForm.id
          ? `/api/rules/${ruleForm.id}`
          : "/api/rules",
        {
          method: ruleModalMode === "edit" && ruleForm.id ? "PATCH" : "POST",
          body: JSON.stringify({ text }),
        },
      );
      setRuleTemplates((prev) =>
        ruleModalMode === "edit"
          ? prev.map((item) => (item.id === savedRule.id ? savedRule : item))
          : [savedRule, ...prev],
      );
      setRuleDraft("");
      closeRuleModal();
    } catch (err: any) {
      console.error("Erro ao salvar regra:", err);
      setError(err?.message || "Falha ao salvar regra");
    }
  };

  const deleteRuleTemplate = async (ruleId: string) => {
    const ruleText = ruleTemplates.find((item) => item.id === ruleId)?.text;
    const ok = window.confirm("Deseja excluir esta regra?");
    if (!ok) return;
    try {
      await api(`/api/rules/${ruleId}`, { method: "DELETE" });
      setRuleTemplates((prev) => prev.filter((item) => item.id !== ruleId));
      if (ruleText)
        setQuoteRules((prev) => prev.filter((text) => text !== ruleText));
    } catch (err: any) {
      console.error("Erro ao deletar regra:", err);
      setError(err?.message || "Falha ao deletar regra");
    }
  };

  const toggleQuoteRule = (ruleText: string) => {
    setQuoteRules((prev) =>
      prev.includes(ruleText)
        ? prev.filter((text) => text !== ruleText)
        : [...prev, ruleText],
    );
  };

  const createStaff = async (event: FormEvent) => {
    event.preventDefault();
    const payload: Record<string, string | boolean> = {
      name: staffForm.name,
      email: staffForm.email,
      role: staffForm.role,
      isActive: staffForm.isActive,
    };

    if (staffForm.password) payload.password = staffForm.password;
    if (teamModalMode === "create") payload.password = staffForm.password;

    await api(
      teamModalMode === "edit" && staffForm.id
        ? `/api/users/${staffForm.id}`
        : "/api/users",
      {
        method: teamModalMode === "edit" && staffForm.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    closeTeamModal();
    await refreshAll();
  };

  const deleteStaff = async (user: LocalUser) => {
    const ok = window.confirm(`Excluir o usuário "${user.name}"?`);
    if (!ok) return;

    try {
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      await refreshAll();
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Não foi possível excluir o usuário.",
      );
    }
  };

  const installLicense = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/license/install", {
        method: "POST",
        body: JSON.stringify({ token: licenseToken }),
      });
      setLicenseToken("");
      await refreshAll();
    } catch (err: any) {
      setError(err?.message || "Falha ao instalar licença");
    } finally {
      setLoading(false);
    }
  };

  const loadCep = async () => {
    const cepDigits = onlyDigits(quoteForm.eventLocationCep);
    if (cepDigits.length !== 8) return;

    setCepLoading(true);
    setCepError("");

    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${cepDigits}/json/`,
      );
      if (!response.ok) {
        setCepError("CEP inválido");
        return;
      }

      const data = (await response.json()) as Record<string, any>;
      if (data?.erro) {
        setCepError("CEP inválido");
        return;
      }

      setQuoteForm((prev) => ({
        ...prev,
        eventLocationStreet: data.logradouro || prev.eventLocationStreet,
        eventLocationDistrict: data.bairro || prev.eventLocationDistrict,
        eventLocationCity: data.localidade || prev.eventLocationCity,
        eventLocationState: data.uf || prev.eventLocationState,
      }));
    } catch {
      setCepError("Falha na consulta do CEP");
    } finally {
      setCepLoading(false);
    }
  };

  const saveQuote = async (event: FormEvent) => {
    event.preventDefault();
    if (!quoteForm.status) return;
    if (!quoteForm.clientId || !quoteForm.buffetTypeId) {
      setError("Selecione cliente e tipo de buffet.");
      return;
    }
    if (!quoteRules.length) {
      setError("Selecione ao menos uma regra para o orçamento.");
      return;
    }

    const people = Number(quoteForm.peopleCount);
    const totalValue = parseCurrencyToNumber(quoteForm.totalValue);
    if (
      !Number.isFinite(people) ||
      people <= 0 ||
      !Number.isFinite(totalValue) ||
      totalValue <= 0
    ) {
      setError("Quantidade de pessoas e valor devem ser válidos");
      return;
    }

    const effectiveUnit = selectedBuffet
      ? selectedBuffet.pricePerPerson
      : Number((totalValue / people).toFixed(2));

    // Salvar apenas as observações livres, não as regras concatenadas
    const payload = {
      clientId: quoteForm.clientId,
      buffetTypeId: quoteForm.buffetTypeId,
      peopleCount: people,
      unitPrice: effectiveUnit,
      totalValue,
      status: quoteForm.status,
      responseDueDate:
        quoteForm.status === "SENT" ? quoteForm.responseDueDate : null,
      eventDate: quoteForm.status === "APPROVED" ? quoteForm.eventDate : null,
      notes: quoteForm.notes || null,
      eventLocationCep: onlyDigits(quoteForm.eventLocationCep),
      eventLocationStreet: quoteForm.eventLocationStreet,
      eventLocationNumber: quoteForm.eventLocationNumber,
      eventLocationComplement: quoteForm.eventLocationComplement || null,
      eventLocationDistrict: quoteForm.eventLocationDistrict,
      eventLocationCity: quoteForm.eventLocationCity,
      eventLocationState: quoteForm.eventLocationState,
    };

    let quoteId = quoteForm.id;

    try {
      if (quoteModalMode === "edit" && quoteForm.id) {
        await api(`/api/quotes/${quoteForm.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        quoteId = quoteForm.id;
      } else {
        const newQuote = await api<Quote>("/api/quotes", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        quoteId = newQuote.id;
      }

      // Depois de salvar o quote, salvar as regras vinculadas
      if (quoteId) {
        // Primeiro, remover as regras antigas (em caso de edit)
        const existingRules = await api<any[]>(
          `/api/quotes/${quoteId}/rules`,
        ).catch(() => []);
        for (const rule of existingRules) {
          await api(`/api/quotes/${quoteId}/rules/${rule.ruleId}`, {
            method: "DELETE",
          }).catch(() => {});
        }

        // Depois, adicionar as novas regras
        for (let index = 0; index < quoteRules.length; index++) {
          const ruleName = quoteRules[index];
          const rule = ruleTemplates.find((r) => r.text === ruleName);
          if (rule) {
            await api(`/api/quotes/${quoteId}/rules`, {
              method: "POST",
              body: JSON.stringify({
                ruleId: rule.id,
                orderIndex: index,
              }),
            }).catch(() => {});
          }
        }
      }

      closeQuoteModal();
      await refreshAll();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Erro ao salvar orçamento",
      );
    }
  };

  const deleteQuote = async (quoteId: string) => {
    const ok = window.confirm("Deseja realmente excluir este orçamento?");
    if (!ok) return;
    await api(`/api/quotes/${quoteId}`, { method: "DELETE" });
    await refreshAll();
  };

  const filteredQuotes = useMemo(() => {
    return quotes.filter((quote) => {
      if (filterStatus && quote.status !== filterStatus) return false;
      if (filterBuffetTypeId && quote.buffetTypeId !== filterBuffetTypeId)
        return false;

      const refDate = getReferenceDateByStatus(quote);
      if (filterDateFrom && refDate && refDate < filterDateFrom) return false;
      if (filterDateTo && refDate && refDate > filterDateTo) return false;

      if ((filterDateFrom || filterDateTo) && !refDate) return false;
      return true;
    });
  }, [quotes, filterStatus, filterBuffetTypeId, filterDateFrom, filterDateTo]);

  const [compYear, compMonth] = competency.split("-").map(Number);

  const monthQuotes = useMemo(() => {
    return quotes.filter((quote) => {
      const key = getMonthKey(getReferenceDateByStatus(quote));
      return key === competency;
    });
  }, [quotes, competency]);

  const pendingInCompetency = monthQuotes.filter(
    (quote) => quote.status === "SENT",
  ).length;
  const eventsInCompetency = monthQuotes.filter(
    (quote) => quote.status === "APPROVED",
  ).length;

  const daysGrid = useMemo(
    () => getDaysGrid(compYear, compMonth - 1),
    [compYear, compMonth],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<number, Quote[]>();

    for (const quote of monthQuotes) {
      const raw = getReferenceDateByStatus(quote);
      if (!raw) continue;
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) continue;
      const day = date.getDate();

      const list = map.get(day) || [];
      list.push(quote);
      map.set(day, list);
    }

    return map;
  }, [monthQuotes]);

  const submitLabel = !quoteForm.status
    ? "Salvar"
    : quoteForm.status === "SENT"
      ? "Gerar Orçamento"
      : quoteForm.status === "APPROVED"
        ? "Gerar Evento"
        : "Salvar Rascunho";

  if (bootLoading)
    return <div className="loader">Carregando Max Buffet...</div>;

  if (!me) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-logo-wrap">
            <img
              src={MAX_BUFFET_BRAND.logoPath}
              alt="Logo Max Buffet"
              className="auth-logo"
            />
          </div>
          <form onSubmit={login}>
            <label>
              Email
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </div>
    );
  }

  const tabHeading = getTabHeading(activeTab);

  return (
    <div className={`layout ${isMobileNavOpen ? "nav-open" : ""}`}>
      <button
        type="button"
        className={`sidebar-backdrop ${isMobileNavOpen ? "show" : ""}`}
        onClick={() => setIsMobileNavOpen(false)}
        aria-label="Fechar menu"
      />

      <aside className={`sidebar ${isMobileNavOpen ? "open" : ""}`}>
        <div className="brand">
          <img src={MAX_BUFFET_BRAND.logoPath} alt="Logo" className="logo" />
          <div>
            <strong>{MAX_BUFFET_BRAND.name}</strong>
            <small>{me.role === "OWNER" ? "Owner Console" : "Equipe"}</small>
          </div>
        </div>

        <nav>
          {visibleTabs.map((tab) => (
            <button
              className={tab.key === activeTab ? "active" : ""}
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setIsMobileNavOpen(false);
              }}
              type="button"
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-head">
            <div>
              <p>{me.name}</p>
              <small>{me.email}</small>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setProfileError("");
                setProfileModalOpen(true);
              }}
              aria-label="Alterar dados do usuário"
            >
              <Settings size={16} />
            </button>
          </div>
          <button className="btn-ghost" onClick={logout} type="button">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="top">
          <div className="top-heading">
            <button
              type="button"
              className="mobile-nav-toggle"
              onClick={() => setIsMobileNavOpen((prev) => !prev)}
              aria-label="Abrir menu"
            >
              <Menu size={16} />
            </button>
            <div>
              <h2>{tabHeading.title}</h2>
              <p>{tabHeading.subtitle}</p>
            </div>
          </div>
          <button
            className="btn"
            onClick={() => refreshAll()}
            type="button"
            disabled={loading}
          >
            Atualizar
          </button>
        </header>

        {blockedByLicense && activeTab === "license" ? (
          <div className="banner">
            Licença bloqueando módulos de negócio. Use a aba{" "}
            <strong>Licença</strong> para renovar.
          </div>
        ) : null}

        {error ? <div className="error-box">{error}</div> : null}

        {activeTab === "dashboard" ? (
          <section className="stack">
            <article className="card competency-card">
              <div className="competency-header">
                <div>
                  <h3>Competência</h3>
                  <p>
                    Selecione mês/ano para visualizar orçamentos e eventos no
                    calendário.
                  </p>
                </div>
                <div className="competency-actions">
                  <CalendarDays size={16} />
                  <input
                    type="month"
                    value={competency}
                    onChange={(event) =>
                      setCompetency(event.target.value || competency)
                    }
                  />
                </div>
              </div>
              <div className="mini-kpis">
                <div>
                  <span>Orçamentos aguardando retorno</span>
                  <strong>{pendingInCompetency}</strong>
                </div>
                <div>
                  <span>Eventos marcados</span>
                  <strong>{eventsInCompetency}</strong>
                </div>
              </div>
            </article>

            <article className="card">
              <h3>Calendário da Competência</h3>
              <div className="calendar-grid week-header">
                {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(
                  (label) => (
                    <span key={label}>{label}</span>
                  ),
                )}
              </div>

              <div className="calendar-grid days-grid">
                {daysGrid.map((cell) => {
                  if (!cell.day)
                    return <div className="day-cell muted" key={cell.key} />;

                  const events = eventsByDay.get(cell.day) || [];
                  return (
                    <div
                      className={`day-cell ${calendarTooltip?.key === cell.key ? "tooltip-open" : ""}`}
                      key={cell.key}
                      tabIndex={events.length > 0 ? 0 : undefined}
                      onPointerEnter={(event) =>
                        showCalendarTooltip(event.currentTarget, events, cell.key)
                      }
                      onPointerLeave={() => hideCalendarTooltip()}
                      onFocus={(event) =>
                        showCalendarTooltip(event.currentTarget, events, cell.key)
                      }
                      onBlur={() => hideCalendarTooltip()}
                      onClick={(event) =>
                        showCalendarTooltip(event.currentTarget, events, cell.key)
                      }
                    >
                      <div className="day-top">{cell.day}</div>
                      {events.slice(0, 2).map((quote) => (
                        <div
                          className={`event-pill ${quote.status === "APPROVED" ? "approved" : "pending"}`}
                          key={quote.id}
                        >
                          {quote.status === "APPROVED" ? "Evento" : "Orçamento"}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {calendarTooltip ? (
                <div
                  ref={calendarTooltipRef}
                  className="tooltip-card"
                  style={{
                    left: calendarTooltip.left,
                    top: calendarTooltip.top,
                  }}
                  onPointerEnter={clearCalendarTooltipTimer}
                  onPointerLeave={() => hideCalendarTooltip()}
                >
                  {calendarTooltip.events.map((quote) => (
                    <div key={`tip-${quote.id}`} className="tooltip-item">
                      <p>
                        <strong>
                          {quote.status === "APPROVED"
                            ? "Evento marcado na data especificada"
                            : "Orçamento aguardando aprovação/enviado para evento na data especificada"}
                        </strong>
                      </p>
                      <p>Tipo: {quote.buffetType?.name || "-"}</p>
                      <p>Pessoas: {quote.peopleCount}</p>
                      <p>Local: {quote.eventAddressLine}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab("quotes");
                          setHighlightedQuoteId(quote.id);
                          setCalendarTooltip(null);
                        }}
                      >
                        Ver Evento
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          </section>
        ) : null}

        {activeTab === "clients" ? (
          <section className="stack">
            <article className="card">
              <div className="table-topbar">
                <h3>Clientes</h3>
                <button
                  type="button"
                  className="btn-inline"
                  onClick={() => openClientModal("create")}
                >
                  <Plus size={14} /> + Cliente
                </button>
              </div>

              <div className="filter-grid client-filter-grid">
                <label>
                  Buscar por nome, CPF/CNPJ ou telefone
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      value={clientFilter}
                      onChange={(event) => setClientFilter(event.target.value)}
                      placeholder="Digite para filtrar clientes"
                    />
                  </div>
                </label>
              </div>

              <div className="table-wrap quote-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>CPF/CNPJ</th>
                      <th>Telefone</th>
                      <th>Email</th>
                      <th>Observações</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => (
                      <tr key={client.id}>
                        <td data-label="Nome">{client.name}</td>
                        <td data-label="CPF/CNPJ">
                          {client.document ? formatCpfCnpj(client.document) : "-"}
                        </td>
                        <td data-label="Telefone">
                          {client.phone ? formatPhone(client.phone) : "-"}
                        </td>
                        <td data-label="Email">{client.email || "-"}</td>
                        <td data-label="Observações">{client.notes || "-"}</td>
                        <td data-label="Ações">
                          <div className="actions">
                            <button
                              type="button"
                              onClick={() => openClientModal("view", client)}
                            >
                              <Search size={14} /> Visualizar
                            </button>
                            <button
                              type="button"
                              onClick={() => openClientModal("edit", client)}
                            >
                              <Pencil size={14} /> Editar
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => deleteClient(client)}
                            >
                              <Trash2 size={14} /> Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredClients.length === 0 ? (
                  <p className="empty-state">Nenhum cliente encontrado.</p>
                ) : null}
              </div>

              <div className="quote-cards">
                {filteredClients.map((client) => (
                  <article className="quote-card" key={`client-${client.id}`}>
                    <header>
                      <strong>{client.name}</strong>
                      <span>
                        {client.document
                          ? formatCpfCnpj(client.document)
                          : "Sem documento"}
                      </span>
                    </header>
                    <p>
                      <strong>Telefone:</strong>{" "}
                      {client.phone ? formatPhone(client.phone) : "-"}
                    </p>
                    <p>
                      <strong>Email:</strong> {client.email || "-"}
                    </p>
                    <p>
                      <strong>Observações:</strong> {client.notes || "-"}
                    </p>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => openClientModal("view", client)}
                      >
                        <Search size={14} /> Visualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => openClientModal("edit", client)}
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteClient(client)}
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
                  </article>
                ))}
                {filteredClients.length === 0 ? (
                  <p className="empty-state">Nenhum cliente encontrado.</p>
                ) : null}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "buffets" ? (
          <section className="stack">
            <article className="card">
              <div className="table-topbar">
                <h3>Tipos Cadastrados</h3>
                <button
                  type="button"
                  className="btn-inline"
                  onClick={() => openBuffetModal("create")}
                >
                  <Plus size={14} /> + Tipo
                </button>
              </div>
              <div className="table-wrap quote-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Qtd Sub-Tipos</th>
                      <th>Qtd Itens</th>
                      <th>Valor por Pessoa</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buffetTypesWithMeta.map((item) => (
                      <tr key={item.id}>
                        <td data-label="Nome">
                          {item.name}
                          {!item.isActive ? (
                            <small className="muted-label">Inativo</small>
                          ) : null}
                        </td>
                        <td data-label="Qtd Sub-Tipos">{item.subtypeCount}</td>
                        <td data-label="Qtd Itens">{item.itemCount}</td>
                        <td data-label="Valor por Pessoa">
                          {money(item.pricePerPerson)}
                        </td>
                        <td data-label="Ações">
                          <div className="actions">
                            <button
                              type="button"
                              onClick={() => openBuffetModal("details", item)}
                            >
                              <ListTree size={14} /> Detalhes
                            </button>
                            <button
                              type="button"
                              onClick={() => openBuffetModal("edit", item)}
                            >
                              <Pencil size={14} /> Editar
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => deactivateBuffetType(item)}
                              disabled={!item.isActive}
                            >
                              <Trash2 size={14} /> Excluir Tipo
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "quotes" ? (
          <section className="stack">
            <article className="card">
              <div className="table-topbar">
                <h3>Orçamentos</h3>
                <button
                  type="button"
                  className="btn-inline"
                  onClick={() => openQuoteModal("create")}
                >
                  <Plus size={14} /> Novo
                </button>
              </div>

              <div className="filter-grid">
                <label>
                  Data inicial
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                  />
                </label>
                <label>
                  Data final
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                  />
                </label>
                <label>
                  Status
                  <select
                    value={filterStatus}
                    onChange={(e) =>
                      setFilterStatus(e.target.value as "" | QuoteStatus)
                    }
                  >
                    <option value="">Todos</option>
                    <option value="DRAFT">Rascunho</option>
                    <option value="SENT">Aguardando Aprovação</option>
                    <option value="APPROVED">Aprovado / Evento</option>
                  </select>
                </label>
                <label>
                  Tipo de Buffet
                  <select
                    value={filterBuffetTypeId}
                    onChange={(e) => setFilterBuffetTypeId(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {buffetTypes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Número do Orçamento</th>
                      <th>Cliente</th>
                      <th>Local</th>
                      <th>Data</th>
                      <th>Tipo de Buffet</th>
                      <th>Quantidade de pessoas</th>
                      <th>Valor do Orçamento</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuotes.map((quote) => (
                      <tr
                        key={quote.id}
                        className={
                          highlightedQuoteId === quote.id ? "row-highlight" : ""
                        }
                      >
                        <td data-label="Número">{quote.number}</td>
                        <td data-label="Cliente">
                          {quote.client?.name || "-"}
                        </td>
                        <td data-label="Local">{quote.eventAddressLine}</td>
                        <td data-label="Data">
                          {dateBr(getReferenceDateByStatus(quote))}
                        </td>
                        <td data-label="Tipo de Buffet">
                          {quote.buffetType?.name || "-"}
                        </td>
                        <td data-label="Pessoas">{quote.peopleCount}</td>
                        <td data-label="Valor">{money(quote.totalValue)}</td>
                        <td data-label="Status">{statusLabel[quote.status]}</td>
                        <td data-label="Ações">
                          <div className="actions">
                            <button
                              type="button"
                              onClick={() => openQuoteModal("view", quote)}
                            >
                              Ver Detalhes
                            </button>
                            <button
                              type="button"
                              onClick={() => openQuoteModal("edit", quote)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => deleteQuote(quote.id)}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="quote-cards">
                {filteredQuotes.map((quote) => (
                  <article
                    key={`card-${quote.id}`}
                    className={`quote-card ${highlightedQuoteId === quote.id ? "row-highlight" : ""}`}
                  >
                    <header>
                      <strong>{quote.number}</strong>
                      <span>{statusLabel[quote.status]}</span>
                    </header>
                    <p>
                      <strong>Cliente:</strong> {quote.client?.name || "-"}
                    </p>
                    <p>
                      <strong>Local:</strong> {quote.eventAddressLine}
                    </p>
                    <p>
                      <strong>Data:</strong>{" "}
                      {dateBr(getReferenceDateByStatus(quote))}
                    </p>
                    <p>
                      <strong>Buffet:</strong> {quote.buffetType?.name || "-"}
                    </p>
                    <p>
                      <strong>Pessoas:</strong> {quote.peopleCount}
                    </p>
                    <p>
                      <strong>Valor:</strong> {money(quote.totalValue)}
                    </p>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => openQuoteModal("view", quote)}
                      >
                        Ver Detalhes
                      </button>
                      <button
                        type="button"
                        onClick={() => openQuoteModal("edit", quote)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteQuote(quote.id)}
                      >
                        Excluir
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "rules" ? (
          <section className="stack">
            <article className="card">
              <div className="table-topbar">
                <h3>Regras</h3>
                <button
                  type="button"
                  className="btn-inline"
                  onClick={() => openRuleModal("create")}
                >
                  <Plus size={14} /> + Regra
                </button>
              </div>

              <div className="filter-grid client-filter-grid">
                <label>
                  Buscar por descrição
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      value={ruleFilter}
                      onChange={(event) => setRuleFilter(event.target.value)}
                      placeholder="Digite para filtrar regras"
                    />
                  </div>
                </label>
              </div>

              <div className="table-wrap quote-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Criada em</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRules.map((rule) => (
                      <tr key={rule.id}>
                        <td data-label="Descrição">{rule.text}</td>
                        <td data-label="Criada em">{dateBr(rule.createdAt)}</td>
                        <td data-label="Ações">
                          <div className="actions">
                            <button
                              type="button"
                              onClick={() => openRuleModal("view", rule)}
                            >
                              <Search size={14} /> Visualizar
                            </button>
                            <button
                              type="button"
                              onClick={() => openRuleModal("edit", rule)}
                            >
                              <Pencil size={14} /> Editar
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => deleteRuleTemplate(rule.id)}
                            >
                              <Trash2 size={14} /> Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRules.length === 0 ? (
                  <p className="empty-state">Nenhuma regra encontrada.</p>
                ) : null}
              </div>

              <div className="quote-cards">
                {filteredRules.map((rule) => (
                  <article className="quote-card" key={`rule-${rule.id}`}>
                    <header>
                      <strong>Regra</strong>
                      <span>{dateBr(rule.createdAt)}</span>
                    </header>
                    <p>{rule.text}</p>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => openRuleModal("view", rule)}
                      >
                        <Search size={14} /> Visualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => openRuleModal("edit", rule)}
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteRuleTemplate(rule.id)}
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
                  </article>
                ))}
                {filteredRules.length === 0 ? (
                  <p className="empty-state">Nenhuma regra encontrada.</p>
                ) : null}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "team" && me.role === "OWNER" ? (
          <section className="stack">
            <article className="card">
              <div className="table-topbar">
                <h3>Equipe</h3>
                <button
                  type="button"
                  className="btn-inline"
                  onClick={() => openTeamModal("create")}
                >
                  <Plus size={14} /> + Usuário
                </button>
              </div>

              <div className="filter-grid client-filter-grid">
                <label>
                  Buscar por nome, email, perfil ou status
                  <div className="search-field">
                    <Search size={16} />
                    <input
                      value={teamFilter}
                      onChange={(event) => setTeamFilter(event.target.value)}
                      placeholder="Digite para filtrar usuários"
                    />
                  </div>
                </label>
              </div>

              <div className="table-wrap quote-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Email</th>
                      <th>Perfil</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td data-label="Nome">{user.name}</td>
                        <td data-label="Email">{user.email}</td>
                        <td data-label="Perfil">{user.role}</td>
                        <td data-label="Status">
                          {user.isActive ? "Ativo" : "Inativo"}
                        </td>
                        <td data-label="Ações">
                          <div className="actions">
                            <button
                              type="button"
                              onClick={() => openTeamModal("view", user)}
                            >
                              <Search size={14} /> Visualizar
                            </button>
                            <button
                              type="button"
                              onClick={() => openTeamModal("edit", user)}
                            >
                              <Pencil size={14} /> Editar
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => deleteStaff(user)}
                              disabled={user.id === me.id}
                            >
                              <Trash2 size={14} /> Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredUsers.length === 0 ? (
                  <p className="empty-state">Nenhum usuário encontrado.</p>
                ) : null}
              </div>

              <div className="quote-cards">
                {filteredUsers.map((user) => (
                  <article className="quote-card" key={`user-${user.id}`}>
                    <header>
                      <strong>{user.name}</strong>
                      <span>{user.isActive ? "Ativo" : "Inativo"}</span>
                    </header>
                    <p>
                      <strong>Email:</strong> {user.email}
                    </p>
                    <p>
                      <strong>Perfil:</strong> {user.role}
                    </p>
                    <div className="actions">
                      <button
                        type="button"
                        onClick={() => openTeamModal("view", user)}
                      >
                        <Search size={14} /> Visualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => openTeamModal("edit", user)}
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteStaff(user)}
                        disabled={user.id === me.id}
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
                  </article>
                ))}
                {filteredUsers.length === 0 ? (
                  <p className="empty-state">Nenhum usuário encontrado.</p>
                ) : null}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "license" ? (
          <section className="split">
            <article className="card">
              <h3>Renovação de Licença</h3>
              <p>
                Status atual: <strong>{licenseStatus?.status || "-"}</strong>
              </p>
              <p>
                {licenseStatus?.message ||
                  (licenseStatus?.daysLeft
                    ? `Dias restantes: ${licenseStatus.daysLeft}`
                    : "")}
              </p>
              <p>Token instalado: {licenseMeta?.tokenPreview || "Nenhum"}</p>
              <p>
                Última validação: {dateTimeBr(licenseMeta?.lastValidationAt)}
              </p>
              <p>
                Regras de acesso: após cadastro do tenant, o sistema inicia em{" "}
                <strong>trial de 30 dias</strong>. Sem renovação paga, há{" "}
                <strong>3 dias de carência</strong>; após esse prazo, o acesso é
                bloqueado.
              </p>
              <ol>
                <li>
                  Acesse a plataforma central para login e pagamento mensal.
                </li>
                <li>Copie o token de licença emitido para seu tenant.</li>
                <li>Cole o token abaixo e clique em instalar.</li>
              </ol>
              <a
                className="btn-inline"
                href={
                  licenseMeta?.centralAppUrl ||
                  licenseStatus?.centralAppUrl ||
                  "https://app.localhost:3000"
                }
                target="_blank"
                rel="noreferrer"
              >
                Abrir Plataforma Central
              </a>
            </article>
            <form className="card" onSubmit={installLicense}>
              <h3>Instalar Token</h3>
              <textarea
                placeholder="Cole aqui o token JWT da licença"
                value={licenseToken}
                onChange={(e) => setLicenseToken(e.target.value)}
                required
              />
              <button type="submit">Instalar Licença</button>
            </form>
          </section>
        ) : null}
      </main>

      {profileModalOpen ? (
        <div className="modal-overlay">
          <div className="modal-card modal-card-sm">
            <header className="modal-header">
              <h3>Alterar Dados do Usuário</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setProfileModalOpen(false)}
              >
                <X size={16} />
              </button>
            </header>

            <form className="modal-form" onSubmit={saveProfile}>
              <label>
                Nome
                <input
                  value={profileForm.name}
                  onChange={(event) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={profileForm.email}
                  onChange={(event) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <label>
                Nova senha (opcional)
                <input
                  type="password"
                  value={profileForm.password}
                  onChange={(event) =>
                    setProfileForm((prev) => ({
                      ...prev,
                      password: event.target.value,
                    }))
                  }
                  placeholder="Mínimo 8 caracteres"
                />
              </label>

              {profileError ? (
                <div className="error-box">{profileError}</div>
              ) : null}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setProfileModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit">Salvar Alterações</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {clientModalMode ? (
        <div className="modal-overlay">
          <div className="modal-card modal-card-sm">
            <header className="modal-header">
              <h3>
                {clientModalMode === "create"
                  ? "Novo Cliente"
                  : clientModalMode === "edit"
                    ? "Editar Cliente"
                    : "Detalhes do Cliente"}
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={closeClientModal}
              >
                <X size={16} />
              </button>
            </header>

            <form className="modal-form" onSubmit={saveClient}>
              <label>
                Nome
                <input
                  value={clientForm.name}
                  onChange={(event) =>
                    setClientForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  required
                  disabled={clientModalMode === "view"}
                />
              </label>

              <label>
                Telefone
                <input
                  value={clientForm.phone}
                  onChange={(event) =>
                    setClientForm((prev) => ({
                      ...prev,
                      phone: formatPhone(event.target.value),
                    }))
                  }
                  disabled={clientModalMode === "view"}
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={clientForm.email}
                  onChange={(event) =>
                    setClientForm((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                  disabled={clientModalMode === "view"}
                />
              </label>

              <label>
                CPF/CNPJ
                <input
                  value={clientForm.document}
                  onChange={(event) =>
                    setClientForm((prev) => ({
                      ...prev,
                      document: formatCpfCnpj(event.target.value),
                    }))
                  }
                  disabled={clientModalMode === "view"}
                />
              </label>

              <label>
                Observações
                <textarea
                  value={clientForm.notes}
                  onChange={(event) =>
                    setClientForm((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                  disabled={clientModalMode === "view"}
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={closeClientModal}
                >
                  Fechar
                </button>
                {clientModalMode !== "view" ? (
                  <button type="submit">
                    {clientModalMode === "create" ? "Salvar Cliente" : "Salvar Alterações"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {ruleModalMode ? (
        <div className="modal-overlay">
          <div className="modal-card modal-card-sm">
            <header className="modal-header">
              <h3>
                {ruleModalMode === "create"
                  ? "Nova Regra"
                  : ruleModalMode === "edit"
                    ? "Editar Regra"
                    : "Detalhes da Regra"}
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={closeRuleModal}
              >
                <X size={16} />
              </button>
            </header>

            <form className="modal-form" onSubmit={saveRuleTemplate}>
              <label>
                Descrição
                <textarea
                  value={ruleForm.text}
                  onChange={(event) =>
                    setRuleForm((prev) => ({
                      ...prev,
                      text: event.target.value,
                    }))
                  }
                  placeholder="Ex: Valores sujeitos à alteração conforme disponibilidade e data do evento."
                  required
                  disabled={ruleModalMode === "view"}
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={closeRuleModal}
                >
                  Fechar
                </button>
                {ruleModalMode !== "view" ? (
                  <button type="submit">
                    {ruleModalMode === "create" ? "Salvar Regra" : "Salvar Alterações"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {teamModalMode ? (
        <div className="modal-overlay">
          <div className="modal-card modal-card-sm">
            <header className="modal-header">
              <h3>
                {teamModalMode === "create"
                  ? "Novo Usuário"
                  : teamModalMode === "edit"
                    ? "Editar Usuário"
                    : "Detalhes do Usuário"}
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={closeTeamModal}
              >
                <X size={16} />
              </button>
            </header>

            <form className="modal-form" onSubmit={createStaff}>
              <label>
                Nome
                <input
                  value={staffForm.name}
                  onChange={(event) =>
                    setStaffForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  required
                  disabled={teamModalMode === "view"}
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  value={staffForm.email}
                  onChange={(event) =>
                    setStaffForm((prev) => ({
                      ...prev,
                      email: event.target.value,
                    }))
                  }
                  required
                  disabled={teamModalMode === "view"}
                />
              </label>

              <label>
                Perfil
                <select
                  value={staffForm.role}
                  onChange={(event) =>
                    setStaffForm((prev) => ({
                      ...prev,
                      role: event.target.value,
                    }))
                  }
                  disabled={teamModalMode === "view"}
                >
                  <option value="STAFF">STAFF</option>
                  <option value="OWNER">OWNER</option>
                </select>
              </label>

              <label>
                Status
                <select
                  value={staffForm.isActive ? "true" : "false"}
                  onChange={(event) =>
                    setStaffForm((prev) => ({
                      ...prev,
                      isActive: event.target.value === "true",
                    }))
                  }
                  disabled={teamModalMode === "view"}
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </label>

              {teamModalMode !== "view" ? (
                <label>
                  {teamModalMode === "create" ? "Senha inicial" : "Nova senha"}
                  <input
                    type="password"
                    value={staffForm.password}
                    onChange={(event) =>
                      setStaffForm((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
                    placeholder={
                      teamModalMode === "create"
                        ? "Mínimo 8 caracteres"
                        : "Opcional"
                    }
                    required={teamModalMode === "create"}
                  />
                </label>
              ) : null}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={closeTeamModal}
                >
                  Fechar
                </button>
                {teamModalMode !== "view" ? (
                  <button type="submit">
                    {teamModalMode === "create" ? "Criar Usuário" : "Salvar Alterações"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {buffetModalMode ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <header className="modal-header">
              <h3>
                {buffetModalMode === "create"
                  ? "Novo Tipo de Buffet"
                  : buffetModalMode === "edit"
                    ? "Editar Tipo de Buffet"
                    : "Detalhes do Tipo de Buffet"}
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={closeBuffetModal}
              >
                <X size={16} />
              </button>
            </header>

            <form className="modal-form" onSubmit={saveBuffetType}>
              <div className="row">
                <label>
                  Nome do Tipo
                  <input
                    value={buffetForm.name}
                    onChange={(event) =>
                      setBuffetForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Ex: Cardápio Churrasco 1"
                    required
                    disabled={buffetModalMode === "details"}
                  />
                </label>
                <label>
                  Valor por pessoa
                  <input
                    value={buffetForm.pricePerPerson}
                    onChange={(event) =>
                      setBuffetForm((prev) => ({
                        ...prev,
                        pricePerPerson: formatCurrencyFromDigits(
                          event.target.value,
                        ),
                      }))
                    }
                    placeholder="R$ 0,00"
                    required
                    disabled={buffetModalMode === "details"}
                  />
                </label>
              </div>

              <div className="subtypes-wrap">
                <div className="table-topbar">
                  <h4>Sub-Tipos e Itens</h4>
                  {buffetModalMode !== "details" ? (
                    <button
                      type="button"
                      className="btn-inline"
                      onClick={addSubtype}
                    >
                      <Plus size={14} /> Sub-Tipo
                    </button>
                  ) : null}
                </div>

                {buffetForm.subtypes.map((subtype) => (
                  <article className="subtype-card" key={subtype.id}>
                    <div className="subtype-head">
                      <label>
                        Sub-Tipo
                        <input
                          value={subtype.name}
                          onChange={(event) =>
                            updateSubtypeName(subtype.id, event.target.value)
                          }
                          placeholder="Ex: Petiscos"
                          disabled={buffetModalMode === "details"}
                        />
                      </label>
                      {buffetModalMode !== "details" ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => removeSubtype(subtype.id)}
                          disabled={buffetForm.subtypes.length <= 1}
                        >
                          Remover Sub-Tipo
                        </button>
                      ) : null}
                    </div>

                    <div className="items-list">
                      {subtype.items.map((item, idx) => (
                        <div className="item-row" key={`${subtype.id}-${idx}`}>
                          <input
                            value={item}
                            onChange={(event) =>
                              updateSubtypeItem(
                                subtype.id,
                                idx,
                                event.target.value,
                              )
                            }
                            placeholder={`Item ${idx + 1} (ex: Batata Frita)`}
                            disabled={buffetModalMode === "details"}
                          />
                          {buffetModalMode !== "details" ? (
                            <button
                              type="button"
                              className="danger"
                              onClick={() => removeSubtypeItem(subtype.id, idx)}
                              disabled={subtype.items.length <= 1}
                            >
                              Remover
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    {buffetModalMode !== "details" ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => addSubtypeItem(subtype.id)}
                      >
                        + Item
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>

              {buffetModalError ? (
                <div className="error-box">{buffetModalError}</div>
              ) : null}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={closeBuffetModal}
                >
                  Fechar
                </button>
                {buffetModalMode !== "details" ? (
                  <button type="submit">Salvar Tipo</button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {quoteModalMode ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <header className="modal-header">
              <h3>
                {quoteModalMode === "create"
                  ? "Novo Orçamento"
                  : quoteModalMode === "edit"
                    ? "Editar Orçamento"
                    : "Detalhes do Orçamento"}
              </h3>
              <button
                type="button"
                className="icon-btn"
                onClick={closeQuoteModal}
              >
                <X size={16} />
              </button>
            </header>

            <form className="modal-form" onSubmit={saveQuote}>
              <label>
                Cliente
                <div className="search-field">
                  <Search size={14} />
                  <input
                    value={clientSearch}
                    onChange={(event) => {
                      setClientSearch(event.target.value);
                      setQuoteForm((prev) => ({ ...prev, clientId: "" }));
                    }}
                    placeholder="Buscar por nome ou CPF/CNPJ"
                    disabled={quoteModalMode === "view"}
                  />
                </div>
                {quoteModalMode !== "view" ? (
                  <div className="search-list">
                    {filteredClientOptions.map((client) => (
                      <button
                        type="button"
                        key={client.id}
                        onClick={() => {
                          setQuoteForm((prev) => ({
                            ...prev,
                            clientId: client.id,
                          }));
                          setClientSearch(
                            `${client.name} (${client.document || "sem documento"})`,
                          );
                        }}
                      >
                        {client.name} • {client.document || "Sem CPF/CNPJ"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>

              <div className="row">
                <label>
                  CEP do Evento
                  <input
                    value={quoteForm.eventLocationCep}
                    maxLength={10}
                    onChange={(event) => {
                      setQuoteForm((prev) => ({
                        ...prev,
                        eventLocationCep: formatCep(event.target.value),
                      }));
                    }}
                    onBlur={loadCep}
                    placeholder="00.000-00"
                    disabled={quoteModalMode === "view"}
                  />
                </label>
                <label>
                  Número
                  <input
                    value={quoteForm.eventLocationNumber}
                    onChange={(event) =>
                      setQuoteForm((prev) => ({
                        ...prev,
                        eventLocationNumber: event.target.value,
                      }))
                    }
                    required
                    disabled={quoteModalMode === "view"}
                  />
                </label>
              </div>

              {cepLoading ? <small>Consultando CEP...</small> : null}
              {cepError ? <small className="error">{cepError}</small> : null}

              <label>
                Rua
                <input
                  value={quoteForm.eventLocationStreet}
                  onChange={(event) =>
                    setQuoteForm((prev) => ({
                      ...prev,
                      eventLocationStreet: event.target.value,
                    }))
                  }
                  required
                  disabled={quoteModalMode === "view"}
                />
              </label>

              <label>
                Complemento
                <input
                  value={quoteForm.eventLocationComplement}
                  onChange={(event) =>
                    setQuoteForm((prev) => ({
                      ...prev,
                      eventLocationComplement: event.target.value,
                    }))
                  }
                  disabled={quoteModalMode === "view"}
                />
              </label>

              <div className="row">
                <label>
                  Bairro
                  <input
                    value={quoteForm.eventLocationDistrict}
                    onChange={(event) =>
                      setQuoteForm((prev) => ({
                        ...prev,
                        eventLocationDistrict: event.target.value,
                      }))
                    }
                    required
                    disabled={quoteModalMode === "view"}
                  />
                </label>
                <label>
                  Cidade
                  <input
                    value={quoteForm.eventLocationCity}
                    onChange={(event) =>
                      setQuoteForm((prev) => ({
                        ...prev,
                        eventLocationCity: event.target.value,
                      }))
                    }
                    required
                    disabled={quoteModalMode === "view"}
                  />
                </label>
                <label>
                  UF
                  <input
                    value={quoteForm.eventLocationState}
                    maxLength={2}
                    onChange={(event) =>
                      setQuoteForm((prev) => ({
                        ...prev,
                        eventLocationState: event.target.value.toUpperCase(),
                      }))
                    }
                    required
                    disabled={quoteModalMode === "view"}
                  />
                </label>
              </div>

              <div className="row">
                <label>
                  Tipo de Buffet
                  <select
                    value={quoteForm.buffetTypeId}
                    onChange={(event) =>
                      setQuoteForm((prev) => ({
                        ...prev,
                        buffetTypeId: event.target.value,
                      }))
                    }
                    required
                    disabled={quoteModalMode === "view"}
                  >
                    <option value="">Selecione</option>
                    {activeBuffetTypes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} • {money(item.pricePerPerson)}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Quantidade de Pessoas
                  <input
                    value={quoteForm.peopleCount}
                    onChange={(event) =>
                      setQuoteForm((prev) => ({
                        ...prev,
                        peopleCount: event.target.value,
                      }))
                    }
                    required
                    disabled={quoteModalMode === "view"}
                  />
                </label>

                <label>
                  Valor
                  <input
                    value={quoteForm.totalValue}
                    onChange={(event) => {
                      setManualTotal(true);
                      setQuoteForm((prev) => ({
                        ...prev,
                        totalValue: formatCurrencyFromDigits(
                          event.target.value,
                        ),
                      }));
                    }}
                    required
                    disabled={quoteModalMode === "view"}
                  />
                </label>
              </div>

              <div className="rules-select card-soft">
                <strong>Regras para o orçamento</strong>
                <small>
                  Selecione os textos prontos para compor este orçamento.
                </small>
                <div className="rules-checks">
                  {ruleTemplates.map((rule) => (
                    <label key={rule.id} className="rule-check">
                      <input
                        type="checkbox"
                        checked={quoteRules.includes(rule.text)}
                        onChange={() => toggleQuoteRule(rule.text)}
                        disabled={quoteModalMode === "view"}
                      />
                      <span>{rule.text}</span>
                    </label>
                  ))}
                </div>
                {!ruleTemplates.length ? (
                  <small>Cadastre regras na guia Regras para usar aqui.</small>
                ) : null}
              </div>

              <label>
                Status
                <select
                  value={quoteForm.status}
                  onChange={(event) => {
                    const status = event.target.value as "" | QuoteStatus;
                    setQuoteForm((prev) => ({
                      ...prev,
                      status,
                      responseDueDate:
                        status === "SENT" ? prev.responseDueDate : "",
                      eventDate: status === "APPROVED" ? prev.eventDate : "",
                    }));
                  }}
                  disabled={quoteModalMode === "view"}
                >
                  <option value="">Selecione</option>
                  <option value="DRAFT">Rascunho</option>
                  <option value="SENT">Enviado / Aguardando Aprovação</option>
                  <option value="APPROVED">Aprovado / Evento</option>
                </select>
              </label>

              {quoteForm.status === "DRAFT" ? (
                <small>
                  Data do rascunho será registrada automaticamente no
                  salvamento.
                </small>
              ) : null}

              {quoteForm.status === "SENT" ? (
                <label>
                  Data limite de resposta
                  <input
                    type="date"
                    value={quoteForm.responseDueDate}
                    onChange={(event) =>
                      setQuoteForm((prev) => ({
                        ...prev,
                        responseDueDate: event.target.value,
                      }))
                    }
                    required
                    disabled={quoteModalMode === "view"}
                  />
                </label>
              ) : null}

              {quoteForm.status === "APPROVED" ? (
                <label>
                  Data do evento
                  <input
                    type="date"
                    value={quoteForm.eventDate}
                    onChange={(event) =>
                      setQuoteForm((prev) => ({
                        ...prev,
                        eventDate: event.target.value,
                      }))
                    }
                    required
                    disabled={quoteModalMode === "view"}
                  />
                </label>
              ) : null}

              <label>
                Observações adicionais
                <textarea
                  value={quoteForm.notes}
                  onChange={(event) =>
                    setQuoteForm((prev) => ({
                      ...prev,
                      notes: event.target.value,
                    }))
                  }
                  disabled={quoteModalMode === "view"}
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={closeQuoteModal}
                >
                  Fechar
                </button>
                {quoteModalMode === "view" && quoteForm.status === "SENT" ? (
                  <QuotePDFButton
                    quote={(() => {
                      const fullQuote = quotes.find(
                        (q) => q.id === quoteForm.id,
                      );
                      if (fullQuote) {
                        return fullQuote;
                      }
                      // Fallback com valores calculados
                      const people = Number(quoteForm.peopleCount) || 0;
                      const total =
                        parseCurrencyToNumber(quoteForm.totalValue) || 0;
                      const unitPrice =
                        people > 0 && total > 0
                          ? Number((total / people).toFixed(2))
                          : selectedBuffet?.pricePerPerson || 0;
                      return {
                        ...quoteForm,
                        number: "ORC-????",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        peopleCount: people,
                        totalValue: total,
                        unitPrice: unitPrice,
                        notes: quoteForm.notes || null,
                        rules: quoteRules.map((text, index) => ({
                          id: `temp-${index}`,
                          quoteRuleId: `temp-${index}`,
                          ruleId: `temp-${index}`,
                          text,
                          orderIndex: index,
                          createdAt: new Date().toISOString(),
                        })),
                      } as any;
                    })()}
                    client={selectedClient || undefined}
                    buffetType={selectedBuffet || undefined}
                  />
                ) : null}
                {quoteModalMode !== "view" ? (
                  <button
                    type="submit"
                    disabled={!quoteForm.status || !quoteRules.length}
                  >
                    {submitLabel}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type QuotePDFButtonProps = {
  quote: Quote;
  client?: Client | null;
  buffetType?: BuffetType | null;
};

function QuotePDFButton({
  quote,
  client,
  buffetType,
}: QuotePDFButtonProps): ReactElement {
  const { generateQuotePDF } = useQuotePDF();
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleDownloadPDF = async () => {
    try {
      setIsGenerating(true);
      setPdfError(null);

      // Validação pré-requisitos
      if (!quote) {
        throw new Error("Orçamento não carregado");
      }
      if (!quote.number) {
        throw new Error("Número do orçamento inválido");
      }

      console.log("Iniciando download do PDF para orçamento:", quote.number);

      await generateQuotePDF({
        quote,
        client: client || undefined,
        buffetType: buffetType || undefined,
      });

      console.log("PDF baixado com sucesso");
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao gerar PDF";
      console.error("Erro ao gerar PDF:", errorMsg, error);
      setPdfError(errorMsg);
      alert(
        `Erro ao gerar PDF do orçamento:\n${errorMsg}\n\nVerifique o console para mais detalhes.`,
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDownloadPDF}
      disabled={isGenerating}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 16px",
        backgroundColor: "#4CAF50",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: isGenerating ? "not-allowed" : "pointer",
        opacity: isGenerating ? 0.6 : 1,
      }}
    >
      <Download size={16} />
      {isGenerating ? "Gerando PDF..." : "Baixar PDF"}
    </button>
  );
}
