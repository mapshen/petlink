import React, { useRef } from 'react';
import { Camera, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { isReceiptImage } from '../../pages/payments/expenseUtils';

interface ReceiptUploadProps {
  receiptUrl: string;
  uploading: boolean;
  error: string | null;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onPreview: (url: string) => void;
}

export default function ReceiptUpload({ receiptUrl, uploading, error, onUpload, onRemove, onPreview }: ReceiptUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <label className="text-xs font-medium text-stone-600 mb-2 block">Receipt (optional)</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={onUpload}
        className="hidden"
      />
      {receiptUrl && isReceiptImage(receiptUrl) ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onPreview(receiptUrl)}
            className="relative group"
          >
            <img
              src={receiptUrl}
              alt="Receipt"
              className="w-16 h-16 rounded-lg object-cover border border-stone-200 group-hover:opacity-75 transition-opacity"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ImageIcon className="w-5 h-5 text-stone-700" />
            </div>
          </button>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-500 hover:text-red-600 font-medium"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
          ) : (
            <><Camera className="w-4 h-4" /> Add Receipt Photo</>
          )}
        </Button>
      )}
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}
