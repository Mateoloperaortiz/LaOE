import { Campo, inputClass } from "@/shared/admin-kit/AdminFields";
import { t } from "@/shared/copy";

export interface MacroContext {
  slug: string;
  termId: string;
  area: string;
  editionId: string;
}

export function Fields({ context, operation }: { context: MacroContext; operation: string }) {
  return (
    <>
      {Object.entries({ ...context, operation }).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

export function MemberSelect({
  members,
  name,
  label,
  selected = "",
  optional = false,
}: {
  members: Array<{ personId: string; fullName: string }>;
  name: string;
  label: string;
  selected?: string;
  optional?: boolean;
}) {
  return (
    <Campo id={name} label={label}>
      <select
        id={name}
        name={name}
        defaultValue={selected}
        required={!optional}
        className={inputClass}
      >
        <option value="">{optional ? t("T-2357") : "—"}</option>
        {members.map((member) => (
          <option key={member.personId} value={member.personId}>
            {member.fullName}
          </option>
        ))}
      </select>
    </Campo>
  );
}
