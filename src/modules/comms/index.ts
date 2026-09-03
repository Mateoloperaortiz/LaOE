// API pública del módulo comms.
export { chooseRoute } from "./domain/pure";
export {
  type SendReceipt,
  sendTransactionalEmail,
  setMailTransportsForTests,
  type TransactionalEmail,
} from "./domain/send";
