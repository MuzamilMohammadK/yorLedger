import React, { useState, useEffect } from 'react';
import {
  X,
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
  CheckCircle2
} from 'lucide-react';
import {
  Party,
  PartyType,
  CreatePartyPayload,
  UpdatePartyPayload,
  INDIAN_STATES,
  validateGSTIN,
  normalizePhone,
  validatePinCode,
  getStateCodeByName
} from '@yorbalance/shared';
import { api } from '../../lib/api';

interface PartyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (party: Party) => void;
  initialParty?: Party | null; // If provided, mode is EDIT; otherwise ADD
}

export const PartyFormModal: React.FC<PartyFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialParty
}) => {
  const isEdit = Boolean(initialParty);

  // Form State
  const [type, setType] = useState<PartyType>('CUSTOMER');
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [additionalPhones, setAdditionalPhones] = useState<string[]>([]);
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('Andhra Pradesh (New)');
  const [pinCode, setPinCode] = useState('');
  const [notes, setNotes] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateParty, setDuplicateParty] = useState<Party | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Populate fields on edit or reset on create
  useEffect(() => {
    if (initialParty) {
      setType(initialParty.type);
      setName(initialParty.name);
      setOwnerName(initialParty.owner_name || '');
      setPhone(initialParty.phone || '');
      setAdditionalPhones(initialParty.additional_phones || []);
      setGstin(initialParty.gstin || '');
      setAddress(initialParty.address || '');
      setState(initialParty.state || 'Andhra Pradesh (New)');
      setPinCode(initialParty.pin_code || '');
      setNotes(initialParty.notes || '');
    } else {
      setType('CUSTOMER');
      setName('');
      setOwnerName('');
      setPhone('');
      setAdditionalPhones([]);
      setGstin('');
      setAddress('');
      setState('Andhra Pradesh (New)');
      setPinCode('');
      setNotes('');
    }
    setFormErrors({});
    setDuplicateWarning(null);
    setDuplicateParty(null);
    setServerError(null);
  }, [initialParty, isOpen]);

  // Handle dynamic additional phones
  const handleAddPhone = () => {
    if (additionalPhones.length >= 4) return;
    setAdditionalPhones(prev => [...prev, '']);
  };

  const handleUpdateAdditionalPhone = (index: number, value: string) => {
    setAdditionalPhones(prev => {
      const copy = [...prev];
      copy[index] = value;
      return copy;
    });
  };

  const handleRemovePhone = (index: number) => {
    setAdditionalPhones(prev => prev.filter((_, i) => i !== index));
  };

  // Debounced duplicate detection
  useEffect(() => {
    if (!isOpen || isEdit) return;
    const cleanPhone = phone.trim();
    const cleanGstin = gstin.trim();

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
  }, [phone, gstin, isOpen, isEdit]);

  // Form submission validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Shop / Business name is required';
    }

    if (!ownerName.trim()) {
      errors.ownerName = 'Owner name is required';
    }

    const normPhone = normalizePhone(phone);
    if (!normPhone) {
      errors.phone = 'Please enter a valid 10-digit Indian mobile number';
    }

    // Additional mobile numbers
    additionalPhones.forEach((p, idx) => {
      if (p.trim()) {
        const norm = normalizePhone(p);
        if (!norm) {
          errors[`additional_phone_${idx}`] = 'Invalid 10-digit mobile number';
        }
      }
    });

    // Optional GSTIN
    if (gstin.trim()) {
      const gstinRes = validateGSTIN(gstin.trim(), false);
      if (!gstinRes.valid) {
        errors.gstin = gstinRes.error || 'Invalid 15-character GSTIN format';
      }
    }

    if (!address.trim()) {
      errors.address = 'Full business address is required';
    }

    if (!state.trim()) {
      errors.state = 'State is required';
    }

    if (!pinCode.trim() || !validatePinCode(pinCode)) {
      errors.pinCode = 'Valid 6-digit postal PIN code is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setServerError(null);

    const normPhone = normalizePhone(phone)!;
    const cleanAdditionals = additionalPhones
      .map(p => normalizePhone(p))
      .filter((p): p is string => Boolean(p));

    const stateCode = getStateCodeByName(state) || '37';

    try {
      if (isEdit && initialParty) {
        const updatePayload: UpdatePartyPayload = {
          name: name.trim(),
          type,
          owner_name: ownerName.trim(),
          phone: normPhone,
          additional_phones: cleanAdditionals,
          gstin: gstin.trim() ? gstin.trim().toUpperCase() : null,
          address: address.trim(),
          state: state.trim(),
          state_code: stateCode,
          pin_code: pinCode.trim(),
          notes: notes.trim() || null
        };
        const res = await api.updateParty(initialParty.id, updatePayload);
        onSuccess(res.party);
        onClose();
      } else {
        const createPayload: CreatePartyPayload = {
          name: name.trim(),
          type,
          owner_name: ownerName.trim(),
          phone: normPhone,
          additional_phones: cleanAdditionals,
          gstin: gstin.trim() ? gstin.trim().toUpperCase() : null,
          address: address.trim(),
          state: state.trim(),
          state_code: stateCode,
          pin_code: pinCode.trim(),
          notes: notes.trim() || null
        };
        const res = await api.createParty(createPayload);
        onSuccess(res.party);
        onClose();
      }
    } catch (err: any) {
      console.error('Save party error:', err);
      setServerError(err.message || 'Failed to save party. Please verify details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-purple-200 backdrop-blur-md">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif-display text-lg font-bold">
                {isEdit ? 'Edit Party Information' : 'Register New Party'}
              </h2>
              <p className="text-xs text-purple-200">
                {isEdit
                  ? 'Update business contact, address, and credit parameters'
                  : 'Add a customer, silk raw material supplier, or weaver to your shop ledger'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {serverError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Duplicate Warning Banner */}
          {duplicateWarning && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>Possible Duplicate Party Detected</span>
              </div>
              <p className="text-amber-700">{duplicateWarning}</p>
              {duplicateParty && (
                <div className="pt-1 text-[11px] text-amber-800 bg-white/60 p-2 rounded-xl mt-1">
                  <strong>Existing Record:</strong> {duplicateParty.name} ({duplicateParty.type}) &bull; Mobile: {duplicateParty.phone} &bull; Owner: {duplicateParty.owner_name}
                </div>
              )}
            </div>
          )}

          {/* Section 1: Party Type Segmented Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Party Type <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setType('CUSTOMER')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  type === 'CUSTOMER'
                    ? 'border-blue-500 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-slate-50/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 ${
                  type === 'CUSTOMER' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold">Customer</span>
                <span className="text-[10px] text-slate-500 mt-0.5">Saree Buyer / Retailer</span>
              </button>

              <button
                type="button"
                onClick={() => setType('SUPPLIER')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  type === 'SUPPLIER'
                    ? 'border-purple-500 bg-purple-50/70 text-purple-900 ring-2 ring-purple-500/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-slate-50/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 ${
                  type === 'SUPPLIER' ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <Truck className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold">Supplier</span>
                <span className="text-[10px] text-slate-500 mt-0.5">Raw Silk / Zari Mills</span>
              </button>

              <button
                type="button"
                onClick={() => setType('ARTISAN')}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all ${
                  type === 'ARTISAN'
                    ? 'border-amber-500 bg-amber-50/70 text-amber-900 ring-2 ring-amber-500/20 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600 bg-slate-50/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 ${
                  type === 'ARTISAN' ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold">Artisan</span>
                <span className="text-[10px] text-slate-500 mt-0.5">Weaver / Job Work</span>
              </button>
            </div>
          </div>

          {/* Section 2: Business & Owner Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Shop / Business Name <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Meenakshi Bridal Sarees"
                  className={`w-full pl-10 pr-3 py-2.5 bg-slate-50/80 border rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    formErrors.name ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                  }`}
                />
              </div>
              {formErrors.name && (
                <p className="text-[11px] text-rose-500 mt-1">{formErrors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Owner / Contact Person <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={ownerName}
                  onChange={e => setOwnerName(e.target.value)}
                  placeholder="e.g. Meenakshi Sundaram"
                  className={`w-full pl-10 pr-3 py-2.5 bg-slate-50/80 border rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    formErrors.ownerName ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                  }`}
                />
              </div>
              {formErrors.ownerName && (
                <p className="text-[11px] text-rose-500 mt-1">{formErrors.ownerName}</p>
              )}
            </div>
          </div>

          {/* Section 3: Contact Details (Primary + Dynamic Additional Numbers) */}
          <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200/80">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Mobile Numbers <span className="text-rose-500">*</span>
              </label>
              {additionalPhones.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddPhone}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Another Number
                </button>
              )}
            </div>

            <div>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  maxLength={10}
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="Primary 10-digit mobile number"
                  className={`w-full pl-10 pr-3 py-2.5 bg-white border rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    formErrors.phone ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                  }`}
                />
              </div>
              {formErrors.phone && (
                <p className="text-[11px] text-rose-500 mt-1">{formErrors.phone}</p>
              )}
            </div>

            {/* Additional Mobile Numbers List */}
            {additionalPhones.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    maxLength={10}
                    value={p}
                    onChange={e => handleUpdateAdditionalPhone(idx, e.target.value.replace(/\D/g, ''))}
                    placeholder={`Additional mobile #${idx + 1}`}
                    className={`w-full pl-10 pr-3 py-2 bg-white border rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
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

          {/* Section 4: GSTIN (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                GSTIN <span className="text-slate-400 font-normal">(Optional for weavers/unregistered buyers)</span>
              </label>
              {gstin && validateGSTIN(gstin, false).valid && (
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Valid GST Format
                </span>
              )}
            </div>
            <div className="relative">
              <FileText className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                maxLength={15}
                value={gstin}
                onChange={e => setGstin(e.target.value.toUpperCase())}
                placeholder="15-digit GSTIN (e.g. 36AAACM8401P1Z3)"
                className={`w-full pl-10 pr-3 py-2.5 bg-slate-50/80 border rounded-xl text-xs font-mono font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                  formErrors.gstin ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                }`}
              />
            </div>
            {formErrors.gstin && (
              <p className="text-[11px] text-rose-500 mt-1">{formErrors.gstin}</p>
            )}
          </div>

          {/* Section 5: Address, State, and PIN Code */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <textarea
                  rows={2}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Shop number, street, textile market, area"
                  className={`w-full pl-10 pr-3 py-2.5 bg-slate-50/80 border rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    formErrors.address ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                  }`}
                />
              </div>
              {formErrors.address && (
                <p className="text-[11px] text-rose-500 mt-1">{formErrors.address}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  State <span className="text-rose-500">*</span>
                </label>
                <select
                  value={state}
                  onChange={e => setState(e.target.value)}
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
                  value={pinCode}
                  onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit PIN code (e.g. 515671)"
                  className={`w-full px-3 py-2.5 bg-slate-50/80 border rounded-xl text-xs font-mono font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${
                    formErrors.pinCode ? 'border-rose-400 ring-1 ring-rose-400' : 'border-slate-200'
                  }`}
                />
                {formErrors.pinCode && (
                  <p className="text-[11px] text-rose-500 mt-1">{formErrors.pinCode}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 6: Notes (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Internal Ledger Notes <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Credit terms, special loom design details, delivery preferences, etc."
              className="w-full px-3 py-2 bg-slate-50/80 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
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
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Party...
                </>
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Create Party Record'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

