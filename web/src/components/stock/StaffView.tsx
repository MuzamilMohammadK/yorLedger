import React, { useState } from 'react';
import { Plus, Users, Calendar, DollarSign, CheckCircle2, X, Phone, Briefcase, Clock } from 'lucide-react';
import { StaffSummary, StaffWageType, StaffRecordType, formatPaiseToINR } from '@yorbalance/shared';
import { api } from '../../lib/api';
import { todayIST } from '../../lib/data/util';
import { useI18n } from '../../i18n';

interface Props {
  staff: StaffSummary[];
  onRefresh: () => void;
}

export const StaffView: React.FC<Props> = ({ staff, onRefresh }) => {
  const { fmtDate } = useI18n();
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [recordActionOpen, setRecordActionOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');

  const [staffForm, setStaffForm] = useState<{
    name: string;
    role: string;
    phone: string;
    wage_type: StaffWageType;
    wage_amount: string;
    joining_date: string;
  }>({
    name: '',
    role: 'Master Weaver',
    phone: '',
    wage_type: 'MONTHLY',
    wage_amount: '',
    joining_date: todayIST()
  });

  const [recordForm, setRecordForm] = useState<{
    staff_id: string;
    record_type: StaffRecordType;
    date: string;
    attendance_status: 'PRESENT' | 'ABSENT' | 'HALF_DAY';
    amount: string;
    notes: string;
  }>({
    staff_id: '',
    record_type: 'ATTENDANCE',
    date: todayIST(),
    attendance_status: 'PRESENT',
    amount: '',
    notes: ''
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalStaff = staff.length;
  const activeStaff = staff.filter(s => s.staff.status === 'ACTIVE').length;
  const totalAdvancesPaise = staff.reduce((sum, s) => sum + s.total_advances_paise, 0);
  const totalPendingSalaryPaise = staff.reduce((sum, s) => sum + s.pending_salary_paise, 0);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffForm.name.trim() || !staffForm.wage_amount) {
      setError('Please provide staff name and wage amount');
      return;
    }
    const wagePaise = Math.round(parseFloat(staffForm.wage_amount) * 100);

    setBusy(true);
    setError(null);
    try {
      await api.createStaff({
        name: staffForm.name.trim(),
        role: staffForm.role.trim(),
        phone: staffForm.phone.trim(),
        wage_type: staffForm.wage_type,
        wage_amount_paise: wagePaise,
        joining_date: staffForm.joining_date
      });
      setAddStaffOpen(false);
      setStaffForm({
        name: '',
        role: 'Master Weaver',
        phone: '',
        wage_type: 'MONTHLY',
        wage_amount: '',
        joining_date: todayIST()
      });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to add staff member');
    } finally {
      setBusy(false);
    }
  };

  const handleRecordAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordForm.staff_id) {
      setError('Please select staff member');
      return;
    }
    const amountPaise = recordForm.amount ? Math.round(parseFloat(recordForm.amount) * 100) : undefined;

    setBusy(true);
    setError(null);
    try {
      await api.recordStaffRecord({
        staff_id: recordForm.staff_id,
        record_type: recordForm.record_type,
        date: recordForm.date,
        attendance_status: recordForm.record_type === 'ATTENDANCE' ? recordForm.attendance_status : undefined,
        amount_paise: amountPaise,
        notes: recordForm.notes.trim() || null
      });
      setRecordActionOpen(false);
      setRecordForm({
        staff_id: '',
        record_type: 'ATTENDANCE',
        date: todayIST(),
        attendance_status: 'PRESENT',
        amount: '',
        notes: ''
      });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to record entry');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Staff Members</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{totalStaff}</span>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{activeStaff} active</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Total Advances Paid</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-amber-600">{formatPaiseToINR(totalAdvancesPaise)}</span>
            <span className="text-xs font-medium text-slate-500">to be adjusted</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Estimated Pending Salary</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl sm:text-2xl font-extrabold text-slate-900">{formatPaiseToINR(totalPendingSalaryPaise)}</span>
            <span className="text-xs font-medium text-slate-500">after advances</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Roles Represented</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-extrabold text-brand-900">
              {new Set(staff.map(s => s.staff.role)).size}
            </span>
            <span className="text-xs font-medium text-slate-500">weaver, helper, etc.</span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="text-base font-bold text-slate-900">Staff Register & Payroll</h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRecordActionOpen(true)}
            className="h-11 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Clock className="w-4 h-4 text-brand-900" />
            <span>Attendance / Advance</span>
          </button>

          <button
            type="button"
            onClick={() => setAddStaffOpen(true)}
            className="h-11 px-4 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Staff</span>
          </button>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Staff Name</th>
                <th className="py-3.5 px-3">Role</th>
                <th className="py-3.5 px-3">Wage / Salary Rate</th>
                <th className="py-3.5 px-3">Joined On</th>
                <th className="py-3.5 px-3 text-right">Present (This Mo.)</th>
                <th className="py-3.5 px-3 text-right">Advances Paid</th>
                <th className="py-3.5 px-4 text-right">Pending Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-base font-semibold">No staff records added yet.</p>
                    <p className="text-xs">Click "Add Staff" to track employees, monthly/daily wages, and attendance.</p>
                  </td>
                </tr>
              ) : (
                staff.map(s => (
                  <tr key={s.staff.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-bold text-slate-900 block">{s.staff.name}</span>
                        {s.staff.phone && (
                          <span className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" /> {s.staff.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                        {s.staff.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="font-bold text-slate-800 font-mono">
                        {formatPaiseToINR(s.staff.wage_amount_paise)}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">
                        /{s.staff.wage_type === 'MONTHLY' ? 'mo' : s.staff.wage_type === 'DAILY' ? 'day' : 'piece'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-xs text-slate-600">
                      {fmtDate(s.staff.joining_date)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-bold text-emerald-700 font-mono">
                      {s.days_present_this_month} days
                    </td>
                    <td className="py-3.5 px-3 text-right font-bold text-amber-700 font-mono">
                      {formatPaiseToINR(s.total_advances_paise)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-slate-900 font-mono">
                      {formatPaiseToINR(s.pending_salary_paise)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff Modal */}
      {addStaffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Add Staff Member</h3>
            <p className="text-xs text-slate-500 mb-4">Register in-house masters, helpers, salesmen, and weavers.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateStaff} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Anand Kumar"
                  value={staffForm.name}
                  onChange={e => setStaffForm({ ...staffForm, name: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Role / Job Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Master Weaver, Sales"
                    value={staffForm.role}
                    onChange={e => setStaffForm({ ...staffForm, role: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="10-digit mobile"
                    value={staffForm.phone}
                    onChange={e => setStaffForm({ ...staffForm, phone: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Wage / Salary Type</label>
                  <select
                    value={staffForm.wage_type}
                    onChange={e => setStaffForm({ ...staffForm, wage_type: e.target.value as StaffWageType })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  >
                    <option value="MONTHLY">Monthly Salary</option>
                    <option value="DAILY">Daily Wage</option>
                    <option value="PIECE_RATE">Piece Rate</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="₹ Rate"
                    value={staffForm.wage_amount}
                    onChange={e => setStaffForm({ ...staffForm, wage_amount: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-bold focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Joining Date</label>
                <input
                  type="date"
                  required
                  value={staffForm.joining_date}
                  onChange={e => setStaffForm({ ...staffForm, joining_date: e.target.value })}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddStaffOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Attendance / Advance Modal */}
      {recordActionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-900 mb-1">Record Staff Action</h3>
            <p className="text-xs text-slate-500 mb-4">Mark daily attendance or record wage advance payment.</p>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleRecordAction} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Staff Member</label>
                <select
                  required
                  value={recordForm.staff_id}
                  onChange={e => setRecordForm({ ...recordForm, staff_id: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                >
                  <option value="">Select Staff Member...</option>
                  {staff.map(s => (
                    <option key={s.staff.id} value={s.staff.id}>
                      {s.staff.name} ({s.staff.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Record Type</label>
                  <select
                    value={recordForm.record_type}
                    onChange={e => setRecordForm({ ...recordForm, record_type: e.target.value as StaffRecordType })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  >
                    <option value="ATTENDANCE">Attendance</option>
                    <option value="ADVANCE">Advance Paid</option>
                    <option value="SALARY_PAY">Salary Settlement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={recordForm.date}
                    onChange={e => setRecordForm({ ...recordForm, date: e.target.value })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  />
                </div>
              </div>

              {recordForm.record_type === 'ATTENDANCE' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Attendance Status</label>
                  <select
                    value={recordForm.attendance_status}
                    onChange={e => setRecordForm({ ...recordForm, attendance_status: e.target.value as any })}
                    className="w-full h-11 px-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                  >
                    <option value="PRESENT">Full Day Present</option>
                    <option value="HALF_DAY">Half Day</option>
                    <option value="ABSENT">Absent</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="₹ Amount paid"
                    value={recordForm.amount}
                    onChange={e => setRecordForm({ ...recordForm, amount: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-xl border border-slate-300 text-sm font-bold focus:border-brand-700 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes or remarks"
                  value={recordForm.notes}
                  onChange={e => setRecordForm({ ...recordForm, notes: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-300 text-sm focus:border-brand-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRecordActionOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2.5 rounded-xl bg-brand-900 hover:bg-brand-950 text-white text-sm font-bold shadow-md transition-colors disabled:opacity-50"
                >
                  {busy ? 'Saving...' : 'Record Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
