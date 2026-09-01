export type BankId = "bog" | "tbc";

export type BankInfo = {
  id: BankId;
  name: string;
  iban: string;
  card: string;
  recipient: string;
};

/** Edit these values with your real account details. */
export const BANKS: Record<BankId, BankInfo> = {
  bog: {
    id: "bog",
    name: "Bank Of Georgia",
    iban: "GE00BG0000000000000000",
    card: "5555 0000 0000 0000",
    recipient: "COBRA POKER LLC",
  },
  tbc: {
    id: "tbc",
    name: "TBC Bank",
    iban: "GE00TB0000000000000000",
    card: "4444 0000 0000 0000",
    recipient: "COBRA POKER LLC",
  },
};

export const BANK_LIST = [BANKS.bog, BANKS.tbc];
