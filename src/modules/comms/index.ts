// API pública del módulo comms (ADR-015, ADR-023, ADR-038).
export {
  deleteMessagesFor,
  listMessagesFor,
  type MessageChannel,
  type MessageKind,
  type MessageStatus,
  type MessageView,
  recordMessage,
} from "./domain/messages";
export { type DeliveryStats, deliverNotification, setPushSenderForTests } from "./domain/notify";
export {
  getPreferences,
  listPreferencesFor,
  type PreferencesInput,
  type PreferencesView,
  preferencesInputSchema,
  unsubscribeByToken,
  updatePreferencesAs,
} from "./domain/preferences";
export {
  chooseRoute,
  DEFAULT_PREFERENCES,
  NOTIFICATION_KINDS,
  type NotificationKind,
  type NotificationRequested,
  notificationRequestedSchema,
  type PreferenceFlags,
  shouldDeliver,
  splitPush,
} from "./domain/pure";
export {
  type SendReceipt,
  sendTransactionalEmail,
  setMailTransportsForTests,
  type TransactionalEmail,
} from "./domain/send";
export {
  countSubscriptionsFor,
  listSubscriptionsFor,
  removeSubscriptionAs,
  type SubscriptionInput,
  type SubscriptionView,
  saveSubscriptionAs,
  subscriptionInputSchema,
  subscriptionSummaryFor,
} from "./domain/subscriptions";
