export class AppError extends Error {
  public readonly status: string;

  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true,
  ) {
    super(message);

    // 1. Set the name to the class name instead of generic "Error"
    this.name = this.constructor.name;

    // 2. Define status based on code (4xx = fail, 5xx = error)
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";

    // 3. Restore prototype chain
    Object.setPrototypeOf(this, new.target.prototype);

    // 4. Capture the stack trace
    Error.captureStackTrace(this, this.constructor);

    // 5. Contextual Logging
    this.logError();
  }

  private logError() {
    console.error(`--- 🚨 Error Identified ---`);
    console.error(`Type: ${this.name}`);
    console.error(`Status: ${this.statusCode} (${this.status})`);
    console.error(`Message: ${this.message}`);
    // This shows the file, line number, and function call stack
    console.error(`Stack: ${this.stack}`);
    console.error(`---------------------------\n`);
  }
}
