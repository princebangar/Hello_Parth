import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2, Plus, Search, Ticket, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const UserSubscriptions = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [busyPlanId, setBusyPlanId] = useState('');

  // The API populates the vehicle into vehicle_type_id.
  const getVehicleName = (item) => item.vehicle_type_id?.name || item.vehicle_type?.name || 'N/A';

  const togglePlan = async (item) => {
    const id = item._id || item.id;
    setBusyPlanId(id);
    try {
      await adminService.setSubscriptionPlanActive('user', id, !item.active);
      setPlans((current) => current.map((plan) => ((plan._id || plan.id) === id ? { ...plan, active: !item.active } : plan)));
      toast.success(item.active ? 'Plan hidden from customers' : 'Plan is live for customers');
    } catch (error) {
      toast.error(error?.message || 'Could not update the plan');
    } finally {
      setBusyPlanId('');
    }
  };

  const removePlan = async (item) => {
    const id = item._id || item.id;
    if (!window.confirm(`Delete the plan "${item.name}"?`)) return;
    setBusyPlanId(id);
    try {
      await adminService.deleteSubscriptionPlan('user', id);
      setPlans((current) => current.filter((plan) => (plan._id || plan.id) !== id));
      toast.success('Plan deleted');
    } catch (error) {
      toast.error(error?.message || 'Could not delete the plan');
    } finally {
      setBusyPlanId('');
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await adminService.getUserSubscriptionPlans();
        setPlans(Array.isArray(response?.data?.results) ? response.data.results : []);
      } catch (error) {
        toast.error(error?.message || 'Failed to load subscription plans');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filteredPlans = plans.filter((item) =>
    `${item.name || ''} ${getVehicleName(item)}`.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-gray-400">
            <span>Users</span>
            <ChevronRight size={12} />
            <span className="text-gray-700">Subscription Management</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Customer Subscription Management</h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/taxi/admin/users/subscriptions/create')}
          className="inline-flex items-center gap-2 rounded-lg bg-yellow-400 px-4 py-2.5 text-sm font-bold text-black shadow-sm transition hover:bg-yellow-500"
        >
          <Plus size={16} />
          Add Subscription
        </button>
      </div>

      <div className="rounded-xl bg-white p-5 border border-gray-200 shadow-sm">
        {!loading && plans.length > 0 ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Subscription revenue</p>
              <p className="mt-1 text-lg font-black text-gray-900">₹{plans.reduce((sum, plan) => sum + Number(plan.revenue || 0), 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Passes sold</p>
              <p className="mt-1 text-lg font-black text-gray-900">{plans.reduce((sum, plan) => sum + Number(plan.sold_count || 0), 0)}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Running now</p>
              <p className="mt-1 text-lg font-black text-gray-900">{plans.reduce((sum, plan) => sum + Number(plan.running_count || 0), 0)}</p>
            </div>
          </div>
        ) : null}
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2.5">
          <Search size={16} className="text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search customer subscription plans..."
            className="w-full bg-transparent text-sm font-bold text-gray-900 outline-none placeholder:text-gray-400"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="py-16 text-center text-sm font-semibold text-slate-400">No customer subscription plans found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-bold text-gray-600">
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Vehicle Type</th>
                  <th className="px-4 py-3">Benefit</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Sold</th>
                  <th className="px-4 py-3">Revenue</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map((item) => (
                  <tr key={item._id || item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-50 text-gray-900 border border-yellow-100">
                          <Ticket size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{item.name}</p>
                          <p className="text-xs font-medium text-gray-500">{item.description || 'Customer ride pass'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-600">{getVehicleName(item)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-600">
                      {item.benefit_type === 'unlimited' ? 'Unlimited rides' : `${item.ride_limit} rides`}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-600">{item.duration} days</td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">₹{Number(item.amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-600">
                      {Number(item.sold_count || 0)}
                      {Number(item.running_count || 0) > 0 ? <span className="ml-1 text-xs text-emerald-600">({item.running_count} running)</span> : null}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900">₹{Number(item.revenue || 0).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={busyPlanId === (item._id || item.id)}
                        onClick={() => togglePlan(item)}
                        className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50 ${item.active === false ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                        title="Click to show/hide this plan for customers"
                      >
                        {item.active === false ? 'Inactive' : 'Active'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={busyPlanId === (item._id || item.id)}
                        onClick={() => removePlan(item)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 px-3 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserSubscriptions;
