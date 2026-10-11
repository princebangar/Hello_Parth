import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowDownLeft, ArrowLeft, ArrowUpRight, RefreshCw, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../../shared/api/axiosInstance';

const money = (value) => {
    const amount = Number(value || 0);
    return `${amount < 0 ? '-' : ''}Rs ${Math.abs(amount).toFixed(2)}`;
};

const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const OwnerWallet = () => {
    const navigate = useNavigate();
    const [balance, setBalance] = useState(0);
    const [transactions, setTransactions] = useState([]);
    const [minimumBalance, setMinimumBalance] = useState(null);
    const [fleetTotals, setFleetTotals] = useState(null);
    const [fleetRides, setFleetRides] = useState([]);
    const [tab, setTab] = useState('earnings');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadWallet = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/drivers/fleet/wallet');
            const data = response?.data?.data || response?.data || {};
            setBalance(Number(data.balance || 0));
            setTransactions(Array.isArray(data.results) ? data.results : []);
            setMinimumBalance(Number.isFinite(Number(data.minimumBalanceForOrders)) ? Number(data.minimumBalanceForOrders) : null);
            setFleetTotals(data.fleetTotals || null);
            setFleetRides(Array.isArray(data.fleetRides) ? data.fleetRides : []);
        } catch (loadError) {
            setError(loadError?.message || 'Could not load your wallet.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadWallet();
    }, [loadWallet]);

    return (
        <div className="min-h-screen bg-[#F8F9FA] pb-28">
            <header className="sticky top-0 z-30 flex items-center justify-between bg-[#F8F9FA] px-5 pt-6 pb-4">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm"
                    aria-label="Back"
                >
                    <ArrowLeft size={20} className="text-slate-900" />
                </button>
                <div className="text-center">
                    <h1 className="text-lg font-black text-slate-950">Owner wallet</h1>
                    <p className="text-xs font-bold text-slate-500">Fleet balance and admin settlements</p>
                </div>
                <button
                    type="button"
                    onClick={loadWallet}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm"
                    aria-label="Refresh"
                >
                    <RefreshCw size={18} className={`text-slate-900 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </header>

            <main className="space-y-4 px-5">
                <section className="rounded-[28px] bg-gradient-to-br from-[#12348c] to-[#3b82f6] p-6 text-white shadow-xl">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Current balance</p>
                            <p className="mt-2 text-4xl font-black">{money(balance)}</p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                            <Wallet size={22} />
                        </div>
                    </div>
                    <p className="mt-4 text-xs font-semibold leading-5 text-white/70">
                        Credits and debits on this wallet are made by the admin team when your fleet earnings are settled.
                    </p>
                    {minimumBalance !== null ? (
                        <div className={`mt-3 rounded-2xl px-3 py-2 text-xs font-bold ${balance < minimumBalance ? 'bg-rose-500/90 text-white' : 'bg-white/15 text-white'}`}>
                            {balance < minimumBalance
                                ? `Your balance is below the minimum ${money(minimumBalance)}: your drivers get no rides until it is topped up.`
                                : `Keep at least ${money(minimumBalance)} in this wallet so your drivers keep getting rides.`}
                        </div>
                    ) : null}
                </section>

                <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
                    {[{ id: 'earnings', label: 'Fleet earnings' }, { id: 'wallet', label: 'Wallet transactions' }].map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setTab(item.id)}
                            className={`rounded-xl py-2.5 text-[11px] font-black uppercase tracking-wider transition ${tab === item.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>

                {error && (
                    <div className="flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {tab === 'earnings' ? (
                    <section className="rounded-[24px] bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black text-slate-950">Fleet earnings and commission</h2>
                        {fleetTotals ? (
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-2xl bg-slate-50 px-2 py-3">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Fare</p>
                                    <p className="mt-1 text-sm font-black text-slate-900">{money(fleetTotals.fare)}</p>
                                </div>
                                <div className="rounded-2xl bg-rose-50 px-2 py-3">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-rose-400">Admin commission</p>
                                    <p className="mt-1 text-sm font-black text-rose-600">{money(fleetTotals.commission)}</p>
                                </div>
                                <div className="rounded-2xl bg-emerald-50 px-2 py-3">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-emerald-500">Fleet earned</p>
                                    <p className="mt-1 text-sm font-black text-emerald-600">{money(fleetTotals.earnings)}</p>
                                </div>
                            </div>
                        ) : null}
                        {!loading && fleetRides.length === 0 && !error && (
                            <p className="mt-3 text-sm font-semibold text-slate-500">No completed fleet trips yet.</p>
                        )}
                        <ul className="mt-3 divide-y divide-slate-100">
                            {fleetRides.map((ride) => (
                                <li key={ride.id} className="py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-slate-900">{ride.driverName || 'Fleet driver'}</p>
                                            <p className="truncate text-xs font-semibold text-slate-500">{ride.vehicle || 'Vehicle not set'}</p>
                                            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{formatDate(ride.completedAt)} - {ride.serviceType === 'parcel' ? 'Delivery' : ride.serviceType === 'intercity' ? 'Outstation' : 'Ride'} - {String(ride.paymentMethod || 'cash').toUpperCase()}</p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-sm font-black text-slate-900">{money(ride.fare)}</p>
                                            <p className="text-[11px] font-bold text-rose-500">Commission {money(ride.commission)}</p>
                                            <p className="text-[11px] font-bold text-emerald-600">Earned {money(ride.driverEarnings)}</p>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : (
                <section className="rounded-[24px] bg-white p-5 shadow-sm">
                    <h2 className="text-sm font-black text-slate-950">Transactions</h2>
                    {!loading && transactions.length === 0 && !error && (
                        <p className="mt-3 text-sm font-semibold text-slate-500">No wallet transactions yet.</p>
                    )}
                    <ul className="mt-2 divide-y divide-slate-100">
                        {transactions.map((item) => {
                            const isDebit = String(item.type || '').toLowerCase() === 'debit';
                            return (
                                <li key={item._id} className="flex items-center gap-3 py-3">
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isDebit ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                        {isDebit ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-slate-900">{item.description || (isDebit ? 'Debit' : 'Credit')}</p>
                                        <p className="text-xs font-semibold text-slate-500">{formatDate(item.createdAt)}</p>
                                    </div>
                                    <p className={`text-sm font-black ${isDebit ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {isDebit ? '-' : '+'}{money(item.amount)}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                </section>
                )}
            </main>

        </div>
    );
};

export default OwnerWallet;
