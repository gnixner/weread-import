export class WereadAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WereadAuthError';
  }
}

export class WereadApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WereadApiError';
  }
}
