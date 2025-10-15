import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Compute daily analytics for all organizations
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, contact_email')

    if (orgsError) {
      throw orgsError
    }

    const results = []

    for (const org of orgs || []) {
      try {
        // Call the daily analytics computation function
        const { error: computeError } = await supabase
          .rpc('compute_daily_analytics', {
            target_date: new Date().toISOString().split('T')[0]
          })

        if (computeError) {
          console.error(`Analytics computation failed for org ${org.id}:`, computeError)
          continue
        }

        // Get today's metrics
        const { data: metrics, error: metricsError } = await supabase
          .from('analytics_daily')
          .select('*')
          .eq('org_id', org.id)
          .eq('date', new Date().toISOString().split('T')[0])
          .single()

        if (metricsError && metricsError.code !== 'PGRST116') {
          console.error(`Metrics fetch failed for org ${org.id}:`, metricsError)
          continue
        }

        // Send digest notifications to users with open tickets
        const { data: usersWithTickets, error: usersError } = await supabase
          .from('users')
          .select(`
            id,
            phone_hash,
            reports!inner (
              tickets!inner (
                id,
                status,
                description,
                created_at
              )
            )
          `)
          .eq('reports.tickets.status', 'open')
          .eq('reports.tickets.org_id', org.id)

        let notificationsSent = 0

        for (const user of usersWithTickets || []) {
          const openTickets = user.reports
            .map(r => r.tickets)
            .filter(t => t.status === 'open')

          if (openTickets.length === 0) continue

          // Log digest notification (in production, would send actual SMS)
          await supabase
            .from('workflow_events')
            .insert({
              ticket_id: openTickets[0].id,
              event_type: 'digest.sent',
              payload: {
                org_id: org.id,
                user_id: user.id,
                message: `Daily update: You have ${openTickets.length} open report(s). We're working on your issues.`,
                ticket_count: openTickets.length
              }
            })

          notificationsSent++
        }

        // Send org summary email (simulated)
        if (org.contact_email && metrics) {
          await supabase
            .from('workflow_events')
            .insert({
              ticket_id: null,
              event_type: 'org.digest_sent',
              payload: {
                org_id: org.id,
                org_name: org.name,
                contact_email: org.contact_email,
                metrics: metrics,
                notifications_sent: notificationsSent
              }
            })
        }

        results.push({
          org_id: org.id,
          org_name: org.name,
          metrics: metrics || {},
          notifications_sent: notificationsSent
        })

      } catch (orgError) {
        console.error(`Processing failed for org ${org.id}:`, orgError)
        results.push({
          org_id: org.id,
          org_name: org.name,
          error: orgError.message
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed_at: new Date().toISOString(),
        organizations: results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Daily digest error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})