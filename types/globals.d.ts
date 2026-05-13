import { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";

declare module "next-auth/jwt" {
  interface JWT {
    role?:       string;         // ✅ was Role enum, now string
    telegramId?: string | null;
  }
}

declare module "next-auth" {
  interface Session {
    user?: {
      role?:       string;       // ✅ was Role enum, now string
      telegramId?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role?:       string;         // ✅ was Role enum, now string
    telegramId?: string | null;
  }
}

type CellTypes = {
  [x: string]: string | number | boolean | null | undefined;
  id:                   string;
  year?:                string;
  annualCredit?:        number | null;
  annualUsed?:          number | null;
  annualAvailable?:     number | null;
  healthCredit?:        number | null;
  healthUsed?:          number | null;
  healthAvailable?:     number | null;
  studyCredit?:         number | null;
  studyUsed?:           number | null;
  studyAvailable?:      number | null;
  maternityCredit?:     number | null;
  maternityUsed?:       number | null;
  maternityAvailable?:  number | null;
  familyCredit?:        number | null;
  familyUsed?:          number | null;
  familyAvailable?:     number | null;
  paternityCredit?:     number | null;
  paternityUsed?:       number | null;
  paternityAvailable?:  number | null;
  unpaidUsed?:          number | null;
  name:                 string;
  email:                string;
};