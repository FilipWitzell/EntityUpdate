/** Thrown when an entity was saved by someone else after it was loaded, so a save would overwrite their change. */
export class EntityChangedError extends Error {
  constructor(
    readonly updatedBy: string,
    readonly updatedAt: string
  ) {
    super("The entity was changed by someone else after it was loaded.");
    this.name = "EntityChangedError";
  }
}
