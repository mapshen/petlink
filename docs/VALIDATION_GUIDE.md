# Validation Guide

This project uses a **dual-layer validation strategy**: backend validates in Express route handlers, frontend uses **React Hook Form + Zod**.

## Frontend Validation (React Hook Form + Zod)

### Architecture

```
src/
  validation/
    helpers.ts      # Reusable Zod primitives (email, password, price, etc.)
    schemas.ts      # Per-entity schemas matching backend validators
    index.ts        # Barrel export
  components/forms/
    FormInput.tsx       # Text/email/number inputs with error display
    FormTextarea.tsx    # Textarea with error display
    FormSelect.tsx      # Single select dropdown
    FormDateInput.tsx   # datetime-local and date inputs
    index.ts            # Barrel export
```

### How to Use in a Form

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bookingSchema } from '../validation';
import { FormInput, FormDateInput, FormSelect } from '../components/forms';

const BookingForm = ({ sitterId, services }) => {
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(bookingSchema),
    defaultValues: { service_id: '', start_time: '', end_time: '' },
    mode: 'onBlur',
  });

  const onSubmit = (data) => {
    // data is fully validated and typed
    fetch('/api/v1/bookings', {
      method: 'POST',
      headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, sitter_id: sitterId }),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormSelect name="service_id" control={control} label="Service" options={services} isRequired />
      <FormDateInput name="start_time" control={control} label="Start" type="datetime-local" isRequired />
      <FormDateInput name="end_time" control={control} label="End" type="datetime-local" isRequired />
      <button type="submit">Book</button>
    </form>
  );
};
```

### Validation Mode

All forms use `mode: 'onBlur'`:
- Errors appear when a field loses focus
- On submit, all untouched fields are validated too
- Errors clear as soon as the user fixes the input

### Adding Validation to a New Form

1. Define a Zod schema in `validation/schemas.ts` matching the backend validation
2. Use reusable helpers from `validation/helpers.ts` for common patterns
3. Use `useForm` with `zodResolver(yourSchema)` and `mode: 'onBlur'`
4. Use form components from `components/forms/` for consistent error display
5. Write tests for both the schema and the form

### Reusable Helpers Reference

| Helper | Purpose | Example |
|--------|---------|---------|
| `emailSchema` | Valid email, max 254 chars | Auth forms |
| `passwordSchema` | 8-72 chars, complexity requirements | Signup/login |
| `nameSchema` | Required trimmed string, 1-100 chars | User name, pet name |
| `optionalStringSchema(max)` | Optional (empty → undefined), trimmed | Bio, description |
| `priceSchema` | Required number >= 0 | Service price, total_price |
| `optionalPriceSchema` | Optional number >= 0 | Booking total |
| `dateTimeSchema` | Required ISO datetime string | Booking start/end |
| `optionalDateSchema` | Optional date string | Availability specific_date |
| `ratingSchema` | Integer 1-5 | Review rating |
| `idSchema` | Positive integer | Foreign keys |
| `serviceTypeSchema` | Enum: walking, sitting, drop-in, grooming | Service type |
| `bookingStatusSchema` | Enum: pending, confirmed, etc. | Booking status |
| `userRoleSchema` | Enum: owner, sitter, both | User role |
| `dateOrderRefine(start, end)` | Refinement: start < end | Booking time range |

## Backend Validation

Backend validation happens inline in route handlers using manual checks. Migrate to Zod schemas for consistency:

### Current Pattern (manual checks)
```typescript
v1.post('/bookings', authMiddleware, async (req, res) => {
  const { sitter_id, service_id, start_time, end_time, total_price } = req.body;
  if (!sitter_id || !service_id || !start_time || !end_time) {
    res.status(400).json({ error: 'All booking fields are required' });
    return;
  }
  // ...
});
```

### Target Pattern (Zod middleware)
```typescript
import { z } from 'zod';

// Shared schema importable by both frontend and backend
const bookingCreateSchema = z.object({
  sitter_id: z.number().int().positive(),
  service_id: z.number().int().positive(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
  total_price: z.number().nonneg().optional(),
}).refine(d => new Date(d.end_time) > new Date(d.start_time), {
  message: 'End time must be after start time',
  path: ['end_time'],
});

// Validation middleware
function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.issues[0].message });
      return;
    }
    req.body = result.data;
    next();
  };
}

v1.post('/bookings', authMiddleware, validate(bookingCreateSchema), async (req, res) => {
  // req.body is validated and typed
});
```

### Key Differences

| Aspect | Backend | Frontend |
|--------|---------|----------|
| Library | Zod (shared schemas) | Zod + React Hook Form |
| Execution | Server middleware | Client-side before submit |
| HTML escape | Sanitize user-provided strings | No escape (backend handles it) |
| Date handling | Validate ISO strings, PostgreSQL stores TIMESTAMPTZ | Strings sent, formatted for display |
| Error display | JSON `{ error: string }` response | Inline error messages below fields |

## Rules

- **Every** user-facing form must have a Zod schema
- **Every** API endpoint must validate its input (backend is the source of truth)
- Schemas should be **shared** between frontend and backend where possible
- Use `mode: 'onBlur'` for all forms
- Validate at system boundaries: user input, external API responses
- Never trust client-side validation alone — always validate on the server
