import { ActionForm } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requirePage, tenantTx } from "@/lib/session";
import { createEmployeeAction } from "../actions";
import { EmployeeFields } from "../employee-fields";
import { employeeFormOptions } from "../options";

export default async function NewEmployeePage() {
  const ctx = await requirePage("employees.write");
  const opts = await tenantTx(ctx, employeeFormOptions);
  return (
    <>
      <PageHeader
        title="Add employee"
        description="New hires start in pre-boarding. Send them a pre-boarding link from their profile to collect personal and bank details."
      />
      <Card>
        <ActionForm action={createEmployeeAction} submitLabel="Create employee">
          <EmployeeFields {...opts} showSensitive={false} isNew />
        </ActionForm>
      </Card>
    </>
  );
}
