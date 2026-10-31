// Uniform application error. The error middleware turns it into
// { error: { code, message, details } } with the given HTTP status.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "VALIDATION_ERROR", message, details);
export const unauthenticated = (message = "Please sign in") =>
  new AppError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have permission to do this") =>
  new AppError(403, "FORBIDDEN", message);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);
export const businessRule = (message: string, details?: unknown) =>
  new AppError(422, "BUSINESS_RULE", message, details);
