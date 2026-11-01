export interface AvailabilityGroup {
  type: "COMMITTEE" | "WORK_GROUP";
  id: string;
  name: string;
}

export interface AvailabilityComparison {
  total: number;
  answered: number;
  counts: number[];
  members: Array<{ personId: string; name: string; slots: number[] | null }>;
}

export interface AvailabilitySaveState {
  status: "idle" | "done" | "error";
  revision: string | 0;
  slots: number[];
  message?: string;
  withdrawn?: boolean;
}

export interface PollActionState {
  status: "idle" | "error" | "done";
  message?: string;
}
