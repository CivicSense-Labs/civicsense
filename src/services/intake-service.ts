import { adminSupabase } from "./supabase";
import { processIntakeWorkflow } from "../agents/workflow";
import type { WorkflowResult } from "../agents/workflow";

interface SmsIntakeParams {
    phoneHash: string;
    fromNumber: string;
    body: string;
}

export async function handleSmsIntake({
  phoneHash,
  fromNumber,
  body,
}: SmsIntakeParams): Promise<{ user: any; org: any; workflowResult: WorkflowResult }> {
  // get/create user
  const { data: user, error: userError } = await adminSupabase
    .from('users')
    .upsert(
      {
        phone_hash: phoneHash,
        last_active: new Date().toISOString(),
      },
      { onConflict: 'phone_hash' }
    )
    .select()
    .single();

  if (userError || !user) {
    throw userError ?? new Error('User upsert failed');
  }

  // get org
  const { data: org, error: orgError } = await adminSupabase
    .from('organizations')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (orgError || !org) {
    throw new Error('No organization configured');
  }

  // run workflow
  const workflowResult = await processIntakeWorkflow({
    userId: user.id,
    orgId: org.id,
    rawText: body,
    channel: 'sms'
  });

  return { user, org, workflowResult };
}
