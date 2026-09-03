// API pública del módulo comms.
export { listMessagesFor, type MessageView } from "./domain/messages";
export { chooseRoute } from "./domain/pure";
export {
  type SendReceipt,
  sendTransactionalEmail,
  setMailTransportsForTests,
  type TransactionalEmail,
} from "./domain/send";
