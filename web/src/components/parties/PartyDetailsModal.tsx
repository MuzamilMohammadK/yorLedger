import React, { useState } from 'react';
import {
  X,
  Building2,
  User,
  Phone,
  MapPin,
  FileText,
  Calendar,
  BookOpen,
  Edit3,
  Copy,
  Check,
  ShoppingBag,
  Truck,
  Sparkles,
  ArrowUpRight,
  Clock
} from 'lucide-react';
import { Party, formatINR } from '@yorbalance/shared';
import { useNavigate } from 'react-router-dom';

interface PartyDetailsModalProps {
  party: Party | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (party: Party) => void;
}

export const PartyDetailsModal: React.FC<PartyDetailsModalProps> = ({
  party,
  isOpen,
  onClose,
  onEdit
}) => {
  const navigate = useNavigate();
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  if (!isOpen || !party) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPhone(text);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const handleOpenLedger = () => {
    onClose();
    navigate(`/ledger?partyId=${party.id}`);
  };

  const getPartyBadge = (type: string) => {
    switch (type) {
      case 'CUSTOMER':
        return {
          label: 'Customer',
          icon: <ShoppingBag className="w-3.5 h-3.5" />,
          classes: 'bg-blue-50 text-blue-700 border-blue-200'
        };
      case 'SUPPLIER':
        return {
          label: 'Supplier',
          icon: <Truck className="w-3.5 h-3.5" />,
          classes: 'bg-purple-50 text-purple-700 border-purple-200'
        };
      case 'ARTISAN':
        return {
          label: 'Artisan / Weaver',
          icon: <Sparkles className="w-3.5 h-3.5" />,
          classes: 'bg-amber-50 text-amber-700 border-amber-200'
        };
      default:
        return {
          label: type,
          icon: <Building2 className="w-3.5 h-3.5" />,
          classes: 'bg-slate-50 text-slate-700 border-slate-200'
        };
    }
  };

  const badge = getPartyBadge(party.type);
  const balance = party.current_balance || 0;
  const isCustomer = party.type === 'CUSTOMER';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header Card */}
        <div className="p-6 bg-gradient-to-br from-slate-900 via-purple-950 to-indigo-950 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badge.classes} bg-white/95 shadow-sm`}>
              {badge.icon} {badge.label}
            </span>
            {party.gstin && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-purple-200 border border-white/20">
                GST: {party.gstin}
              </span>
            )}
          </div>

          <h2 className="font-serif-display text-2xl font-bold text-white tracking-tight">
            {party.name}
          </h2>

          <div className="flex items-center gap-2 text-xs text-purple-200 mt-1">
            <User className="w-3.5 h-3.5 text-purple-300" />
            <span>Proprietor: <strong className="text-white font-medium">{party.owner_name}</strong></span>
          </div>

          {/* Balance Spotlight Pill */}
          <div className="mt-5 p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-purple-200 font-semibold">
                Current Ledger Balance
              </p>
              <div className="text-2xl font-mono font-bold text-white mt-0.5">
                {formatINR(balance)}
              </div>
            </div>
            <div>
              {balance === 0 ? (
                <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Account Settled
                </span>
              ) : isCustomer ? (
                <span className="px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Receivable (Due from Buyer)
                </span>
              ) : (
                <span className="px-3 py-1 rounded-xl text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Payable (Due to Supplier)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content Details */}
        <div className="p-6 space-y-5 text-xs text-slate-600">
          {/* Contact Numbers */}
          <div>
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Contact Numbers
            </h4>
            <div className="space-y-2">
              {/* Primary Mobile */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Phone className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Primary Mobile</span>
                    <p className="font-mono font-bold text-slate-900 text-xs">{party.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => copyToClipboard(party.phone)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                    title="Copy number"
                  >
                    {copiedPhone === party.phone ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a
                    href={`tel:${party.phone}`}
                    className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-[11px] transition-colors"
                  >
                    Call
                  </a>
                </div>
              </div>

              {/* Additional Numbers */}
              {party.additional_phones && party.additional_phones.map((num, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-400">Alt #{i + 1}:</span>
                    <span className="font-mono font-medium text-slate-800">{num}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyToClipboard(num)}
                      className="p-1 rounded text-slate-400 hover:text-slate-700"
                    >
                      {copiedPhone === num ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                    <a
                      href={`tel:${num}`}
                      className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-[10px]"
                    >
                      Call
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Location & Tax Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1">
                <MapPin className="w-3 h-3" /> Address & Location
              </span>
              <p className="text-slate-800 font-medium leading-relaxed">
                {party.address}
              </p>
              <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 font-medium">
                {party.state} &bull; PIN: <span className="font-mono text-slate-700 font-bold">{party.pin_code}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-1">
                  <FileText className="w-3 h-3" /> Tax Compliance (GST)
                </span>
                {party.gstin ? (
                  <div>
                    <span className="font-mono font-bold text-xs text-slate-900">{party.gstin}</span>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">GST Registered Entity</p>
                  </div>
                ) : (
                  <div>
                    <span className="text-slate-600 font-medium">Unregistered Party</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Weaver / Direct Consumer / Composition</p>
                  </div>
                )}
              </div>

              <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center gap-1 text-[10px] text-slate-400">
                <Calendar className="w-3 h-3" />
                <span>Added: {new Date(party.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {party.notes && (
            <div className="p-3.5 rounded-xl bg-purple-50/60 border border-purple-100 text-purple-950">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block mb-1">
                Internal Shop Notes
              </span>
              <p className="text-xs leading-relaxed text-purple-900">
                {party.notes}
              </p>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              onClose();
              onEdit(party);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" /> Edit Details
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleOpenLedger}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all"
            >
              <BookOpen className="w-4 h-4" /> Open Party Ledger <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

