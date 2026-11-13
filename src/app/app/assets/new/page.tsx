import { ActionForm } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requirePage, tenantTx } from "@/lib/session";
import { createAssetAction } from "../actions";
import { AssetFields } from "../asset-fields";
import { assetFormOptions } from "../options";

export default async function NewAssetPage() {
  const ctx = await requirePage("assets.manage");
  const opts = await tenantTx(ctx, assetFormOptions);
  return (
    <>
      <PageHeader title="Add asset" description="Items bought through a purchase order are added automatically when goods are received." />
      <Card>
        <ActionForm action={createAssetAction} submitLabel="Add asset">
          <AssetFields {...opts} isNew />
        </ActionForm>
      </Card>
    </>
  );
}
