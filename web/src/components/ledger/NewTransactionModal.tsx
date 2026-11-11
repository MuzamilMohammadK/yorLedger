import React from 'react';
import { Party, Transaction } from '@yorbalance/shared';
import { useI18n } from '../../i18n';
import { Sheet } from '../ui/Sheet';
import { BillForm, DraftBill } from './BillForm';

export type { DraftBill, DraftItem } from './BillForm';
export { Sheet } from '../ui/Sheet';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tx: Transaction) => void;
  parties: Party[];
  preselectedPartyId?: string | null;
  onNavigateToNewParty?: () => void;
  onScan?: () => void;
  draft?: Partial<DraftBill> | null;
}

/** "New bill" from anywhere in the app: the §8.3 bill form in a sheet. */
export const NewTransactionModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, parties, preselectedPartyId, onNavigateToNewParty, onScan, draft }) => {
  const { t } = useI18n();
  if (!isOpen) return null;
  return (
    <Sheet title={t('new_bill')} onClose={onClose}>
      {/* key: a fresh form each time the sheet opens */}
      <BillForm
        key={`${preselectedPartyId ?? ''}-${draft ? JSON.stringify(draft).length : 0}`}
        parties={parties}
        partyId={draft?.partyId ?? preselectedPartyId ?? null}
        draft={draft}
        onSaved={onSuccess}
        onDone={onClose}
        onScan={onScan}
        onNewParty={onNavigateToNewParty ? () => { onClose(); onNavigateToNewParty(); } : undefined}
      />
    </Sheet>
  );
};
