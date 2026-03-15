export class DomainError extends Error {
  constructor({ message, code = "DOMAIN_ERROR", status = 500, details = null }) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const isDomainError = (error) => error instanceof DomainError;
