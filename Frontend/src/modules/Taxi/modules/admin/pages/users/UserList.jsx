import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
  Search, Download, UserPlus, MoreHorizontal,
  ChevronRight, UserCheck, Edit2, Lock, Trash2,
  Loader2, Ban, FileText
} from 'lucide-react';

const StatusToggle = ({ status, onToggle }) => (
  <button 
    onClick={(e) => { e.stopPropagation(); onToggle(); }}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${status === 'Active' ? 'bg-emerald-500' : 'bg-gray-300'}`}
  >
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${status === 'Active' ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
  </button>
);

import UserModal from './UserModal';
import { adminService } from '../../services/adminService';

const GENDER_LABELS = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
};

const UserList = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [referralSource, setReferralSource] = useState('all');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [page, setPage] = useState(1);
  const [paginator, setPaginator] = useState(null);
  const latestRequestId = useRef(0);
  const hasLoadedUsersRef = useRef(false);

  const fetchUsers = useCallback(async ({
    nextPage = page,
    nextLimit = itemsPerPage,
    nextSearch = searchTerm,
    nextReferralSource = referralSource,
    nextEmployeeId = selectedEmployeeId,
  } = {}) => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    const showInitialLoader = !hasLoadedUsersRef.current;

    try {
      setIsLoading(showInitialLoader);
      setIsRefreshing(!showInitialLoader);
      setError(null);
      const resData = await adminService.getUsers(nextPage, nextLimit, String(nextSearch || '').trim(), {
        referralSource: nextReferralSource,
        employeeId: nextEmployeeId,
      });
      if (requestId !== latestRequestId.current) return;

      if (resData.success) {
        const mapped = (resData.data?.results || []).map(u => ({
          id: u._id,
          name: u.name || 'Anonymous',
          gender: GENDER_LABELS[u.gender] || 'N/A',
          email: u.email || 'N/A',
          phone: u.mobile || 'N/A',
          profileImage: u.profileImage || '',
          governmentIdProof: u.governmentIdProof || null,
          acquiredByEmployeeId: u.acquiredByEmployeeId || '',
          acquiredByEmployeeCode: u.acquiredByEmployeeCode || '',
          acquiredByEmployeeName: u.acquiredByEmployeeName || '',
          status: u.active ? 'Active' : 'Suspended',
        }));
        setUsers(mapped);
        setPaginator(resData.data?.paginator || null);
        hasLoadedUsersRef.current = true;
      } else {
        setError(resData.message || 'Failed to fetch users');
      }
    } catch (err) {
      if (requestId !== latestRequestId.current) return;
      setError(err.message || 'Network error');
      hasLoadedUsersRef.current = true;
    } finally {
      if (requestId === latestRequestId.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [itemsPerPage, page, referralSource, searchTerm, selectedEmployeeId]);

  useEffect(() => {
    const trimmedSearch = String(searchTerm || '').trim();
    const timeoutId = window.setTimeout(() => {
      fetchUsers({
        nextPage: page,
        nextLimit: itemsPerPage,
        nextSearch: trimmedSearch,
        nextReferralSource: referralSource,
        nextEmployeeId: selectedEmployeeId,
      });
    }, trimmedSearch ? 350 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [fetchUsers, page, itemsPerPage, referralSource, searchTerm, selectedEmployeeId]);

  useEffect(() => {
    const closeMenu = () => setActiveMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const handleToggleStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'Active' ? false : true;
    const confirmed = window.confirm(`Are you sure you want to ${newStatus ? 'activate' : 'block'} this user?`);
    if (!confirmed) return;
    try {
      const resData = await adminService.updateUser(userId, { active: newStatus });
      if (resData.success) {
        setUsers(users.map(u => u.id === userId ? { ...u, status: newStatus ? 'Active' : 'Suspended' } : u));
        toast?.success?.(`User ${newStatus ? 'activated' : 'blocked'} successfully`) || console.log('Status updated');
      }
    } catch (err) {
      console.error('Failed to toggle status', err);
      alert('Failed to update status');
    }
  };

  const handleBlockUser = async (user) => {
    if (!user) return;
    const shouldBlock = user.status === 'Active';
    const confirmed = window.confirm(
      shouldBlock
        ? `Block ${user.name}? They will not be able to log in, open their profile, or register again with ${user.phone}.`
        : `Unblock ${user.name}? They will be able to use their account again.`
    );

    if (!confirmed) return;

    await handleToggleStatus(user.id, user.status);
    setActiveMenu(null);
  };

  // Downloads every user that matches the current search (all pages, not just the 10 on screen) as a CSV file.
  const [isExporting, setIsExporting] = useState(false);
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const rows = [];
      const csvCell = (value) => {
        const text = String(value ?? '').replace(/"/g, '""');
        return `"${text}"`;
      };
      for (let exportPage = 1; exportPage <= 100; exportPage += 1) {
        const resData = await adminService.getUsers(exportPage, 100, String(searchTerm || '').trim(), {});
        const chunk = resData?.data?.results || [];
        chunk.forEach((u) => rows.push([
          u.name || '', GENDER_LABELS[u.gender] || '', u.mobile || '', u.email || '',
          u.active ? 'Active' : 'Blocked', u.acquiredByEmployeeName || '', u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN') : '',
        ]));
        if (exportPage >= Number(resData?.data?.paginator?.last_page || 1)) break;
      }
      if (!rows.length) {
        toast.error('There are no users to export');
        return;
      }
      const csv = [['Name', 'Gender', 'Mobile', 'Email', 'Status', 'Employee referral', 'Joined'], ...rows]
        .map((row) => row.map(csvCell).join(','))
        .join('\r\n');
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} users exported`);
    } catch (err) {
      toast.error(err?.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleAddUser = () => { navigate('/taxi/admin/users/create'); };
  const handleEditUser = (user) => { setEditingUser(user); setIsModalOpen(true); };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        const resData = await adminService.deleteUser(userId);
        if (resData.success) setUsers(users.filter(u => u.id !== userId));
      } catch (err) {
        console.error('Failed to delete user', err);
      }
    }
  };

  const handleModalSubmit = async (formData) => {
    try {
      setIsSubmitting(true);
      const resData = editingUser 
        ? await adminService.updateUser(editingUser.id, formData)
        : await adminService.createUser(formData);
      if (resData.success) {
        setIsModalOpen(false);
        fetchUsers();
      } else {
        alert(resData.message || 'Operation failed');
      }
    } catch (err) {
      alert(err.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleMenu = (e, userId) => {
    e.stopPropagation();
    if (activeMenu === userId) {
      setActiveMenu(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 210;
    const gap = 8;
    let left = rect.right - menuWidth;
    left = Math.max(12, Math.min(left, window.innerWidth - menuWidth - 12));

    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - 12) {
      top = Math.max(12, rect.top - gap - menuHeight);
    }

    setMenuPosition({ top, left });
    setActiveMenu(userId);
  };

  const totalPages = Math.max(1, Number(paginator?.last_page || 1));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const totalEntries = Number(paginator?.total || 0);
  const perPage = Number(paginator?.per_page || itemsPerPage);
  const startIndex = (safePage - 1) * perPage;
  const showingFrom = totalEntries === 0 ? 0 : startIndex + 1;
  const showingTo = totalEntries === 0 ? 0 : Math.min(startIndex + users.length, totalEntries);
  // 1 2 3 ... 12 : the current page with its neighbours, the first and the last
  const pageNumbers = (() => {
    const wanted = new Set([1, totalPages, safePage - 1, safePage, safePage + 1]);
    const sorted = [...wanted].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
    const result = [];
    sorted.forEach((n, i) => {
      if (i > 0 && n - sorted[i - 1] > 1) result.push('...');
      result.push(n);
    });
    return result;
  })();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
        <p className="text-sm text-gray-400">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 p-4 lg:p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <span>Users</span>
        <ChevronRight size={12} />
        <span className="text-gray-700 font-medium">All Users</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg text-gray-900 font-bold">Passengers</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export
          </button>
          <button 
            onClick={handleAddUser}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 text-black text-sm font-semibold rounded-lg shadow-sm hover:bg-yellow-500 transition-colors"
          >
            <UserPlus size={14} /> New User
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by name, mobile, or email..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
            />
            {isRefreshing && (
              <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin" />
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Show</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value) || 10);
                setPage(1);
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm font-bold text-gray-800 bg-white focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 outline-none transition-colors"
            >
              {[10, 25, 50].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            <span>Entries</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex flex-1 flex-col rounded-xl border border-gray-200 bg-white overflow-visible">
        <div className="flex-1 overflow-x-auto overflow-y-visible">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">User</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Gender</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Mobile</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900">Employee Referral</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-900">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 font-medium text-xs flex items-center justify-center">
                        {user.profileImage ? (
                          <img src={user.profileImage} alt={user.name} className="h-full w-full rounded-full object-cover" />
                        ) : (
                          user.name.split(' ').map(n => n[0]).join('')
                        )}
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/users/${user.id}`)}
                          className="text-left text-sm font-medium text-gray-900 hover:text-indigo-600 hover:underline transition-colors"
                        >
                          {user.name}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{user.gender}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{user.phone}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{user.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {user.acquiredByEmployeeName ? (
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{user.acquiredByEmployeeName}</span>
                        <span className="text-xs text-gray-500">
                          {user.acquiredByEmployeeCode || 'Employee referral'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-medium text-gray-500">Not employee referred</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusToggle status={user.status} onToggle={() => handleToggleStatus(user.id, user.status)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="relative">
                      <button 
                        onClick={(e) => toggleMenu(e, user.id)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && (
          <div className="mt-auto border-t border-gray-100 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-gray-500">
            <span>Showing {showingFrom} to {showingTo} of {totalEntries} entries</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1.5 border border-gray-200 rounded text-xs text-gray-600 font-bold disabled:opacity-50 hover:bg-gray-50"
              >
                Prev
              </button>
              {pageNumbers.map((entry, index) => (
                entry === '...' ? (
                  <span key={`gap-${index}`} className="px-1 text-gray-400">...</span>
                ) : (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setPage(entry)}
                    className={`min-w-[32px] px-2.5 py-1.5 rounded text-xs font-bold ${entry === safePage ? 'bg-black text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  >
                    {entry}
                  </button>
                )
              ))}
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded text-xs text-gray-700 font-bold disabled:opacity-50 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {activeMenu &&
        createPortal(
          <div className="fixed inset-0 z-[9999]" onClick={() => setActiveMenu(null)}>
            <div
              className="absolute w-44 bg-white rounded-lg shadow-2xl border border-gray-200 py-1"
              style={{ top: menuPosition.top, left: menuPosition.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => { setActiveMenu(null); navigate(`/admin/users/${activeMenu}`); }} className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-yellow-50 flex items-center gap-2">
                <UserCheck size={13} className="text-gray-500" /> View Profile
              </button>
              <button onClick={() => { setActiveMenu(null); handleEditUser(users.find((item) => item.id === activeMenu)); }} className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-yellow-50 flex items-center gap-2">
                <Edit2 size={13} className="text-gray-500" /> Edit
              </button>
              <button onClick={() => { setActiveMenu(null); handleEditUser(users.find((item) => item.id === activeMenu)); }} className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-yellow-50 flex items-center gap-2">
                <Lock size={13} className="text-gray-500" /> Update Password
              </button>
              <button
                onClick={() => { setActiveMenu(null); handleBlockUser(users.find((item) => item.id === activeMenu)); }}
                className="w-full text-left px-3 py-2 text-xs font-bold text-gray-700 hover:bg-yellow-50 flex items-center gap-2"
              >
                <Ban size={13} className="text-gray-500" />
                {users.find((item) => item.id === activeMenu)?.status === 'Active' ? 'Block User' : 'Unblock User'}
              </button>
              <div className="h-px bg-gray-100 my-1" />
              <button onClick={() => { setActiveMenu(null); handleDeleteUser(activeMenu); }} className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2">
                <Trash2 size={13} className="text-red-500" /> Delete
              </button>
            </div>
          </div>,
          document.body,
        )}

      <UserModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleModalSubmit}
        editingUser={editingUser}
        isLoading={isSubmitting}
      />
    </div>
  );
};

export default UserList;
