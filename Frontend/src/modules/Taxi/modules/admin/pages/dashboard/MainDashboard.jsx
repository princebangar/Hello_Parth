import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Car,
  CircleAlert,
  Clock,
  CreditCard,
  History,
  IndianRupee,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  Activity,
  ChevronRight,
  ArrowRight,
  Zap,
  TrendingUp,
  BarChart3,
  RefreshCw,
  Server,
  Mail,
  MessageSquare,
  MapPin,
  Shield,
  FileText,
  AlertTriangle,
  Award,
  Play,
  CheckCircle,
  Eye,
  Info,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import { adminService } from '../../services/adminService';
import { BACKEND_LABEL } from '../../../../shared/api/runtimeConfig';
import { GOOGLE_MAPS_API_KEY, HAS_VALID_GOOGLE_MAPS_KEY, INDIA_CENTER, useBaseGoogleMapsLoader } from '../../utils/googleMaps';
import { setVisibleInterval } from '@/shared/utils/visibleInterval.js';

const currency = (value) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 });
const DASHBOARD_REFRESH_INTERVAL_MS = 60000;

const MainDashboard = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  // Timeframe filter state
  const [timeframe, setTimeframe] = useState('Today'); // Today, Week, Month, Year

  // Interactive Chart states
  const [hoveredRevenueIndex, setHoveredRevenueIndex] = useState(null);
  const [hoveredDonutSegment, setHoveredDonutSegment] = useState(null);

  // Google Maps Loader
  const { isLoaded } = useBaseGoogleMapsLoader();

  const fetchData = async (silent = false) => {
    try {
      silent ? setIsRefreshing(true) : setIsLoading(true);
      const res = await adminService.getDashboardData();
      setDashboard(res?.data || res || {});
      setDashboardError('');
      setLastUpdatedAt(new Date());
    } catch (err) {
      setDashboardError(`System offline. Connection to ${BACKEND_LABEL} failed.`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    return setVisibleInterval(() => fetchData(true), DASHBOARD_REFRESH_INTERVAL_MS);
  }, []);

  // Backend Mapped Variables
  const totalUsers = dashboard?.totalUsers || 0;
  const totalDrivers = dashboard?.totalDrivers?.total || 0;
  const approvedDrivers = dashboard?.totalDrivers?.approved || 0;
  const declinedDrivers = dashboard?.totalDrivers?.declined || 0;

  const todayEarnings = dashboard?.todayEarnings || {};
  const overallEarnings = dashboard?.overallEarnings || {};
  const notifiedSos = dashboard?.notifiedSos || {};
  const todayTrips = dashboard?.todayTrips || {};
  const overallTrips = dashboard?.overallTrips || {};
  const onlineDrivers = dashboard?.onlineDrivers || 0;
  const pendingWithdrawals = dashboard?.pendingWithdrawals || 0;
  const openSupportTickets = dashboard?.openSupportTickets || 0;
  const topDrivers = Array.isArray(dashboard?.topDrivers) ? dashboard.topDrivers : [];

  const formatUptime = (seconds) => {
    const total = Math.max(0, Number(seconds) || 0);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Operational metrics calculations
  // Share of approved drivers that are online right now
  const fleetUtilization = useMemo(() => {
    if (approvedDrivers === 0) return 0;
    return Math.min(100, Math.round((onlineDrivers / approvedDrivers) * 100));
  }, [approvedDrivers, onlineDrivers]);

  // SVG Area Chart Points mapping for Revenue Trajectory
  const chartWidth = 500;
  const chartHeight = 150;
  const revenueChartData = useMemo(() => {
    const rawChart = overallEarnings?.chart || [];
    if (rawChart.length > 0) {
      return rawChart.map(item => ({ label: item.label, value: item.amount }));
    }
    return [];
  }, [overallEarnings]);

  const revenuePoints = useMemo(() => {
    if (revenueChartData.length === 0) return [];
    const maxVal = Math.max(...revenueChartData.map(d => d.value), 1000);
    return revenueChartData.map((d, i) => {
      const x = (i / (revenueChartData.length - 1)) * chartWidth;
      const y = chartHeight - (d.value / maxVal) * (chartHeight - 30) - 15;
      return { x, y, label: d.label, value: d.value };
    });
  }, [revenueChartData]);

  const linePath = useMemo(() => {
    if (revenuePoints.length === 0) return '';
    return 'M ' + revenuePoints.map(p => `${p.x} ${p.y}`).join(' L ');
  }, [revenuePoints]);

  const areaPath = useMemo(() => {
    if (revenuePoints.length === 0) return '';
    return `${linePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;
  }, [revenuePoints, linePath]);

  // Donut chart segments for Booking Distribution
  const bookingDonutData = useMemo(() => {
    const completed = todayTrips.completed || 0;
    const cancelled = todayTrips.cancelled || 0;
    const pending = todayTrips.scheduled || 0;
    const total = completed + cancelled + pending;
    
    if (total === 0) return [];
    
    return [
      { label: 'Completed', value: completed, color: '#22C55E', percent: Math.round((completed / total) * 100) },
      { label: 'Cancelled', value: cancelled, color: '#EF4444', percent: Math.round((cancelled / total) * 100) },
      { label: 'Pending', value: pending, color: '#FFC400', percent: Math.round((pending / total) * 100) }
    ];
  }, [todayTrips]);

  const donutRadius = 30;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutSegments = useMemo(() => {
    let accumulatedAngle = 0;
    return bookingDonutData.map((seg) => {
      const strokeDasharray = `${(seg.percent / 100) * donutCircumference} ${donutCircumference}`;
      const strokeDashoffset = -accumulatedAngle;
      accumulatedAngle += (seg.percent / 100) * donutCircumference;
      return {
        ...seg,
        strokeDasharray,
        strokeDashoffset
      };
    });
  }, [bookingDonutData, donutCircumference]);

  // Food-style KPI tiles: label, value, one-line helper, tinted icon; every tile with a destination is clickable.
  const kpiCards = [
    { label: 'Total Customers', value: totalUsers, helper: 'Registered riders', icon: Users, tone: 'text-violet-600', accent: 'bg-violet-200/40', path: '/taxi/admin/users' },
    { label: 'Total Drivers', value: totalDrivers, helper: 'All driver accounts', icon: Car, tone: 'text-sky-600', accent: 'bg-sky-200/40', path: '/taxi/admin/drivers' },
    { label: 'Active Drivers', value: approvedDrivers, helper: 'Approved and active', icon: UserCheck, tone: 'text-emerald-600', accent: 'bg-emerald-200/40', path: '/taxi/admin/drivers/active' },
    { label: 'Online Drivers', value: onlineDrivers, helper: 'On duty right now', icon: Zap, tone: 'text-orange-600', accent: 'bg-orange-200/40', path: '/taxi/admin/drivers/active' },
    { label: 'Total Trips', value: overallTrips.total || 0, helper: 'All time', icon: Activity, tone: 'text-rose-600', accent: 'bg-rose-200/40', path: '/taxi/admin/trips' },
    { label: 'Ongoing Trips', value: todayTrips.scheduled || 0, helper: 'Scheduled today', icon: Clock, tone: 'text-blue-600', accent: 'bg-blue-200/40', path: '/taxi/admin/trips' },
    { label: "Today's Revenue", value: `₹${currency(todayEarnings.total)}`, helper: 'Earned today', icon: IndianRupee, tone: 'text-green-600', accent: 'bg-green-200/40', path: '/taxi/admin/earnings' },
    { label: 'Fleet Online', value: `${fleetUtilization}%`, helper: 'Drivers online vs total', icon: TrendingUp, tone: 'text-teal-600', accent: 'bg-teal-200/40', path: '/taxi/admin/drivers/active' },
    { label: 'Pending Approvals', value: declinedDrivers, helper: 'Drivers awaiting approval', icon: AlertTriangle, tone: 'text-red-600', accent: 'bg-red-200/40', path: '/taxi/admin/drivers/pending' },
    { label: 'Server Uptime', value: formatUptime(dashboard?.serverUptimeSeconds), helper: 'Since last restart', icon: Server, tone: 'text-indigo-600', accent: 'bg-indigo-200/40' },
  ];

  return (
    <div className="font-sans redigo-admin-root animate-in fade-in duration-300">
      <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-[0_30px_120px_-60px_rgba(0,0,0,0.28)]">

        {/* HEADER BAND — same layout as the Food admin dashboard */}
        <div className="flex flex-col gap-4 border-b border-neutral-200 bg-gradient-to-br from-white via-neutral-50 to-neutral-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Admin Overview</p>
            <h1 className="text-2xl font-semibold text-neutral-900">Taxi Operations Command</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-700 shadow-sm">
              <Clock size={14} className="text-neutral-500" />
              <span className="font-medium">
                Synced {lastUpdatedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => fetchData(true)}
              title="Refresh now"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-white shadow-sm transition-colors hover:bg-neutral-50"
            >
              <RefreshCw size={16} className={isRefreshing ? 'animate-spin text-neutral-900' : 'text-neutral-600'} />
            </button>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">

        {dashboardError && (
          <div className="rounded-xl bg-rose-50 border border-rose-100 p-4 flex items-center gap-4">
            <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center text-rose-500 shadow-sm shrink-0">
              <CircleAlert size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-rose-900">Could not load dashboard data</p>
              <p className="text-[11px] text-rose-600 mt-0.5">{dashboardError}</p>
            </div>
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {kpiCards.map((kpi) => (
            <div
              key={kpi.label}
              role={kpi.path ? 'link' : undefined}
              tabIndex={kpi.path ? 0 : undefined}
              onClick={kpi.path ? () => navigate(kpi.path) : undefined}
              onKeyDown={kpi.path ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); navigate(kpi.path); } } : undefined}
              className={`group relative overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all duration-300 ${kpi.path ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl active:scale-[0.98]' : ''}`}
            >
              <div className={`absolute inset-0 opacity-40 transition-opacity duration-300 group-hover:opacity-60 ${kpi.accent}`} />
              <div className="relative z-10 flex items-center justify-between px-4 py-4">
                <div className="mr-2 min-w-0 flex-1">
                  <p className="mb-1 truncate text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-500">{kpi.label}</p>
                  <div className="mb-1 flex min-h-[1.75rem] items-center text-xl font-bold leading-tight text-neutral-900">
                    {isLoading ? <span className="inline-block h-6 w-20 animate-pulse rounded-md bg-neutral-200" /> : kpi.value}
                  </div>
                  <p className="text-[10px] font-medium leading-snug text-neutral-500">{kpi.helper}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-1 ring-neutral-200 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6">
                  <kpi.icon className={`h-5 w-5 ${kpi.tone}`} />
                </div>
              </div>
              {kpi.path ? (
                <ArrowUpRight className="absolute bottom-2 right-2 h-3 w-3 translate-x-2 text-neutral-400 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
              ) : null}
            </div>
          ))}
        </div>

        {/* REVENUE & BOOKING ANALYTICS ROW */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          
          {/* 2. Interactive Revenue Analytics */}
          <div className="admin-card lg:col-span-2 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs text-[#0B1220] uppercase tracking-wider font-bold">Revenue Analytics</h3>
                  <div className="h-1.5 w-1.5 rounded-full bg-[#FFC400]" />
                </div>
                <div className="flex gap-1">
                  {['Today', 'Week', 'Month', 'Year'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setTimeframe(tab)}
                      className={`text-[9px] font-bold px-2 py-0.5 rounded border transition-all ${timeframe === tab ? 'bg-[#FFC400] text-[#0B1220] border-[#FFC400]' : 'bg-transparent text-[#64748B] border-[#E5E7EB]'}`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-[#64748B]">Platform commission vs overall driver disbursements.</p>
            </div>

            <div className="grid grid-cols-3 gap-2 my-3">
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                <span className="text-[8px] text-[#64748B] block uppercase">Revenue</span>
                <span className="text-xs font-bold text-[#0B1220] block mt-0.5">
                  ₹{currency(timeframe === 'Today' ? todayEarnings.total : overallEarnings.total)}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                <span className="text-[8px] text-[#64748B] block uppercase font-bold text-[#FFC400]">Commission</span>
                <span className="text-xs font-bold text-[#0B1220] block mt-0.5">
                  ₹{currency(timeframe === 'Today' ? todayEarnings.admin_commission : overallEarnings.admin_commission)}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                <span className="text-[8px] text-[#64748B] block uppercase">Trips</span>
                <span className="text-xs font-bold text-[#0B1220] block mt-0.5">
                  {timeframe === 'Today' ? todayTrips.total : overallTrips.total}
                </span>
              </div>
            </div>

            {/* Interactive SVG Area Chart */}
            {revenueChartData.length === 0 ? (
              <div className="h-[150px] flex flex-col items-center justify-center border border-dashed border-[#E5E7EB] rounded-2xl bg-slate-50/50 p-4 my-2 text-center">
                <p className="text-sm font-semibold text-[#0B1220] whitespace-normal">No historical data available</p>
                <p className="text-[10px] text-[#64748B] mt-1 whitespace-normal">Transaction growth telemetry will automatically sync here.</p>
              </div>
            ) : (
              <>
                <div className="relative pt-2">
                  <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full overflow-visible">
                    <path d={areaPath} fill="rgba(255, 196, 0, 0.05)" />
                    <path d={linePath} fill="none" stroke="#FFC400" strokeWidth="2.5" />
                    {revenuePoints.map((pt, idx) => (
                      <circle
                        key={idx}
                        cx={pt.x}
                        cy={pt.y}
                        r={hoveredRevenueIndex === idx ? 6 : 4}
                        fill={hoveredRevenueIndex === idx ? '#FFC400' : '#FFFFFF'}
                        stroke="#FFC400"
                        strokeWidth="2"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredRevenueIndex(idx)}
                        onMouseLeave={() => setHoveredRevenueIndex(null)}
                      />
                    ))}
                  </svg>

                  {hoveredRevenueIndex !== null && revenuePoints[hoveredRevenueIndex] && (
                    <div
                      className="absolute bg-slate-900 !text-white rounded p-2 text-[10px] pointer-events-none shadow-xl border border-slate-800"
                      style={{
                        left: `${(revenuePoints[hoveredRevenueIndex].x / chartWidth) * 100}%`,
                        top: `${(revenuePoints[hoveredRevenueIndex].y / chartHeight) * 100 - 35}%`,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      <span className="font-semibold block">{revenuePoints[hoveredRevenueIndex].label}</span>
                      <span className="block mt-0.5">Revenue: ₹{currency(revenuePoints[hoveredRevenueIndex].value)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between text-[9px] text-[#64748B] pt-2 border-t border-[#E5E7EB] mt-2">
                  {revenueChartData.map((d, i) => (
                    <span key={i}>{d.label}</span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 3. Booking Analytics & Distribution */}
          <div className="admin-card flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <h3 className="text-xs text-[#0B1220] uppercase tracking-wider mb-1 font-bold">Booking Analytics</h3>
              <p className="text-[11px] text-[#64748B] mb-3">Trips distribution today.</p>
            </div>

            {bookingDonutData.length === 0 ? (
              <div className="h-[150px] flex flex-col items-center justify-center border border-dashed border-[#E5E7EB] rounded-2xl bg-slate-50/50 p-4 my-2 text-center">
                <p className="text-sm font-semibold text-[#0B1220] whitespace-normal">No historical data available</p>
                <p className="text-[10px] text-[#64748B] mt-1 whitespace-normal">Daily booking records and trip statistics will populate here.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center relative py-1">
                  <svg width="100" height="100" viewBox="0 0 100 100" className="transform -rotate-90">
                    {donutSegments.map((seg, i) => (
                      <circle
                        key={i}
                        cx="50"
                        cy="50"
                        r={donutRadius}
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth="8"
                        strokeDasharray={seg.strokeDasharray}
                        strokeDashoffset={seg.strokeDashoffset}
                        className="cursor-pointer transition-all hover:stroke-[10px]"
                        onMouseEnter={() => setHoveredDonutSegment(seg)}
                        onMouseLeave={() => setHoveredDonutSegment(null)}
                      />
                    ))}
                  </svg>

                  <div className="absolute text-center">
                    <span className="text-[8px] text-[#64748B] uppercase block">
                      {hoveredDonutSegment ? hoveredDonutSegment.label : 'Trips'}
                    </span>
                    <span className="text-sm font-bold text-[#0B1220] block mt-0.5">
                      {hoveredDonutSegment ? `${hoveredDonutSegment.percent}%` : todayTrips.total || 0}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2.5 border-t border-[#E5E7EB] mt-2">
                  {bookingDonutData.map((seg, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px] text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: seg.color }} />
                        <span>{seg.label}</span>
                      </div>
                      <span className="font-semibold text-[#0B1220]">{seg.value} ({seg.percent}%)</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        </div>

        {/* SECONDARY ROW (Leaderboards, Activity Feed, MAP, SOS) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          
          {/* Driver Performance Leaderboard */}
          <div className="admin-card flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <h3 className="text-xs text-[#0B1220] uppercase tracking-wider mb-3 flex items-center gap-1 font-bold">
                <Award size={14} className="text-[#FFC400]" />
                <span>Performance Leaderboard</span>
              </h3>
              
              <div className="space-y-3.5">
                {topDrivers.length === 0 ? (
                  <p className="text-xs text-[#64748B] py-6 text-center">No completed trips yet.</p>
                ) : topDrivers.map((lead, i) => (
                  <div key={i} className="flex items-center justify-between text-xs pb-2 border-b border-[#F1F5F9] last:border-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center font-bold text-[10px] text-[#0B1220] border">
                        {i + 1}
                      </div>
                      <div>
                        <span className="font-semibold block text-[#0B1220]">{lead.name}</span>
                        <span className="text-[9px] text-slate-400 block mt-0.5">{lead.rating ? `Rating: ${Number(lead.rating).toFixed(2)} ⭐` : 'Not rated yet'}</span>
                      </div>
                    </div>
                    <span className="font-bold text-[#0B1220]">{lead.trips} trips</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SOS Safety Monitoring & Uptime */}
          <div className="admin-card flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-[#0B1220] uppercase tracking-wider flex items-center gap-1.5 font-bold">
                  <Shield size={14} className="text-rose-500" />
                  <span>SOS Response Center</span>
                </h3>
                {Number(notifiedSos.total || 0) > 0 && (
                  <span className="bg-rose-100 text-rose-800 text-[8px] font-bold px-1.5 py-0.5 rounded border border-rose-200 animate-pulse">
                    ACTIVE DISTRESS
                  </span>
                )}
              </div>

              <div className="flex items-center justify-around py-4">
                <div className="text-center">
                  <span className="text-3xl font-bold text-rose-500 block leading-none">{notifiedSos.total || 0}</span>
                  <span className="text-[9px] text-[#64748B] block mt-1.5 uppercase font-medium">Pending SOS</span>
                </div>
                <div className="w-[1px] h-10 bg-[#E5E7EB]" />
                <div className="text-center">
                  <span className="text-3xl font-bold text-[#0B1220] block leading-none">{notifiedSos.closed || 0}</span>
                  <span className="text-[9px] text-[#64748B] block mt-1.5 uppercase font-medium">Resolved Signals</span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 space-y-2 text-[10px] text-slate-600 mt-2">
                <div className="flex justify-between">
                  <span>Last SOS alert:</span>
                  <span className="font-bold text-[#0B1220]">
                    {notifiedSos.lastAt ? new Date(notifiedSos.lastAt).toLocaleString('en-IN') : 'None yet'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Open support tickets:</span>
                  <span className="font-bold text-[#0B1220]">{openSupportTickets}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/taxi/admin/safety')}
              className="admin-btn-primary h-9 text-xs justify-center gap-1.5 mt-3 !bg-rose-600 !text-white hover:!bg-rose-700"
            >
              <AlertTriangle size={13} />
              <span>Enter Emergency Terminal</span>
            </button>
          </div>

          {/* Needs attention: real counts, each one links to the screen that clears it */}
          <div className="admin-card flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
              <h3 className="text-xs text-[#0B1220] uppercase tracking-wider mb-3 flex items-center gap-1.5 font-bold">
                <AlertTriangle size={14} className="text-amber-500" />
                <span>Needs Attention</span>
              </h3>

              <div className="space-y-2">
                {[
                  { label: 'Drivers awaiting approval', value: declinedDrivers, path: '/taxi/admin/drivers/pending' },
                  { label: 'Owner vehicles awaiting approval', value: Number(dashboard?.pendingFleetVehicles || 0), path: '/taxi/admin/fleet/manage?status=pending' },
                  { label: 'Withdrawal requests', value: pendingWithdrawals, path: '/taxi/admin/drivers/wallet/withdrawals' },
                  { label: 'Open support tickets', value: openSupportTickets, path: '/taxi/admin/support/tickets' },
                  { label: 'Active SOS alerts', value: Number(notifiedSos.total || 0), path: '/taxi/admin/safety' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className="w-full flex items-center justify-between rounded-lg border border-[#F1F5F9] px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-slate-600">{item.label}</span>
                    <span className={`font-bold ${item.value > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{item.value}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* GOOGLE MAPS DISTRIBUTION & DEMAND */}
        <div className="admin-card">
          <h3 className="text-xs text-[#0B1220] uppercase tracking-wider mb-2 flex items-center gap-1.5 font-bold">
            <MapPin size={14} className="text-[#FFC400]" />
            <span>Operational Demand Distribution</span>
          </h3>
          <p className="text-[11px] text-[#64748B] mb-4">Live fleet positions and demand distribution maps.</p>

          <div className="w-full h-80 rounded-xl overflow-hidden border border-[#E5E7EB] bg-slate-50 flex items-center justify-center relative shadow-sm">
            {isLoaded ? (
              <GoogleMap
                mapContainerClassName="w-full h-full"
                center={INDIA_CENTER}
                zoom={5}
                options={{
                  disableDefaultUI: true,
                  styles: [
                    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
                    { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
                    { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },
                    { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
                    { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
                    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
                    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
                    { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
                    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
                    { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
                    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] },
                    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] }
                  ]
                }}
              >
                {/* Central operational coordinate */}
                <MarkerF position={INDIA_CENTER} />
              </GoogleMap>
            ) : (
              <div className="text-center text-xs text-[#64748B] flex flex-col items-center gap-2">
                <Loader2 size={24} className="animate-spin text-[#0B1220]" />
                <span>Loading Google Maps Services...</span>
              </div>
            )}
          </div>
        </div>

        </div>
      </div>
    </div>
  );
};

export default MainDashboard;
