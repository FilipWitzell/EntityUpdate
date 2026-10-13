/** Thrown when a sale was saved by someone else after it was loaded, so a save would overwrite their change. */
export class SaleChangedError extends Error {
  constructor(
    readonly updatedBy: string,
    readonly updatedAt: string
  ) {
    super("The sale was changed by someone else after it was loaded.");
    this.name = "SaleChangedError";
  }
}
