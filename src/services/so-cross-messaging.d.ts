// eslint-disable-next-line no-var
declare var SuperOffice: {
  ClientCrossMessaging: {
    refresh: () => void;
    executeSoProtocol: (protocol: string) => void;
    openDocument: (documentId: number) => void;
  };
};

export function jumpTo(soProtocol: string): void;
export function refreshSuperOffice(): void;
export function openSuperOfficeDocument(documentId: number): void;
