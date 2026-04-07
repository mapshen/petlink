import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface ReceiptPreviewModalProps {
  url: string | null;
  onClose: () => void;
}

export default function ReceiptPreviewModal({ url, onClose }: ReceiptPreviewModalProps) {
  return (
    <AlertDialog open={url !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Receipt</AlertDialogTitle>
          <AlertDialogDescription className="sr-only">Full-size receipt image preview</AlertDialogDescription>
        </AlertDialogHeader>
        {url && (
          <img
            src={url}
            alt="Receipt"
            className="w-full max-h-[70vh] object-contain rounded-lg"
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
