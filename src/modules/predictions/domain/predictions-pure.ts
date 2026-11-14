// Los estados de los pronósticos del Athletic (ADR-197 regla 7), en el orden del modelo.
export const PREDICTION_MARKET_STATUSES = ["DRAFT", "OPEN", "RESOLVED", "CANCELLED"] as const;
export const PREDICTION_TICKET_STATUSES = ["OPEN", "WON", "LOST", "REFUNDED"] as const;
