import { BaseError } from "../../base.error.js";


export class NotFoundError extends BaseError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404);
  }
}

export class ValidationError extends BaseError {
  constructor(message = "Validation error", details = null) {
    super(message, 400, details);
  }
}

export class ConflictError extends BaseError {
  constructor(message = "Resource already exists") {
    super(message, 409);
  }
}