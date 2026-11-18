import { contractUploadExpires } from "@/domain-events/finance";
import { onEvent } from "@/jobs/registry";
import { deleteObject } from "@/shared/adapters/storage";

onEvent(contractUploadExpires, async ({ key }) => {
  await deleteObject(key);
});
