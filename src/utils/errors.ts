export class AppError extends Error {
  constructor(
    message: string,
    readonly userMessage = "Something went wrong. Please try again."
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toFriendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof AppError) {
    return error.userMessage;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}
