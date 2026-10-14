/**
 * What the SuperOffice card next to the panel is busy with, so the panel does not save over unsaved
 * changes or reload the card while someone is writing in it.
 *
 * The panel is served from the same tenant as SuperOffice, so it can read the SuperOffice window and
 * its frames. When it can not, the card is treated as busy: better to skip a reload than to lose a
 * message someone is writing.
 */

export interface CardState {
  /** The card's own form has unsaved changes: its Lagre and Avbryt buttons are showing. */
  editing: boolean;
  /** Text is being written somewhere on the card, e.g. a reply to a ticket. */
  writing: boolean;
  /** The SuperOffice window could not be read, so nothing is known. */
  unknown: boolean;
}

export function readCardState(): CardState {
  const documents = superOfficeDocuments();
  if (documents.length === 0) return { editing: false, writing: false, unknown: true };
  return {
    editing: documents.some(hasSaveAndCancel),
    writing: documents.some(hasTextBeingWritten),
    unknown: false
  };
}

/** Whether reloading the card now could throw away something the user has not saved. */
export function cardIsBusy(state: CardState = readCardState()): boolean {
  return state.editing || state.writing || state.unknown;
}

/** The SuperOffice window's document and every frame in it that can be read - except the panel's own. */
function superOfficeDocuments(): Document[] {
  let top: Document;
  try {
    if (!window.top || window.top === window) return [];
    top = window.top.document;
  } catch {
    // Another origin: the browser does not let the panel read it.
    return [];
  }
  const found: Document[] = [];
  const visit = (doc: Document, depth: number) => {
    if (doc === document) return;
    found.push(doc);
    if (depth > 4) return;
    for (const frame of doc.querySelectorAll("iframe, frame")) {
      try {
        const inner = (frame as HTMLIFrameElement).contentDocument;
        if (inner) visit(inner, depth + 1);
      } catch {
        // A frame from another origin, e.g. a third-party web panel.
      }
    }
  };
  visit(top, 0);
  return found;
}

function isShown(element: Element): boolean {
  return element.getClientRects().length > 0;
}

/** A form in edit mode shows both a Lagre and an Avbryt button. */
function hasSaveAndCancel(doc: Document): boolean {
  const labels = new Set(
    [...doc.querySelectorAll("button, [role=button], input[type=button], input[type=submit]")]
      .filter(isShown)
      .map((button) => (button.textContent || (button as HTMLInputElement).value || "").trim().toLowerCase())
  );
  return (labels.has("lagre") && labels.has("avbryt")) || (labels.has("save") && labels.has("cancel"));
}

/** An editor or text area with text in it - a message being written. */
function hasTextBeingWritten(doc: Document): boolean {
  const editors = [...doc.querySelectorAll<HTMLElement>("[contenteditable=''], [contenteditable=true]")];
  if (doc.body?.isContentEditable) editors.push(doc.body);
  if (editors.some((editor) => isShown(editor) && (editor.textContent ?? "").trim() !== "")) return true;
  return [...doc.querySelectorAll("textarea")].some((area) => isShown(area) && area.value.trim() !== "");
}
