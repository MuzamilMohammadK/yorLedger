import React, { useState, useEffect } from 'react';
import {
  Building2,
  User,
  Phone,
  Plus,
  Trash2,
  FileText,
  MapPin,
  AlertTriangle,
  Loader2,
  ShoppingBag,
  Truck,
  Sparkles,
  CheckCircle2,
  ArrowLeft,
  BookOpen,
  PlusCircle,
  Users
} from 'lucide-react';
import {
  Party,
  PartyType,
  CreatePartyPayload,
  INDIAN_STATES,
  validateGSTIN,
  normalizePhone,
  validatePinCode,
  getStateCodeByName
} from '@yorbalance/shared';
import { api } from '../../lib/api';

export interface NewPartyFormData {
  type: PartyType;
  name: string;
  ownerName: string;
  phone: string;
  additionalPhones: string[];
  gstin: string;
  address: string;
  state: string;
  pinCode: string;
  notes: string;
}

interface NewPartyEntryViewProps {
  formData: NewPartyFormData;
  onFormChange: (data: NewPartyFormData) => void;
  onCancel: () => void;
  onSuccess: (party: Party, action: 'open_ledger' | 'add_transaction' | 'add_another') => void;
}

export const NewPartyEntryView: React.FC<NewPartyEntryViewProps> = ({
  formData,
  onFormChange,
  onCancel,
  onSuccess
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateParty, setDuplicateParty] = useState<Party | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedParty, setSavedParty] = useState<Party | null>(null);

  const updateField = <K extends keyof NewPartyFormData>(field: K, value: NewPartyFormData[K]) => {
    onFormChange({
      ...formData,
      [field]: value
    });
  };

  // Dynamic additional mobile numbers
  const handleAddPhone = () => {
    if (formData.additionalPhones.length >= 4) return;
    updateField('additionalPhones', [...formData.additionalPhones, '']);
  };

  const handleUpdatePhone = (index: number, val: string) => {
    const copy = [...formData.additionalPhones];
    copy[index] = val;
    updateField('additionalPhones', copy);
  };

  const handleRemovePhone = (index: number) => {
    updateField('additionalPhones', formData.additionalPhones.filter((_, i) => i !== index));
  };

  // Debounced duplicate detection
  useEffect(() => {
    const cleanPhone = formData.phone.trim();
    const cleanGstin = formData.gstin.trim();

    if (cleanPhone.length >= 10 || cleanGstin.length >= 15) {
      const timer = setTimeout(async () => {
        try {
          const res = await api.checkDuplicateParty({
            phone: cleanPhone,
            gstin: cleanGstin || undefined
          });
          if (res.isDuplicate && res.existingParty) {
            setDuplicateWarning(res.message || 'A matching party already exists in your records.');
            setDuplicateParty(res.existingParty);
          } else {
            setDuplicateWarning(null);
            setDuplicateParty(null);
          }
        } catch {}
      }, 500);

      return () => clearTimeout(timer);
    } else {
      setDuplicateWarning(null);
      setDuplicateParty(null);
    }
  }, [formData.phone, formData.gstin]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Shop / Business name is required';
    }

    if (!formData.ownerName.trim()) {
      errors.ownerName = 'Owner / Proprietor name is required';
    }

    const normPhone = normalizePhone(formData.phone);
    if (!normPhone) {
      errors.phone = 'Valid 10-digit Indian mobile number is required';
    }

    formData.additionalPhones.forEach((p, idx) => {
      if (p.trim()) {
        const norm = normalizePhone(p);
        if (!norm) {
          errors[`additional_phone_${idx}`] = 'Invalid 10-digit mobile number';
        }
      }
    });

    if (formData.gstin.trim()) {
      const gstinRes = validateGSTIN(formData.gstin.trim(), false);
      if (!gstinRes.valid) {
        errors.gstin = gstinRes.error || 'Invalid 15-character GSTIN format';
      }
    }

    if (!formData.address.trim()) {
      errors.address = 'Full business address is required';
    }

    if (!formData.state.trim()) {
      errors.state = 'State is required';
    }

    if (!formData.pinCode.trim() || !validatePinCode(formData.pinCode)) {
      errors.pinCode = 'Valid 6-digit postal PIN code is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setServerError(null);

    const normPhone = normalizePhone(formData.phone)!;
    const cleanAdditionals = formData.additionalPhones
      .map(p => normalizePhone(p))
      .filter((p): p is string => Boolean(p));

    const stateCode = getStateCodeByName(formData.state) || '37';

    try {
      const payload: CreatePartyPayload = {
        name: formData.name.trim(),
        type: formData.type,
        owner_name: formData.ownerName.trim(),
        phone: normPhone,
        additional_phones: cleanAdditionals,
        gstin: formData.gstin.trim() ? formData.gstin.trim().toUpperCase() : null,
        address: formData.address.trim(),
        state: formData.state.trim(),
        state_code: stateCode,
        pin_code: formData.pinCode.trim(),
        notes: formData.notes.trim() || null
      };

      const res = await api.createParty(payload);
      setSavedParty(res.party);
    } catch (err: any) {
      console.error('Create party error:', err);
      setServerError(err.message || 'Failed to register party. Please verify information and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // If saved, render the post-save celebration & next actions card
  if (savedParty) {
    return (
      <div className="max-w-xl mx-auto py-6 px-4 animate-in fade-in zoom-in-95">
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-6 sm:p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
              Registration Complete
            </span>
            <h2 className="font-serif-display text-2xl font-bold text-slate-900 mt-2">
              {savedParty.name}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Registered as <strong className="text-purple-700 capitalize">{savedParty.type.toLowerCase()}</strong> &bull; Mobile: {savedParty.phone}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-left text-xs space-y-1.5 text-slate-600">
            <p><strong>Owner:</strong> {savedParty.owner_name}</p>
            <p><strong>Address:</strong> {savedParty.address}, {savedParty.state} - {savedParty.pin_code}</p>
            {savedParty.gstin && <p><strong>GSTIN:</strong> {savedParty.gstin}</p>}
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={() => onSuccess(savedParty, 'open_ledger')}
              className="w-full py-3 px-4 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
            >
              <BookOpen className="w-4 h-4" /> Open Party Ledger
            </button>

            <button
              onClick={() => onSuccess(savedParty, 'add_transaction')}
              className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 transition-all"
            >
              <PlusCircle className="w-4 h-4" /> Add First Transaction (Bill / Voucher)
            </button>

            <button
              onClick={() => {
                setSavedParty(null);
                onSuccess(savedParty, 'add_another');
              }}
              className="w-full py-2.5 px-4 rounded-2xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <Users className="w-4 h-4 text-slate-500" /> Add Another Party
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-20">
      {/* Mobile Screen Header with Swipe Hint */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Return to Ledger"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-serif-display text-lg font-bold text-slate-900">
              New Party Entry
            </h2>
            <p className="text-[11px] text-slate-400">
              Swipe right anywhere or tap Cancel to return to Ledger
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Main Registration Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {serverError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Duplicate Warning */}
          {duplicateWarning && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Possible Duplicate Party</span>
              </div>
              <p className="text-amber-700">{duplicateWarning}</p>
              {duplicateParty && (
                <div className="p-2 rounded-xl bg-white/70 text-[11px] text-amber-900 mt-1">
                  Existing Record: <strong>{duplicateParty.name}</strong> &bull; {duplicateParty.phone} ({duplicateParty.type})
                </div>
              )}
            </div>
          )}

          {/* Party Type Segmented Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Party Type <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => updateField('type', 'CUSTOMER')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  formData.type === 'CUSTOMER'
                    ? 'border-blue-500 bg-blue-50/80 text-blue-900 ring-2 ring-blue-500/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-slate-50/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1 ${
                  formData.type === 'CUSTOMER' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold">Customer</span>
                <span className="text-[10px] text-slate-400">Buyer</span>
              </button>

              <button
                type="button"
                onClick={() => updateField('type', 'SUPPLIER')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  formData.type === 'SUPPLIER'
                    ? 'border-purple-500 bg-purple-50/80 text-purple-900 ring-2 ring-purple-500/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-slate-50/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1 ${
                  formData.type === 'SUPPLIER' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <Truck className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold">Supplier</span>
                <span className="text-[10px] text-slate-400">Yarn / Zari</span>
              </button>

              <button
                type="button"
                onClick={() => updateField('type', 'ARTISAN')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  formData.type === 'ARTISAN'
                    ? 'border-amber-500 bg-amber-50/80 text-amber-900 ring-2 ring-amber-500/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-slate-50/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1 ${
                  formData.type === 'ARTISAN' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold">Artisan</span>
                <span className="text-[10px] text-slate-400">Weaver</span>
              </button>
            </div>
          </div>

          {/* Business & Owner Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shop / Business Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => updateField('name', e.target.value)}
                  placeholder="e.g. Meenakshi Bridal Sarees"
                  className={`w-full pl-9 pr-3 py-2.5 bg-slate-50/80 border rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    formErrors.name ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                  }`}
                />
              </div>
              {formErrors.name && <p className="text-[11px] text-rose-500 mt-1">{formErrors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Owner / Proprietor Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={formData.ownerName}
                  onChange={e => updateField('ownerName', e.target.value)}
                  placeholder="e.g. Meenakshi Sundaram"
                  className={`w-full pl-9 pr-3 py-2.5 bg-slate-50/80 border rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    formErrors.ownerName ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                  }`}
                />
              </div>
              {formErrors.ownerName && <p className="text-[11px] text-rose-500 mt-1">{formErrors.ownerName}</p>}
            </div>
          </div>

          {/* Primary Mobile & Additional Mobile Numbers */}
          <div className="p-3.5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Mobile Numbers <span className="text-rose-500">*</span>
              </label>
              {formData.additionalPhones.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddPhone}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Another Mobile
                </button>
              )}
            </div>

            <div>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  maxLength={10}
                  value={formData.phone}
                  onChange={e => updateField('phone', e.target.value.replace(/\D/g, ''))}
                  placeholder="Primary 10-digit mobile number"
                  className={`w-full pl-9 pr-3 py-2.5 bg-white border rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    formErrors.phone ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                  }`}
                />
              </div>
              {formErrors.phone && <p className="text-[11px] text-rose-500 mt-1">{formErrors.phone}</p>}
            </div>

            {formData.additionalPhones.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    maxLength={10}
                    value={p}
                    onChange={e => handleUpdatePhone(idx, e.target.value.replace(/\D/g, ''))}
                    placeholder={`Additional mobile #${idx + 1}`}
                    className={`w-full pl-9 pr-3 py-2 bg-white border rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                      formErrors[`additional_phone_${idx}`] ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                    }`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemovePhone(idx)}
                  className="w-8 h-8 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                  title="Remove number"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* GSTIN (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                GSTIN <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              {formData.gstin && validateGSTIN(formData.gstin, false).valid && (
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Valid GSTIN
                </span>
              )}
            </div>
            <div className="relative">
              <FileText className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                maxLength={15}
                value={formData.gstin}
                onChange={e => updateField('gstin', e.target.value.toUpperCase())}
                placeholder="15-digit GSTIN (e.g. 36AAACM8401P1Z3)"
                className={`w-full pl-9 pr-3 py-2.5 bg-slate-50/80 border rounded-xl text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                  formErrors.gstin ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                }`}
              />
            </div>
            {formErrors.gstin && <p className="text-[11px] text-rose-500 mt-1">{formErrors.gstin}</p>}
          </div>

          {/* Address, State, PIN Code */}
          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <textarea
                  rows={2}
                  value={formData.address}
                  onChange={e => updateField('address', e.target.value)}
                  placeholder="Shop number, street, textile bazaar, landmark"
                  className={`w-full pl-9 pr-3 py-2 bg-slate-50/80 border rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    formErrors.address ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                  }`}
                />
              </div>
              {formErrors.address && <p className="text-[11px] text-rose-500 mt-1">{formErrors.address}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  State <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.state}
                  onChange={e => updateField('state', e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                >
                  {INDIAN_STATES.map(s => (
                    <option key={s.code} value={s.name}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Postal PIN Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={formData.pinCode}
                  onChange={e => updateField('pinCode', e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit PIN code"
                  className={`w-full px-3 py-2.5 bg-slate-50/80 border rounded-xl text-xs font-mono font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    formErrors.pinCode ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                  }`}
                />
                {formErrors.pinCode && <p className="text-[11px] text-rose-500 mt-1">{formErrors.pinCode}</p>}
              </div>
            </div>
          </div>

          {/* Notes (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Internal Shop / Credit Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={e => updateField('notes', e.target.value)}
              placeholder="e.g. 15-day settlement cycle, Jacquard weave specialist"
              className="w-full px-3 py-2 bg-slate-50/80 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving Party...
                </>
              ) : (
                'Save Party Record'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

