# API Response Envelope

All API responses follow a consistent envelope format.

## Format

```json
{
    "success": true,
    "data": null,
    "message": "Human-readable message.",
    "code": 200,
    "version": "0.0.31"
}
```

| Field     | Type        | Description                                    |
| --------- | ----------- | ---------------------------------------------- |
| `success` | `boolean`   | Whether the request succeeded                  |
| `data`    | `T \| null` | Response payload (`null` for side-effect-only) |
| `message` | `string`    | Translated human-readable message              |
| `code`    | `number`    | HTTP status code                               |
| `version` | `string`    | API version from package.json (auto-bumped)    |

## Response Helpers

Two helpers in `apps/api/src/lib/response/`:

### `ok(c, data, message?, code?)`

Returns a success envelope.

```typescript
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'

return ok(c, claws, t('api.clawsFetched'))
return ok(c, null, t('api.clawDeleted'))
return ok(c, { scheduled: true }, t('api.clawDeletionScheduled'))
```

### `fail(c, message, code?, data?)`

Returns an error envelope. The optional `data` parameter passes extra context.

```typescript
import { fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

return fail(c, t('api.clawNotFound'), 404)
return fail(c, t('api.rateLimitExceeded'), 429, { retryAfter: 60 })
```

## Client Handling

The shared `RequestClient` in `packages/shared/` detects envelopes automatically via duck-typing (checks for all 5 fields). When an envelope is detected:

- `success: true` — unwraps and returns `data` as `T`
- `success: false` — throws `Error` with the `message`

This means client code stays clean:

```typescript
const claws = await api.getClaws()
```

The variable `claws` is typed as `Claw[]` — the envelope is transparent.

## Examples

### Success with data

```
GET /agents → 200
{
    "success": true,
    "data": [{ "id": "abc", "name": "my-claw", ... }],
    "message": "Claws fetched successfully.",
    "code": 200,
    "version": "0.0.31"
}
```

### Success without data

```
POST /auth/send-otp → 200
{
    "success": true,
    "data": null,
    "message": "Code sent successfully.",
    "code": 200,
    "version": "0.0.31"
}
```

### Error

```
GET /agents/nonexistent → 404
{
    "success": false,
    "data": null,
    "message": "Claw not found.",
    "code": 404,
    "version": "0.0.31"
}
```

### Error with extra data

```
POST /auth/send-otp → 429
{
    "success": false,
    "data": { "retryAfter": 45 },
    "message": "Too many requests. Please try again later.",
    "code": 429,
    "version": "0.0.31"
}
```
