/**
 * utils/AppError.ts — Custom Application Error Class
 *
 * Extends the native Error with two extra fields:
 *   statusCode    — HTTP status to send in the response (default 500)
 *   isOperational — true for expected errors (bad input, not found, auth fail)
 *                   false for programmer bugs. Useful if you add a global error
 *                   handler that decides whether to restart the process.
 *
 * Usage:
 *   throw new AppError("User not found", 404);
 *   throw new AppError("Unauthorized", 401);
 */

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
  ) {
    super(message);
    // Restore the prototype chain so `instanceof AppError` works correctly
    Object.setPrototypeOf(this, new.target.prototype);
    // Capture a clean stack trace that starts at the throw site, not here
    Error.captureStackTrace(this, this.constructor);
    console.log(message);
  }
}
