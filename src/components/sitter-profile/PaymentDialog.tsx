import { CreditCard } from 'lucide-react';
import PaymentForm from '../payment/PaymentForm';
import { Alert, AlertDescription } from '../ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../ui/alert-dialog';

interface PaymentDialogProps {
  open: boolean;
  onDismiss: () => void;
  onPayLater: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
  clientSecret: string | null;
  paymentAmount: number;
  paymentLoading: boolean;
  paymentError: string | null;
}

export default function PaymentDialog({
  open,
  onDismiss,
  onPayLater,
  onSuccess,
  onError,
  clientSecret,
  paymentAmount,
  paymentLoading,
  paymentError,
}: PaymentDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onDismiss(); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            Complete Payment
          </AlertDialogTitle>
          <AlertDialogDescription>
            Your booking has been created. Complete payment to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {clientSecret && paymentAmount > 0 ? (
          <PaymentForm
            clientSecret={clientSecret}
            amount={paymentAmount}
            onSuccess={onSuccess}
            onError={onError}
          />
        ) : paymentLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : paymentError ? (
          <Alert variant="destructive">
            <AlertDescription>{paymentError}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onPayLater}>
            Pay Later
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
