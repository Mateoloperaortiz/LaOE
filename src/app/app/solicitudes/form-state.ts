import type { RequestKind } from "@/modules/crm";

export interface RequestActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

export interface CommitteeOption {
  id: string;
  name: string;
}

export const requestTypes: Record<string, RequestKind> = {
  licencia: "LEAVE",
  cambio: "TRANSFER",
  retiro: "RESIGNATION",
};
