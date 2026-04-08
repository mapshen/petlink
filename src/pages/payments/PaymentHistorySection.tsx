import PaymentHistoryList from '../../components/payment/PaymentHistoryList';

interface PaymentHistorySectionProps {
  readonly token: string | null;
}

export default function PaymentHistorySection({ token }: PaymentHistorySectionProps) {
  return (
    <div>
      <h3 className="text-base font-semibold text-stone-800 mb-4">Payment History</h3>
      <PaymentHistoryList token={token} />
    </div>
  );
}
