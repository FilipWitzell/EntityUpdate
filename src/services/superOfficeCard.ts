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
  /** The elements that made the card look busy, for the console. */
  found: string[];
}

export function readCardState(): CardState {
  const documents = superOfficeDocuments();
  if (documents.length === 0) return { editing: false, writing: false, unknown: true, found: [] };
  const editing = documents.flatMap(saveAndCancelButtons);
  const writing = documents.flatMap(textBeingWritten);
  const state = { editing: editing.length > 0, writing: writing.length > 0, unknown: false, found: [...editing, ...writing].map(describe) };
  if (state.found.length > 0) console.info("The SuperOffice card looks busy because of:", state.found);
  return state;
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

/**
 * Really on screen: laid out, with a size, not hidden by visibility or opacity (on it or any parent),
 * and inside its window. SuperOffice keeps buttons for edit mode in the page while they are hidden.
 */
function isShown(element: Element): boolean {
  const box = element.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) return false;
  const view = element.ownerDocument.defaultView;
  // Placed off screen. A window with no size (a frame not laid out yet) tells nothing, so it is skipped.
  const offScreen = (end: number, start: number, size: number) => end <= 0 || (size > 0 && start >= size);
  if (view && (offScreen(box.bottom, box.top, view.innerHeight) || offScreen(box.right, box.left, view.innerWidth))) return false;
  if (typeof element.checkVisibility === "function") {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  } else {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = view?.getComputedStyle(node);
      if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) return false;
    }
  }
  // Cut away by a parent that clips its content, e.g. a collapsed panel with height 0.
  for (let node = element.parentElement; node && node !== element.ownerDocument.body; node = node.parentElement) {
    const style = view?.getComputedStyle(node);
    if (!style || style.overflow === "visible") continue;
    const clip = node.getBoundingClientRect();
    if (box.bottom <= clip.top || box.top >= clip.bottom || box.right <= clip.left || box.left >= clip.right) return false;
  }
  return true;
}

function label(button: Element): string {
  return (button.textContent || (button as HTMLInputElement).value || "").trim().toLowerCase();
}

/** A form in edit mode shows both a Lagre and an Avbryt button; both are returned, or none. */
function saveAndCancelButtons(doc: Document): Element[] {
  const shown = [...doc.querySelectorAll("button, [role=button], input[type=button], input[type=submit]")].filter(
    (button) => ["lagre", "avbryt", "save", "cancel"].includes(label(button)) && isShown(button)
  );
  const save = shown.filter((button) => label(button) === "lagre" || label(button) === "save");
  const cancel = shown.filter((button) => label(button) === "avbryt" || label(button) === "cancel");
  return save.length > 0 && cancel.length > 0 ? [...save, ...cancel] : [];
}

/** Editors and text areas with text in them - a message being written. */
function textBeingWritten(doc: Document): Element[] {
  const editors = [...doc.querySelectorAll<HTMLElement>("[contenteditable=''], [contenteditable=true]")];
  if (doc.body?.isContentEditable) editors.push(doc.body);
  return [
    ...editors.filter((editor) => (editor.textContent ?? "").trim() !== "" && isShown(editor)),
    ...[...doc.querySelectorAll("textarea")].filter((area) => area.value.trim() !== "" && isShown(area))
  ];
}

/** "button.btn.primary «Lagre» in /Cust30460/default.aspx" - enough to find the element again. */
function describe(element: Element): string {
  const classes = typeof element.className === "string" && element.className.trim() ? "." + element.className.trim().split(/\s+/).join(".") : "";
  const text = (element.textContent || (element as HTMLInputElement).value || "").trim().slice(0, 40);
  return `${element.tagName.toLowerCase()}${element.id ? "#" + element.id : ""}${classes} «${text}» in ${element.ownerDocument.location?.pathname ?? "?"}`;
}
