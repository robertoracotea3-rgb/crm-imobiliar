export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function monthKey(d: string) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function countByMonth(items: { created_at: string }[], months: string[]) {
  const map: Record<string, number> = {};
  items.forEach(i => { const k = monthKey(i.created_at); map[k] = (map[k] || 0) + 1; });
  return months.map(m => ({ month: m, count: map[m] || 0 }));
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id, role, full_name').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthDt = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = `${lastMonthDt.getFullYear()}-${String(lastMonthDt.getMonth() + 1).padStart(2, '0')}`;
    const thisWeekStart = new Date(now); thisWeekStart.setDate(now.getDate() - 7);
    const months12: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months12.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const agencyId = profile.agency_id;

    // Fetch all data in parallel
    const [
      { data: allProps },
      { data: allDemands },
      { data: allContacts },
      { data: allLeads },
      { data: allProfiles },
      { data: allActivities },
      { data: allTasks },
    ] = await Promise.all([
      admin.from('properties')
        .select('id, internal_code, title, status, category, transaction, price, currency, description, attributes, created_at, agent_id, city, county')
        .eq('agency_id', agencyId).limit(500),
      admin.from('demands')
        .select('id, status, category, source, created_at, agent_id, budget_min, budget_max')
        .eq('agency_id', agencyId).limit(500),
      admin.from('contacts')
        .select('id, type, source, created_at, agent_id')
        .eq('agency_id', agencyId).limit(500),
      admin.from('leads')
        .select('id, status, received_at')
        .eq('agency_id', agencyId).limit(500),
      admin.from('profiles')
        .select('user_id, full_name, role')
        .eq('agency_id', agencyId).limit(100),
      Promise.resolve(
        admin.from('calendar_events')
          .select('id, type, start_at, completed, agent_id')
          .eq('agency_id', agencyId)
          .gte('start_at', new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString())
          .limit(500)
      ).catch(() => ({ data: [] })),
      Promise.resolve(
        admin.from('tasks')
          .select('id, status, priority, due_at')
          .eq('agency_id', agencyId)
          .limit(500)
      ).catch(() => ({ data: [] })),
    ]);

    const props = allProps || [];
    const demands = allDemands || [];
    const contacts = allContacts || [];
    const leads = allLeads || [];
    const profiles = allProfiles || [];
    const acts = (allActivities || []) as { id: string; type: string; start_at: string; completed: boolean; agent_id: string }[];
    const taskRows = (allTasks || []) as { id: string; status: string; priority: string; due_at: string | null }[];

    // ── Tasks (reminders) ──
    const nowMs = Date.now();
    const soonMs = nowMs + 3 * 86400000; // next 3 days
    const tasksOpen = taskRows.filter(t => t.status !== 'done');
    const tasksOverdue = tasksOpen.filter(t => t.due_at && new Date(t.due_at).getTime() < nowMs);
    const tasksDueSoon = tasksOpen.filter(t => t.due_at && new Date(t.due_at).getTime() >= nowMs && new Date(t.due_at).getTime() < soonMs);
    const tasksHigh = tasksOpen.filter(t => t.priority === 'mare');

    // ── Properties ──
    // Statusurile considerate "tranzacționate" — identic cu modulul Finanțe și filtrul din /properties.
    const SOLD_STATUSES = new Set(['tranzactionata', 'vanduta_noi', 'vanduta_altii', 'inchiriata']);
    const activeProps = props.filter(p => p.status === 'activa');
    const soldProps = props.filter(p => SOLD_STATUSES.has(p.status));
    const rentedProps = props.filter(p => p.status === 'inchiriata');
    const withdrawnProps = props.filter(p => ['retrasa', 'expirata', 'arhivata'].includes(p.status));
    const propsThisMonth = props.filter(p => monthKey(p.created_at) === thisMonth);
    const propsLastMonth = props.filter(p => monthKey(p.created_at) === lastMonth);
    const propsThisWeek = props.filter(p => new Date(p.created_at) >= thisWeekStart);
    const noPhotos = props.filter(p => {
      const photos = p.attributes?.photos;
      return !photos || (Array.isArray(photos) && photos.length === 0) || photos === '';
    });
    const noDescription = props.filter(p => !p.description || p.description.trim() === '');
    const totalValue = activeProps.reduce((s, p) => s + (p.price || 0), 0);

    // Categories breakdown
    const catMap: Record<string, number> = {};
    props.forEach(p => { if (p.category) catMap[p.category] = (catMap[p.category] || 0) + 1; });
    const byCategory = Object.entries(catMap).map(([cat, count]) => ({ category: cat, count })).sort((a, b) => b.count - a.count);

    // Monthly breakdown
    const propsByMonth = countByMonth(props, months12);
    const soldByMonth = countByMonth(soldProps, months12);

    // AI quality alerts
    const qualityAlerts = [
      ...noPhotos.slice(0, 5).map(p => ({
        type: 'no_photos', id: p.id, code: p.internal_code, title: p.title || p.internal_code,
        message: 'Fără fotografii', severity: 'high',
      })),
      ...noDescription.slice(0, 5).map(p => ({
        type: 'no_description', id: p.id, code: p.internal_code, title: p.title || p.internal_code,
        message: 'Fără descriere', severity: 'medium',
      })),
    ];

    // Price outlier detection (basic)
    const prices = activeProps.filter(p => p.price > 0).map(p => p.price);
    if (prices.length > 3) {
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      const suspiciousPrice = activeProps.filter(p => p.price > 0 && (p.price < avg * 0.1 || p.price > avg * 10));
      suspiciousPrice.slice(0, 3).forEach(p => qualityAlerts.push({
        type: 'suspicious_price', id: p.id, code: p.internal_code, title: p.title || p.internal_code,
        message: `Preț suspect: ${p.price.toLocaleString()} ${p.currency}`, severity: 'medium',
      }));
    }

    // Demands AI suggestions (old without contact)
    const oldDemands = demands.filter(d => {
      const age = (Date.now() - new Date(d.created_at).getTime()) / 86400000;
      return age > 14 && d.status === 'activa';
    }).slice(0, 3);

    // ── Daily demand stats ──
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const demandsToday = demands.filter(d => {
      const t = new Date(d.created_at).getTime();
      return t >= todayStart.getTime() && t <= todayEnd.getTime();
    });
    const demandsActive = demands.filter(d => d.status === 'activa');
    const demandsFinalized = demands.filter(d => d.status === 'indeplinita' || d.status === 'anulata');
    const demandsFinalizedToday = demandsFinalized.filter(d => {
      const t = new Date(d.created_at).getTime();
      return t >= todayStart.getTime();
    });
    const demandsWaiting = demands.filter(d => d.status === 'activa' && !d.agent_id);
    const demandsWithoutAgent = demands.filter(d => !d.agent_id);

    // ── Leads ──
    const leadsNew = leads.filter(l => l.status === 'new' || !l.status);
    const leadsInProgress = leads.filter(l => l.status === 'in_progress');
    const leadsLost = leads.filter(l => l.status === 'lost');
    const leadsThisWeek = leads.filter(l => new Date(l.received_at) >= thisWeekStart);

    // Lead sources (not available in current schema)
    const leadSrcMap: Record<string, number> = {};

    // ── Contacts ──
    const contactsThisMonth = contacts.filter(c => monthKey(c.created_at) === thisMonth);
    const contactsLastMonth = contacts.filter(c => monthKey(c.created_at) === lastMonth);
    const contactsByMonth = countByMonth(contacts, months12);

    // ── Activities statistics ──
    const todayActStart = new Date(now); todayActStart.setHours(0, 0, 0, 0);
    const todayActEnd = new Date(now); todayActEnd.setHours(23, 59, 59, 999);
    const actsToday = acts.filter(a => {
      const t = new Date(a.start_at).getTime();
      return t >= todayActStart.getTime() && t <= todayActEnd.getTime();
    });
    const actsCompletedToday = actsToday.filter(a => a.completed);
    const actsOverdue = acts.filter(a => !a.completed && new Date(a.start_at).getTime() < todayActStart.getTime());
    const actsUpcoming = acts.filter(a => !a.completed && new Date(a.start_at).getTime() > todayActEnd.getTime());
    const actsPending = acts.filter(a => !a.completed);
    const actTypeMap: Record<string, number> = {};
    acts.forEach(a => { if (a.type) actTypeMap[a.type] = (actTypeMap[a.type] || 0) + 1; });
    const actsByType = Object.entries(actTypeMap).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);

    // ── Agent leaderboard ──
    const agentPropMap: Record<string, { active: number; sold: number; demands: number; leads: number; activities: number }> = {};
    const initAgent = (uid: string) => { if (!agentPropMap[uid]) agentPropMap[uid] = { active: 0, sold: 0, demands: 0, leads: 0, activities: 0 }; };
    props.forEach(p => { if (p.agent_id) { initAgent(p.agent_id); if (p.status === 'activa') agentPropMap[p.agent_id].active++; if (SOLD_STATUSES.has(p.status)) agentPropMap[p.agent_id].sold++; } });
    demands.forEach(d => { if (d.agent_id) { initAgent(d.agent_id); agentPropMap[d.agent_id].demands++; } });
    // leads table has no agent_id column — skip leaderboard count for leads
    acts.forEach(a => { if (a.agent_id) { initAgent(a.agent_id); agentPropMap[a.agent_id].activities++; } });

    const leaderboard = profiles.map(p => ({
      user_id: p.user_id,
      name: p.full_name || 'Agent',
      role: p.role,
      ...agentPropMap[p.user_id] || { active: 0, sold: 0, demands: 0, leads: 0, activities: 0 },
      score: (agentPropMap[p.user_id]?.active || 0) * 2 + (agentPropMap[p.user_id]?.sold || 0) * 5 + (agentPropMap[p.user_id]?.demands || 0),
    })).sort((a, b) => b.score - a.score);

    // ── Notifications ──
    const notifications: unknown[] = [];
    demands.filter(d => monthKey(d.created_at) === thisMonth).slice(0, 3).forEach(d =>
      notifications.push({ type: 'demand', message: `Cerere nouă ${d.category?.replace(/_/g, ' ')}`, created_at: d.created_at, severity: 'info' })
    );
    leadsThisWeek.slice(0, 3).forEach(l =>
      notifications.push({ type: 'lead', message: `Lead nou primit`, created_at: l.received_at, severity: 'success' })
    );
    noPhotos.slice(0, 2).forEach(p =>
      notifications.push({ type: 'alert', message: `${p.internal_code}: Proprietate fără fotografii`, created_at: p.created_at, severity: 'warning' })
    );
    notifications.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // ── Recent activity ──
    const recentActivity = [
      ...props.slice(0, 8).map(p => ({
        type: 'property', id: p.id, code: p.internal_code,
        label: `Proprietate ${p.status === 'activa' ? 'adăugată' : 'actualizată'}: ${p.title || p.internal_code}`,
        sub: `${p.category?.replace(/_/g, ' ')} · ${p.city}`,
        created_at: p.created_at,
      })),
      ...demands.slice(0, 4).map(d => ({
        type: 'demand', id: d.id, code: '',
        label: `Cerere nouă: ${d.category?.replace(/_/g, ' ')}`,
        sub: d.source || '',
        created_at: d.created_at,
      })),
      ...contacts.slice(0, 4).map(c => ({
        type: 'contact', id: c.id, code: '',
        label: `Contact nou`,
        sub: c.type || '',
        created_at: c.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 12);

    return Response.json({
      user: { name: profile.full_name, role: profile.role },
      properties: {
        total: props.length,
        active: activeProps.length,
        sold: soldProps.length,
        rented: rentedProps.length,
        withdrawn: withdrawnProps.length,
        this_month: propsThisMonth.length,
        last_month: propsLastMonth.length,
        this_week: propsThisWeek.length,
        no_photos: noPhotos.length,
        no_description: noDescription.length,
        total_value: totalValue,
        by_category: byCategory,
        by_month: propsByMonth,
        sold_by_month: soldByMonth,
        recent: props.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
        quality_alerts: qualityAlerts,
      },
      demands: {
        total: demands.length,
        active: demandsActive.length,
        this_month: demands.filter(d => monthKey(d.created_at) === thisMonth).length,
        last_month: demands.filter(d => monthKey(d.created_at) === lastMonth).length,
        old_uncontacted: oldDemands.length,
        today: demandsToday.length,
        finalized_today: demandsFinalizedToday.length,
        waiting: demandsWaiting.length,
        without_agent: demandsWithoutAgent.length,
        by_status: {
          activa: demandsActive.length,
          indeplinita: demandsFinalized.filter(d => d.status === 'indeplinita').length,
          anulata: demandsFinalized.filter(d => d.status === 'anulata').length,
        },
      },
      contacts: {
        total: contacts.length,
        this_month: contactsThisMonth.length,
        last_month: contactsLastMonth.length,
        by_month: contactsByMonth,
      },
      leads: {
        total: leads.length,
        new: leadsNew.length,
        in_progress: leadsInProgress.length,
        lost: leadsLost.length,
        this_week: leadsThisWeek.length,
        by_source: Object.entries(leadSrcMap).map(([source, count]) => ({ source, count })),
      },
      team: {
        total: profiles.length,
        leaderboard,
      },
      activities: {
        total: acts.length,
        today: actsToday.length,
        completed_today: actsCompletedToday.length,
        overdue: actsOverdue.length,
        upcoming: actsUpcoming.length,
        pending: actsPending.length,
        by_type: actsByType,
      },
      tasks: {
        open: tasksOpen.length,
        overdue: tasksOverdue.length,
        due_soon: tasksDueSoon.length,
        high_priority: tasksHigh.length,
      },
      notifications: notifications.slice(0, 10),
      activity: recentActivity,
      months: months12,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
