import { useAuth } from '../../context/AuthContext';
import SavedPaymentMethods from '../../components/payment/SavedPaymentMethods';
import PaymentHistoryList from '../../components/payment/PaymentHistoryList';

export default function PaymentMethodsSection() {
  const { token } = useAuth();

  return (
    <div className="space-y-6">
      <SavedPaymentMethods />

      <div>
        <h3 className="text-base font-semibold text-stone-800 mb-4">Payment History</h3>
        <PaymentHistoryList token={token} />
      </div>
    </div>
  );
}
