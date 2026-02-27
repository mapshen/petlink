# Date & Time Handling Guide

All dates and times are stored in UTC (PostgreSQL `TIMESTAMPTZ`). Display uses the user's local browser timezone for end-user pages. Admin/internal contexts may use a fixed timezone.

## Field Types

| | Datetime fields | Date-only fields |
|---|---|---|
| **Examples** | Booking start/end, walk event timestamps | Availability specific_date |
| **User enters** | Date + time via `<input type="datetime-local">` | Calendar date via `<input type="date">` |
| **Frontend → UTC** | `new Date(input).toISOString()` | `startOfDay(parseISO(dateString)).toISOString()` |
| **Stored as** | `TIMESTAMPTZ` (UTC) | `DATE` (PostgreSQL) or `TIMESTAMPTZ` at midnight UTC |
| **Display (UTC → local)** | `format(new Date(value), 'MMM d, yyyy h:mm a')` | `format(new Date(value), 'MMM d, yyyy')` |
| **Form init** | `format(new Date(value), "yyyy-MM-dd'T'HH:mm")` | `format(new Date(value), 'yyyy-MM-dd')` |

## Utility Reference

All date formatting uses `date-fns` v4. Import from `date-fns`.

| Function | Purpose |
|----------|---------|
| `format(date, pattern)` | Format a Date to a display string |
| `parseISO(string)` | Parse an ISO 8601 string to a Date |
| `formatISO(date)` | Format a Date to ISO 8601 string |
| `startOfDay(date)` | Get 00:00:00.000 of the day |
| `endOfDay(date)` | Get 23:59:59.999 of the day |
| `isAfter(a, b)` / `isBefore(a, b)` | Compare two dates |
| `addHours(date, n)` / `addDays(date, n)` | Date arithmetic |

## Adding a New Date/Time Field

1. **Choose type**: datetime (has time component) or date-only (calendar date)
2. **Database**: Use `TIMESTAMPTZ` for datetimes, `DATE` for date-only
3. **API**: Accept ISO 8601 strings, validate with Zod (`z.string().datetime()` or `z.string().date()`)
4. **Frontend form submit**: Convert local input to ISO string via `new Date(input).toISOString()`
5. **Frontend form init**: Format UTC value to local input format via `date-fns/format`
6. **Frontend display**: Use `date-fns/format` with appropriate pattern

## Common Patterns

### Booking datetime input
```tsx
// Form submit: local datetime-local → UTC ISO string
const startTime = new Date(formData.start_time).toISOString();

// Form init: UTC ISO string → local datetime-local value
const defaultValue = format(new Date(booking.start_time), "yyyy-MM-dd'T'HH:mm");
```

### Display formatting
```tsx
// Date + time: "Jan 15, 2026 2:30 PM"
format(new Date(booking.start_time), 'MMM d, yyyy h:mm a')

// Date only: "Jan 15, 2026"
format(new Date(booking.start_time), 'MMM d, yyyy')

// Time only: "2:30 PM"
format(new Date(msg.created_at), 'h:mm a')
```

### Availability date-only
```tsx
// Store: midnight UTC of the selected date
const specificDate = formData.specific_date; // "2026-03-15" from <input type="date">

// Display: extract date portion
format(parseISO(slot.specific_date), 'MMM d, yyyy')
```

## Rules

- **Never** construct dates with string concatenation or manual offset math
- **Always** use `date-fns` for formatting and parsing
- **Always** store `TIMESTAMPTZ` in PostgreSQL (not `TIMESTAMP` without timezone)
- **Never** hardcode timezone offsets; let PostgreSQL and the browser handle conversions
- Booking time ranges: validate `end_time > start_time` in both Zod schema and backend
