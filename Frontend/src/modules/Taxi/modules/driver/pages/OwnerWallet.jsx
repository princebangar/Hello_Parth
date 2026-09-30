import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowDownLeft, ArrowLeft, ArrowUpRight, RefreshCw, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
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
            <header className="flex items-center justify-between px-5 pt-6 pb-4">
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
                <section className="rounded-[28px] bg-slate-950 p-6 text-white shadow-xl">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Current balance</p>
                            <p className="mt-2 text-4xl font-black">{money(balance)}</p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                            <Wallet size={22} />
                        </div>
                    </div>
                    <p className="mt-4 text-xs font-semibold leading-5 text-white/60">
                        Credits and debits on this wallet are made by the admin team when your fleet earnings are settled.
                    </p>
                </section>

                {error && (
                    <div className="flex items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

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
            </main>

            <DriverBottomNav />
        </div>
    );
};

export default OwnerWallet;
