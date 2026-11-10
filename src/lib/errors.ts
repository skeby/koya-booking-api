/**
 * Domain errors carry an HTTP status so services can signal failures without
 * knowing about Express. The error-handling middleware (and the booking
 * outcome wrapper) maps them to `{ error }` responses.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request") {
    super(400, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Missing or invalid API key") {
    super(401, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, message);
  }
}

export class UnprocessableError extends AppError {
  constructor(message = "Unprocessable request") {
    super(422, message);
  }
}

export class RateLimitError extends AppError {
  constructor(retry_after_seconds: number) {
    super(
      429,
      `Too many booking attempts for this email. Try again in ${retry_after_seconds} seconds.`,
      { "Retry-After": String(retry_after_seconds) },
    );
  }
}

/** MongoDB duplicate-key error (a unique index rejected the write). */
export function is_duplicate_key_error(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === 11000;
}
