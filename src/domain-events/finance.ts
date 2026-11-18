import { z } from "zod";
import { defineEvent } from "./define";

/** Solo copias de subida. Los expedientes definitivos viven bajo contracts/files/. */
export const contractUploadExpires = defineEvent(
  "finance.contract-upload-expires",
  z.object({
    key: z
      .string()
      .regex(
        /^contracts\/incoming\/[a-z0-9]+\/[a-z0-9]+\/[a-z0-9]{24}\/(contract|legal|coordinator)\/[a-f0-9]{64}\/[a-z0-9]{24}$/,
      ),
  }),
);
