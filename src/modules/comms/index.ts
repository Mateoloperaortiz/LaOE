// API pública del módulo comms (ADR-015, ADR-023, ADR-038).
export {
  cancelCampaignAs,
  createCampaignAs,
  estimateAudience,
  getCampaign,
  listActiveCampaigns,
  listRecipients,
  processCampaignBatch,
  RECIPIENT_STATUSES,
  runCampaignTick,
  SKIP_REASONS,
  scheduleCampaignAs,
  startDueCampaigns,
  updateCampaignAs,
} from "./domain/campaigns";
export { listMessagesFor, type MessageView } from "./domain/messages";
export { deliverNotification, setPushSenderForTests } from "./domain/notify";
export {
  getPreferences,
  type PreferencesView,
  unsubscribeByToken,
  unsubscribeTokenExists,
  updatePreferencesAs,
} from "./domain/preferences";
export { DEFAULT_PREFERENCES, splitPush } from "./domain/pure";
export {
  type CampaignHold,
  getCampaignBacklog,
  getCampaignQuotaStatus,
  liftCampaignQuotaCutAs,
  resetTransactionalReserveAs,
  setTransactionalReserveAs,
} from "./domain/quota";
export { sendTransactionalEmail, setMailTransportsForTests } from "./domain/send";
export {
  countSubscriptionsFor,
  listSubscriptionsFor,
  releaseSubscriptionOnSignOut,
  removeSubscriptionAs,
  SubscriptionTakenError,
  saveSubscriptionAs,
  subscriptionInputSchema,
  subscriptionSummaryFor,
} from "./domain/subscriptions";
export {
  createTemplate,
  getTemplate,
  previewTemplateFor,
  sendTemplateTestAs,
} from "./domain/templates";
export { wrapEmail } from "./domain/templates-pure";
