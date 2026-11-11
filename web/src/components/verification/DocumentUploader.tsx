import React, { useRef, useState } from 'react';
import { ImagePlus, RefreshCw, Trash2, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { REQUIRED_SHOP_DOCUMENTS, SHOP_DOCUMENT_TYPES, ShopDocument, ShopDocumentType, ShopDocumentUpload } from '@yorbalance/shared';
import { useI18n } from '../../i18n';
import { MAX_DOC_INPUT_BYTES, compressJpeg, isJpeg } from '../../lib/image';

export interface DocSlotState {
  /** Newly chosen file (to upload on submit). */
  upload?: ShopDocumentUpload;
  /** Already stored document (resubmission / review). */
  stored?: ShopDocument;
  /** Stored document the user removed. */
  removed?: boolean;
}

interface Props {
  value: Partial<Record<ShopDocumentType, DocSlotState>>;
  onChange: (next: Partial<Record<ShopDocumentType, DocSlotState>>) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

const STATUS = {
  PENDING: { icon: Clock, cls: 'text-amber-700' },
  APPROVED: { icon: CheckCircle2, cls: 'text-emerald-700' },
  REJECTED: { icon: XCircle, cls: 'text-rose-700' }
} as const;

/** §4.6: four document slots — JPEG only, size check, preview, replace / remove, status + admin comment. */
export const DocumentUploader: React.FC<Props> = ({ value, onChange, errors = {}, disabled }) => {
  const { t } = useI18n();
  const inputs = useRef<Partial<Record<ShopDocumentType, HTMLInputElement | null>>>({});
  const [busy, setBusy] = useState<ShopDocumentType | null>(null);
  const [slotError, setSlotError] = useState<Partial<Record<ShopDocumentType, string>>>({});

  const pick = async (type: ShopDocumentType, file?: File) => {
    if (!file) return;
    setSlotError(e => ({ ...e, [type]: undefined }));
    if (!isJpeg(file)) { setSlotError(e => ({ ...e, [type]: t('only_jpeg') })); return; }
    if (file.size > MAX_DOC_INPUT_BYTES) { setSlotError(e => ({ ...e, [type]: t('photo_too_big') })); return; }
    setBusy(type);
    try {
      const data_url = await compressJpeg(file);
      onChange({ ...value, [type]: { ...value[type], upload: { type, data_url, file_name: file.name }, removed: false } });
    } catch {
      setSlotError(e => ({ ...e, [type]: t('photo_too_big') }));
    } finally {
      setBusy(null);
    }
  };

  const remove = (type: ShopDocumentType) => {
    const cur = value[type];
    onChange({ ...value, [type]: cur?.stored ? { stored: cur.stored, removed: true } : {} });
  };

  return (
    <div className="space-y-3">
      {SHOP_DOCUMENT_TYPES.map(type => {
        const slot = value[type] ?? {};
        const preview = slot.upload?.data_url ?? (!slot.removed ? slot.stored?.data_url : undefined);
        const name = slot.upload?.file_name ?? (!slot.removed ? slot.stored?.file_name : undefined);
        const required = REQUIRED_SHOP_DOCUMENTS.includes(type);
        const st = !slot.upload && !slot.removed ? slot.stored?.verification_status : undefined;
        const S = st ? STATUS[st] : null;
        const err = slotError[type] ?? errors[`documents.${type}`];
        return (
          <div key={type} className={`rounded-2xl border-2 p-3 ${err ? 'border-rose-300' : 'border-slate-200'}`}>
            <input ref={el => { inputs.current[type] = el; }} type="file" accept=".jpg,.jpeg,image/jpeg" className="hidden"
              onChange={e => { pick(type, e.target.files?.[0]); e.target.value = ''; }} />
            <div className="flex items-start gap-3">
              <div className="w-20 h-20 shrink-0 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center">
                {busy === type ? <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  : preview ? <img src={preview} alt={t(`doc_${type}` as any)} className="w-full h-full object-cover" />
                  : <ImagePlus className="w-7 h-7 text-slate-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-slate-900">{t(`doc_${type}` as any)}</p>
                <p className="text-sm text-slate-500">{required ? t('doc_required') : t('doc_optional')}{name ? ` · ${name}` : ''}</p>
                {busy === type && <p className="text-sm text-slate-600">{t('preparing_photo')}</p>}
                {S && st && (
                  <p className={`text-sm font-semibold flex items-center gap-1 ${S.cls}`}><S.icon className="w-4 h-4" /> {t(`doc_status_${st}` as any)}</p>
                )}
                {st && slot.stored?.admin_comment && <p className="text-sm text-slate-700">{t('admin_comment')}: {slot.stored.admin_comment}</p>}
                {err && <p className="text-sm text-rose-600">{err}</p>}
              </div>
            </div>
            {!disabled && (
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => inputs.current[type]?.click()} disabled={busy !== null}
                  className="flex-1 h-11 rounded-xl border-2 border-indigo-300 text-indigo-800 text-base font-semibold flex items-center justify-center gap-2">
                  {preview ? <><RefreshCw className="w-5 h-5" /> {t('replace')}</> : <><ImagePlus className="w-5 h-5" /> {t('add_photo')}</>}
                </button>
                {preview && (
                  <button type="button" onClick={() => remove(type)}
                    className="h-11 px-4 rounded-xl border-2 border-slate-200 text-slate-700 text-base font-semibold flex items-center gap-2">
                    <Trash2 className="w-5 h-5" /> {t('remove')}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export function uploadsOf(v: Partial<Record<ShopDocumentType, DocSlotState>>): ShopDocumentUpload[] {
  return Object.values(v).flatMap(s => (s?.upload ? [s.upload] : []));
}
export function removedOf(v: Partial<Record<ShopDocumentType, DocSlotState>>): ShopDocumentType[] {
  return (Object.entries(v) as [ShopDocumentType, DocSlotState][]).filter(([, s]) => s?.removed && !s.upload).map(([k]) => k);
}
