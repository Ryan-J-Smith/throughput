/** Thrown when a caller asks the engine to do something the rules forbid. */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}
