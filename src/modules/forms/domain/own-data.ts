import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { OWN_DATA_QUERY_LIMIT, ownDataCollections } from "@/shared/lib/own-data";
import { editionRegistration, form, formSubmission } from "../schema";
import { fieldsSchema } from "./pure";

/** Solo respuestas vinculadas al titular; nunca se busca por un correo enviado por el cliente. */
export async function collectOwnFormsData(personId: string) {
  const db = getDb();
  const [submissions, editionRegistrations] = await Promise.all([
    db
      .select({
        id: formSubmission.id,
        formId: formSubmission.formId,
        email: formSubmission.email,
        firstName: formSubmission.firstName,
        lastName: formSubmission.lastName,
        answers: formSubmission.answers,
        consentAcceptedAt: formSubmission.consentAcceptedAt,
        policyVersion: formSubmission.policyVersion,
        createdAt: formSubmission.createdAt,
        fields: form.fields,
      })
      .from(formSubmission)
      .innerJoin(form, eq(form.id, formSubmission.formId))
      .where(eq(formSubmission.personId, personId))
      .orderBy(desc(formSubmission.createdAt), desc(formSubmission.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: editionRegistration.id,
        editionId: editionRegistration.editionId,
        status: editionRegistration.status,
        createdAt: editionRegistration.createdAt,
      })
      .from(editionRegistration)
      .where(eq(editionRegistration.personId, personId))
      .orderBy(desc(editionRegistration.createdAt), desc(editionRegistration.id))
      .limit(OWN_DATA_QUERY_LIMIT),
  ]);
  const formSubmissions = submissions.map(({ fields: rawFields, answers: rawAnswers, ...row }) => {
    const fields = fieldsSchema.safeParse(rawFields);
    const keys = new Set(fields.success ? fields.data.map((field) => field.key) : []);
    const scalar = (value: unknown) =>
      value === null || ["string", "number", "boolean"].includes(typeof value);
    const answers = Object.fromEntries(
      Object.entries(rawAnswers).filter(
        ([key, value]) =>
          keys.has(key) && (scalar(value) || (Array.isArray(value) && value.every(scalar))),
      ),
    );
    return {
      ...row,
      answers,
      answersSchemaAvailable: fields.success,
      answersRequiringReview: Object.keys(rawAnswers).length - Object.keys(answers).length,
    };
  });
  return ownDataCollections({ formSubmissions, editionRegistrations });
}
