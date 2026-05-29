export type Role = "OWNER" | "STAFF";
export type QuoteStatus = "DRAFT" | "SENT" | "APPROVED";

export type QuoteRule = {
  id: string;
  quoteRuleId?: string;
  ruleId: string;
  text: string;
  orderIndex: number;
  createdAt: string;
};

export type LocalUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
};

export type Client = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  notes: string | null;
  addressCep: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BuffetType = {
  id: string;
  name: string;
  description: string | null;
  pricePerPerson: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Quote = {
  id: string;
  number: string;
  clientId: string;
  buffetTypeId: string;
  status: QuoteStatus;
  peopleCount: number;
  unitPrice: number;
  totalValue: number;

  eventLocationCep: string;
  eventLocationStreet: string;
  eventLocationNumber: string;
  eventLocationComplement: string | null;
  eventLocationDistrict: string;
  eventLocationCity: string;
  eventLocationState: string;
  eventAddressLine: string;

  draftSavedAt: string | null;
  responseDueDate: string | null;
  eventDate: string | null;

  notes: string | null;
  rules: QuoteRule[];
  createdAt: string;
  updatedAt: string;

  client: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    document: string | null;
  } | null;
  buffetType: {
    id: string;
    name: string;
    description: string | null;
    pricePerPerson: number;
  } | null;
};

export type LicenseStatus = {
  status: "active" | "grace" | "expired" | "invalid";
  message?: string;
  daysLeft?: number;
  expiresAt?: string | null;
  centralAppUrl: string;
};

export type LicenseMeta = {
  installedAt: string | null;
  lastValidationAt: string | null;
  tokenPreview: string | null;
  centralAppUrl: string;
};
