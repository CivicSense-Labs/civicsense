import { Router } from 'express';
import { createSupabaseClient } from '../services/supabase.js';
import type { DashboardMetrics, TicketSummary } from '../types/index.js';

const router = Router();
const supabase = createSupabaseClient();

// Get dashboard metrics for an organization
router.get('/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;

    // Get metrics from the view
    const { data: metrics, error: metricsError } = await supabase
      .from('org_dashboard_metrics')
      .select('*')
      .eq('org_id', orgId)
      .single();

    if (metricsError) {
      console.error('Metrics fetch error:', metricsError);
      throw metricsError;
    }

    // Get recent ticket summaries
    const { data: tickets, error: ticketsError } = await supabase
      .from('ticket_summaries')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50);

    if (ticketsError) {
      console.error('Tickets fetch error:', ticketsError);
      throw ticketsError;
    }

    // Get parent tickets only (for main dashboard view)
    const parentTickets = tickets?.filter(t => !t.parent_id) || [];

    // Get recent activity
    const { data: activity, error: activityError } = await supabase
      .from('recent_activity')
      .select('*')
      .eq('org_id', orgId)
      .order('activity_time', { ascending: false })
      .limit(20);

    if (activityError) {
      console.error('Activity fetch error:', activityError);
    }

    res.json({
      metrics: metrics as DashboardMetrics,
      parentTickets: parentTickets as TicketSummary[],
      allTickets: tickets as TicketSummary[],
      recentActivity: activity || []
    });

  } catch (error) {
    console.error('Dashboard API error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard data'
    });
  }
});

// Get specific ticket details with children
router.get('/:orgId/tickets/:ticketId', async (req, res) => {
  try {
    const { orgId, ticketId } = req.params;

    // Get ticket summary
    const { data: ticket, error: ticketError } = await supabase
      .from('ticket_summaries')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', ticketId)
      .single();

    if (ticketError) {
      console.error('Ticket fetch error:', ticketError);
      throw ticketError;
    }

    // Get child tickets if this is a parent
    const { data: children, error: childrenError } = await supabase
      .from('ticket_summaries')
      .select('*')
      .eq('parent_id', ticketId)
      .order('created_at', { ascending: false });

    if (childrenError) {
      console.error('Children fetch error:', childrenError);
    }

    // Get reports for this ticket
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select(`
        *,
        users:user_id (
          id,
          phone_hash
        )
      `)
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (reportsError) {
      console.error('Reports fetch error:', reportsError);
    }

    res.json({
      ticket: ticket as TicketSummary,
      children: children || [],
      reports: reports || []
    });

  } catch (error) {
    console.error('Ticket details API error:', error);
    res.status(500).json({
      error: 'Failed to fetch ticket details'
    });
  }
});

// Update ticket status
router.patch('/:orgId/tickets/:ticketId', async (req, res) => {
  try {
    const { orgId, ticketId } = req.params;
    const { status, priority } = req.body;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    updateData.updated_at = new Date().toISOString();

    const { data: ticket, error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', ticketId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) {
      console.error('Ticket update error:', error);
      throw error;
    }

    // TODO: Trigger notification workflow if status changed to closed

    res.json({
      success: true,
      ticket
    });

  } catch (error) {
    console.error('Ticket update API error:', error);
    res.status(500).json({
      error: 'Failed to update ticket'
    });
  }
});

export { router as dashboardRouter };