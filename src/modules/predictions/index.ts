// API pública del módulo predictions (ADR-197 regla 7): los pronósticos del Athletic con GH Points.
// Lo usa src/app y nadie más.
export {
  cancelMarketAs,
  createMarketAs,
  getMatchCap,
  listPredictionMatches,
  marketStatusLabel,
  myPredictions,
  openMarketAs,
  placePredictionAs,
  resolveMarketAs,
  setMatchCapAs,
  ticketStatusLabel,
} from "./domain/predictions";
