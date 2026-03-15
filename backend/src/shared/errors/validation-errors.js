import { DomainError } from "./domain-error.js";

export class ValidationError extends DomainError {
  constructor(message, details = null) {
    super({
      message,
      code: "VALIDATION_ERROR",
      status: 400,
      details,
    });
    this.name = "ValidationError";
  }
}
