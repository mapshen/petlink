interface TaxPDFSummary {
  year: number;
  filing_status: string;
  total_income: number;
  total_expenses: number;
  net_income: number;
  expense_by_category: Record<string, number>;
  quarterly_estimates: {
    quarter: string;
    income: number;
    expenses: number;
    net_income: number;
    se_tax: number;
    income_tax: number;
    estimated_tax: number;
    due_date: string;
  }[];
  annual_se_tax: number;
  annual_income_tax: number;
  annual_estimated_tax: number;
}

export async function generateTaxPDF(
  summary: TaxPDFSummary,
  categories: readonly { value: string; label: string; icon: string }[]
) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const fmt = (cents: number) =>
    `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let y = 20;

  const checkPage = () => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  };

  doc.setFontSize(18);
  doc.text(`PetLink Tax Summary — ${summary.year}`, 14, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text('For informational purposes only. Consult a tax professional.', 14, y);
  doc.setTextColor(0, 0, 0);
  y += 12;

  // Annual summary
  checkPage();
  doc.setFontSize(13);
  doc.text('Annual Summary', 14, y); y += 8;
  doc.setFontSize(10);
  doc.text(`Gross Income: ${fmt(summary.total_income)}`, 14, y); y += 6;
  doc.text(`Total Expenses: ${fmt(summary.total_expenses)}`, 14, y); y += 6;
  doc.text(`Net Income: ${fmt(summary.net_income)}`, 14, y); y += 6;
  doc.text(`Self-Employment Tax: ${fmt(summary.annual_se_tax)}`, 14, y); y += 6;
  doc.text(`Estimated Income Tax: ${fmt(summary.annual_income_tax)}`, 14, y); y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Estimated Tax: ${fmt(summary.annual_estimated_tax)}`, 14, y);
  doc.setFont('helvetica', 'normal');
  y += 12;

  // Expenses by category
  if (Object.keys(summary.expense_by_category).length > 0) {
    checkPage();
    doc.setFontSize(13);
    doc.text('Expenses by Category', 14, y); y += 8;
    doc.setFontSize(10);
    for (const [cat, amount] of Object.entries(summary.expense_by_category)) {
      checkPage();
      const label = categories.find(c => c.value === cat)?.label || cat;
      doc.text(`${label}: ${fmt(amount)}`, 14, y); y += 6;
    }
    y += 6;
  }

  // Quarterly estimates
  checkPage();
  doc.setFontSize(13);
  doc.text('Quarterly Estimated Tax Payments', 14, y); y += 8;
  doc.setFontSize(10);
  for (const q of summary.quarterly_estimates) {
    checkPage();
    doc.text(`${q.quarter} (due ${q.due_date}): ${fmt(q.estimated_tax)}  (SE: ${fmt(q.se_tax)} + Income: ${fmt(q.income_tax)})`, 14, y);
    y += 6;
  }

  doc.save(`petlink-tax-summary-${summary.year}.pdf`);
}
