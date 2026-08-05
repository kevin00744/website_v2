'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { createStoreSchema, type CreateStoreInput, type StoreSummary } from '@website-v2/shared-types';
import { ApiError } from '@/lib/api-client';
import { createStore } from '@/lib/stores-api';
import { CenteredModal } from '@/components/admin/kiosk/CenteredModal';
import { KioskButton } from '@/components/admin/kiosk/KioskButton';
import { KioskInput } from '@/components/admin/kiosk/KioskInput';
import { KioskSelect } from '@/components/admin/kiosk/KioskSelect';
import { MaskedPhoneInput } from '@/components/admin/kiosk/MaskedInput';

interface NewStoreModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (store: StoreSummary) => void;
  /** 經銷商登入時由父層帶入自己負責的區域，鎖死區域下拉選單（後端 service 層也會再驗一次，這裡只是 UX） */
  lockedRegion?: CreateStoreInput['region'];
}

const REGION_OPTIONS = [
  { value: 'A', label: 'A - 北部' },
  { value: 'B', label: 'B - 中部' },
  { value: 'C', label: 'C - 南部' },
];

/**
 * 置中大畫面（max-w-3xl）取代側欄——分店表單欄位不多，不需要像建顧客那樣用到 5xl 的全螢幕版面，
 * 但一樣絕對不擠進右側窄面板裡。
 *
 * 故意沒有「分店編號」欄位：編號是後端依所選區域自動生成（N01/C01/S01...），
 * 門市人員不需要、也不該自己輸入編號。
 */
export function NewStoreModal({ open, onClose, onCreated, lockedRegion }: NewStoreModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, dirtyFields },
  } = useForm<CreateStoreInput>({
    resolver: zodResolver(createStoreSchema),
    mode: 'onChange',
    defaultValues: { name: '', region: lockedRegion, phone: '', address: '', note: '' },
  });

  // 經銷商打開這個 Modal 時，區域要直接帶入並鎖定，不能讓他選成自己區域以外的值
  useEffect(() => {
    if (lockedRegion) {
      setValue('region', lockedRegion, { shouldValidate: true });
    }
  }, [lockedRegion, setValue]);

  async function onSubmit(values: CreateStoreInput) {
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const created = await createStore(values);
      reset({ name: '', region: lockedRegion, phone: '', address: '', note: '' });
      onCreated(created);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : '建立分店失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setSubmitError(undefined);
    onClose();
  }

  return (
    <CenteredModal open={open} onClose={handleClose} title="新增分店" maxWidthClassName="md:max-w-3xl">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-5">
        <KioskSelect
          label="所屬區域"
          required
          options={REGION_OPTIONS}
          placeholder="請選擇區域"
          disabled={Boolean(lockedRegion)}
          errorMessage={errors.region?.message}
          isValid={Boolean(dirtyFields.region || lockedRegion) && !errors.region}
          {...register('region')}
        />
        {lockedRegion && (
          <p className="text-kiosk-base text-slate-500">
            您的帳號是經銷商，只能在自己負責的區域建立分店，這裡已經自動帶入、不能更改
          </p>
        )}
        <KioskInput
          label="分店名稱"
          required
          placeholder="請輸入分店名稱"
          errorMessage={errors.name?.message}
          isValid={Boolean(dirtyFields.name) && !errors.name}
          {...register('name')}
        />
        <MaskedPhoneInput name="phone" control={control} label="分店電話" errorMessage={errors.phone?.message} />
        <KioskInput
          label="分店地址"
          placeholder="請輸入分店地址（選填）"
          errorMessage={errors.address?.message}
          isValid={Boolean(dirtyFields.address) && !errors.address}
          {...register('address')}
        />
        <KioskInput
          label="備註"
          placeholder="請輸入備註（選填）"
          errorMessage={errors.note?.message}
          isValid={Boolean(dirtyFields.note) && !errors.note}
          {...register('note')}
        />

        {submitError && (
          <p className="text-kiosk-base font-semibold text-kiosk-danger" role="alert">
            ⚠️ {submitError}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-2">
          <KioskButton type="submit" variant="primary" fullWidth disabled={submitting}>
            {submitting ? '建立中…' : '建立分店'}
          </KioskButton>
          <KioskButton type="button" variant="ghost" fullWidth onClick={handleClose} disabled={submitting}>
            取消
          </KioskButton>
        </div>
      </form>
    </CenteredModal>
  );
}
